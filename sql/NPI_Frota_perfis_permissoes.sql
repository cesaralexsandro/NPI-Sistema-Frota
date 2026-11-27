-- ============================================================================
-- NPI FROTA | CONTROLE DE ACESSO POR PERFIL (RBAC) + ÁREA DO MOTORISTA
-- Pré-requisito: Etapas 1, 2 e 3 já executadas.
-- Execute uma única vez no Supabase > SQL Editor.
-- Antes de executar, informe o e-mail do administrador que já está em
-- Authentication > Users e na tabela public.usuarios.
-- ============================================================================

-- 1) VÍNCULO DO LOGIN AO CADASTRO DO MOTORISTA
alter table public.usuarios
  add column if not exists motorista_id uuid references public.motoristas(id) on delete set null;
create index if not exists usuarios_motorista_id_idx on public.usuarios(motorista_id);

-- 2) VEÍCULOS ATRIBUÍDOS A CADA MOTORISTA
create table if not exists public.motorista_veiculos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  motorista_id uuid not null references public.motoristas(id) on delete restrict,
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  data_inicio date not null default current_date,
  data_fim date,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motorista_veiculos_periodo_valido check (data_fim is null or data_fim >= data_inicio)
);
create index if not exists motorista_veiculos_motorista_idx on public.motorista_veiculos(motorista_id, ativo);
create index if not exists motorista_veiculos_veiculo_idx on public.motorista_veiculos(veiculo_id, ativo);
create unique index if not exists motorista_veiculos_ativo_unico_idx
  on public.motorista_veiculos(motorista_id, veiculo_id) where ativo = true;
alter table public.motorista_veiculos enable row level security;
drop trigger if exists motorista_veiculos_updated_at on public.motorista_veiculos;
create trigger motorista_veiculos_updated_at before update on public.motorista_veiculos
for each row execute function public.npi_set_updated_at();
revoke all on table public.motorista_veiculos from anon, authenticated;

-- 3) PERFIS PADRÃO
insert into public.perfis (nome, descricao, situacao)
select v.nome, v.descricao, 'Ativo'
from (values
  ('Administrador', 'Acesso total ao NPI FROTA e gerenciamento de usuários e permissões.'),
  ('Gestor de Frota', 'Administra cadastros, operações e controle geral da frota.'),
  ('Motorista', 'Acesso restrito ao próprio painel e aos veículos atribuídos.'),
  ('Manutenção', 'Acompanha veículos, checklists, manutenções e pneus.'),
  ('Financeiro', 'Acessa despesas, rateios e informações financeiras autorizadas.'),
  ('Solicitante', 'Solicita reservas e acompanha suas solicitações.'),
  ('Supervisor', 'Acompanha a operação e aprova solicitações conforme permissões.')
) as v(nome, descricao)
where not exists (select 1 from public.perfis p where lower(btrim(p.nome)) = lower(btrim(v.nome)));

-- 4) PERMISSÕES INICIAIS DOS PERFIS
-- Administrador recebe todas as ações em todos os módulos conhecidos.
with modulos(modulo) as (values
 ('dashboard'),('painel_motorista'),('empresas'),('filiais'),('centros'),('projetos'),('veiculos'),('motoristas'),
 ('reservas'),('retiradas'),('devolucoes'),('utilizacoes'),('checklists'),('modelos'),('itens'),
 ('abastecimentos'),('manutencoes'),('pneus'),('movpneus'),('multas'),('documentos'),('seguros'),('sinistros'),
 ('despesas'),('rateios'),('relatorios'),('usuarios'),('perfis'),('atribuicoes_motoristas'),('auditoria')
)
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, m.modulo, true, true, true, true, true, true
from public.perfis p cross join modulos m
where p.nome = 'Administrador'
on conflict (perfil_id, modulo) do nothing;

