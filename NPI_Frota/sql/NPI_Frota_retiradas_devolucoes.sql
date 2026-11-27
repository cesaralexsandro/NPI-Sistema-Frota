-- NPI FROTA | ETAPA 4 - RETIRADAS E DEVOLUCOES
-- Execute este script no SQL Editor do Supabase depois da Etapa de Perfis/Permissoes.
-- O script e idempotente: pode ser executado novamente com segurança.
-- Libera somente os usuarios com permissoes nos modulos e limita os dados a empresa vinculada.

begin;

-- Situacao controla a existencia de uma retirada em aberto por veiculo.
alter table public.retiradas
  add column if not exists situacao text not null default 'Em aberto';

alter table public.retiradas
  drop constraint if exists retiradas_situacao_check;
alter table public.retiradas
  add constraint retiradas_situacao_check
  check (situacao in ('Em aberto','Devolvida'));

create index if not exists retiradas_veiculo_situacao_idx
  on public.retiradas (veiculo_id, situacao);

-- Evita duas retiradas em aberto para o mesmo veiculo.
create unique index if not exists retiradas_uma_aberta_por_veiculo_idx
  on public.retiradas (veiculo_id) where situacao = 'Em aberto';

-- Permissoes SQL para o cliente autenticado. Nao ha acesso anonimo.
grant select, insert, update on public.retiradas, public.devolucoes to authenticated;
revoke all on public.retiradas, public.devolucoes from anon;

alter table public.retiradas enable row level security;
alter table public.devolucoes enable row level security;

