-- ============================================================================
-- NPI FROTA | AÇÕES DO MOTORISTA NO MEU PAINEL + CHECKLIST DE SAÍDA/RETORNO
-- Pré-requisitos: Etapas 1, 2, 3 e SQL de retiradas/devoluções já executados.
-- Execute uma vez no Supabase > SQL Editor. O script pode ser reexecutado.
-- ============================================================================

begin;

-- 1) Modelo padrão de checklist. Não cria registros de veículos/retiradas:
-- apenas itens de inspeção reutilizáveis para todos os veículos.
do $$
declare
  v_modelo_id uuid;
begin
  select id into v_modelo_id
  from public.modelos_checklist
  where lower(btrim(nome)) = lower('Checklist padrão de utilização')
  order by created_at asc
  limit 1;

  if v_modelo_id is null then
    insert into public.modelos_checklist
      (nome, categoria_veiculo, descricao, obrigatorio_saida, obrigatorio_devolucao, situacao)
    values
      ('Checklist padrão de utilização', 'Todas',
       'Inspeção do veículo antes da saída e no momento da devolução.', true, true, 'Ativo')
    returning id into v_modelo_id;
  else
    update public.modelos_checklist
       set categoria_veiculo = coalesce(categoria_veiculo, 'Todas'),
           obrigatorio_saida = true,
           obrigatorio_devolucao = true,
           situacao = 'Ativo'
     where id = v_modelo_id;
  end if;

  insert into public.itens_checklist
    (modelo_checklist_id, descricao, grupo, tipo_resposta, obrigatorio, exige_fotografia, ordem, situacao)
  select v_modelo_id, item.descricao, item.grupo, 'Condição', true, false, item.ordem, 'Ativo'
  from (values
    ('Pneus e estepe', 'Segurança', 10),
    ('Freios e freio de estacionamento', 'Segurança', 20),
    ('Faróis, lanternas e luz de freio', 'Iluminação', 30),
    ('Setas e pisca-alerta', 'Iluminação', 40),
    ('Retrovisores e vidros', 'Carroceria', 50),
    ('Limpadores e para-brisa', 'Segurança', 60),
    ('Cintos de segurança', 'Segurança', 70),
    ('Buzina', 'Segurança', 80),
    ('Nível de óleo e fluidos', 'Motor', 90),
    ('Documentos e equipamentos obrigatórios', 'Documentação', 100),
    ('Triângulo, macaco e chave de roda', 'Equipamentos', 110),
    ('Lataria, pintura e avarias aparentes', 'Carroceria', 120)
  ) as item(descricao, grupo, ordem)
  where not exists (
    select 1 from public.itens_checklist i
    where i.modelo_checklist_id = v_modelo_id
      and lower(btrim(i.descricao)) = lower(btrim(item.descricao))
  );
end;
$$;

-- 2) O motorista pode consultar somente modelos e itens ativos para preencher
-- o checklist no próprio painel. Edição dos modelos continua administrativa.
revoke all on public.modelos_checklist, public.itens_checklist from anon, authenticated;
grant select on public.modelos_checklist, public.itens_checklist to authenticated;
-- O histórico dos checklists é gravado somente pelas funções RPC controladas.
revoke all on public.checklists, public.checklist_respostas from anon, authenticated;
alter table public.checklists enable row level security;
alter table public.checklist_respostas enable row level security;
alter table public.modelos_checklist enable row level security;
alter table public.itens_checklist enable row level security;

drop policy if exists modelos_checklist_driver_read_active on public.modelos_checklist;
create policy modelos_checklist_driver_read_active
on public.modelos_checklist for select to authenticated
using (situacao = 'Ativo' and (
  (select public.npi_current_is_driver())
  or (select public.npi_has_permission('modelos','visualizar'))
));

drop policy if exists itens_checklist_driver_read_active on public.itens_checklist;
create policy itens_checklist_driver_read_active
on public.itens_checklist for select to authenticated
using (situacao = 'Ativo' and exists (
  select 1 from public.modelos_checklist mc
  where mc.id = itens_checklist.modelo_checklist_id and mc.situacao = 'Ativo'
));

-- 3) Permitir que o motorista consulte apenas as próprias retiradas abertas
-- e as próprias devoluções. Escrita operacional será feita pelas RPCs abaixo.
grant select on public.retiradas, public.devolucoes to authenticated;

