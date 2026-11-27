-- ============================================================================
-- NPI FROTA | AUTOATENDIMENTO DO MOTORISTA: ESCOLHER VEÍCULO + SERVIÇO
-- Pré-requisitos: scripts RBAC, retiradas/devoluções, painel/checklist e
-- desvinculação já executados.
-- Execute este script no Supabase > SQL Editor. Pode ser reexecutado.
-- ============================================================================

begin;

-- 1) Guarda o serviço escolhido no vínculo e no histórico da retirada.
alter table public.motorista_veiculos
  add column if not exists servico text;
alter table public.motorista_veiculos
  add column if not exists servico_detalhes text;
alter table public.retiradas
  add column if not exists servico text;
alter table public.retiradas
  add column if not exists servico_detalhes text;

-- 2) Impede que dois motoristas mantenham vínculos ativos para o mesmo veículo.
-- O bloqueio da linha do veículo serializa tentativas simultâneas.
create or replace function public.npi_guard_active_vehicle_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id uuid;
  v_situacao text;
begin
  if new.ativo = true and (new.data_fim is null or new.data_fim >= current_date) then
    select v.empresa_id, v.situacao
      into v_empresa_id, v_situacao
    from public.veiculos v
    where v.id = new.veiculo_id
    for update;

    if not found then
      raise exception using message = 'O veículo selecionado não foi encontrado.';
    end if;
    if v_empresa_id is distinct from new.empresa_id then
      raise exception using message = 'O veículo e o motorista precisam pertencer à mesma empresa.';
    end if;
    if v_situacao not in ('Disponível', 'Reservado') then
      raise exception using message = 'Este veículo não está disponível para receber um vínculo.';
    end if;

    if exists (
      select 1
      from public.motorista_veiculos mv
      where mv.veiculo_id = new.veiculo_id
        and mv.ativo = true
        and (mv.data_fim is null or mv.data_fim >= current_date)
        and mv.id is distinct from new.id
    ) then
      raise exception using message = 'Este veículo já está vinculado a outro motorista.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists motorista_veiculos_guard_active on public.motorista_veiculos;
create trigger motorista_veiculos_guard_active
before insert or update on public.motorista_veiculos
for each row execute function public.npi_guard_active_vehicle_assignment();