-- Gestor de Frota
with defaults(modulo, v, i, a, e, ap, ex) as (values
 ('dashboard',true,false,false,false,false,false),
 ('empresas',true,false,false,false,false,false),('filiais',true,true,true,false,false,true),
 ('centros',true,true,true,false,false,true),('projetos',true,true,true,false,false,true),
 ('veiculos',true,true,true,true,false,true),('motoristas',true,true,true,true,false,true),
 ('reservas',true,true,true,true,true,true),('retiradas',true,true,true,false,false,true),
 ('devolucoes',true,true,true,false,false,true),('utilizacoes',true,true,true,false,false,true),
 ('checklists',true,true,true,false,false,true),('modelos',true,true,true,false,false,true),('itens',true,true,true,false,false,true),
 ('abastecimentos',true,true,true,false,false,true),('atribuicoes_motoristas',true,true,true,false,false,true),('manutencoes',true,true,true,false,false,true),
 ('pneus',true,true,true,false,false,true),('movpneus',true,true,true,false,false,true),
 ('multas',true,true,true,false,false,true),('documentos',true,true,true,false,false,true),('seguros',true,true,true,false,false,true),('sinistros',true,true,true,false,false,true),
 ('despesas',true,false,false,false,false,true),('rateios',true,false,false,false,false,true),('relatorios',true,false,false,false,false,true)
)
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id,d.modulo,d.v,d.i,d.a,d.e,d.ap,d.ex from public.perfis p cross join defaults d
where p.nome='Gestor de Frota' on conflict (perfil_id,modulo) do nothing;

-- Motorista: sem dashboard gerencial e sem telas de cadastro.
-- O Meu Painel consulta apenas veículos atribuídos por meio de RLS.
with defaults(modulo, v, i, a, e, ap, ex) as (values
 ('painel_motorista',true,false,false,false,false,false)
)
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id,d.modulo,d.v,d.i,d.a,d.e,d.ap,d.ex from public.perfis p cross join defaults d
where p.nome='Motorista' on conflict (perfil_id,modulo) do nothing;
-- Trava explícita: Motorista nunca recebe o Dashboard gerencial nem as telas
-- gerais de cadastro de veículos/motoristas. A consulta segura ocorre no Meu Painel.
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, m.modulo, false, false, false, false, false, false
from public.perfis p cross join (values ('dashboard'),('veiculos'),('motoristas')) as m(modulo)
where p.nome='Motorista'
on conflict (perfil_id, modulo) do update set
  visualizar=false, incluir=false, alterar=false, excluir=false, aprovar=false, exportar=false;
update public.permissoes pm
set visualizar=false, incluir=false, alterar=false, excluir=false, aprovar=false, exportar=false
from public.perfis p
where pm.perfil_id=p.id and p.nome='Motorista' and pm.modulo <> 'painel_motorista';

-- Manutenção
with defaults(modulo, v, i, a, e, ap, ex) as (values
 ('veiculos',true,false,false,false,false,false),('motoristas',true,false,false,false,false,false),
 ('checklists',true,true,true,false,false,true),('manutencoes',true,true,true,true,false,true),
 ('pneus',true,true,true,true,false,true),('movpneus',true,true,true,true,false,true),
 ('documentos',true,false,false,false,false,true),('seguros',true,false,false,false,false,false),('sinistros',true,false,false,false,false,false),('relatorios',true,false,false,false,false,true)
)
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id,d.modulo,d.v,d.i,d.a,d.e,d.ap,d.ex from public.perfis p cross join defaults d
where p.nome='Manutenção' on conflict (perfil_id,modulo) do nothing;

-- Financeiro
with defaults(modulo, v, i, a, e, ap, ex) as (values
 ('veiculos',true,false,false,false,false,false),('centros',true,false,false,false,false,false),
 ('projetos',true,false,false,false,false,false),('abastecimentos',true,false,false,false,false,true),
 ('despesas',true,true,true,true,false,true),('rateios',true,true,true,true,false,true),
 ('relatorios',true,false,false,false,false,true)
)
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id,d.modulo,d.v,d.i,d.a,d.e,d.ap,d.ex from public.perfis p cross join defaults d
where p.nome='Financeiro' on conflict (perfil_id,modulo) do nothing;

-- Solicitante
with defaults(modulo, v, i, a, e, ap, ex) as (values
 ('veiculos',true,false,false,false,false,false),('reservas',true,true,false,false,false,false)
)
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id,d.modulo,d.v,d.i,d.a,d.e,d.ap,d.ex from public.perfis p cross join defaults d
where p.nome='Solicitante' on conflict (perfil_id,modulo) do nothing;