drop policy if exists retiradas_select_driver_own on public.retiradas;
create policy retiradas_select_driver_own
on public.retiradas for select to authenticated
using (
  motorista_id = (select public.npi_current_motorista_id())
  and (select public.npi_current_is_driver())
  and exists (
    select 1 from public.veiculos v
    where v.id = retiradas.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

drop policy if exists devolucoes_select_driver_own on public.devolucoes;
create policy devolucoes_select_driver_own
on public.devolucoes for select to authenticated
using (
  (select public.npi_current_is_driver())
  and exists (
    select 1 from public.retiradas r
    join public.veiculos v on v.id = r.veiculo_id
    where r.id = devolucoes.retirada_id
      and r.motorista_id = (select public.npi_current_motorista_id())
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

-- 4) Função privada que grava o cabeçalho do checklist e as respostas.
-- Só pode ser chamada pelas RPCs de início e devolução.
create or replace function public.npi_driver_create_checklist(
  p_veiculo_id uuid,
  p_motorista_id uuid,
  p_modelo_checklist_id uuid,
  p_tipo_checklist text,
  p_observacoes text,
  p_respostas jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modelo public.modelos_checklist%rowtype;
  v_item public.itens_checklist%rowtype;
  v_resposta jsonb;
  v_item_id uuid;
  v_valor text;
  v_obs text;
  v_checklist_id uuid;
  v_required_count integer;
  v_answered_required_count integer;
  v_resultado text;
begin
  if p_tipo_checklist not in ('Saída','Devolução') then
    raise exception 'Tipo de checklist inválido.';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'array' then
    raise exception 'Informe as respostas do checklist.';
  end if;

  select * into v_modelo
  from public.modelos_checklist mc
  where mc.id = p_modelo_checklist_id and mc.situacao = 'Ativo';
  if not found then raise exception 'Modelo de checklist não encontrado ou inativo.'; end if;
  if p_tipo_checklist = 'Saída' and not v_modelo.obrigatorio_saida then
    raise exception 'O modelo selecionado não está habilitado para checklist de saída.';
  end if;
  if p_tipo_checklist = 'Devolução' and not v_modelo.obrigatorio_devolucao then
    raise exception 'O modelo selecionado não está habilitado para checklist de devolução.';
  end if;

  select count(*) into v_required_count
  from public.itens_checklist i
  where i.modelo_checklist_id = v_modelo.id and i.situacao = 'Ativo' and i.obrigatorio = true;

  -- Toda resposta precisa apontar para um item do modelo e usar uma opção válida.
  for v_resposta in select value from jsonb_array_elements(p_respostas)
  loop
    v_item_id := nullif(v_resposta->>'item_id','')::uuid;
    v_valor := nullif(btrim(v_resposta->>'resposta'),'');
    v_obs := nullif(btrim(v_resposta->>'observacao'),'');
    if v_item_id is null then raise exception 'Há uma resposta sem item de checklist.'; end if;
    select * into v_item from public.itens_checklist i
    where i.id = v_item_id and i.modelo_checklist_id = v_modelo.id and i.situacao = 'Ativo';
    if not found then raise exception 'O checklist contém um item inválido.'; end if;
    if v_valor not in ('Conforme','Não conforme','Não se aplica') then
      raise exception 'Selecione uma condição para todos os itens obrigatórios.';
    end if;
    if v_valor = 'Não conforme' and v_obs is null then
      raise exception 'Descreva a ocorrência dos itens marcados como Não conforme.';
    end if;
  end loop;

  if (select count(*) from jsonb_array_elements(p_respostas)) <>
     (select count(distinct value->>'item_id') from jsonb_array_elements(p_respostas)) then
    raise exception 'O checklist contém itens repetidos.';
  end if;

  select count(*) into v_answered_required_count
  from public.itens_checklist i
  where i.modelo_checklist_id = v_modelo.id
    and i.situacao = 'Ativo'
    and i.obrigatorio = true
    and exists (
      select 1 from jsonb_array_elements(p_respostas) a(value)
      where a.value->>'item_id' = i.id::text
        and nullif(btrim(a.value->>'resposta'),'') is not null
    );
  if v_answered_required_count < v_required_count then
    raise exception 'Preencha todos os itens obrigatórios do checklist.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_respostas) a(value)
    where a.value->>'resposta' = 'Não conforme'
  ) then
    v_resultado := 'Com apontamentos';
  else
    v_resultado := 'Conforme';
  end if;

  insert into public.checklists
    (modelo_checklist_id, veiculo_id, motorista_id, tipo_checklist, data_hora,
     resultado, observacoes, fotografias, responsavel)
  values
    (v_modelo.id, p_veiculo_id, p_motorista_id, p_tipo_checklist, now(),
     v_resultado, nullif(btrim(p_observacoes),''), '[]'::jsonb, 'Motorista')
  returning id into v_checklist_id;

  for v_resposta in select value from jsonb_array_elements(p_respostas)
  loop
    v_item_id := nullif(v_resposta->>'item_id','')::uuid;
    v_valor := nullif(btrim(v_resposta->>'resposta'),'');
    v_obs := nullif(btrim(v_resposta->>'observacao'),'');
    insert into public.checklist_respostas
      (checklist_id, item_checklist_id, descricao_item, resposta, observacao, fotografias)
    select v_checklist_id, i.id, i.descricao, v_valor, v_obs, '[]'::jsonb
    from public.itens_checklist i where i.id = v_item_id;
  end loop;

  return v_checklist_id;
end;
$$;

-- 5) RPC: motorista inicia a utilização do veículo que está atribuído a ele.
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
begin
  if not (select public.npi_current_is_driver()) then
    raise exception 'Somente usuários com perfil Motorista podem iniciar uma utilização por este painel.';
  end if;
  v_motorista_id := (select public.npi_current_motorista_id());
  v_empresa_id := (select public.npi_current_empresa_id());
  if v_motorista_id is null or v_empresa_id is null then raise exception 'Seu usuário não está vinculado a um motorista ativo.'; end if;
  if p_quilometragem_inicial is null or p_quilometragem_inicial < 0 then raise exception 'Informe uma quilometragem válida.'; end if;
  if nullif(btrim(p_destino),'') is null then raise exception 'Informe o destino ou local de utilização.'; end if;
  if p_nivel_combustivel is not null and (p_nivel_combustivel < 0 or p_nivel_combustivel > 100) then raise exception 'O combustível deve estar entre 0 e 100 por cento.'; end if;

  if not exists (
    select 1 from public.motoristas m
    where m.id = v_motorista_id and m.empresa_id = v_empresa_id and m.situacao = 'Ativo'
  ) then raise exception 'Seu cadastro de motorista está inativo.'; end if;

  select v.quilometragem_atual, v.situacao into v_km_atual, v_situacao
  from public.veiculos v
  where v.id = p_veiculo_id and v.empresa_id = v_empresa_id
  for update;
  if not found then raise exception 'Veículo não encontrado na sua empresa.'; end if;
  if v_situacao <> 'Disponível' then raise exception 'Este veículo não está disponível para utilização.'; end if;
  if p_quilometragem_inicial < coalesce(v_km_atual,0) then
    raise exception 'A quilometragem de saída não pode ser menor que a quilometragem atual do veículo.';
  end if;
  if not exists (
    select 1 from public.motorista_veiculos mv
    where mv.motorista_id = v_motorista_id and mv.veiculo_id = p_veiculo_id
      and mv.empresa_id = v_empresa_id and mv.ativo = true
      and mv.data_inicio <= current_date and (mv.data_fim is null or mv.data_fim >= current_date)
  ) then raise exception 'Este veículo não está atribuído a você.'; end if;

  v_checklist_id := public.npi_driver_create_checklist(
    p_veiculo_id, v_motorista_id, p_modelo_checklist_id, 'Saída', p_observacoes, p_respostas
  );

  insert into public.retiradas
    (veiculo_id, motorista_id, data_hora_retirada, quilometragem_inicial,
     nivel_combustivel, destino, responsavel_liberacao, checklist_saida_id, observacoes)
  values
    (p_veiculo_id, v_motorista_id, now(), p_quilometragem_inicial,
     p_nivel_combustivel, nullif(btrim(p_destino),''), 'Retirada pelo motorista', v_checklist_id,
     nullif(btrim(p_observacoes),''))
  returning id into v_retirada_id;

  return jsonb_build_object('ok', true, 'retirada_id', v_retirada_id, 'checklist_id', v_checklist_id);
end;
$$;

-- 6) RPC: motorista devolve somente uma retirada aberta do próprio cadastro.
create or replace function public.npi_driver_return_vehicle(
  p_retirada_id uuid,
  p_quilometragem_final numeric,
  p_nivel_combustivel numeric,
  p_condicoes_veiculo text,
  p_avarias_identificadas text,
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
  v_retirada public.retiradas%rowtype;
  v_checklist_id uuid;
  v_devolucao_id uuid;
begin
  if not (select public.npi_current_is_driver()) then
    raise exception 'Somente usuários com perfil Motorista podem devolver veículos por este painel.';
  end if;
  v_motorista_id := (select public.npi_current_motorista_id());
  v_empresa_id := (select public.npi_current_empresa_id());
  if v_motorista_id is null or v_empresa_id is null then raise exception 'Seu usuário não está vinculado a um motorista ativo.'; end if;

  select r.* into v_retirada
  from public.retiradas r
  join public.veiculos v on v.id = r.veiculo_id
  where r.id = p_retirada_id
    and r.motorista_id = v_motorista_id
    and r.situacao = 'Em aberto'
    and v.empresa_id = v_empresa_id
  for update of r;
  if not found then raise exception 'Não encontramos uma retirada em aberto vinculada ao seu usuário.'; end if;
  if p_quilometragem_final is null or p_quilometragem_final < v_retirada.quilometragem_inicial then
    raise exception 'A quilometragem final não pode ser menor que a quilometragem de saída.';
  end if;
  if p_nivel_combustivel is not null and (p_nivel_combustivel < 0 or p_nivel_combustivel > 100) then raise exception 'O combustível deve estar entre 0 e 100 por cento.'; end if;
  if p_condicoes_veiculo = 'Com avarias ou danos' and nullif(btrim(p_avarias_identificadas),'') is null then
    raise exception 'Descreva as avarias ou danos identificados.';
  end if;

  v_checklist_id := public.npi_driver_create_checklist(
    v_retirada.veiculo_id, v_motorista_id, p_modelo_checklist_id, 'Devolução', p_avarias_identificadas, p_respostas
  );

  insert into public.devolucoes
    (retirada_id, data_hora_devolucao, quilometragem_final, nivel_combustivel,
     condicoes_veiculo, avarias_identificadas, responsavel_recebimento, checklist_retorno_id)
  values
    (p_retirada_id, now(), p_quilometragem_final, p_nivel_combustivel,
     nullif(btrim(p_condicoes_veiculo),''), nullif(btrim(p_avarias_identificadas),''),
     'Devolução pelo motorista', v_checklist_id)
  returning id into v_devolucao_id;

  return jsonb_build_object('ok', true, 'devolucao_id', v_devolucao_id, 'checklist_id', v_checklist_id);
end;
$$;

-- As funções auxiliares não podem ser chamadas isoladamente pelo navegador.
revoke all on function public.npi_driver_create_checklist(uuid,uuid,uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.npi_driver_start_vehicle_use(uuid,numeric,numeric,text,text,uuid,jsonb) from public, anon;
revoke all on function public.npi_driver_return_vehicle(uuid,numeric,numeric,text,text,uuid,jsonb) from public, anon;
grant execute on function public.npi_driver_start_vehicle_use(uuid,numeric,numeric,text,text,uuid,jsonb) to authenticated;
grant execute on function public.npi_driver_return_vehicle(uuid,numeric,numeric,text,text,uuid,jsonb) to authenticated;

-- 7) RPC segura para o motorista encerrar o próprio vínculo com um veículo.

create or replace function public.npi_driver_unassign_vehicle(
  p_assignment_id uuid
)
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

  -- Bloqueia e trava o veículo antes de conferir retiradas em aberto.
  -- Assim, uma retirada concorrente não pode começar durante a desvinculação.
  select v.situacao into v_veiculo_situacao
  from public.veiculos v
  where v.id = v_assignment.veiculo_id
    and v.empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception using message = 'O veículo deste vínculo não foi encontrado na sua empresa.';
  end if;

  if exists (
    select 1
    from public.retiradas r
    where r.veiculo_id = v_assignment.veiculo_id
      and r.situacao = 'Em aberto'
  ) then
    raise exception using message = 'Não é possível se desvincular enquanto houver uma retirada em aberto. Registre a devolução primeiro.';
  end if;

  if coalesce(v_veiculo_situacao, '') = 'Em utilização' then
    raise exception using message = 'O veículo consta como Em utilização. Solicite a conferência da operação antes de se desvincular.';
  end if;

  update public.motorista_veiculos
  set ativo = false,
      data_fim = current_date
  where id = v_assignment.id
    and motorista_id = v_motorista_id
    and empresa_id = v_empresa_id
    and ativo = true;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment.id,
    'veiculo_id', v_assignment.veiculo_id,
    'data_fim', current_date,
    'mensagem', 'Vínculo encerrado. O histórico foi preservado.'
  );
end;
$$;

revoke all on function public.npi_driver_unassign_vehicle(uuid) from public, anon;
grant execute on function public.npi_driver_unassign_vehicle(uuid) to authenticated;


commit;

-- Resultado:
-- * Motorista vê apenas seus veículos atribuídos.
-- * Em veículo disponível, aparece Utilizar veículo.
-- * Em veículo com retirada aberta do próprio motorista, aparece Devolver veículo.
-- * Os checklists de saída e retorno e suas respostas ficam gravados e vinculados.
-- * Os gatilhos existentes atualizam situação e quilometragem do veículo.
