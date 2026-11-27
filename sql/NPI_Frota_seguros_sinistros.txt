-- ============================================================================
-- NPI FROTA | SEGUROS E SINISTROS
-- Pré-requisitos: Etapas 1, 2 e 3 + NPI_Frota_perfis_permissoes.sql.
-- Aproveita public.seguros existente, cria public.sinistros e bucket privado.
-- Não apaga apólices, veículos, motoristas nem demais registros existentes.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.seguros') is null then
    raise exception 'A tabela public.seguros não existe. Execute primeiro a Etapa 2 do NPI FROTA.';
  end if;
  if to_regclass('public.veiculos') is null or to_regclass('public.motoristas') is null then
    raise exception 'As tabelas de veículos e motoristas são necessárias. Execute a Etapa 1.';
  end if;
  if to_regclass('public.oficinas') is null then
    raise exception 'A tabela public.oficinas não existe. Execute NPI_Frota_cadastros_auxiliares.sql.';
  end if;
  if to_regclass('public.permissoes') is null
     or to_regprocedure('public.npi_current_empresa_id()') is null
     or to_regprocedure('public.npi_has_permission(text,text)') is null
     or to_regprocedure('public.npi_is_admin()') is null then
    raise exception 'Funções/tabelas de controle de acesso ausentes. Execute NPI_Frota_perfis_permissoes.sql.';
  end if;
end;
$$;

-- 1) Complementa a apólice com informações operacionais adicionais.
alter table public.seguros
  add column if not exists tipo_seguro text,
  add column if not exists telefone_assistencia text,
  add column if not exists valor_segurado numeric(14,2),
  add column if not exists observacoes text;

-- Verificações novas são NOT VALID para preservar registros antigos; novas
-- gravações já precisam respeitar as condições.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.seguros'::regclass and conname='seguros_valores_nao_negativos') then
    alter table public.seguros add constraint seguros_valores_nao_negativos
      check ((valor_premio is null or valor_premio >= 0) and (franquia is null or franquia >= 0) and (valor_segurado is null or valor_segurado >= 0)) not valid;
  end if;
end;
$$;

-- Chave composta usada para garantir que um sinistro e sua apólice pertençam
-- ao mesmo veículo (não basta escolher IDs individualmente válidos).
create unique index if not exists seguros_id_veiculo_unico_idx
  on public.seguros (id, veiculo_id);

-- 2) Registro de ocorrências/sinistros.
create table if not exists public.sinistros (
  id uuid primary key default gen_random_uuid(),
  seguro_id uuid not null,
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  motorista_id uuid references public.motoristas(id) on delete restrict,
  tipo_sinistro text not null,
  data_hora_ocorrencia timestamptz not null,
  data_aviso_seguradora date,
  local_ocorrencia text,
  descricao text not null,
  terceiros_envolvidos boolean not null default false,
  numero_bo text,
  numero_sinistro text,
  valor_estimado numeric(14,2) not null default 0 check (valor_estimado >= 0),
  valor_franquia numeric(14,2) check (valor_franquia is null or valor_franquia >= 0),
  valor_indenizacao numeric(14,2) check (valor_indenizacao is null or valor_indenizacao >= 0),
  oficina_id uuid references public.oficinas(id) on delete set null,
  situacao text not null default 'Aberto'
    check (situacao in ('Aberto','Em análise','Aguardando documentos','Aprovado','Negado','Encerrado')),
  data_encerramento date,
  arquivo_path text,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sinistros_seguro_veiculo_fk
    foreign key (seguro_id, veiculo_id)
    references public.seguros(id, veiculo_id) on delete restrict,
  constraint sinistros_data_aviso_valida
    check (data_aviso_seguradora is null or data_aviso_seguradora >= data_hora_ocorrencia::date),
  constraint sinistros_data_encerramento_valida
    check (data_encerramento is null or data_encerramento >= data_hora_ocorrencia::date)
);

create index if not exists seguros_veiculo_vigencia_idx on public.seguros (veiculo_id, fim_vigencia);
create index if not exists seguros_fim_vigencia_idx on public.seguros (fim_vigencia) where fim_vigencia is not null;
create index if not exists sinistros_veiculo_data_idx on public.sinistros (veiculo_id, data_hora_ocorrencia desc);
create index if not exists sinistros_seguro_idx on public.sinistros (seguro_id, data_hora_ocorrencia desc);
create index if not exists sinistros_situacao_idx on public.sinistros (situacao, data_hora_ocorrencia desc);
create unique index if not exists sinistros_numero_unico_por_apolice_idx
  on public.sinistros (seguro_id, upper(btrim(numero_sinistro)))
  where numero_sinistro is not null and btrim(numero_sinistro) <> '';