-- Supervisor
with defaults(modulo, v, i, a, e, ap, ex) as (values
 ('dashboard',true,false,false,false,false,false),('empresas',true,false,false,false,false,false),
 ('filiais',true,false,false,false,false,false),('centros',true,false,false,false,false,false),
 ('projetos',true,false,false,false,false,false),('veiculos',true,false,false,false,false,true),
 ('motoristas',true,false,false,false,false,true),('reservas',true,false,false,false,true,true),
 ('retiradas',true,false,false,false,false,true),('devolucoes',true,false,false,false,false,true),
 ('utilizacoes',true,false,false,false,false,true),('checklists',true,false,false,false,false,true),
 ('abastecimentos',true,false,false,false,false,true),('manutencoes',true,false,false,false,false,true),
 ('multas',true,false,false,false,false,true),('documentos',true,false,false,false,false,true),
 ('seguros',true,false,false,false,false,true),('sinistros',true,false,false,false,false,true),('despesas',true,false,false,false,false,true),('relatorios',true,false,false,false,false,true)
)
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id,d.modulo,d.v,d.i,d.a,d.e,d.ap,d.ex from public.perfis p cross join defaults d
where p.nome='Supervisor' on conflict (perfil_id,modulo) do nothing;

-- 5) ATRIBUIR O PERFIL ADMINISTRADOR AO ADMINISTRADOR ATUAL
-- IMPORTANTE: substitua pelo e-mail da conta que já está ativa no NPI FROTA.
do $$
declare
  v_admin_email text := 'COLE-O-EMAIL-DO-ADMINISTRADOR';
  v_admin_id uuid;
  v_empresa_id uuid;
  v_perfil_id uuid;
begin
  select u.id, u.empresa_id into v_admin_id, v_empresa_id
  from public.usuarios u where lower(u.email) = lower(v_admin_email) limit 1;
  if v_admin_id is null then
    raise exception 'Usuário administrador não encontrado em public.usuarios. Confira o e-mail e se a Etapa 3 foi executada.';
  end if;
  select p.id into v_perfil_id from public.perfis p where p.nome='Administrador' and p.situacao='Ativo' limit 1;
  if v_perfil_id is null then raise exception 'Perfil Administrador não encontrado.'; end if;
  insert into public.perfis_usuarios (usuario_id, perfil_id, empresa_id, filial_id, situacao)
  select v_admin_id, v_perfil_id, v_empresa_id, null, 'Ativo'
  where not exists (
    select 1 from public.perfis_usuarios pu
    where pu.usuario_id=v_admin_id and pu.perfil_id=v_perfil_id
      and pu.empresa_id is not distinct from v_empresa_id and pu.filial_id is null
  );
  update public.usuarios set situacao='Ativo' where id=v_admin_id;
end;
$$;

-- 6) FUNÇÕES DE CONTEXTO E AUTORIZAÇÃO. SECURITY DEFINER para leitura segura
-- das tabelas de perfil mesmo quando a RLS destas tabelas está habilitada.
create or replace function public.npi_current_empresa_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select u.empresa_id from public.usuarios u
  where u.id=(select auth.uid()) and u.situacao='Ativo' limit 1;
$$;

create or replace function public.npi_current_motorista_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select u.motorista_id from public.usuarios u
  where u.id=(select auth.uid()) and u.situacao='Ativo' limit 1;
$$;

create or replace function public.npi_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis_usuarios pu
    join public.perfis p on p.id=pu.perfil_id
    join public.usuarios u on u.id=pu.usuario_id and u.situacao='Ativo'
    where pu.usuario_id=(select auth.uid()) and pu.situacao='Ativo'
      and pu.empresa_id is not distinct from (select public.npi_current_empresa_id())
      and p.situacao='Ativo' and p.nome='Administrador'
  );
$$;

create or replace function public.npi_current_is_driver()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis_usuarios pu
    join public.perfis p on p.id=pu.perfil_id
    join public.usuarios u on u.id=pu.usuario_id and u.situacao='Ativo'
    where pu.usuario_id=(select auth.uid()) and pu.situacao='Ativo'
      and pu.empresa_id is not distinct from (select public.npi_current_empresa_id())
      and p.situacao='Ativo' and p.nome='Motorista'
  );
$$;

