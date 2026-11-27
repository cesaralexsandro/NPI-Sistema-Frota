-- NPI FROTA | ETAPA 6 - MANUTENÇÕES
-- Pré-requisitos: Etapas 1, 2 e 3 de banco/perfis já executadas.
-- A tabela public.manutencoes já existe na Etapa 2. Este script apenas
-- complementa colunas, libera o CRUD por RLS e sincroniza a situação do veículo.
-- Script idempotente: pode ser executado novamente sem apagar os registros.

begin;

-- 1) Complementos necessários ao formulário de manutenção.
alter table public.manutencoes
  add column if not exists valor_pecas numeric(14,2) not null default 0 check (valor_pecas >= 0),
  add column if not exists centro_custo_id uuid references public.centros_custo(id) on delete set null,
  add column if not exists projeto_id uuid references public.projetos(id) on delete set null;

create index if not exists manutencoes_situacao_idx
  on public.manutencoes (situacao, data_abertura desc);
create index if not exists manutencoes_centro_custo_idx
  on public.manutencoes (centro_custo_id);
create index if not exists manutencoes_projeto_idx
  on public.manutencoes (projeto_id);

-- 2) Permissões SQL: autenticados podem usar a tabela somente sob RLS.
grant select, insert, update, delete on public.manutencoes to authenticated;
revoke all on public.manutencoes from anon;
alter table public.manutencoes enable row level security;

-- SELECT: permissão de consulta e veículo pertencente à empresa da sessão.
drop policy if exists manutencoes_select_role on public.manutencoes;
create policy manutencoes_select_role
on public.manutencoes
for select to authenticated
using (
  (select public.npi_has_permission('manutencoes', 'visualizar'))
  and exists (
    select 1
    from public.veiculos v
    where v.id = manutencoes.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

-- INSERT: valida permissão, veículo e referências opcionais da mesma empresa.
drop policy if exists manutencoes_insert_role on public.manutencoes;
create policy manutencoes_insert_role
on public.manutencoes
for insert to authenticated
with check (
  (select public.npi_has_permission('manutencoes', 'incluir'))
  and exists (
    select 1
    from public.veiculos v
    where v.id = manutencoes.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
  and (
    manutencoes.centro_custo_id is null
    or exists (
      select 1 from public.centros_custo cc
      where cc.id = manutencoes.centro_custo_id
        and cc.empresa_id = (select public.npi_current_empresa_id())
    )
  )
  and (
    manutencoes.projeto_id is null
    or exists (
      select 1 from public.projetos p
      where p.id = manutencoes.projeto_id
        and p.empresa_id = (select public.npi_current_empresa_id())
    )
  )
);

-- UPDATE: mantém veículo, centro de custo e projeto dentro da empresa do usuário.
drop policy if exists manutencoes_update_role on public.manutencoes;
create policy manutencoes_update_role
on public.manutencoes
for update to authenticated
using (
  (select public.npi_has_permission('manutencoes', 'alterar'))
  and exists (
    select 1 from public.veiculos v
    where v.id = manutencoes.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
)
with check (
  (select public.npi_has_permission('manutencoes', 'alterar'))
  and exists (
    select 1 from public.veiculos v
    where v.id = manutencoes.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
  and (
    manutencoes.centro_custo_id is null
    or exists (
      select 1 from public.centros_custo cc
      where cc.id = manutencoes.centro_custo_id
        and cc.empresa_id = (select public.npi_current_empresa_id())
    )
  )
  and (
    manutencoes.projeto_id is null
    or exists (
      select 1 from public.projetos p
      where p.id = manutencoes.projeto_id
        and p.empresa_id = (select public.npi_current_empresa_id())
    )
  )
);

-- DELETE: somente perfis com permissão explícita de exclusão.
drop policy if exists manutencoes_delete_role on public.manutencoes;
create policy manutencoes_delete_role
on public.manutencoes
for delete to authenticated
using (
  (select public.npi_has_permission('manutencoes', 'excluir'))
  and exists (
    select 1 from public.veiculos v
    where v.id = manutencoes.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

-- 3) Atualização segura da situação do veículo.
-- Uma manutenção em andamento coloca o veículo em Manutenção. Quando não
-- houver mais nenhuma manutenção em andamento, o veículo volta a Disponível.
-- Não inicia manutenção em veículo Reservado, Em utilização ou Inativo.
create or replace function public.npi_refresh_vehicle_maintenance_status(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status text;
  v_has_ongoing boolean;
begin
  if p_vehicle_id is null then return; end if;

  select v.situacao
    into v_current_status
  from public.veiculos v
  where v.id = p_vehicle_id
  for update;

  if not found then return; end if;

  select exists (
    select 1
    from public.manutencoes m
    where m.veiculo_id = p_vehicle_id
      and m.situacao = 'Em andamento'
  ) into v_has_ongoing;

  if v_has_ongoing then
    if v_current_status not in ('Disponível', 'Manutenção') then
      raise exception 'Não é possível iniciar manutenção: o veículo está com situação %.', v_current_status
        using errcode = '23514';
    end if;
    update public.veiculos
      set situacao = 'Manutenção', updated_at = now()
    where id = p_vehicle_id and situacao <> 'Manutenção';
  elsif v_current_status = 'Manutenção' then
    update public.veiculos
      set situacao = 'Disponível', updated_at = now()
    where id = p_vehicle_id;
  end if;
end;
$$;

create or replace function public.npi_sync_vehicle_maintenance_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.npi_refresh_vehicle_maintenance_status(old.veiculo_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.veiculo_id is distinct from new.veiculo_id then
    perform public.npi_refresh_vehicle_maintenance_status(old.veiculo_id);
  end if;

  perform public.npi_refresh_vehicle_maintenance_status(new.veiculo_id);
  return new;
end;
$$;

drop trigger if exists manutencoes_sync_vehicle_status on public.manutencoes;
create trigger manutencoes_sync_vehicle_status
after insert or update or delete on public.manutencoes
for each row execute function public.npi_sync_vehicle_maintenance_status_trigger();

revoke all on function public.npi_refresh_vehicle_maintenance_status(uuid) from public, anon, authenticated;
revoke all on function public.npi_sync_vehicle_maintenance_status_trigger() from public, anon, authenticated;

commit;

-- Observação operacional:
-- 1. Situação Agendada não altera a situação do veículo.
-- 2. Ao mudar para Em andamento, o veículo precisa estar Disponível.
-- 3. Ao concluir/cancelar a manutenção (situação diferente de Em andamento),
--    o veículo volta para Disponível se não houver outra manutenção em andamento.
-- 4. O histórico permanece gravado em public.manutencoes.
