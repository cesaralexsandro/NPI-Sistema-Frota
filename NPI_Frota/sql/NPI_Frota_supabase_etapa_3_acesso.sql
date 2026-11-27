-- NPI FROTA | ETAPA 3 - PERFIL ADMINISTRADOR E POLÍTICAS RLS
-- Execute SOMENTE depois das Etapas 1 e 2.
-- Antes de executar: substitua os quatro valores indicados no bloco DO.
-- A empresa inicial ficará como NPI Tecnologia; altere o nome caso necessário.
-- Este script libera o CRUD apenas para usuários ativos vinculados à própria empresa.

-- ================================================================
-- A) PREENCHA ESTES DADOS E EXECUTE O BLOCO
-- ================================================================
do $$
declare
  -- Copie o UUID do usuário em Authentication > Users no Supabase.
  v_auth_user_id uuid := 'COLE-AQUI-O-UUID-DO-USUARIO-AUTH';
  v_user_name text := 'NOME DO ADMINISTRADOR';
  v_user_email text := 'EMAIL-DO-ADMINISTRADOR';
  v_company_name text := 'NPI Tecnologia';
  v_company_id uuid;
begin
  select e.id into v_company_id
  from public.empresas as e
  where lower(coalesce(nullif(e.nome_fantasia, ''), e.razao_social)) = lower(v_company_name)
  order by e.created_at asc
  limit 1;

  if v_company_id is null then
    insert into public.empresas (razao_social, nome_fantasia, situacao)
    values (v_company_name, v_company_name, 'Ativo')
    returning id into v_company_id;
  end if;

  insert into public.usuarios (id, nome, login, email, empresa_id, situacao)
  values (
    v_auth_user_id,
    v_user_name,
    lower(split_part(v_user_email, '@', 1)),
    v_user_email,
    v_company_id,
    'Ativo'
  )
  on conflict (id) do update set
    nome = excluded.nome,
    login = excluded.login,
    email = excluded.email,
    empresa_id = excluded.empresa_id,
    situacao = 'Ativo';
end;
$$;

-- ================================================================
-- B) FUNÇÃO DE CONTEXTO: empresa do usuário autenticado
-- ================================================================
create or replace function public.npi_current_empresa_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.empresa_id
  from public.usuarios as u
  where u.id = (select auth.uid())
    and u.situacao = 'Ativo'
  limit 1;
$$;

revoke all on function public.npi_current_empresa_id() from public;
grant execute on function public.npi_current_empresa_id() to authenticated;
grant usage on schema public to authenticated;

-- ================================================================
-- C) PERMISSÕES DA TABELA DE PERFIL
-- Cada usuário só consegue consultar o próprio perfil.
-- ================================================================
grant select on public.usuarios to authenticated;
drop policy if exists usuarios_select_proprio_perfil on public.usuarios;
create policy usuarios_select_proprio_perfil
on public.usuarios for select to authenticated
using (id = (select auth.uid()) and situacao = 'Ativo');

-- ================================================================
-- D) EMPRESA: leitura e edição somente da empresa vinculada ao usuário
-- A criação da empresa inicial é feita no bloco A.
-- ================================================================
grant select, update on public.empresas to authenticated;
drop policy if exists empresas_select_empresa_vinculada on public.empresas;
create policy empresas_select_empresa_vinculada
on public.empresas for select to authenticated
using (id = (select public.npi_current_empresa_id()));
drop policy if exists empresas_update_empresa_vinculada on public.empresas;
create policy empresas_update_empresa_vinculada
on public.empresas for update to authenticated
using (id = (select public.npi_current_empresa_id()))
with check (id = (select public.npi_current_empresa_id()));

-- ================================================================
-- E) CADASTROS BASE: CRUD somente dentro da empresa do usuário
-- ================================================================
grant select, insert, update, delete on
  public.filiais,
  public.centros_custo,
  public.projetos,
  public.veiculos,
  public.motoristas
 to authenticated;

-- FILIAIS
alter table public.filiais enable row level security;
drop policy if exists filiais_empresa_vinculada on public.filiais;
create policy filiais_empresa_vinculada on public.filiais
for all to authenticated
using (empresa_id = (select public.npi_current_empresa_id()))
with check (empresa_id = (select public.npi_current_empresa_id()));

-- CENTROS DE CUSTO
alter table public.centros_custo enable row level security;
drop policy if exists centros_custo_empresa_vinculada on public.centros_custo;
create policy centros_custo_empresa_vinculada on public.centros_custo
for all to authenticated
using (empresa_id = (select public.npi_current_empresa_id()))
with check (empresa_id = (select public.npi_current_empresa_id()));

-- PROJETOS
alter table public.projetos enable row level security;
drop policy if exists projetos_empresa_vinculada on public.projetos;
create policy projetos_empresa_vinculada on public.projetos
for all to authenticated
using (empresa_id = (select public.npi_current_empresa_id()))
with check (empresa_id = (select public.npi_current_empresa_id()));

-- VEÍCULOS
alter table public.veiculos enable row level security;
drop policy if exists veiculos_empresa_vinculada on public.veiculos;
create policy veiculos_empresa_vinculada on public.veiculos
for all to authenticated
using (empresa_id = (select public.npi_current_empresa_id()))
with check (empresa_id = (select public.npi_current_empresa_id()));

-- MOTORISTAS
alter table public.motoristas enable row level security;
drop policy if exists motoristas_empresa_vinculada on public.motoristas;
create policy motoristas_empresa_vinculada on public.motoristas
for all to authenticated
using (empresa_id = (select public.npi_current_empresa_id()))
with check (empresa_id = (select public.npi_current_empresa_id()));

-- As demais tabelas continuam sem grants/policies nesta etapa.
-- Não libere anon e nunca use sb_secret no JavaScript do navegador.