create or replace function public.npi_has_permission(p_modulo text, p_acao text default 'visualizar')
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when public.npi_is_admin() then true
    -- O perfil Motorista é estritamente limitado à consulta do próprio painel.
    when public.npi_current_is_driver() then (
      p_modulo='painel_motorista' and lower(p_acao)='visualizar' and exists (
        select 1 from public.perfis_usuarios pu
        join public.perfis p on p.id=pu.perfil_id and p.situacao='Ativo'
        join public.permissoes pm on pm.perfil_id=p.id and pm.modulo='painel_motorista'
        where pu.usuario_id=(select auth.uid()) and pu.situacao='Ativo'
          and pu.empresa_id is not distinct from (select public.npi_current_empresa_id())
          and p.nome='Motorista' and pm.visualizar=true
      )
    )
    else exists (
      select 1 from public.perfis_usuarios pu
      join public.perfis p on p.id=pu.perfil_id and p.situacao='Ativo'
      join public.permissoes pm on pm.perfil_id=p.id and pm.modulo=p_modulo
      join public.usuarios u on u.id=pu.usuario_id and u.situacao='Ativo'
      where pu.usuario_id=(select auth.uid()) and pu.situacao='Ativo'
        and pu.empresa_id is not distinct from (select public.npi_current_empresa_id())
        and case lower(p_acao)
          when 'visualizar' then pm.visualizar
          when 'incluir' then pm.incluir
          when 'alterar' then pm.alterar
          when 'excluir' then pm.excluir
          when 'aprovar' then pm.aprovar
          when 'exportar' then pm.exportar
          else false
        end
    )
  end;
$$;

create or replace function public.npi_driver_can_view_vehicle(p_veiculo_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.motorista_veiculos mv
    where mv.motorista_id=(select public.npi_current_motorista_id())
      and mv.veiculo_id=p_veiculo_id and mv.ativo=true
      and mv.data_inicio <= current_date
      and (mv.data_fim is null or mv.data_fim >= current_date)
  );
$$;

create or replace function public.npi_validate_motorista_vehicle_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_motorista_empresa uuid; v_veiculo_empresa uuid;
begin
  select m.empresa_id into v_motorista_empresa from public.motoristas m where m.id=new.motorista_id;
  select v.empresa_id into v_veiculo_empresa from public.veiculos v where v.id=new.veiculo_id;
  if v_motorista_empresa is null or v_veiculo_empresa is null
     or v_motorista_empresa is distinct from new.empresa_id
     or v_veiculo_empresa is distinct from new.empresa_id then
    raise exception 'O motorista e o veículo precisam pertencer à mesma empresa da atribuição.';
  end if;
  return new;
end;
$$;
drop trigger if exists motorista_veiculos_validar_empresa on public.motorista_veiculos;
create trigger motorista_veiculos_validar_empresa before insert or update on public.motorista_veiculos
for each row execute function public.npi_validate_motorista_vehicle_assignment();

revoke all on function public.npi_current_empresa_id() from public;
revoke all on function public.npi_current_motorista_id() from public;
revoke all on function public.npi_is_admin() from public;
revoke all on function public.npi_current_is_driver() from public;
revoke all on function public.npi_has_permission(text,text) from public;
revoke all on function public.npi_driver_can_view_vehicle(uuid) from public;
revoke all on function public.npi_validate_motorista_vehicle_assignment() from public;
grant execute on function public.npi_current_empresa_id() to authenticated;
grant execute on function public.npi_current_motorista_id() to authenticated;
grant execute on function public.npi_is_admin() to authenticated;
grant execute on function public.npi_current_is_driver() to authenticated;
grant execute on function public.npi_has_permission(text,text) to authenticated;
grant execute on function public.npi_driver_can_view_vehicle(uuid) to authenticated;
grant usage on schema public to authenticated;

-- 7) TRIGGER: novo usuário autenticável entra como INATIVO até o administrador
-- escolher seu perfil, vinculá-lo (se motorista) e ativá-lo na tela Usuários.
create or replace function public.npi_create_user_profile_on_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_empresa_id uuid;
begin
  select e.id into v_empresa_id from public.empresas e
  where e.situacao='Ativo' order by e.created_at asc limit 1;
  insert into public.usuarios (id,nome,login,email,empresa_id,situacao)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome',''), nullif(split_part(coalesce(new.email,''),'@',1),''), 'Novo usuário'),
    lower(split_part(coalesce(new.email,''),'@',1)),
    lower(new.email),
    v_empresa_id,
    'Inativo'
  ) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists npi_auth_user_created on auth.users;
