-- ============================================================================
-- NPI FROTA | DESPESAS E RATEIOS
-- Pré-requisitos: Etapas 1, 2 e 3 + SQL de perfis/permissões + cadastros auxiliares.
-- Cria/atualiza public.despesas e public.rateios, com segurança por empresa (RLS).
-- Compatível com a Etapa 2: atualiza tabelas já existentes e preserva os registros.
-- ============================================================================

begin;

-- 0) Verifica as tabelas e funções que dão contexto de segurança ao projeto.
do $$
begin
  if to_regclass('public.empresas') is null
     or to_regclass('public.veiculos') is null
     or to_regclass('public.fornecedores') is null
     or to_regclass('public.centros_custo') is null
     or to_regclass('public.projetos') is null
     or to_regclass('public.filiais') is null then
    raise exception 'Cadastros-base ausentes. Execute as etapas iniciais e o SQL de cadastros auxiliares do NPI FROTA.';
  end if;
  if to_regclass('public.perfis') is null
     or to_regclass('public.permissoes') is null
     or to_regprocedure('public.npi_current_empresa_id()') is null
     or to_regprocedure('public.npi_has_permission(text,text)') is null
     or to_regprocedure('public.npi_is_admin()') is null then
    raise exception 'Controle de acesso não encontrado. Execute NPI_Frota_perfis_permissoes.sql antes desta instalação.';
  end if;
end;
$$;

-- 1) DESPESAS: razão financeira de gastos da frota.
create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  filial_id uuid references public.filiais(id) on delete restrict,
  veiculo_id uuid references public.veiculos(id) on delete restrict,
  categoria text not null,
  fornecedor_id uuid references public.fornecedores(id) on delete restrict,
  descricao text not null,
  documento_fiscal text,
  data_lancamento date not null default current_date,
  vencimento date,
  data_pagamento date,
  valor_bruto numeric(14,2) not null default 0 check (valor_bruto >= 0),
  desconto numeric(14,2) not null default 0 check (desconto >= 0),
  juros numeric(14,2) not null default 0 check (juros >= 0),
  valor_liquido numeric(14,2) not null default 0 check (valor_liquido >= 0),
  forma_pagamento text,
  situacao text not null default 'Pendente' check (situacao in ('Pendente','Paga','Cancelada')),
  centro_custo_id uuid references public.centros_custo(id) on delete restrict,
  projeto_id uuid references public.projetos(id) on delete restrict,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint despesas_vencimento_data_valida check (vencimento is null or vencimento >= data_lancamento),
  constraint despesas_pagamento_data_valida check (data_pagamento is null or data_pagamento >= data_lancamento),
  constraint despesas_paga_com_data check (situacao <> 'Paga' or data_pagamento is not null)
);

-- 2) RATEIOS: cada linha distribui uma parte de uma despesa a um destino.
create table if not exists public.rateios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  despesa_id uuid not null references public.despesas(id) on delete restrict,
  criterio_rateio text not null check (criterio_rateio in ('Percentual','Valor fixo')),
  veiculo_id uuid references public.veiculos(id) on delete restrict,
  centro_custo_id uuid references public.centros_custo(id) on delete restrict,
  projeto_id uuid references public.projetos(id) on delete restrict,
  percentual numeric(9,4),
  valor numeric(14,2),
  observacoes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rateios_percentual_range check (percentual is null or (percentual > 0 and percentual <= 100)),
  constraint rateios_valor_positivo check (valor is null or valor > 0),
  constraint rateios_destino_obrigatorio check (veiculo_id is not null or centro_custo_id is not null or projeto_id is not null)
);

-- Compatibilidade caso uma instalação anterior tenha criado as tabelas parcialmente.
alter table public.despesas add column if not exists data_pagamento date;
alter table public.despesas add column if not exists fornecedor_id uuid references public.fornecedores(id) on delete set null;
alter table public.despesas add column if not exists observacoes text;
alter table public.despesas add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.despesas add column if not exists updated_at timestamptz not null default now();
alter table public.rateios add column if not exists empresa_id uuid references public.empresas(id) on delete restrict;
alter table public.rateios add column if not exists veiculo_id uuid references public.veiculos(id) on delete restrict;
alter table public.rateios add column if not exists criterio_rateio text;
alter table public.rateios add column if not exists percentual numeric(9,4);
alter table public.rateios add column if not exists valor numeric(14,2);
alter table public.rateios add column if not exists observacoes text;
alter table public.rateios add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.rateios add column if not exists updated_at timestamptz not null default now();