-- 3) Atualização automática de updated_at.
drop trigger if exists seguros_updated_at on public.seguros;
create trigger seguros_updated_at before update on public.seguros
for each row execute function public.npi_set_updated_at();
drop trigger if exists sinistros_updated_at on public.sinistros;
create trigger sinistros_updated_at before update on public.sinistros
for each row execute function public.npi_set_updated_at();

-- 4) Helpers de isolamento por empresa e validação dos relacionamentos.
create or replace function public.npi_seguros_veiculo_empresa(p_veiculo_id uuid)
returns boolean
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select exists (
    select 1 from public.veiculos v
    where v.id = p_veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  );
$$;

create or replace function public.npi_sinistros_relacoes_validas(
  p_veiculo_id uuid,
  p_seguro_id uuid,
  p_motorista_id uuid,
  p_oficina_id uuid
)
returns boolean
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select exists (
    select 1
    from public.seguros s
    join public.veiculos v on v.id = s.veiculo_id
    where s.id = p_seguro_id
      and s.veiculo_id = p_veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
  and (
    p_motorista_id is null or exists (
      select 1 from public.motoristas m
      where m.id = p_motorista_id
        and m.empresa_id = (select public.npi_current_empresa_id())
    )
  )
  and (
    p_oficina_id is null or exists (
      select 1 from public.oficinas o
      where o.id = p_oficina_id
        and o.empresa_id = (select public.npi_current_empresa_id())
    )
  );
$$;

revoke all on function public.npi_seguros_veiculo_empresa(uuid) from public;
revoke all on function public.npi_sinistros_relacoes_validas(uuid,uuid,uuid,uuid) from public;
grant execute on function public.npi_seguros_veiculo_empresa(uuid) to authenticated;
grant execute on function public.npi_sinistros_relacoes_validas(uuid,uuid,uuid,uuid) to authenticated;

-- 5) RLS das apólices. O vínculo com empresa é conferido pelo veículo.
grant select, insert, update, delete on public.seguros to authenticated;
alter table public.seguros enable row level security;

drop policy if exists seguros_select_role on public.seguros;
drop policy if exists seguros_insert_role on public.seguros;
drop policy if exists seguros_update_role on public.seguros;
drop policy if exists seguros_delete_role on public.seguros;

create policy seguros_select_role on public.seguros
for select to authenticated
using (
  (select public.npi_seguros_veiculo_empresa(veiculo_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('seguros','visualizar'))
  )
);
create policy seguros_insert_role on public.seguros
for insert to authenticated
with check (
  (select public.npi_seguros_veiculo_empresa(veiculo_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('seguros','incluir'))
  )
);
create policy seguros_update_role on public.seguros
for update to authenticated
using (
  (select public.npi_seguros_veiculo_empresa(veiculo_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('seguros','alterar'))
  )
)
with check (
  (select public.npi_seguros_veiculo_empresa(veiculo_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('seguros','alterar'))
  )
);
create policy seguros_delete_role on public.seguros
for delete to authenticated
using (
  (select public.npi_seguros_veiculo_empresa(veiculo_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('seguros','excluir'))
  )
);

-- 6) RLS dos sinistros. A FK composta e o helper asseguram que o seguro
-- selecionado pertence ao mesmo veículo e empresa; motorista/oficina também
-- precisam pertencer à empresa ativa.
grant select, insert, update, delete on public.sinistros to authenticated;
alter table public.sinistros enable row level security;

drop policy if exists sinistros_select_role on public.sinistros;
drop policy if exists sinistros_insert_role on public.sinistros;
drop policy if exists sinistros_update_role on public.sinistros;
drop policy if exists sinistros_delete_role on public.sinistros;

create policy sinistros_select_role on public.sinistros
for select to authenticated
using (
  (select public.npi_sinistros_relacoes_validas(veiculo_id, seguro_id, motorista_id, oficina_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('sinistros','visualizar'))
  )
);
create policy sinistros_insert_role on public.sinistros
for insert to authenticated
with check (
  (select public.npi_sinistros_relacoes_validas(veiculo_id, seguro_id, motorista_id, oficina_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('sinistros','incluir'))
  )
);
create policy sinistros_update_role on public.sinistros
for update to authenticated
using (
  (select public.npi_sinistros_relacoes_validas(veiculo_id, seguro_id, motorista_id, oficina_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('sinistros','alterar'))
  )
)
with check (
  (select public.npi_sinistros_relacoes_validas(veiculo_id, seguro_id, motorista_id, oficina_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('sinistros','alterar'))
  )
);
create policy sinistros_delete_role on public.sinistros
for delete to authenticated
using (
  (select public.npi_sinistros_relacoes_validas(veiculo_id, seguro_id, motorista_id, oficina_id))
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('sinistros','excluir'))
  )
);