create trigger npi_auth_user_created after insert on auth.users
for each row execute function public.npi_create_user_profile_on_signup();
revoke all on function public.npi_create_user_profile_on_signup() from public, anon, authenticated;

-- Backfill: contas Auth existentes antes da criação deste gatilho também aparecem
-- na tela de usuários. Elas entram Inativas até o administrador atribuir perfil.
insert into public.usuarios (id,nome,login,email,empresa_id,situacao)
select
  au.id,
  coalesce(nullif(au.raw_user_meta_data->>'nome',''), nullif(split_part(coalesce(au.email,''),'@',1),''), 'Novo usuário'),
  lower(nullif(split_part(coalesce(au.email,''),'@',1),'')),
  lower(au.email),
  (select e.id from public.empresas e where e.situacao='Ativo' order by e.created_at asc limit 1),
  'Inativo'
from auth.users au
where not exists (select 1 from public.usuarios u where u.id=au.id);

-- 8) FUNÇÃO ADMINISTRATIVA ATÔMICA: atribui perfil, motorista e situação.
create or replace function public.npi_admin_set_user_access(
  p_usuario_id uuid, p_perfil_id uuid, p_motorista_id uuid, p_situacao text
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_empresa_id uuid; v_nome_perfil text;
begin
  if not public.npi_is_admin() then raise exception 'Apenas administradores podem alterar acessos.'; end if;
  if p_situacao is null or p_situacao not in ('Ativo','Inativo') then raise exception 'Situação inválida.'; end if;
  select u.empresa_id into v_empresa_id from public.usuarios u where u.id=p_usuario_id;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if v_empresa_id is distinct from (select public.npi_current_empresa_id()) then
    raise exception 'Não é permitido administrar usuários de outra empresa.';
  end if;
  select p.nome into v_nome_perfil from public.perfis p where p.id=p_perfil_id and p.situacao='Ativo';
  if v_nome_perfil is null then raise exception 'Selecione um perfil ativo.'; end if;
  if v_nome_perfil='Motorista' and p_motorista_id is null then
    raise exception 'Vincule o cadastro de motorista antes de atribuir o perfil Motorista.';
  end if;
  if v_nome_perfil <> 'Motorista' then p_motorista_id := null; end if;
  if p_motorista_id is not null and not exists (
    select 1 from public.motoristas m where m.id=p_motorista_id and m.empresa_id=v_empresa_id and m.situacao='Ativo'
  ) then raise exception 'O cadastro de motorista não pertence à empresa deste usuário ou está inativo.'; end if;
  update public.usuarios set motorista_id=p_motorista_id, situacao=p_situacao where id=p_usuario_id;
  delete from public.perfis_usuarios where usuario_id=p_usuario_id;
  insert into public.perfis_usuarios(usuario_id,perfil_id,empresa_id,filial_id,situacao)
  values (p_usuario_id,p_perfil_id,v_empresa_id,null,'Ativo');
end;
$$;
revoke all on function public.npi_admin_set_user_access(uuid,uuid,uuid,text) from public;
grant execute on function public.npi_admin_set_user_access(uuid,uuid,uuid,text) to authenticated;

-- 9) RLS: USUÁRIOS E CONFIGURAÇÃO DE PERFIS
-- Escrita de usuários e vínculos de perfil passa exclusivamente pela função
-- administrativa SECURITY DEFINER; o navegador não recebe UPDATE direto.
revoke all on table public.usuarios, public.perfis, public.perfis_usuarios, public.permissoes, public.motorista_veiculos from anon, authenticated;
grant select on public.usuarios to authenticated;
grant select, insert on public.perfis to authenticated;
grant select on public.perfis_usuarios to authenticated;
grant select, insert, update on public.permissoes to authenticated;
grant select, insert, update on public.motorista_veiculos to authenticated;

drop policy if exists usuarios_select_proprio_perfil on public.usuarios;
drop policy if exists usuarios_select_admin_ou_proprio on public.usuarios;
create policy usuarios_select_admin_ou_proprio on public.usuarios for select to authenticated
using (id=(select auth.uid()) or (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_is_admin())));
drop policy if exists usuarios_update_admin on public.usuarios;