-- 3) Lista apenas veículos livres da empresa do motorista, sem expor campos
-- confidenciais como Renavam e Chassi ao navegador.
create or replace function public.npi_driver_list_available_vehicles()
returns table (
  id uuid,
  placa text,
  codigo_interno text,
  marca text,
  modelo text,
  categoria text,
  quilometragem_atual numeric,
  situacao text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa_id uuid;
  v_motorista_id uuid;
begin
  if not (select public.npi_current_is_driver()) then
    raise exception using message = 'Somente usuários com perfil Motorista podem consultar veículos disponíveis por este painel.';
  end if;

  v_empresa_id := (select public.npi_current_empresa_id());
  v_motorista_id := (select public.npi_current_motorista_id());

  if v_empresa_id is null or v_motorista_id is null then
    raise exception using message = 'Seu usuário não está vinculado a um motorista ativo.';
  end if;
  if not exists (
    select 1 from public.motoristas m
    where m.id = v_motorista_id
      and m.empresa_id = v_empresa_id
      and m.situacao = 'Ativo'
  ) then
    raise exception using message = 'Seu cadastro de motorista está inativo.';
  end if;

  return query
  select v.id,
         v.placa::text,
         v.codigo_interno::text,
         v.marca::text,
         v.modelo::text,
         v.categoria::text,
         coalesce(v.quilometragem_atual, 0)::numeric,
         v.situacao::text
  from public.veiculos v
  where v.empresa_id = v_empresa_id
    and v.situacao = 'Disponível'
    and not exists (
      select 1 from public.motorista_veiculos mv
      where mv.veiculo_id = v.id
        and mv.ativo = true
        and (mv.data_fim is null or mv.data_fim >= current_date)
    )
    and not exists (
      select 1 from public.retiradas r
      where r.veiculo_id = v.id and r.situacao = 'Em aberto'
    )
  order by v.codigo_interno nulls last, v.placa;
end;
$$;

-- 4) Motorista escolhe veículo e serviço. O vínculo é criado atomicamente e o
-- veículo passa a Reservado. O início da viagem continua exigindo checklist.
create or replace function public.npi_driver_self_assign_vehicle(
  p_veiculo_id uuid,
  p_servico text,
  p_servico_detalhes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motorista_id uuid;
  v_empresa_id uuid;
  v_situacao text;
  v_assignment_id uuid;
  v_servico text;
  v_detalhes text;
begin
  if not (select public.npi_current_is_driver()) then
    raise exception using message = 'Somente usuários com perfil Motorista podem vincular veículos pelo Meu Painel.';
  end if;

  v_motorista_id := (select public.npi_current_motorista_id());
  v_empresa_id := (select public.npi_current_empresa_id());
  v_servico := nullif(btrim(p_servico), '');
  v_detalhes := nullif(btrim(p_servico_detalhes), '');

  if v_motorista_id is null or v_empresa_id is null then
    raise exception using message = 'Seu usuário não está vinculado a um motorista ativo.';
  end if;
  if not exists (
    select 1 from public.motoristas m
    where m.id = v_motorista_id and m.empresa_id = v_empresa_id and m.situacao = 'Ativo'
  ) then
    raise exception using message = 'Seu cadastro de motorista está inativo.';
  end if;
  if v_servico is null or v_servico not in (
    'Atendimento funerário',
    'Remoção',
    'Translado',
    'Sepultamento / cortejo',
    'Entrega / retirada de materiais',
    'Apoio operacional',
    'Serviço administrativo',
    'Outro'
  ) then
    raise exception using message = 'Selecione um serviço válido.';
  end if;
  if v_servico = 'Outro' and v_detalhes is null then
    raise exception using message = 'Descreva o serviço selecionado como Outro.';
  end if;
  if length(coalesce(v_detalhes, '')) > 1000 then
    raise exception using message = 'Os detalhes do serviço devem ter no máximo 1.000 caracteres.';
  end if;

  select v.situacao into v_situacao
  from public.veiculos v
  where v.id = p_veiculo_id and v.empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception using message = 'Veículo não encontrado na sua empresa.';
  end if;
  if v_situacao <> 'Disponível' then
    raise exception using message = 'Este veículo não está mais disponível. Atualize o painel e escolha outro.';
  end if;
  if exists (
    select 1 from public.motorista_veiculos mv
    where mv.veiculo_id = p_veiculo_id
      and mv.ativo = true
      and (mv.data_fim is null or mv.data_fim >= current_date)
  ) then
    raise exception using message = 'Este veículo já foi vinculado a outro motorista. Atualize o painel.';
  end if;
  if exists (
    select 1 from public.retiradas r
    where r.veiculo_id = p_veiculo_id and r.situacao = 'Em aberto'
  ) then
    raise exception using message = 'Este veículo possui uma retirada em aberto e não pode ser escolhido.';
  end if;

  insert into public.motorista_veiculos
    (empresa_id, motorista_id, veiculo_id, data_inicio, data_fim, ativo,
     servico, servico_detalhes, observacoes)
  values
    (v_empresa_id, v_motorista_id, p_veiculo_id, current_date, null, true,
     v_servico, v_detalhes, v_detalhes)
  returning id into v_assignment_id;

  update public.veiculos
  set situacao = 'Reservado'
  where id = p_veiculo_id and empresa_id = v_empresa_id;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'veiculo_id', p_veiculo_id,
    'servico', v_servico,
    'situacao', 'Reservado',
    'mensagem', 'Veículo reservado para o motorista. O checklist de saída será exigido no início da utilização.'
  );
end;
$$;

-- 5) A retirada manual/por painel também aceita veículo Reservado, mas somente
-- quando existe vínculo ativo do motorista que está iniciando a operação.
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
  select v.situacao, v.empresa_id
    into v_veiculo_situacao, v_empresa_id
  from public.veiculos v
  where v.id = new.veiculo_id
  for update;

  select m.empresa_id into v_motorista_empresa_id
  from public.motoristas m where m.id = new.motorista_id;

  if v_veiculo_situacao is distinct from 'Disponível'
     and v_veiculo_situacao is distinct from 'Reservado' then
    raise exception using message = 'O veículo não está disponível para retirada.';
  end if;
  if v_empresa_id is null or v_empresa_id is distinct from v_motorista_empresa_id then
    raise exception using message = 'O veículo e o motorista precisam pertencer à mesma empresa.';
  end if;
  if not exists (
    select 1 from public.motorista_veiculos mv
    where mv.veiculo_id = new.veiculo_id
      and mv.motorista_id = new.motorista_id
      and mv.empresa_id = v_empresa_id
      and mv.ativo = true
      and mv.data_inicio <= current_date
      and (mv.data_fim is null or mv.data_fim >= current_date)
  ) then
    raise exception using message = 'O motorista não possui vínculo ativo para este veículo.';
  end if;
  new.situacao := 'Em aberto';
  return new;
end;
$$;