-- Retiradas: leitura limitada pela empresa e pela permissao do modulo.
drop policy if exists retiradas_select_role on public.retiradas;
create policy retiradas_select_role on public.retiradas
for select to authenticated
using (
  (select public.npi_has_permission('retiradas','visualizar'))
  and exists (
    select 1 from public.veiculos v
    where v.id = retiradas.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

-- Uma retirada exige veiculo e motorista ativos, vinculados entre si, na empresa do usuario.
drop policy if exists retiradas_insert_role on public.retiradas;
create policy retiradas_insert_role on public.retiradas
for insert to authenticated
with check (
  (select public.npi_has_permission('retiradas','incluir'))
  and exists (
    select 1
    from public.veiculos v
    join public.motoristas m on m.id = retiradas.motorista_id
    join public.motorista_veiculos mv
      on mv.veiculo_id = v.id
     and mv.motorista_id = m.id
     and mv.ativo = true
     and (mv.data_fim is null or mv.data_fim >= current_date)
    where v.id = retiradas.veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
      and m.empresa_id = (select public.npi_current_empresa_id())
      and v.situacao = 'Disponível'
      and m.situacao = 'Ativo'
  )
);

drop policy if exists retiradas_update_role on public.retiradas;
create policy retiradas_update_role on public.retiradas
for update to authenticated
using (
  situacao = 'Em aberto'
  and (select public.npi_has_permission('retiradas','alterar'))
  and exists (select 1 from public.veiculos v where v.id=retiradas.veiculo_id and v.empresa_id=(select public.npi_current_empresa_id()))
)
with check (
  situacao = 'Em aberto'
  and (select public.npi_has_permission('retiradas','alterar'))
  and exists (select 1 from public.veiculos v where v.id=retiradas.veiculo_id and v.empresa_id=(select public.npi_current_empresa_id()))
);

-- Impede exclusao de registros operacionais: preserva rastreabilidade.
drop policy if exists retiradas_no_delete on public.retiradas;
create policy retiradas_no_delete on public.retiradas
for delete to authenticated using (false);

-- Devolucoes: acesso herdado da empresa do veiculo associado a retirada.
drop policy if exists devolucoes_select_role on public.devolucoes;
create policy devolucoes_select_role on public.devolucoes
for select to authenticated
using (
  (select public.npi_has_permission('devolucoes','visualizar'))
  and exists (
    select 1 from public.retiradas r
    join public.veiculos v on v.id = r.veiculo_id
    where r.id = devolucoes.retirada_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

drop policy if exists devolucoes_insert_role on public.devolucoes;
create policy devolucoes_insert_role on public.devolucoes
for insert to authenticated
with check (
  (select public.npi_has_permission('devolucoes','incluir'))
  and exists (
    select 1 from public.retiradas r
    join public.veiculos v on v.id = r.veiculo_id
    where r.id = devolucoes.retirada_id
      and r.situacao = 'Em aberto'
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

drop policy if exists devolucoes_update_role on public.devolucoes;
create policy devolucoes_update_role on public.devolucoes
for update to authenticated
using (
  (select public.npi_has_permission('devolucoes','alterar'))
  and exists (
    select 1 from public.retiradas r
    join public.veiculos v on v.id = r.veiculo_id
    where r.id = devolucoes.retirada_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
)
with check (
  (select public.npi_has_permission('devolucoes','alterar'))
  and exists (
    select 1 from public.retiradas r
    join public.veiculos v on v.id = r.veiculo_id
    where r.id = devolucoes.retirada_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  )
);

drop policy if exists devolucoes_no_delete on public.devolucoes;
create policy devolucoes_no_delete on public.devolucoes
for delete to authenticated using (false);

-- Valida a retirada e altera o veiculo para Em utilizacao.
create or replace function public.npi_validate_and_start_retirada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_veiculo_situacao text;
  v_empresa_id uuid;
  v_motorista_empresa_id uuid;
begin
  select v.situacao, v.empresa_id into v_veiculo_situacao, v_empresa_id
  from public.veiculos v where v.id = new.veiculo_id;
  select m.empresa_id into v_motorista_empresa_id
  from public.motoristas m where m.id = new.motorista_id;

  if v_veiculo_situacao is distinct from 'Disponível' then
    raise exception 'O veículo não está disponível para retirada.';
  end if;
  if v_empresa_id is null or v_empresa_id is distinct from v_motorista_empresa_id then
    raise exception 'O veículo e o motorista precisam pertencer à mesma empresa.';
  end if;
  if not exists (
    select 1 from public.motorista_veiculos mv
    where mv.veiculo_id = new.veiculo_id
      and mv.motorista_id = new.motorista_id
      and mv.empresa_id = v_empresa_id
      and mv.ativo = true
      and (mv.data_fim is null or mv.data_fim >= current_date)
  ) then
    raise exception 'O motorista não possui atribuição ativa para este veículo.';
  end if;
  new.situacao := 'Em aberto';
  return new;
end;
$$;

create or replace function public.npi_set_vehicle_in_use_after_retirada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.veiculos set situacao = 'Em utilização'
  where id = new.veiculo_id;
  return new;
end;
$$;

drop trigger if exists npi_validate_retirada_before_insert on public.retiradas;
create trigger npi_validate_retirada_before_insert
before insert on public.retiradas
for each row execute function public.npi_validate_and_start_retirada();

drop trigger if exists npi_set_vehicle_in_use_after_retirada on public.retiradas;
create trigger npi_set_vehicle_in_use_after_retirada
after insert on public.retiradas
for each row execute function public.npi_set_vehicle_in_use_after_retirada();

-- Devolucao valida km e encerra a retirada; atualiza km e libera o veiculo.
create or replace function public.npi_process_devolucao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retirada public.retiradas%rowtype;
begin
  select * into v_retirada
  from public.retiradas r
  where r.id = new.retirada_id
  for update;

  if not found then
    raise exception 'Retirada vinculada não encontrada.';
  end if;
  if v_retirada.situacao <> 'Em aberto' then
    if tg_op = 'INSERT' then
      raise exception 'Esta retirada já foi devolvida.';
    end if;
  end if;
  if new.quilometragem_final < v_retirada.quilometragem_inicial then
    raise exception 'A quilometragem final não pode ser menor que a quilometragem inicial.';
  end if;

  update public.retiradas set situacao = 'Devolvida'
  where id = new.retirada_id;
  update public.veiculos
  set quilometragem_atual = greatest(coalesce(quilometragem_atual,0), new.quilometragem_final),
      situacao = 'Disponível'
  where id = v_retirada.veiculo_id;
  return new;
end;
$$;

drop trigger if exists npi_process_devolucao_after_insert on public.devolucoes;
create trigger npi_process_devolucao_after_insert
after insert on public.devolucoes
for each row execute function public.npi_process_devolucao();

-- Evita alterar qual retirada esta associada a uma devolucao.
create or replace function public.npi_keep_devolucao_retirada_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.retirada_id is distinct from old.retirada_id then
    raise exception 'Não é permitido trocar a retirada vinculada após registrar a devolução.';
  end if;
  if new.quilometragem_final < (select r.quilometragem_inicial from public.retiradas r where r.id=old.retirada_id) then
    raise exception 'A quilometragem final não pode ser menor que a quilometragem inicial.';
  end if;
  return new;
end;
$$;

drop trigger if exists npi_keep_devolucao_retirada_immutable on public.devolucoes;
create trigger npi_keep_devolucao_retirada_immutable
before update on public.devolucoes
for each row execute function public.npi_keep_devolucao_retirada_immutable();

create or replace function public.npi_refresh_vehicle_after_devolucao_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_veiculo_id uuid;
begin
  select r.veiculo_id into v_veiculo_id from public.retiradas r where r.id=new.retirada_id;
  update public.veiculos
  set quilometragem_atual = greatest(coalesce(quilometragem_atual,0),new.quilometragem_final),
      situacao = 'Disponível'
  where id=v_veiculo_id;
  return new;
end;
$$;

drop trigger if exists npi_refresh_vehicle_after_devolucao_update on public.devolucoes;
create trigger npi_refresh_vehicle_after_devolucao_update
after update on public.devolucoes
for each row execute function public.npi_refresh_vehicle_after_devolucao_update();

-- Funcoes chamadas somente pelos triggers; sem execucao direta pelo navegador.
revoke all on function public.npi_validate_and_start_retirada() from public, anon, authenticated;
revoke all on function public.npi_set_vehicle_in_use_after_retirada() from public, anon, authenticated;
revoke all on function public.npi_process_devolucao() from public, anon, authenticated;
revoke all on function public.npi_keep_devolucao_retirada_immutable() from public, anon, authenticated;
revoke all on function public.npi_refresh_vehicle_after_devolucao_update() from public, anon, authenticated;

commit;

-- Resultado esperado:
-- 1) Ao inserir uma retirada válida, o veiculo muda para 'Em utilização'.
-- 2) Ao inserir a devolucao, a retirada muda para 'Devolvida'.
-- 3) O veiculo recebe a quilometragem final e volta para 'Disponível'.