drop policy if exists perfis_select_visiveis on public.perfis;
create policy perfis_select_visiveis on public.perfis for select to authenticated
using ((select public.npi_is_admin()) or exists (
  select 1 from public.perfis_usuarios pu where pu.perfil_id=perfis.id
    and pu.usuario_id=(select auth.uid()) and pu.situacao='Ativo'
));
drop policy if exists perfis_admin_manage on public.perfis;
create policy perfis_admin_manage on public.perfis for all to authenticated
using ((select public.npi_is_admin())) with check ((select public.npi_is_admin()));

drop policy if exists perfis_usuarios_select_proprio_admin on public.perfis_usuarios;
create policy perfis_usuarios_select_proprio_admin on public.perfis_usuarios for select to authenticated
using (usuario_id=(select auth.uid()) or (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_is_admin())));
drop policy if exists perfis_usuarios_admin_manage on public.perfis_usuarios;

drop policy if exists permissoes_select_perfis_vinculados on public.permissoes;
create policy permissoes_select_perfis_vinculados on public.permissoes for select to authenticated
using ((select public.npi_is_admin()) or exists (
  select 1 from public.perfis_usuarios pu where pu.perfil_id=permissoes.perfil_id
    and pu.usuario_id=(select auth.uid()) and pu.situacao='Ativo'
));
drop policy if exists permissoes_admin_manage on public.permissoes;
create policy permissoes_admin_manage on public.permissoes for all to authenticated
using ((select public.npi_is_admin())) with check ((select public.npi_is_admin()));

-- 10) RLS GRANULAR PARA OS CADASTROS-BASE. Remove as políticas amplas da Etapa 3.
drop policy if exists empresas_select_empresa_vinculada on public.empresas;
drop policy if exists empresas_update_empresa_vinculada on public.empresas;
drop policy if exists empresas_select_by_role on public.empresas;
drop policy if exists empresas_update_by_role on public.empresas;
create policy empresas_select_by_role on public.empresas for select to authenticated
using (id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('empresas','visualizar')));
create policy empresas_update_by_role on public.empresas for update to authenticated
using (id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('empresas','alterar')))
with check (id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('empresas','alterar')));

-- Helper de criação das quatro políticas CRUD em tabelas com empresa_id.
do $$
declare item record;
begin
  for item in select * from (values
    ('filiais','filiais'),('centros_custo','centros'),('projetos','projetos')
  ) as t(tabela,modulo)
  loop
    execute format('drop policy if exists %I on public.%I', item.tabela || '_empresa_vinculada', item.tabela);
    execute format('drop policy if exists %I on public.%I', item.tabela || '_select_role', item.tabela);
    execute format('drop policy if exists %I on public.%I', item.tabela || '_insert_role', item.tabela);
    execute format('drop policy if exists %I on public.%I', item.tabela || '_update_role', item.tabela);
    execute format('drop policy if exists %I on public.%I', item.tabela || '_delete_role', item.tabela);
    execute format('create policy %I on public.%I for select to authenticated using (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''visualizar'')))', item.tabela || '_select_role', item.tabela, item.modulo);
    execute format('create policy %I on public.%I for insert to authenticated with check (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''incluir'')))', item.tabela || '_insert_role', item.tabela, item.modulo);
    execute format('create policy %I on public.%I for update to authenticated using (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''alterar''))) with check (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''alterar'')))', item.tabela || '_update_role', item.tabela, item.modulo, item.modulo);
    execute format('create policy %I on public.%I for delete to authenticated using (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission(%L,''excluir'')))', item.tabela || '_delete_role', item.tabela, item.modulo);
  end loop;
end;
$$;

