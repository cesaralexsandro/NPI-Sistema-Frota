-- ============================================================================
-- NPI FROTA | INTEGRAÇÃO DO MÓDULO MULTAS
-- Pré-requisitos: Etapas 1, 2, 3 e script NPI_Frota_perfis_permissoes.sql executados.
-- A tabela public.multas já existe desde a Etapa 2. Este script NÃO a recria,
-- não apaga dados e libera CRUD com RLS por empresa via veículo relacionado.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.multas') is null then
    raise exception 'A tabela public.multas não existe. Execute primeiro a Etapa 2 do NPI FROTA.';
  end if;
  if to_regprocedure('public.npi_current_empresa_id()') is null
     or to_regprocedure('public.npi_has_permission(text,text)') is null
     or to_regprocedure('public.npi_is_admin()') is null then
    raise exception 'Funções de controle de acesso ausentes. Execute primeiro NPI_Frota_perfis_permissoes.sql.';
  end if;
end;
$$;

-- Índices para a listagem e os alertas de vencimento.
create index if not exists multas_data_hora_idx on public.multas (data_hora desc);
create index if not exists multas_vencimento_situacao_idx on public.multas (vencimento, situacao);
create index if not exists multas_prazo_indicacao_idx on public.multas (prazo_indicacao) where prazo_indicacao is not null;

-- Como multas não possui empresa_id próprio, valida a empresa pelo veículo
-- e, quando informado, pelo cadastro do motorista.
create or replace function public.npi_multas_referencias_validas(
  p_veiculo_id uuid,
  p_motorista_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select
    exists (
      select 1
      from public.veiculos v
      where v.id = p_veiculo_id
        and v.empresa_id = (select public.npi_current_empresa_id())
    )
    and (
      p_motorista_id is null
      or exists (
        select 1
        from public.motoristas m
        where m.id = p_motorista_id
          and m.empresa_id = (select public.npi_current_empresa_id())
      )
    );
$$;

revoke all on function public.npi_multas_referencias_validas(uuid,uuid) from public;
grant execute on function public.npi_multas_referencias_validas(uuid,uuid) to authenticated;

grant select, insert, update, delete on public.multas to authenticated;
alter table public.multas enable row level security;

drop policy if exists multas_select_role on public.multas;
drop policy if exists multas_insert_role on public.multas;
drop policy if exists multas_update_role on public.multas;
drop policy if exists multas_delete_role on public.multas;

create policy multas_select_role on public.multas
for select to authenticated
using (
  (select public.npi_is_admin())
  or (
    (select public.npi_has_permission('multas', 'visualizar'))
    and (select public.npi_multas_referencias_validas(veiculo_id, motorista_id))
  )
);

create policy multas_insert_role on public.multas
for insert to authenticated
with check (
  (select public.npi_has_permission('multas', 'incluir'))
  and (select public.npi_multas_referencias_validas(veiculo_id, motorista_id))
);

create policy multas_update_role on public.multas
for update to authenticated
using (
  (select public.npi_is_admin())
  or (
    (select public.npi_has_permission('multas', 'alterar'))
    and (select public.npi_multas_referencias_validas(veiculo_id, motorista_id))
  )
)
with check (
  (select public.npi_has_permission('multas', 'alterar'))
  and (select public.npi_multas_referencias_validas(veiculo_id, motorista_id))
);

create policy multas_delete_role on public.multas
for delete to authenticated
using (
  (select public.npi_is_admin())
  or (
    (select public.npi_has_permission('multas', 'excluir'))
    and (select public.npi_multas_referencias_validas(veiculo_id, motorista_id))
  )
);

comment on table public.multas is 'Infrações da frota, com acesso limitado por empresa através do veículo vinculado e permissões do módulo multas.';

commit;
-- FIM DA INTEGRAÇÃO DO MÓDULO MULTAS
