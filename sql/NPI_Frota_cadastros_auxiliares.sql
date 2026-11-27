-- ============================================================================
-- NPI FROTA | CADASTROS AUXILIARES
-- Cria Fornecedores, Oficinas e Postos de Combustível e liga esses cadastros
-- aos módulos já existentes de Pneus, Manutenções e Abastecimentos.
--
-- PRÉ-REQUISITOS:
--   1) Etapas 1, 2 e 3 do Supabase já executadas.
--   2) SQLs dos módulos Abastecimentos, Manutenções e Pneus já executados.
--
-- Seguro para reexecutar: usa IF NOT EXISTS / CREATE OR REPLACE e não apaga
-- cadastros, movimentações ou histórico.
-- ============================================================================

begin;

-- 0) Conferir helpers de segurança já instalados no projeto.
do $$
begin
  if to_regprocedure('public.npi_current_empresa_id()') is null then
    raise exception 'Helper npi_current_empresa_id() não encontrado. Execute primeiro o SQL de controle de acesso do NPI FROTA.';
  end if;
  if to_regprocedure('public.npi_has_permission(text,text)') is null then
    raise exception 'Helper npi_has_permission(text,text) não encontrado. Execute primeiro o SQL de perfis e permissões.';
  end if;
end;
$$;

-- 1) FORNECEDORES
create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  tipo_pessoa text not null default 'Pessoa Jurídica'
    check (tipo_pessoa in ('Pessoa Física','Pessoa Jurídica')),
  razao_social text not null,
  nome_fantasia text,
  cpf_cnpj text,
  inscricao_estadual text,
  categoria text,
  telefone text,
  email text,
  contato_principal text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf char(2),
  observacoes text,
  situacao text not null default 'Ativo' check (situacao in ('Ativo','Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) OFICINAS
create table if not exists public.oficinas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  nome text not null,
  cnpj text,
  telefone text,
  email text,
  contato_responsavel text,
  especialidades text,
  prazo_medio_dias integer check (prazo_medio_dias is null or prazo_medio_dias >= 0),
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf char(2),
  observacoes text,
  situacao text not null default 'Ativo' check (situacao in ('Ativo','Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) POSTOS DE COMBUSTÍVEL
create table if not exists public.postos_combustivel (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  nome text not null,
  cnpj text,
  bandeira text,
  telefone text,
  email text,
  contato text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf char(2),
  observacoes text,
  situacao text not null default 'Ativo' check (situacao in ('Ativo','Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) RELACIONAR CADASTROS EXISTENTES AOS NOVOS REGISTROS AUXILIARES.
-- Os campos antigos em texto são mantidos como fotografia histórica do nome.
alter table public.pneus
  add column if not exists fornecedor_id uuid references public.fornecedores(id) on delete set null;

alter table public.manutencoes
  add column if not exists oficina_id uuid references public.oficinas(id) on delete set null;

alter table public.abastecimentos
  add column if not exists posto_combustivel_id uuid references public.postos_combustivel(id) on delete set null;

-- 5) ÍNDICES
create index if not exists fornecedores_empresa_nome_idx
  on public.fornecedores (empresa_id, lower(razao_social));
create index if not exists oficinas_empresa_nome_idx
  on public.oficinas (empresa_id, lower(nome));
create index if not exists oficinas_fornecedor_idx
  on public.oficinas (fornecedor_id);
create index if not exists postos_empresa_nome_idx
  on public.postos_combustivel (empresa_id, lower(nome));
create index if not exists postos_fornecedor_idx
  on public.postos_combustivel (fornecedor_id);
create index if not exists pneus_fornecedor_idx on public.pneus (fornecedor_id);
create index if not exists manutencoes_oficina_idx on public.manutencoes (oficina_id);
create index if not exists abastecimentos_posto_idx on public.abastecimentos (posto_combustivel_id);

create unique index if not exists fornecedores_documento_empresa_unico_idx
  on public.fornecedores (empresa_id, upper(btrim(cpf_cnpj)))
  where cpf_cnpj is not null and btrim(cpf_cnpj) <> '';
create unique index if not exists oficinas_cnpj_empresa_unico_idx
  on public.oficinas (empresa_id, upper(btrim(cnpj)))
  where cnpj is not null and btrim(cnpj) <> '';
create unique index if not exists postos_cnpj_empresa_unico_idx
  on public.postos_combustivel (empresa_id, upper(btrim(cnpj)))
  where cnpj is not null and btrim(cnpj) <> '';

-- 6) VINCULAR AUTOMATICAMENTE OS CADASTROS À EMPRESA DA SESSÃO.
create or replace function public.npi_set_auxiliary_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id uuid;
begin
  v_empresa_id := public.npi_current_empresa_id();
  if v_empresa_id is null then
    raise exception 'Não foi possível identificar a empresa do usuário autenticado.' using errcode = '42501';
  end if;
  if new.empresa_id is null then
    new.empresa_id := v_empresa_id;
  elsif new.empresa_id is distinct from v_empresa_id then
    raise exception 'Não é permitido cadastrar ou alterar registros de outra empresa.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.npi_set_auxiliary_company() from public, anon, authenticated;

drop trigger if exists fornecedores_set_empresa on public.fornecedores;
create trigger fornecedores_set_empresa
before insert or update on public.fornecedores
for each row execute function public.npi_set_auxiliary_company();

drop trigger if exists oficinas_set_empresa on public.oficinas;
create trigger oficinas_set_empresa
before insert or update on public.oficinas
for each row execute function public.npi_set_auxiliary_company();

drop trigger if exists postos_set_empresa on public.postos_combustivel;
create trigger postos_set_empresa
before insert or update on public.postos_combustivel
for each row execute function public.npi_set_auxiliary_company();

-- 7) VALIDAR QUE REFERÊNCIAS DE FORNECEDOR/OFICINA/POSTO SÃO DA MESMA EMPRESA.
create or replace function public.npi_validate_auxiliary_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id uuid;
  v_referencia_empresa_id uuid;
begin
  if tg_table_name = 'oficinas' or tg_table_name = 'postos_combustivel' then
    v_empresa_id := new.empresa_id;
    if new.fornecedor_id is not null then
      select f.empresa_id into v_referencia_empresa_id
      from public.fornecedores f where f.id = new.fornecedor_id;
      if v_referencia_empresa_id is null or v_referencia_empresa_id is distinct from v_empresa_id then
        raise exception 'O fornecedor vinculado precisa pertencer à mesma empresa.' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'pneus' then
    v_empresa_id := coalesce(new.empresa_id, public.npi_current_empresa_id());
    if new.fornecedor_id is not null then
      select f.empresa_id into v_referencia_empresa_id
      from public.fornecedores f where f.id = new.fornecedor_id;
      if v_referencia_empresa_id is null or v_referencia_empresa_id is distinct from v_empresa_id then
        raise exception 'O fornecedor do pneu precisa pertencer à mesma empresa.' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'manutencoes' then
    select v.empresa_id into v_empresa_id
    from public.veiculos v where v.id = new.veiculo_id;
    if new.oficina_id is not null then
      select o.empresa_id into v_referencia_empresa_id
      from public.oficinas o where o.id = new.oficina_id;
      if v_referencia_empresa_id is null or v_referencia_empresa_id is distinct from v_empresa_id then
        raise exception 'A oficina da manutenção precisa pertencer à mesma empresa do veículo.' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'abastecimentos' then
    select v.empresa_id into v_empresa_id
    from public.veiculos v where v.id = new.veiculo_id;
    if new.posto_combustivel_id is not null then
      select p.empresa_id into v_referencia_empresa_id
      from public.postos_combustivel p where p.id = new.posto_combustivel_id;
      if v_referencia_empresa_id is null or v_referencia_empresa_id is distinct from v_empresa_id then
        raise exception 'O posto do abastecimento precisa pertencer à mesma empresa do veículo.' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.npi_validate_auxiliary_links() from public, anon, authenticated;

drop trigger if exists oficinas_validate_auxiliary_links on public.oficinas;
create trigger oficinas_validate_auxiliary_links
before insert or update on public.oficinas
for each row execute function public.npi_validate_auxiliary_links();

drop trigger if exists postos_validate_auxiliary_links on public.postos_combustivel;
create trigger postos_validate_auxiliary_links
before insert or update on public.postos_combustivel
for each row execute function public.npi_validate_auxiliary_links();

drop trigger if exists pneus_validate_auxiliary_links on public.pneus;
create trigger pneus_validate_auxiliary_links
before insert or update on public.pneus
for each row execute function public.npi_validate_auxiliary_links();

drop trigger if exists manutencoes_validate_auxiliary_links on public.manutencoes;
create trigger manutencoes_validate_auxiliary_links
before insert or update on public.manutencoes
for each row execute function public.npi_validate_auxiliary_links();

drop trigger if exists abastecimentos_validate_auxiliary_links on public.abastecimentos;
create trigger abastecimentos_validate_auxiliary_links
before insert or update on public.abastecimentos
for each row execute function public.npi_validate_auxiliary_links();

-- 8) updated_at AUTOMÁTICO
-- A função npi_set_updated_at() já é criada na Etapa 1.
drop trigger if exists fornecedores_updated_at on public.fornecedores;
create trigger fornecedores_updated_at before update on public.fornecedores
for each row execute function public.npi_set_updated_at();
drop trigger if exists oficinas_updated_at on public.oficinas;
create trigger oficinas_updated_at before update on public.oficinas
for each row execute function public.npi_set_updated_at();
drop trigger if exists postos_updated_at on public.postos_combustivel;
create trigger postos_updated_at before update on public.postos_combustivel
for each row execute function public.npi_set_updated_at();

-- 9) RLS DOS NOVOS CADASTROS AUXILIARES.
revoke all on public.fornecedores, public.oficinas, public.postos_combustivel from anon, authenticated;
grant select, insert, update, delete on public.fornecedores, public.oficinas, public.postos_combustivel to authenticated;
alter table public.fornecedores enable row level security;
alter table public.oficinas enable row level security;
alter table public.postos_combustivel enable row level security;

do $$
declare item record;
begin
  for item in
    select * from (values
      ('fornecedores','fornecedores'),
      ('oficinas','oficinas'),
      ('postos_combustivel','postos')
    ) as t(tabela, modulo)
  loop
    execute format('drop policy if exists %I on public.%I', item.tabela || '_select_role', item.tabela);
    execute format('drop policy if exists %I on public.%I', item.tabela || '_insert_role', item.tabela);
    execute format('drop policy if exists %I on public.%I', item.tabela || '_update_role', item.tabela);
    execute format('drop policy if exists %I on public.%I', item.tabela || '_delete_role', item.tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated using (empresa_id = (select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''visualizar'')))',
      item.tabela || '_select_role', item.tabela, item.modulo
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (empresa_id = (select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''incluir'')))',
      item.tabela || '_insert_role', item.tabela, item.modulo
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (empresa_id = (select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''alterar''))) with check (empresa_id = (select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''alterar'')))',
      item.tabela || '_update_role', item.tabela, item.modulo, item.modulo
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (empresa_id = (select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''excluir'')))',
      item.tabela || '_delete_role', item.tabela, item.modulo
    );
  end loop;
