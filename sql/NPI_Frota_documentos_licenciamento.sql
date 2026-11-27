-- ============================================================================
-- NPI FROTA | DOCUMENTOS E LICENCIAMENTO
-- Pré-requisitos: etapas 1, 2 e 3 + NPI_Frota_perfis_permissoes.sql.
-- Aproveita public.documentos já criada na Etapa 2. Não recria nem apaga dados.
-- Também cria um bucket privado para anexos PDF/JPG/PNG por veículo.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.documentos') is null then
    raise exception 'A tabela public.documentos não existe. Execute primeiro a Etapa 2 do NPI FROTA.';
  end if;
  if to_regclass('public.veiculos') is null then
    raise exception 'A tabela public.veiculos não existe. Execute primeiro a Etapa 1 do NPI FROTA.';
  end if;
  if to_regprocedure('public.npi_current_empresa_id()') is null
     or to_regprocedure('public.npi_has_permission(text,text)') is null
     or to_regprocedure('public.npi_is_admin()') is null then
    raise exception 'Funções de controle de acesso ausentes. Execute NPI_Frota_perfis_permissoes.sql.';
  end if;
end;
$$;

-- Complementa o cadastro de documentos para acompanhar licenciamento/IPVA.
alter table public.documentos
  add column if not exists ano_referencia integer,
  add column if not exists valor_pago numeric(14,2),
  add column if not exists data_pagamento date,
  add column if not exists observacoes text;

alter table public.documentos alter column situacao set default 'Pendente';

-- Validações adicionais sem modificar registros antigos.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documentos'::regclass
      and conname = 'documentos_ano_referencia_valido'
  ) then
    alter table public.documentos
      add constraint documentos_ano_referencia_valido
      check (ano_referencia is null or ano_referencia between 2000 and 2100) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documentos'::regclass
      and conname = 'documentos_valor_pago_nao_negativo'
  ) then
    alter table public.documentos
      add constraint documentos_valor_pago_nao_negativo
      check (valor_pago is null or valor_pago >= 0) not valid;
  end if;
end;
$$;

create index if not exists documentos_veiculo_id_idx on public.documentos (veiculo_id);
create index if not exists documentos_data_validade_idx on public.documentos (data_validade) where data_validade is not null;
create index if not exists documentos_tipo_ano_idx on public.documentos (tipo_documento, ano_referencia);

-- A tabela documentos não possui empresa_id: o acesso é validado pelo veículo.
create or replace function public.npi_documentos_veiculo_empresa(p_veiculo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.veiculos v
    where v.id = p_veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  );
$$;

revoke all on function public.npi_documentos_veiculo_empresa(uuid) from public;
grant execute on function public.npi_documentos_veiculo_empresa(uuid) to authenticated;

grant select, insert, update, delete on public.documentos to authenticated;
alter table public.documentos enable row level security;

drop policy if exists documentos_select_role on public.documentos;
drop policy if exists documentos_insert_role on public.documentos;
drop policy if exists documentos_update_role on public.documentos;
drop policy if exists documentos_delete_role on public.documentos;

create policy documentos_select_role on public.documentos
for select to authenticated
using (
  (select public.npi_is_admin())
  or (
    (select public.npi_has_permission('documentos', 'visualizar'))
    and (select public.npi_documentos_veiculo_empresa(veiculo_id))
  )
);

create policy documentos_insert_role on public.documentos
for insert to authenticated
with check (
  ((select public.npi_is_admin()) or (select public.npi_has_permission('documentos', 'incluir')))
  and (select public.npi_documentos_veiculo_empresa(veiculo_id))
);

create policy documentos_update_role on public.documentos
for update to authenticated
using (
  ((select public.npi_is_admin()) or (select public.npi_has_permission('documentos', 'alterar')))
  and (select public.npi_documentos_veiculo_empresa(veiculo_id))
)
with check (
  ((select public.npi_is_admin()) or (select public.npi_has_permission('documentos', 'alterar')))
  and (select public.npi_documentos_veiculo_empresa(veiculo_id))
);

create policy documentos_delete_role on public.documentos
for delete to authenticated
using (
  ((select public.npi_is_admin()) or (select public.npi_has_permission('documentos', 'excluir')))
  and (select public.npi_documentos_veiculo_empresa(veiculo_id))
);

-- Bucket privado: cada arquivo fica em uma pasta cujo nome é o UUID do veículo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'npi-documentos-veiculos',
  'npi-documentos-veiculos',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Função para validar a pasta do objeto sem converter texto inválido para UUID.
create or replace function public.npi_documentos_path_da_empresa(p_veiculo_id_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.veiculos v
    where v.id::text = p_veiculo_id_text
      and v.empresa_id = (select public.npi_current_empresa_id())
  );
$$;

revoke all on function public.npi_documentos_path_da_empresa(text) from public;
grant execute on function public.npi_documentos_path_da_empresa(text) to authenticated;

drop policy if exists npi_documentos_storage_select on storage.objects;
drop policy if exists npi_documentos_storage_insert on storage.objects;
drop policy if exists npi_documentos_storage_update on storage.objects;
drop policy if exists npi_documentos_storage_delete on storage.objects;

create policy npi_documentos_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'npi-documentos-veiculos'
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('documentos', 'visualizar')))
  and (select public.npi_documentos_path_da_empresa(split_part(name, '/', 1)))
);

create policy npi_documentos_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'npi-documentos-veiculos'
  and (
    (select public.npi_is_admin())
    or (select public.npi_has_permission('documentos', 'incluir'))
    or (select public.npi_has_permission('documentos', 'alterar'))
  )
  and (select public.npi_documentos_path_da_empresa(split_part(name, '/', 1)))
);

create policy npi_documentos_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'npi-documentos-veiculos'
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('documentos', 'alterar')))
  and (select public.npi_documentos_path_da_empresa(split_part(name, '/', 1)))
)
with check (
  bucket_id = 'npi-documentos-veiculos'
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('documentos', 'alterar')))
  and (select public.npi_documentos_path_da_empresa(split_part(name, '/', 1)))
);

create policy npi_documentos_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'npi-documentos-veiculos'
  and ((select public.npi_is_admin()) or (select public.npi_has_permission('documentos', 'excluir')))
  and (select public.npi_documentos_path_da_empresa(split_part(name, '/', 1)))
);

comment on table public.documentos is 'Documentos veiculares, CRLV-e, licenciamento, IPVA e comprovantes com acesso restrito por empresa e veículo.';
comment on column public.documentos.arquivo_path is 'Caminho privado no bucket npi-documentos-veiculos; não armazenar URL pública.';

commit;
-- FIM: DOCUMENTOS E LICENCIAMENTO