-- A Etapa 2 antiga criava rateios com ON DELETE CASCADE e sem veículo/empresa.
-- Atualiza o relacionamento para preservar rateios e evitar exclusão em cascata.
do $$
declare
  v_fk text;
begin
  for v_fk in
    select c.conname
    from pg_constraint c
    where c.contype='f'
      and c.conrelid='public.rateios'::regclass
      and c.confrelid='public.despesas'::regclass
  loop
    execute format('alter table public.rateios drop constraint %I', v_fk);
  end loop;
end;
$$;
alter table public.rateios
  add constraint rateios_despesa_id_fkey
  foreign key (despesa_id) references public.despesas(id) on delete restrict;

-- Migra empresa_id de dados antigos quando existe vínculo que permita inferi-la.
update public.despesas d
set empresa_id = coalesce(
  (select v.empresa_id from public.veiculos v where v.id=d.veiculo_id),
  (select f.empresa_id from public.filiais f where f.id=d.filial_id),
  (select c.empresa_id from public.centros_custo c where c.id=d.centro_custo_id),
  (select p.empresa_id from public.projetos p where p.id=d.projeto_id),
  (select s.empresa_id from public.fornecedores s where s.id=d.fornecedor_id)
)
where d.empresa_id is null
  and coalesce(
    (select v.empresa_id from public.veiculos v where v.id=d.veiculo_id),
    (select f.empresa_id from public.filiais f where f.id=d.filial_id),
    (select c.empresa_id from public.centros_custo c where c.id=d.centro_custo_id),
    (select p.empresa_id from public.projetos p where p.id=d.projeto_id),
    (select s.empresa_id from public.fornecedores s where s.id=d.fornecedor_id)
  ) is not null;

update public.rateios r
set empresa_id=d.empresa_id
from public.despesas d
where r.despesa_id=d.id and r.empresa_id is null and d.empresa_id is not null;

-- Garante exatamente um destino por linha de rateio (veículo OU centro de custo OU projeto).
alter table public.rateios drop constraint if exists rateios_destino_exclusivo;
alter table public.rateios add constraint rateios_destino_exclusivo
  check (num_nonnulls(veiculo_id, centro_custo_id, projeto_id) = 1) not valid;

-- 3) Índices usados por filtros, relatórios e consultas de rateios.
create index if not exists despesas_empresa_data_idx on public.despesas (empresa_id, data_lancamento desc);
create index if not exists despesas_empresa_status_vencimento_idx on public.despesas (empresa_id, situacao, vencimento);
create index if not exists despesas_veiculo_idx on public.despesas (veiculo_id, data_lancamento desc);
create index if not exists despesas_centro_custo_idx on public.despesas (centro_custo_id, data_lancamento desc);
create index if not exists despesas_projeto_idx on public.despesas (projeto_id, data_lancamento desc);
create index if not exists despesas_fornecedor_idx on public.despesas (fornecedor_id);
create index if not exists rateios_empresa_despesa_idx on public.rateios (empresa_id, despesa_id);
create index if not exists rateios_veiculo_idx on public.rateios (veiculo_id) where veiculo_id is not null;
create index if not exists rateios_centro_custo_idx on public.rateios (centro_custo_id) where centro_custo_id is not null;
create index if not exists rateios_projeto_idx on public.rateios (projeto_id) where projeto_id is not null;

-- 4) Helpers de validação de relacionamentos (SECURITY DEFINER para validar
-- referências da mesma empresa sem depender das políticas de SELECT do usuário).
create or replace function public.npi_finance_expense_links_valid(
  p_empresa_id uuid,
  p_filial_id uuid,
  p_veiculo_id uuid,
  p_fornecedor_id uuid,
  p_centro_custo_id uuid,
  p_projeto_id uuid
)
returns boolean
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare
  v_empresa uuid;
begin
  v_empresa := public.npi_current_empresa_id();
  if p_empresa_id is null or p_empresa_id is distinct from v_empresa then return false; end if;
  if p_filial_id is not null then
    if not exists (select 1 from public.filiais f where f.id=p_filial_id and f.empresa_id=v_empresa) then return false; end if;
  end if;
  if p_veiculo_id is not null then
    if not exists (select 1 from public.veiculos v where v.id=p_veiculo_id and v.empresa_id=v_empresa) then return false; end if;
  end if;
  if p_fornecedor_id is not null then
    if not exists (select 1 from public.fornecedores f where f.id=p_fornecedor_id and f.empresa_id=v_empresa) then return false; end if;
  end if;
  if p_centro_custo_id is not null then
    if not exists (select 1 from public.centros_custo c where c.id=p_centro_custo_id and c.empresa_id=v_empresa) then return false; end if;
  end if;
  if p_projeto_id is not null then
    if not exists (select 1 from public.projetos p where p.id=p_projeto_id and p.empresa_id=v_empresa) then return false; end if;
  end if;
  return true;