-- 7) Permissão do novo módulo: copia o padrão de Seguros para cada perfil
-- já existente. Perfis sem permissão de Seguros começam sem acesso a Sinistros.
insert into public.permissoes (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, 'sinistros',
       coalesce(ps.visualizar, false), coalesce(ps.incluir, false),
       coalesce(ps.alterar, false), coalesce(ps.excluir, false),
       coalesce(ps.aprovar, false), coalesce(ps.exportar, false)
from public.perfis p
left join public.permissoes ps on ps.perfil_id = p.id and ps.modulo = 'seguros'
on conflict (perfil_id, modulo) do nothing;

-- 8) Bucket privado para apólices e anexos de sinistros.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'npi-seguros-sinistros', 'npi-seguros-sinistros', false, 15728640,
  array['application/pdf','image/jpeg','image/png']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Caminhos aceitos: <uuid-do-veiculo>/apolices/<arquivo> ou
-- <uuid-do-veiculo>/sinistros/<arquivo>. Cada ação respeita a permissão do módulo.
create or replace function public.npi_seguros_sinistros_storage_autorizado(p_path text, p_action text)
returns boolean
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare
  v_vehicle_id uuid;
  v_folder text;
  v_module text;
begin
  if p_path is null or p_path !~ '^[0-9a-fA-F-]{36}/(apolices|sinistros)/[^/]+$' then
    return false;
  end if;
  begin
    v_vehicle_id := split_part(p_path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  v_folder := split_part(p_path, '/', 2);
  v_module := case when v_folder = 'apolices' then 'seguros' else 'sinistros' end;

  if not exists (
    select 1 from public.veiculos v
    where v.id = v_vehicle_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  ) then
    return false;
  end if;

  if (select public.npi_is_admin()) then return true; end if;
  if p_action = 'incluir' then
    return (select public.npi_has_permission(v_module,'incluir'))
       or (select public.npi_has_permission(v_module,'alterar'));
  end if;
  return (select public.npi_has_permission(v_module,p_action));
end;
$$;
revoke all on function public.npi_seguros_sinistros_storage_autorizado(text,text) from public;
grant execute on function public.npi_seguros_sinistros_storage_autorizado(text,text) to authenticated;

drop policy if exists npi_seguros_sinistros_storage_select on storage.objects;
drop policy if exists npi_seguros_sinistros_storage_insert on storage.objects;
drop policy if exists npi_seguros_sinistros_storage_update on storage.objects;
drop policy if exists npi_seguros_sinistros_storage_delete on storage.objects;

create policy npi_seguros_sinistros_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'npi-seguros-sinistros'
  and (select public.npi_seguros_sinistros_storage_autorizado(name,'visualizar'))
);
create policy npi_seguros_sinistros_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'npi-seguros-sinistros'
  and (select public.npi_seguros_sinistros_storage_autorizado(name,'incluir'))
);
create policy npi_seguros_sinistros_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'npi-seguros-sinistros'
  and (select public.npi_seguros_sinistros_storage_autorizado(name,'alterar'))
)
with check (
  bucket_id = 'npi-seguros-sinistros'
  and (select public.npi_seguros_sinistros_storage_autorizado(name,'alterar'))
);
create policy npi_seguros_sinistros_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'npi-seguros-sinistros'
  and (select public.npi_seguros_sinistros_storage_autorizado(name,'excluir'))
);

comment on table public.seguros is 'Apólices e coberturas de veículos, com acesso controlado pela empresa do veículo.';
comment on table public.sinistros is 'Ocorrências e processos de sinistros vinculados a uma apólice e ao respectivo veículo.';
comment on column public.seguros.arquivo_apolice_path is 'Caminho privado no bucket npi-seguros-sinistros; não armazenar URL pública.';
comment on column public.sinistros.arquivo_path is 'Caminho privado no bucket npi-seguros-sinistros; não armazenar URL pública.';

commit;
-- FIM: SEGUROS E SINISTROS