end;
$$;

-- 10) PERMISSÕES INICIAIS DOS PERFIS.
-- ON CONFLICT DO NOTHING preserva personalizações que já estejam salvas.
insert into public.permissoes
  (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, d.modulo, d.visualizar, d.incluir, d.alterar, d.excluir, d.aprovar, d.exportar
from public.perfis p
cross join (values
  ('fornecedores', true, true, true, true, true, true),
  ('oficinas', true, true, true, true, true, true),
  ('postos', true, true, true, true, true, true)
) as d(modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
where p.nome = 'Administrador'
on conflict (perfil_id, modulo) do nothing;

insert into public.permissoes
  (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, d.modulo, d.visualizar, d.incluir, d.alterar, d.excluir, d.aprovar, d.exportar
from public.perfis p
cross join (values
  ('fornecedores', true, true, true, false, false, true),
  ('oficinas', true, true, true, false, false, true),
  ('postos', true, true, true, false, false, true)
) as d(modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
where p.nome = 'Gestor de Frota'
on conflict (perfil_id, modulo) do nothing;

insert into public.permissoes
  (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, d.modulo, d.visualizar, d.incluir, d.alterar, d.excluir, d.aprovar, d.exportar
from public.perfis p
cross join (values
  ('fornecedores', true, false, false, false, false, true),
  ('oficinas', true, true, true, false, false, true),
  ('postos', true, false, false, false, false, false)
) as d(modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
where p.nome = 'Manutenção'
on conflict (perfil_id, modulo) do nothing;

insert into public.permissoes
  (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, d.modulo, d.visualizar, d.incluir, d.alterar, d.excluir, d.aprovar, d.exportar
from public.perfis p
cross join (values
  ('fornecedores', true, false, false, false, false, true),
  ('oficinas', true, false, false, false, false, true),
  ('postos', true, false, false, false, false, true)
) as d(modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
where p.nome in ('Financeiro','Supervisor')
on conflict (perfil_id, modulo) do nothing;

-- O motorista permanece restrito ao próprio painel: nenhuma permissão nesses módulos.
insert into public.permissoes
  (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, d.modulo, false, false, false, false, false, false
from public.perfis p
cross join (values ('fornecedores'),('oficinas'),('postos')) as d(modulo)
where p.nome = 'Motorista'
on conflict (perfil_id, modulo) do nothing;

commit;

-- Depois de executar: atualize o NPI FROTA e entre novamente para carregar a matriz.
-- Os cadastros de oficina e posto serão disponibilizados nos formulários de
-- manutenção/abastecimento; os nomes em texto que existiam antes são preservados.