end;
$$;

create or replace function public.npi_finance_rateio_links_valid(
  p_despesa_id uuid,
  p_veiculo_id uuid,
  p_centro_custo_id uuid,
  p_projeto_id uuid
)
returns boolean
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare
  v_empresa uuid;
begin
  v_empresa := public.npi_current_empresa_id();
  if not exists (select 1 from public.despesas d where d.id=p_despesa_id and d.empresa_id=v_empresa and d.situacao <> 'Cancelada') then return false; end if;
  if p_veiculo_id is not null and not exists (select 1 from public.veiculos v where v.id=p_veiculo_id and v.empresa_id=v_empresa) then return false; end if;
  if p_centro_custo_id is not null and not exists (select 1 from public.centros_custo c where c.id=p_centro_custo_id and c.empresa_id=v_empresa) then return false; end if;
  if p_projeto_id is not null and not exists (select 1 from public.projetos p where p.id=p_projeto_id and p.empresa_id=v_empresa) then return false; end if;
  return num_nonnulls(p_veiculo_id, p_centro_custo_id, p_projeto_id) = 1;
end;
$$;

revoke all on function public.npi_finance_expense_links_valid(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.npi_finance_rateio_links_valid(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.npi_finance_expense_links_valid(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.npi_finance_rateio_links_valid(uuid,uuid,uuid,uuid) to authenticated;

-- 5) Valor líquido é calculado no banco. O valor do navegador é apenas uma prévia.
create or replace function public.npi_finance_expense_before_write()
returns trigger
language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare
  v_empresa uuid;
  v_allocated numeric(14,2);
  v_rateio_count integer;
begin
  v_empresa := public.npi_current_empresa_id();
  if new.empresa_id is null then new.empresa_id := v_empresa; end if;
  if new.empresa_id is distinct from v_empresa then
    raise exception 'Não é permitido lançar despesas para outra empresa.' using errcode='42501';
  end if;

  new.valor_bruto := coalesce(new.valor_bruto,0);
  new.desconto := coalesce(new.desconto,0);
  new.juros := coalesce(new.juros,0);
  if new.valor_bruto <= 0 or new.desconto < 0 or new.juros < 0 then
    raise exception 'Informe valor bruto positivo e desconto/juros não negativos.' using errcode='23514';
  end if;
  new.valor_liquido := round(new.valor_bruto - new.desconto + new.juros,2);
  if new.valor_liquido < 0 then
    raise exception 'O valor líquido não pode ser negativo.' using errcode='23514';
  end if;
  if new.vencimento is not null and new.vencimento < new.data_lancamento then
    raise exception 'O vencimento não pode ser anterior à data de lançamento.' using errcode='23514';
  end if;
  if new.data_pagamento is not null and new.data_pagamento < new.data_lancamento then
    raise exception 'A data de pagamento não pode ser anterior ao lançamento.' using errcode='23514';
  end if;
  if new.situacao='Paga' and new.data_pagamento is null then
    raise exception 'Informe a data de pagamento para despesas pagas.' using errcode='23514';
  end if;
  if new.data_pagamento is not null and new.situacao <> 'Paga' then
    raise exception 'Uma despesa com data de pagamento deve estar com situação Paga.' using errcode='23514';
  end if;
  if not public.npi_finance_expense_links_valid(new.empresa_id,new.filial_id,new.veiculo_id,new.fornecedor_id,new.centro_custo_id,new.projeto_id) then
    raise exception 'Empresa, filial, veículo, fornecedor, centro de custo e projeto precisam pertencer à empresa do usuário.' using errcode='23514';
  end if;

  if tg_op='UPDATE' then
    select coalesce(sum(r.valor),0), count(*) into v_allocated, v_rateio_count from public.rateios r where r.despesa_id=new.id;
    if v_rateio_count > 0 and round(old.valor_liquido,2) is distinct from round(new.valor_liquido,2) then
      raise exception 'Esta despesa já possui rateios. Remova e refaça os rateios antes de alterar o valor líquido.' using errcode='23514';
    end if;
    if new.situacao='Cancelada' and v_rateio_count > 0 then
      raise exception 'Remova os rateios antes de cancelar esta despesa.' using errcode='23514';
    end if;
    if v_allocated > new.valor_liquido + 0.005 then
      raise exception 'O valor líquido não pode ficar abaixo do total já distribuído nos rateios (%).', v_allocated using errcode='23514';
    end if;
  end if;

  if tg_op='UPDATE' then new.updated_at := now(); end if;
  return new;
end;
$$;

revoke all on function public.npi_finance_expense_before_write() from public, anon, authenticated;
drop trigger if exists despesas_before_write on public.despesas;
create trigger despesas_before_write
before insert or update on public.despesas
for each row execute function public.npi_finance_expense_before_write();

-- 6) Rateios são serializados bloqueando a despesa-pai, para impedir que duas
-- gravações simultâneas ultrapassem 100% ou o valor líquido disponível.
create or replace function public.npi_finance_rateio_before_write()
returns trigger
language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare
  v_empresa uuid;
  v_valor_liquido numeric(14,2);
  v_percentual_usado numeric(12,4);
  v_valor_usado numeric(14,2);
  v_criterio_diferente boolean;
begin
  select d.empresa_id, d.valor_liquido
    into v_empresa, v_valor_liquido
  from public.despesas d
  where d.id=new.despesa_id
  for update;
  if not found then
    raise exception 'Selecione uma despesa existente.' using errcode='23503';
  end if;
  if v_empresa is distinct from public.npi_current_empresa_id() then
    raise exception 'A despesa precisa pertencer à empresa do usuário.' using errcode='42501';
  end if;
  new.empresa_id := v_empresa;
  if not public.npi_finance_rateio_links_valid(new.despesa_id,new.veiculo_id,new.centro_custo_id,new.projeto_id) then
    raise exception 'Selecione ao menos um destino válido da mesma empresa: veículo, centro de custo ou projeto.' using errcode='23514';
  end if;
  if v_valor_liquido <= 0 then
    raise exception 'Não é possível ratear uma despesa sem valor líquido positivo.' using errcode='23514';
  end if;

  select exists (
    select 1 from public.rateios r
    where r.despesa_id=new.despesa_id
      and r.id is distinct from new.id
      and r.criterio_rateio is distinct from new.criterio_rateio
  ) into v_criterio_diferente;
  if v_criterio_diferente then
    raise exception 'Todos os rateios de uma mesma despesa devem utilizar o mesmo critério.' using errcode='23514';
  end if;

  if new.criterio_rateio='Percentual' then
    if new.percentual is null or new.percentual <= 0 or new.percentual > 100 then
      raise exception 'Informe um percentual maior que zero e até 100.' using errcode='23514';
    end if;
    select coalesce(sum(r.percentual),0) into v_percentual_usado
    from public.rateios r where r.despesa_id=new.despesa_id and r.id is distinct from new.id;
    if v_percentual_usado + new.percentual > 100.0001 then
      raise exception 'O total dos rateios não pode ultrapassar 100 por cento. Percentual já distribuído: %.', v_percentual_usado using errcode='23514';
    end if;
    new.valor := round(v_valor_liquido * new.percentual / 100,2);
  elsif new.criterio_rateio='Valor fixo' then
    if new.valor is null or new.valor <= 0 then
      raise exception 'Informe um valor fixo de rateio maior que zero.' using errcode='23514';
    end if;
    select coalesce(sum(r.valor),0) into v_valor_usado
    from public.rateios r where r.despesa_id=new.despesa_id and r.id is distinct from new.id;
    if v_valor_usado + new.valor > v_valor_liquido + 0.005 then
      raise exception 'A soma dos rateios ultrapassa o valor líquido da despesa. Já distribuído: %.', v_valor_usado using errcode='23514';
    end if;
    new.percentual := round(new.valor / v_valor_liquido * 100,4);
  else
    raise exception 'Critério de rateio inválido.' using errcode='23514';
  end if;

  if tg_op='UPDATE' then new.updated_at := now(); end if;
  return new;
end;
$$;

revoke all on function public.npi_finance_rateio_before_write() from public, anon, authenticated;
drop trigger if exists rateios_before_write on public.rateios;
create trigger rateios_before_write
before insert or update on public.rateios
for each row execute function public.npi_finance_rateio_before_write();

-- 7) Atualização de updated_at para despesas e rateios.
create or replace function public.npi_finance_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
revoke all on function public.npi_finance_set_updated_at() from public, anon, authenticated;
-- Os triggers principais já atualizam updated_at; estes triggers cobrem atualizações
-- de linhas sem alteração de valores financeiros, sem substituir os triggers de validação.