-- VEÍCULOS: o motorista só consulta veículos ativos atribuídos a ele.
drop policy if exists veiculos_empresa_vinculada on public.veiculos;
drop policy if exists veiculos_select_role on public.veiculos;
drop policy if exists veiculos_insert_role on public.veiculos;
drop policy if exists veiculos_update_role on public.veiculos;
drop policy if exists veiculos_delete_role on public.veiculos;
create policy veiculos_select_role on public.veiculos for select to authenticated using (
  empresa_id=(select public.npi_current_empresa_id()) and (
    (select public.npi_is_admin()) or (
      (select public.npi_current_is_driver())
      and (select public.npi_has_permission('painel_motorista','visualizar'))
      and (select public.npi_driver_can_view_vehicle(id))
    ) or (
      not (select public.npi_current_is_driver())
      and (select public.npi_has_permission('veiculos','visualizar'))
    )
  )
);
create policy veiculos_insert_role on public.veiculos for insert to authenticated
with check (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('veiculos','incluir')));
create policy veiculos_update_role on public.veiculos for update to authenticated
using (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('veiculos','alterar')))
with check (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('veiculos','alterar')));
create policy veiculos_delete_role on public.veiculos for delete to authenticated
using (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('veiculos','excluir')));

-- MOTORISTAS: cadastro completo fica restrito a perfis de gestão autorizados;
-- o perfil Motorista não consulta esta tabela diretamente.
drop policy if exists motoristas_empresa_vinculada on public.motoristas;
drop policy if exists motoristas_select_role on public.motoristas;
drop policy if exists motoristas_insert_role on public.motoristas;
drop policy if exists motoristas_update_role on public.motoristas;
drop policy if exists motoristas_delete_role on public.motoristas;
create policy motoristas_select_role on public.motoristas for select to authenticated using (
  empresa_id=(select public.npi_current_empresa_id()) and (
    (select public.npi_is_admin()) or (
      not (select public.npi_current_is_driver())
      and (select public.npi_has_permission('motoristas','visualizar'))
    )
  )
);
create policy motoristas_insert_role on public.motoristas for insert to authenticated
with check (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('motoristas','incluir')));
create policy motoristas_update_role on public.motoristas for update to authenticated
using (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('motoristas','alterar')))
with check (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('motoristas','alterar')));
create policy motoristas_delete_role on public.motoristas for delete to authenticated
using (empresa_id=(select public.npi_current_empresa_id()) and (select public.npi_has_permission('motoristas','excluir')));

-- ASSOCIAÇÕES: motorista vê apenas suas atribuições; administrador gerencia todas.
drop policy if exists motorista_veiculos_select_role on public.motorista_veiculos;
drop policy if exists motorista_veiculos_insert_role on public.motorista_veiculos;
drop policy if exists motorista_veiculos_update_role on public.motorista_veiculos;
drop policy if exists motorista_veiculos_delete_role on public.motorista_veiculos;
create policy motorista_veiculos_select_role on public.motorista_veiculos for select to authenticated
using (
  (empresa_id=(select public.npi_current_empresa_id()) and (
    (select public.npi_is_admin()) or (select public.npi_has_permission('atribuicoes_motoristas','visualizar'))
  )) or (
    motorista_id=(select public.npi_current_motorista_id())
    and (select public.npi_has_permission('painel_motorista','visualizar'))
  )
);
create policy motorista_veiculos_insert_role on public.motorista_veiculos for insert to authenticated
with check (empresa_id=(select public.npi_current_empresa_id()) and (
  (select public.npi_is_admin()) or (select public.npi_has_permission('atribuicoes_motoristas','incluir'))
));
create policy motorista_veiculos_update_role on public.motorista_veiculos for update to authenticated
using (empresa_id=(select public.npi_current_empresa_id()) and (
  (select public.npi_is_admin()) or (select public.npi_has_permission('atribuicoes_motoristas','alterar'))
))
with check (empresa_id=(select public.npi_current_empresa_id()) and (
  (select public.npi_is_admin()) or (select public.npi_has_permission('atribuicoes_motoristas','alterar'))
));
create policy motorista_veiculos_delete_role on public.motorista_veiculos for delete to authenticated
using (empresa_id=(select public.npi_current_empresa_id()) and (
  (select public.npi_is_admin()) or (select public.npi_has_permission('atribuicoes_motoristas','excluir'))
));

-- 11) GARANTIR QUE O ADMINISTRADOR TENHA O ACESSO COMPLETO ÀS TABELAS DE CADASTRO.
grant select, insert, update, delete on public.filiais, public.centros_custo, public.projetos,
  public.veiculos, public.motoristas to authenticated;
grant select, update on public.empresas to authenticated;

-- FIM. Os módulos operacionais/financeiros continuam sem acesso direto no navegador
-- até serem conectados e receberem suas próprias políticas RLS específicas.