-- 6) Atualiza a RPC de início para copiar o serviço escolhido para o histórico
-- da retirada. Mantém a assinatura usada pelo painel do motorista.
create or replace function public.npi_driver_start_vehicle_use(
  p_veiculo_id uuid,
  p_quilometragem_inicial numeric,
  p_nivel_combustivel numeric,
  p_destino text,
  p_observacoes text,
  p_modelo_checklist_id uuid,
  p_respostas jsonb
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
  v_servico text;
  v_servico_detalhes text;
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
    raise exception using message = 'A quilometragem de saída não pode ser menor que a quilometragem atual do veículo.';
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
    raise exception using message = 'Este veículo não está vinculado a você. Escolha um veículo disponível no Meu Painel.';
  end if;

  v_checklist_id := public.npi_driver_create_checklist(
    p_veiculo_id, v_motorista_id, p_modelo_checklist_id, 'Saída', p_observacoes, p_respostas
  );

  insert into public.retiradas
    (veiculo_id, motorista_id, data_hora_retirada, quilometragem_inicial,
     nivel_combustivel, destino, responsavel_liberacao, checklist_saida_id,
     observacoes, servico, servico_detalhes)
  values
    (p_veiculo_id, v_motorista_id, now(), p_quilometragem_inicial,
     p_nivel_combustivel, nullif(btrim(p_destino), ''), 'Retirada pelo motorista', v_checklist_id,
     nullif(btrim(p_observacoes), ''), v_servico, v_servico_detalhes)
  returning id into v_retirada_id;

  return jsonb_build_object(
    'ok', true,
    'retirada_id', v_retirada_id,
    'checklist_id', v_checklist_id,
    'servico', v_servico
  );
end;
$$;

-- 7) Atualiza a desvinculação para devolver à lista o veículo apenas quando
-- ele foi reservado pelo motorista, sem apagar histórico ou mexer em viagens.
create or replace function public.npi_driver_unassign_vehicle(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motorista_id uuid;
  v_empresa_id uuid;
  v_assignment public.motorista_veiculos%rowtype;
  v_veiculo_situacao text;
begin
  if not (select public.npi_current_is_driver()) then
    raise exception using message = 'Somente usuários com perfil Motorista podem se desvincular pelo Meu Painel.';
  end if;

  v_motorista_id := (select public.npi_current_motorista_id());
  v_empresa_id := (select public.npi_current_empresa_id());
  if v_motorista_id is null or v_empresa_id is null then
    raise exception using message = 'Seu usuário não está vinculado a um motorista ativo.';
  end if;

  select mv.* into v_assignment
  from public.motorista_veiculos mv
  where mv.id = p_assignment_id
    and mv.motorista_id = v_motorista_id
    and mv.empresa_id = v_empresa_id
    and mv.ativo = true
    and mv.data_inicio <= current_date
    and (mv.data_fim is null or mv.data_fim >= current_date)
  for update;

  if not found then
    raise exception using message = 'Este vínculo não está ativo ou não pertence ao seu cadastro.';
  end if;

  select v.situacao into v_veiculo_situacao
  from public.veiculos v
  where v.id = v_assignment.veiculo_id and v.empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception using message = 'O veículo deste vínculo não foi encontrado na sua empresa.';
  end if;
  if exists (
    select 1 from public.retiradas r
    where r.veiculo_id = v_assignment.veiculo_id and r.situacao = 'Em aberto'
  ) then
    raise exception using message = 'Não é possível se desvincular enquanto houver uma retirada em aberto. Registre a devolução primeiro.';
  end if;
  if coalesce(v_veiculo_situacao, '') = 'Em utilização' then
    raise exception using message = 'O veículo consta como Em utilização. Registre a devolução antes de se desvincular.';
  end if;

  update public.motorista_veiculos
  set ativo = false, data_fim = current_date
  where id = v_assignment.id and motorista_id = v_motorista_id
    and empresa_id = v_empresa_id and ativo = true;

  if v_veiculo_situacao = 'Reservado' then
    update public.veiculos set situacao = 'Disponível'
    where id = v_assignment.veiculo_id and empresa_id = v_empresa_id and situacao = 'Reservado';
  end if;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment.id,
    'veiculo_id', v_assignment.veiculo_id,
    'data_fim', current_date,
    'mensagem', 'Vínculo encerrado. O veículo voltou para a lista de disponíveis e o histórico foi preservado.'
  );
end;
$$;

-- 8) Apenas usuários autenticados podem consultar a lista e executar as ações.
revoke all on function public.npi_driver_list_available_vehicles() from public, anon;
revoke all on function public.npi_driver_self_assign_vehicle(uuid, text, text) from public, anon;
revoke all on function public.npi_driver_unassign_vehicle(uuid) from public, anon;
grant execute on function public.npi_driver_list_available_vehicles() to authenticated;
grant execute on function public.npi_driver_self_assign_vehicle(uuid, text, text) to authenticated;
grant execute on function public.npi_driver_unassign_vehicle(uuid) to authenticated;

commit;

-- TESTE:
-- 1. Entre com usuário de perfil Motorista.
-- 2. Abra Meu Painel > Veículos disponíveis para você.
-- 3. Escolha um veículo e informe o serviço.
-- 4. O veículo deverá ficar Reservado e aparecer em Veículos vinculados a você.
-- 5. Inicie a utilização com o checklist de saída; na devolução, o veículo volta
--    a Disponível e o serviço fica guardado no histórico da retirada.
