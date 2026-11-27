-- NPI FROTA | ETAPA 5 - ABASTECIMENTOS
-- Execute no SQL Editor do Supabase depois das Etapas 1, 2, 3 e 4.
-- Script idempotente: pode ser executado novamente.
-- O acesso é restrito à empresa do usuário e às permissões do módulo.

begin;

-- A Etapa 2 já criou a tabela e ativou RLS. Aqui liberamos somente usuários
-- autenticados, sempre sujeitos às políticas abaixo.
grant select, insert, update, delete on public.abastecimentos to authenticated;
revoke all on public.abastecimentos from anon;
alter table public.abastecimentos enable row level security;

-- SELECT: usuário precisa ter permissão de visualizar e o veículo precisa
-- pertencer à empresa vinculada à conta.
drop policy if exists abastecimentos_select_role on public.abastecimentos;
create policy abastecimentos_select_role
on public.abastecimentos
for select to authenticated
using (
  (select public.npi_has_permission('abastecimentos','visualizar'))
  and exists (
    select 1
    from public.veiculos v
    where v.id = abastecimentos.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

-- INSERT: valida permissão, empresa do veículo e, quando informados,
-- motorista, centro de custo e projeto da mesma empresa.
drop policy if exists abastecimentos_insert_role on public.abastecimentos;
create policy abastecimentos_insert_role
on public.abastecimentos
for insert to authenticated
with check (
  (select public.npi_has_permission('abastecimentos','incluir'))
  and exists (
    select 1
    from public.veiculos v
    where v.id = abastecimentos.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
  and (
    abastecimentos.motorista_id is null
    or exists (
      select 1
      from public.motoristas m
      where m.id = abastecimentos.motorista_id
        and m.empresa_id = (select public.npi_current_empresa_id())
        and m.situacao = 'Ativo'
    )
  )
  and (
    abastecimentos.centro_custo_id is null
    or exists (
      select 1
      from public.centros_custo cc
      where cc.id = abastecimentos.centro_custo_id
        and cc.empresa_id = (select public.npi_current_empresa_id())
    )
  )
  and (
    abastecimentos.projeto_id is null
    or exists (
      select 1
      from public.projetos p
      where p.id = abastecimentos.projeto_id
        and p.empresa_id = (select public.npi_current_empresa_id())
    )
  )
);

-- UPDATE: exige permissão de alteração e mantém todas as referências dentro
-- da mesma empresa.
drop policy if exists abastecimentos_update_role on public.abastecimentos;
create policy abastecimentos_update_role
on public.abastecimentos
for update to authenticated
using (
  (select public.npi_has_permission('abastecimentos','alterar'))
  and exists (
    select 1 from public.veiculos v
    where v.id = abastecimentos.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
)
with check (
  (select public.npi_has_permission('abastecimentos','alterar'))
  and exists (
    select 1 from public.veiculos v
    where v.id = abastecimentos.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
  and (
    abastecimentos.motorista_id is null
    or exists (
      select 1 from public.motoristas m
      where m.id = abastecimentos.motorista_id
        and m.empresa_id = (select public.npi_current_empresa_id())
        and m.situacao = 'Ativo'
    )
  )
  and (
    abastecimentos.centro_custo_id is null
    or exists (
      select 1 from public.centros_custo cc
      where cc.id = abastecimentos.centro_custo_id
        and cc.empresa_id = (select public.npi_current_empresa_id())
    )
  )
  and (
    abastecimentos.projeto_id is null
    or exists (
      select 1 from public.projetos p
      where p.id = abastecimentos.projeto_id
        and p.empresa_id = (select public.npi_current_empresa_id())
    )
  )
);

-- DELETE: somente perfis com permissão explícita de exclusão.
drop policy if exists abastecimentos_delete_role on public.abastecimentos;
create policy abastecimentos_delete_role
on public.abastecimentos
for delete to authenticated
using (
  (select public.npi_has_permission('abastecimentos','excluir'))
  and exists (
    select 1 from public.veiculos v
    where v.id = abastecimentos.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

commit;

-- Após executar, faça login novamente ou atualize o NPI FROTA.
-- O perfil Motorista não acessa este módulo; Gestor de Frota e Administrador
-- podem cadastrar abastecimentos conforme suas permissões.
