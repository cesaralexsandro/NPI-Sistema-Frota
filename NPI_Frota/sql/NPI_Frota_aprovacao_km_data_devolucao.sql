-- ============================================================================
-- NPI FROTA | Aprovação do gestor para divergência de hodômetro + data/hora
-- de devolução informada pelo motorista.
-- Pré-requisito: SQLs de acesso por perfil, retiradas/devoluções,
-- autoatendimento do motorista e painel/checklists já executados.
-- Migração aditiva e reexecutável: não apaga retiradas, devoluções ou histórico.
-- Execute em Supabase > SQL Editor.
-- ============================================================================
begin;

-- 1) Garante os campos do serviço já selecionado pelo motorista e a auditoria da KM.
alter table public.motorista_veiculos
  add column if not exists servico text,
  add column if not exists servico_detalhes text;
alter table public.retiradas
  add column if not exists servico text,
  add column if not exists servico_detalhes text;

-- A retirada precisa aceitar veículos Reservados pelo próprio motorista.
create or replace function public.npi_validate_and_start_retirada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_veiculo_situacao text;
  v_empresa_id uuid;
  v_motorista_empresa_id uuid;
begin
  select v.situacao, v.empresa_id into v_veiculo_situacao, v_empresa_id
  from public.veiculos v where v.id = new.veiculo_id for update;
  select m.empresa_id into v_motorista_empresa_id
  from public.motoristas m where m.id = new.motorista_id;
  if v_veiculo_situacao is distinct from 'Disponível' and v_veiculo_situacao is distinct from 'Reservado' then
    raise exception using message = 'O veículo não está disponível para retirada.';
  end if;
  if v_empresa_id is null or v_empresa_id is distinct from v_motorista_empresa_id then
    raise exception using message = 'O veículo e o motorista precisam pertencer à mesma empresa.';
  end if;
  if not exists (
    select 1 from public.motorista_veiculos mv
    where mv.veiculo_id = new.veiculo_id and mv.motorista_id = new.motorista_id
      and mv.empresa_id = v_empresa_id and mv.ativo = true
      and mv.data_inicio <= current_date and (mv.data_fim is null or mv.data_fim >= current_date)
  ) then
    raise exception using message = 'O motorista não possui vínculo ativo para este veículo.';
  end if;
  new.situacao := 'Em aberto';
  return new;
end;
$$;
revoke all on function public.npi_validate_and_start_retirada() from public, anon, authenticated;

-- Guarda auditoria da autorização diretamente na retirada.
alter table public.retiradas
  add column if not exists km_base_registrada numeric,
  add column if not exists km_divergencia_autorizada boolean not null default false,
  add column if not exists km_autorizada_por uuid references public.usuarios(id) on delete restrict,
  add column if not exists km_justificativa_autorizacao text;

-- 2) Autorizações de KM são registros de uso único, com validade curta.
create table if not exists public.npi_vehicle_km_approvals (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  motorista_id uuid not null references public.motoristas(id) on delete restrict,
  km_anterior numeric not null check (km_anterior >= 0),
  km_solicitada numeric not null check (km_solicitada > km_anterior),
  autorizado_por uuid not null references public.usuarios(id) on delete restrict,
  justificativa text not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '10 minutes'),
  usado_em timestamptz,
  retirada_id uuid references public.retiradas(id) on delete restrict,
  constraint npi_vehicle_km_approvals_expiration_check check (expira_em > criado_em)
);
create index if not exists npi_vehicle_km_approvals_pending_idx
  on public.npi_vehicle_km_approvals (veiculo_id, motorista_id, expira_em)
  where usado_em is null;
alter table public.npi_vehicle_km_approvals enable row level security;
revoke all on public.npi_vehicle_km_approvals from public, anon, authenticated;

-- Garante que o perfil padrão Gestor de Frota tem autorização operacional
-- para aprovar divergências de hodômetro. O Administrador já possui acesso total.
update public.permissoes pm
set aprovar = true
from public.perfis p
where p.id = pm.perfil_id
  and p.nome = 'Gestor de Frota'
  and pm.modulo = 'retiradas';