-- 8) RLS: acesso restrito à empresa da sessão e às permissões do módulo.
grant select, insert, update, delete on public.despesas, public.rateios to authenticated;
alter table public.despesas enable row level security;
alter table public.rateios enable row level security;

drop policy if exists despesas_select_empresa_role on public.despesas;
drop policy if exists despesas_insert_empresa_role on public.despesas;
drop policy if exists despesas_update_empresa_role on public.despesas;
drop policy if exists despesas_delete_empresa_role on public.despesas;
create policy despesas_select_empresa_role on public.despesas
for select to authenticated
using (empresa_id=(select public.npi_current_empresa_id())
  and (select public.npi_finance_expense_links_valid(empresa_id,filial_id,veiculo_id,fornecedor_id,centro_custo_id,projeto_id))
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('despesas','visualizar'))));
create policy despesas_insert_empresa_role on public.despesas
for insert to authenticated
with check (empresa_id=(select public.npi_current_empresa_id())
  and (select public.npi_finance_expense_links_valid(empresa_id,filial_id,veiculo_id,fornecedor_id,centro_custo_id,projeto_id))
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('despesas','incluir'))));
create policy despesas_update_empresa_role on public.despesas
for update to authenticated
using (empresa_id=(select public.npi_current_empresa_id())
  and (select public.npi_finance_expense_links_valid(empresa_id,filial_id,veiculo_id,fornecedor_id,centro_custo_id,projeto_id))
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('despesas','alterar'))))
with check (empresa_id=(select public.npi_current_empresa_id())
  and (select public.npi_finance_expense_links_valid(empresa_id,filial_id,veiculo_id,fornecedor_id,centro_custo_id,projeto_id))
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('despesas','alterar'))));
create policy despesas_delete_empresa_role on public.despesas
for delete to authenticated
using (empresa_id=(select public.npi_current_empresa_id())
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('despesas','excluir'))));