-- 3) O gestor autentica-se numa sessão temporária no navegador e esta RPC
-- confirma no servidor se o usuário é Gestor de Frota ou Administrador.
create or replace function public.npi_manager_authorize_vehicle_km(
  p_veiculo_id uuid,
  p_motorista_id uuid,
  p_quilometragem_anterior numeric,
  p_quilometragem_solicitada numeric,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager_id uuid;
  v_empresa_id uuid;
  v_km_atual numeric;
  v_situacao text;
  v_approval_id uuid;
begin
  v_manager_id := (select auth.uid());
  v_empresa_id := (select public.npi_current_empresa_id());

  if v_manager_id is null or v_empresa_id is null then
    raise exception using message = 'A sessão do gestor não é válida ou está inativa.';
  end if;

  if not (select public.npi_has_permission('retiradas', 'aprovar')) then
    raise exception using message = 'Este usuário não possui permissão para aprovar divergências de quilometragem.';
  end if;

  if not exists (
    select 1
    from public.perfis_usuarios pu
    join public.perfis p on p.id = pu.perfil_id and p.situacao = 'Ativo'
    join public.usuarios u on u.id = pu.usuario_id and u.situacao = 'Ativo'
    where pu.usuario_id = v_manager_id
      and pu.empresa_id = v_empresa_id
      and pu.situacao = 'Ativo'
      and p.nome in ('Gestor de Frota', 'Administrador')
  ) then
    raise exception using message = 'A autorização exige uma conta ativa de Gestor de Frota ou Administrador da mesma empresa.';
  end if;

  if p_quilometragem_anterior is null or p_quilometragem_solicitada is null
     or p_quilometragem_anterior < 0
     or p_quilometragem_solicitada <= p_quilometragem_anterior then
    raise exception using message = 'A quilometragem solicitada precisa ser maior que a última quilometragem confirmada.';
  end if;
  if nullif(btrim(p_justificativa), '') is null then
    raise exception using message = 'Informe a justificativa para a divergência de quilometragem.';
  end if;

  select v.quilometragem_atual, v.situacao
    into v_km_atual, v_situacao
  from public.veiculos v
  where v.id = p_veiculo_id and v.empresa_id = v_empresa_id
  for update;
  if not found then
    raise exception using message = 'Veículo não encontrado na empresa do gestor.';
  end if;
  if v_situacao not in ('Disponível', 'Reservado') then
    raise exception using message = 'O veículo não está disponível para uma nova retirada.';
  end if;
  if coalesce(v_km_atual, 0) is distinct from p_quilometragem_anterior then
    raise exception using message = 'A quilometragem do veículo mudou durante a solicitação. Atualize o Meu Painel e tente novamente.';
  end if;

  if not exists (
    select 1 from public.motoristas m
    where m.id = p_motorista_id and m.empresa_id = v_empresa_id and m.situacao = 'Ativo'
  ) then
    raise exception using message = 'Motorista não encontrado ou inativo na empresa.';
  end if;
  if not exists (
    select 1 from public.motorista_veiculos mv
    where mv.motorista_id = p_motorista_id
      and mv.veiculo_id = p_veiculo_id
      and mv.empresa_id = v_empresa_id
      and mv.ativo = true
      and mv.data_inicio <= current_date
      and (mv.data_fim is null or mv.data_fim >= current_date)
  ) then
    raise exception using message = 'O motorista não possui vínculo ativo com este veículo.';
  end if;

  insert into public.npi_vehicle_km_approvals (
    empresa_id, veiculo_id, motorista_id, km_anterior, km_solicitada,
    autorizado_por, justificativa
  ) values (
    v_empresa_id, p_veiculo_id, p_motorista_id, p_quilometragem_anterior,
    p_quilometragem_solicitada, v_manager_id, btrim(p_justificativa)
  ) returning id into v_approval_id;

  return jsonb_build_object('ok', true, 'approval_id', v_approval_id, 'expira_em', now() + interval '10 minutes');
end;
$$;

revoke all on function public.npi_manager_authorize_vehicle_km(uuid, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.npi_manager_authorize_vehicle_km(uuid, uuid, numeric, numeric, text) to authenticated;

-- 4) Substitui a RPC de retirada: divergências positivas exigem uma aprovação
-- de gestor correspondente exatamente ao veículo, motorista e KM informados.
drop function if exists public.npi_driver_start_vehicle_use(uuid, numeric, numeric, text, text, uuid, jsonb);

create or replace function public.npi_driver_start_vehicle_use(
  p_veiculo_id uuid,
  p_quilometragem_inicial numeric,
  p_nivel_combustivel numeric,
  p_destino text,
  p_observacoes text,
  p_modelo_checklist_id uuid,
  p_respostas jsonb,
  p_autorizacao_km_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motorista_id uuid;
  v_empresa_id uuid;
  v_km_atual numeric;
  v_situacao text;
  v_checklist_id uuid;
  v_retirada_id uuid;
  v_aprovacao public.npi_vehicle_km_approvals%rowtype;
  v_km_autorizada_por uuid;
  v_km_justificativa text;
  v_servico text;
  v_servico_detalhes text;
  v_divergencia_aprovada boolean := false;
begin
  if not (select public.npi_current_is_driver()) then
    raise exception using message = 'Somente usuários com perfil Motorista podem iniciar uma utilização por este painel.';
  end if;

  v_motorista_id := (select public.npi_current_motorista_id());
  v_empresa_id := (select public.npi_current_empresa_id());
  if v_motorista_id is null or v_empresa_id is null then
    raise exception using message = 'Seu usuário não está vinculado a um motorista ativo.';
  end if;
  if p_quilometragem_inicial is null or p_quilometragem_inicial < 0 then
    raise exception using message = 'Informe uma quilometragem válida.';
  end if;
  if nullif(btrim(p_destino), '') is null then
    raise exception using message = 'Informe o destino ou local de utilização.';
  end if;
  if p_nivel_combustivel is not null and (p_nivel_combustivel < 0 or p_nivel_combustivel > 100) then
    raise exception using message = 'O combustível deve estar entre 0 e 100 por cento.';
  end if;
  if not exists (
    select 1 from public.motoristas m
    where m.id = v_motorista_id and m.empresa_id = v_empresa_id and m.situacao = 'Ativo'
  ) then
    raise exception using message = 'Seu cadastro de motorista está inativo.';
  end if;

  select v.quilometragem_atual, v.situacao
    into v_km_atual, v_situacao
  from public.veiculos v
  where v.id = p_veiculo_id and v.empresa_id = v_empresa_id
  for update;
  if not found then
    raise exception using message = 'Veículo não encontrado na sua empresa.';
  end if;
  if v_situacao not in ('Disponível', 'Reservado') then
    raise exception using message = 'Este veículo não está disponível para utilização.';
  end if;
  if p_quilometragem_inicial < coalesce(v_km_atual, 0) then
    raise exception using message = 'A quilometragem de saída não pode ser menor que a última quilometragem confirmada.';
  end if;

  if p_quilometragem_inicial > coalesce(v_km_atual, 0) then
    if p_autorizacao_km_id is null then
      raise exception using message = 'NPI_KM_APPROVAL_REQUIRED: o hodômetro informado é diferente da última quilometragem confirmada. Solicite autorização do Gestor de Frota.';
    end if;

    select a.* into v_aprovacao
    from public.npi_vehicle_km_approvals a
    where a.id = p_autorizacao_km_id
      and a.empresa_id = v_empresa_id
      and a.veiculo_id = p_veiculo_id
      and a.motorista_id = v_motorista_id
      and a.km_anterior = coalesce(v_km_atual, 0)
      and a.km_solicitada = p_quilometragem_inicial
      and a.usado_em is null
      and a.expira_em > now()
    for update;
    if not found then
      raise exception using message = 'A autorização do gestor não existe, expirou, já foi usada ou não corresponde a esta quilometragem.';
    end if;

    v_divergencia_aprovada := true;
    v_km_autorizada_por := v_aprovacao.autorizado_por;
    v_km_justificativa := v_aprovacao.justificativa;
  elsif p_autorizacao_km_id is not null then
    raise exception using message = 'Não é necessário usar uma autorização de divergência quando a quilometragem coincide com o valor confirmado.';
  end if;

  select mv.servico, mv.servico_detalhes
    into v_servico, v_servico_detalhes
  from public.motorista_veiculos mv
  where mv.motorista_id = v_motorista_id
    and mv.veiculo_id = p_veiculo_id
    and mv.empresa_id = v_empresa_id
    and mv.ativo = true
    and mv.data_inicio <= current_date
    and (mv.data_fim is null or mv.data_fim >= current_date)
  order by mv.created_at desc
  limit 1;
  if not found then
    raise exception using message = 'Este veículo não está atribuído a você.';
  end if;

  v_checklist_id := public.npi_driver_create_checklist(
    p_veiculo_id, v_motorista_id, p_modelo_checklist_id, 'Saída', p_observacoes, p_respostas
  );

  insert into public.retiradas (
    veiculo_id, motorista_id, data_hora_retirada, quilometragem_inicial,
    nivel_combustivel, destino, responsavel_liberacao, checklist_saida_id,
    observacoes, servico, servico_detalhes, km_base_registrada,
    km_divergencia_autorizada, km_autorizada_por, km_justificativa_autorizacao
  ) values (
    p_veiculo_id, v_motorista_id, now(), p_quilometragem_inicial,
    p_nivel_combustivel, nullif(btrim(p_destino), ''), 'Retirada pelo motorista', v_checklist_id,
    nullif(btrim(p_observacoes), ''), v_servico, v_servico_detalhes,
    coalesce(v_km_atual, 0), v_divergencia_aprovada, v_km_autorizada_por, v_km_justificativa
  ) returning id into v_retirada_id;

  if v_divergencia_aprovada then
    update public.npi_vehicle_km_approvals
    set usado_em = now(), retirada_id = v_retirada_id
    where id = p_autorizacao_km_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'retirada_id', v_retirada_id,
    'checklist_id', v_checklist_id,
    'km_base_registrada', coalesce(v_km_atual, 0),
    'km_divergencia_autorizada', v_divergencia_aprovada,
    'km_autorizada_por', v_km_autorizada_por
  );
end;
$$;

revoke all on function public.npi_driver_start_vehicle_use(uuid, numeric, numeric, text, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.npi_driver_start_vehicle_use(uuid, numeric, numeric, text, text, uuid, jsonb, uuid) to authenticated;

-- 5) Substitui a RPC de devolução para receber data/hora informada pelo motorista.
drop function if exists public.npi_driver_return_vehicle(uuid, numeric, numeric, text, text, uuid, jsonb);

create or replace function public.npi_driver_return_vehicle(
  p_retirada_id uuid,
  p_quilometragem_final numeric,
  p_nivel_combustivel numeric,
  p_condicoes_veiculo text,
  p_avarias_identificadas text,
  p_modelo_checklist_id uuid,
  p_respostas jsonb,
  p_data_hora_devolucao timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motorista_id uuid;
  v_empresa_id uuid;
  v_retirada public.retiradas%rowtype;
  v_checklist_id uuid;
  v_devolucao_id uuid;
begin
  if not (select public.npi_current_is_driver()) then
    raise exception using message = 'Somente usuários com perfil Motorista podem devolver veículos por este painel.';
  end if;
  v_motorista_id := (select public.npi_current_motorista_id());
  v_empresa_id := (select public.npi_current_empresa_id());
  if v_motorista_id is null or v_empresa_id is null then
    raise exception using message = 'Seu usuário não está vinculado a um motorista ativo.';
  end if;

  select r.* into v_retirada
  from public.retiradas r
  join public.veiculos v on v.id = r.veiculo_id
  where r.id = p_retirada_id
    and r.motorista_id = v_motorista_id
    and r.situacao = 'Em aberto'
    and v.empresa_id = v_empresa_id
  for update of r;
  if not found then
    raise exception using message = 'Não encontramos uma retirada em aberto vinculada ao seu usuário.';
  end if;
  if p_quilometragem_final is null or p_quilometragem_final < v_retirada.quilometragem_inicial then
    raise exception using message = 'A quilometragem final não pode ser menor que a quilometragem de saída.';
  end if;
  if p_data_hora_devolucao is null then
    raise exception using message = 'Informe a data e a hora da devolução.';
  end if;
  if p_data_hora_devolucao < v_retirada.data_hora_retirada then
    raise exception using message = 'A data/hora da devolução não pode ser anterior à retirada.';
  end if;
  if p_data_hora_devolucao > now() then
    raise exception using message = 'A data/hora da devolução não pode estar no futuro.';
  end if;
  if p_nivel_combustivel is not null and (p_nivel_combustivel < 0 or p_nivel_combustivel > 100) then
    raise exception using message = 'O combustível deve estar entre 0 e 100 por cento.';
  end if;
  if p_condicoes_veiculo = 'Com avarias ou danos' and nullif(btrim(p_avarias_identificadas), '') is null then
    raise exception using message = 'Descreva as avarias ou danos identificados.';
  end if;

  v_checklist_id := public.npi_driver_create_checklist(
    v_retirada.veiculo_id, v_motorista_id, p_modelo_checklist_id, 'Devolução', p_avarias_identificadas, p_respostas
  );

  insert into public.devolucoes (
    retirada_id, data_hora_devolucao, quilometragem_final, nivel_combustivel,
    condicoes_veiculo, avarias_identificadas, responsavel_recebimento, checklist_retorno_id
  ) values (
    p_retirada_id, p_data_hora_devolucao, p_quilometragem_final, p_nivel_combustivel,
    nullif(btrim(p_condicoes_veiculo), ''), nullif(btrim(p_avarias_identificadas), ''),
    'Devolução pelo motorista', v_checklist_id
  ) returning id into v_devolucao_id;

  return jsonb_build_object(
    'ok', true,
    'devolucao_id', v_devolucao_id,
    'checklist_id', v_checklist_id,
    'data_hora_devolucao', p_data_hora_devolucao
  );
end;
$$;

revoke all on function public.npi_driver_return_vehicle(uuid, numeric, numeric, text, text, uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.npi_driver_return_vehicle(uuid, numeric, numeric, text, text, uuid, jsonb, timestamptz) to authenticated;

commit;

-- Testes manuais recomendados:
-- 1) Devolva uma utilização com data/hora real e confira devolucoes.data_hora_devolucao.
-- 2) O KM final da devolução deve atualizar veiculos.quilometragem_atual (trigger existente).
-- 3) Inicie outra utilização com exatamente o KM atual: não deve pedir aprovação.
-- 4) Inicie com KM maior: deve exigir e-mail/senha de Gestor de Frota ou Administrador.
-- 5) Tente usar a mesma autorização duas vezes: a segunda tentativa deve ser bloqueada.
-- 6) Tente iniciar com KM menor: a operação deve ser bloqueada.