drop policy if exists rateios_select_empresa_role on public.rateios;
drop policy if exists rateios_insert_empresa_role on public.rateios;
drop policy if exists rateios_update_empresa_role on public.rateios;
drop policy if exists rateios_delete_empresa_role on public.rateios;
create policy rateios_select_empresa_role on public.rateios
for select to authenticated
using (empresa_id=(select public.npi_current_empresa_id())
  and (select public.npi_finance_rateio_links_valid(despesa_id,veiculo_id,centro_custo_id,projeto_id))
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('rateios','visualizar'))));
create policy rateios_insert_empresa_role on public.rateios
for insert to authenticated
with check (empresa_id=(select public.npi_current_empresa_id())
  and (select public.npi_finance_rateio_links_valid(despesa_id,veiculo_id,centro_custo_id,projeto_id))
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('rateios','incluir'))));
create policy rateios_update_empresa_role on public.rateios
for update to authenticated
using (empresa_id=(select public.npi_current_empresa_id())
  and (select public.npi_finance_rateio_links_valid(despesa_id,veiculo_id,centro_custo_id,projeto_id))
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('rateios','alterar'))))
with check (empresa_id=(select public.npi_current_empresa_id())
  and (select public.npi_finance_rateio_links_valid(despesa_id,veiculo_id,centro_custo_id,projeto_id))
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('rateios','alterar'))));
create policy rateios_delete_empresa_role on public.rateios
for delete to authenticated
using (empresa_id=(select public.npi_current_empresa_id())
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('rateios','excluir'))));

-- 9) Permissões iniciais para perfis financeiros e de acompanhamento.
-- Não sobrescreve permissões já personalizadas pelo administrador.
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, x.modulo, x.visualizar, x.incluir, x.alterar, x.excluir, x.aprovar, x.exportar
from public.perfis p
cross join (values
  ('despesas', true, true, true, true, false, true),
  ('rateios', true, true, true, true, false, true)
) as x(modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
where p.nome='Financeiro'
on conflict (perfil_id, modulo) do nothing;

insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, x.modulo, true, false, false, false, false, true
from public.perfis p
cross join (values ('despesas'),('rateios')) as x(modulo)
where p.nome in ('Gestor de Frota','Supervisor')
on conflict (perfil_id, modulo) do nothing;

-- Perfis não contemplados recebem explicitamente ausência de acesso, sem
-- substituir configurações que o administrador já tenha personalizado.
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, x.modulo, false, false, false, false, false, false
from public.perfis p
cross join (values ('despesas'),('rateios')) as x(modulo)
on conflict (perfil_id, modulo) do nothing;

commit;

-- Após instalar: atualize o NPI FROTA e faça login novamente para carregar as permissões.
-- Critério de rateio é único por despesa. Rateios parciais são permitidos; o banco
-- impede ultrapassar 100% ou o valor líquido total. Uma despesa com rateios não pode
-- ter seu valor líquido alterado nem ser cancelada até que os rateios sejam removidos;
-- isso evita que valores percentuais previamente calculados fiquem desatualizados.
