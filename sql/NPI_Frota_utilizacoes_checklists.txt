-- ============================================================================
-- NPI FROTA | UTILIZAÇÕES, CHECKLISTS, MODELOS E ITENS DE CHECKLIST
-- Pré-requisitos: etapas 1, 2, RBAC, retiradas/devoluções e painel do motorista.
-- Migração idempotente: preserva dados e não cria registros fictícios.
-- Execute no Supabase > SQL Editor com a role administrativa do projeto.
-- ============================================================================

begin;

-- 1) Complementa a tabela de utilizações e liga cada histórico à operação original.
alter table public.utilizacoes
  add column if not exists retirada_id uuid references public.retiradas(id) on delete set null;
alter table public.utilizacoes
  add column if not exists devolucao_id uuid references public.devolucoes(id) on delete set null;

create unique index if not exists utilizacoes_retirada_id_uidx
  on public.utilizacoes (retirada_id);
create index if not exists utilizacoes_veiculo_saida_idx
  on public.utilizacoes (veiculo_id, data_saida desc);
create index if not exists checklists_veiculo_data_idx
  on public.checklists (veiculo_id, data_hora desc);
create index if not exists itens_checklist_modelo_ordem_idx
  on public.itens_checklist (modelo_checklist_id, ordem);

-- O serviço escolhido no Meu Painel também passa a compor a finalidade da utilização.
alter table public.retiradas add column if not exists servico text;
alter table public.retiradas add column if not exists servico_detalhes text;

-- 2) Função que sincroniza o histórico de utilização quando uma retirada começa.
create or replace function public.npi_sync_utilizacao_from_retirada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_devolucao public.devolucoes%rowtype;
  v_finalidade text;
begin
  select d.* into v_devolucao
  from public.devolucoes d
  where d.retirada_id = new.id
  order by d.data_hora_devolucao desc
  limit 1;

  v_finalidade := nullif(
    concat_ws(' — ', nullif(btrim(new.servico), ''), nullif(btrim(new.servico_detalhes), '')),
    ''
  );

  insert into public.utilizacoes (
    retirada_id, devolucao_id, veiculo_id, motorista_id,
    data_saida, data_retorno, quilometragem_inicial, quilometragem_final,
    destino, finalidade
  ) values (
    new.id, v_devolucao.id, new.veiculo_id, new.motorista_id,
    new.data_hora_retirada, v_devolucao.data_hora_devolucao,
    new.quilometragem_inicial, v_devolucao.quilometragem_final,
    new.destino, v_finalidade
  )
  on conflict (retirada_id) do update set
    devolucao_id = excluded.devolucao_id,
    veiculo_id = excluded.veiculo_id,
    motorista_id = excluded.motorista_id,
    data_saida = excluded.data_saida,
    data_retorno = excluded.data_retorno,
    quilometragem_inicial = excluded.quilometragem_inicial,
    quilometragem_final = excluded.quilometragem_final,
    destino = excluded.destino,
    finalidade = excluded.finalidade,
    updated_at = now();

  return new;
end;
$$;

-- 3) Função que sincroniza a mesma utilização quando a devolução é registrada.
create or replace function public.npi_sync_utilizacao_from_devolucao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retirada public.retiradas%rowtype;
  v_finalidade text;
begin
  select r.* into v_retirada
  from public.retiradas r
  where r.id = new.retirada_id;
  if not found then
    raise exception using message = 'A retirada vinculada à devolução não foi encontrada.';
  end if;

  v_finalidade := nullif(
    concat_ws(' — ', nullif(btrim(v_retirada.servico), ''), nullif(btrim(v_retirada.servico_detalhes), '')),
    ''
  );

  insert into public.utilizacoes (
    retirada_id, devolucao_id, veiculo_id, motorista_id,
    data_saida, data_retorno, quilometragem_inicial, quilometragem_final,
    destino, finalidade
  ) values (
    v_retirada.id, new.id, v_retirada.veiculo_id, v_retirada.motorista_id,
    v_retirada.data_hora_retirada, new.data_hora_devolucao,
    v_retirada.quilometragem_inicial, new.quilometragem_final,
    v_retirada.destino, v_finalidade
  )
  on conflict (retirada_id) do update set
    devolucao_id = excluded.devolucao_id,
    data_retorno = excluded.data_retorno,
    quilometragem_final = excluded.quilometragem_final,
    finalidade = excluded.finalidade,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.npi_sync_utilizacao_from_retirada() from public, anon;
revoke all on function public.npi_sync_utilizacao_from_devolucao() from public, anon;
grant execute on function public.npi_sync_utilizacao_from_retirada() to authenticated;
grant execute on function public.npi_sync_utilizacao_from_devolucao() to authenticated;

drop trigger if exists npi_sync_utilizacao_after_retirada on public.retiradas;
create trigger npi_sync_utilizacao_after_retirada
after insert or update on public.retiradas
for each row execute function public.npi_sync_utilizacao_from_retirada();

drop trigger if exists npi_sync_utilizacao_after_devolucao on public.devolucoes;
create trigger npi_sync_utilizacao_after_devolucao
after insert or update on public.devolucoes
for each row execute function public.npi_sync_utilizacao_from_devolucao();

-- 4) Backfill idempotente: cria/atualiza utilizações a partir de retiradas já existentes.
insert into public.utilizacoes (
  retirada_id, devolucao_id, veiculo_id, motorista_id,
  data_saida, data_retorno, quilometragem_inicial, quilometragem_final,
  destino, finalidade
)
select
  r.id, d.id, r.veiculo_id, r.motorista_id,
  r.data_hora_retirada, d.data_hora_devolucao,
  r.quilometragem_inicial, d.quilometragem_final,
  r.destino,
  nullif(concat_ws(' — ', nullif(btrim(r.servico), ''), nullif(btrim(r.servico_detalhes), '')), '')
from public.retiradas r
left join public.devolucoes d on d.retirada_id = r.id
on conflict (retirada_id) do update set
  devolucao_id = excluded.devolucao_id,
  veiculo_id = excluded.veiculo_id,
  motorista_id = excluded.motorista_id,
  data_saida = excluded.data_saida,
  data_retorno = excluded.data_retorno,
  quilometragem_inicial = excluded.quilometragem_inicial,
  quilometragem_final = excluded.quilometragem_final,
  destino = excluded.destino,
  finalidade = excluded.finalidade,
  updated_at = now();

-- 5) Funções de contexto para RLS. SECURITY DEFINER evita depender de permissões
-- de leitura em veículos e checklists para verificar o vínculo com a empresa.
create or replace function public.npi_vehicle_belongs_to_current_company(p_veiculo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.veiculos v
    where v.id = p_veiculo_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  );
$$;

create or replace function public.npi_checklist_belongs_to_current_company(p_checklist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.checklists c
    join public.veiculos v on v.id = c.veiculo_id
    where c.id = p_checklist_id
      and v.empresa_id = (select public.npi_current_empresa_id())
  );
$$;

revoke all on function public.npi_vehicle_belongs_to_current_company(uuid) from public;
revoke all on function public.npi_checklist_belongs_to_current_company(uuid) from public;
grant execute on function public.npi_vehicle_belongs_to_current_company(uuid) to authenticated;
grant execute on function public.npi_checklist_belongs_to_current_company(uuid) to authenticated;

-- 6) UTILIZAÇÕES: histórico de leitura. Escrita somente pelos gatilhos do banco.
alter table public.utilizacoes enable row level security;
revoke all on public.utilizacoes from anon, authenticated;
grant select on public.utilizacoes to authenticated;

drop policy if exists utilizacoes_select_by_role on public.utilizacoes;
create policy utilizacoes_select_by_role
on public.utilizacoes for select to authenticated
using (
  (select public.npi_has_permission('utilizacoes', 'visualizar'))
  and (select public.npi_vehicle_belongs_to_current_company(veiculo_id))
);

-- 7) CHECKLISTS e RESPOSTAS: consulta para perfis autorizados; gravação permanece
-- exclusiva das RPCs de início/devolução do motorista.
alter table public.checklists enable row level security;
alter table public.checklist_respostas enable row level security;
revoke all on public.checklists, public.checklist_respostas from anon, authenticated;
grant select on public.checklists, public.checklist_respostas to authenticated;

drop policy if exists checklists_select_by_role on public.checklists;
create policy checklists_select_by_role
on public.checklists for select to authenticated
using (
  (select public.npi_has_permission('checklists', 'visualizar'))
  and (select public.npi_vehicle_belongs_to_current_company(veiculo_id))
);

drop policy if exists checklist_respostas_select_by_role on public.checklist_respostas;
create policy checklist_respostas_select_by_role
on public.checklist_respostas for select to authenticated
using (
  (select public.npi_has_permission('checklists', 'visualizar'))
  and (select public.npi_checklist_belongs_to_current_company(checklist_id))
);

-- 8) MODELOS DE CHECKLIST: CRUD protegido pelas permissões do perfil.
-- Motoristas podem apenas consultar modelos ativos para preencher o Meu Painel.
alter table public.modelos_checklist enable row level security;
revoke all on public.modelos_checklist from anon, authenticated;
grant select, insert, update, delete on public.modelos_checklist to authenticated;

drop policy if exists modelos_checklist_driver_read_active on public.modelos_checklist;
drop policy if exists modelos_checklist_select_by_permission on public.modelos_checklist;
drop policy if exists modelos_checklist_insert_by_permission on public.modelos_checklist;
drop policy if exists modelos_checklist_update_by_permission on public.modelos_checklist;
drop policy if exists modelos_checklist_delete_by_permission on public.modelos_checklist;

create policy modelos_checklist_select_by_permission
on public.modelos_checklist for select to authenticated
using (
  (select public.npi_has_permission('modelos', 'visualizar'))
  or ((select public.npi_current_is_driver()) and situacao = 'Ativo')
);
create policy modelos_checklist_insert_by_permission
on public.modelos_checklist for insert to authenticated
with check ((select public.npi_has_permission('modelos', 'incluir')));
create policy modelos_checklist_update_by_permission
on public.modelos_checklist for update to authenticated
using ((select public.npi_has_permission('modelos', 'alterar')))
with check ((select public.npi_has_permission('modelos', 'alterar')));
create policy modelos_checklist_delete_by_permission
on public.modelos_checklist for delete to authenticated
using ((select public.npi_has_permission('modelos', 'excluir')));

-- 9) ITENS DE CHECKLIST: CRUD protegido; motoristas só consultam itens ativos.
alter table public.itens_checklist enable row level security;
revoke all on public.itens_checklist from anon, authenticated;
grant select, insert, update, delete on public.itens_checklist to authenticated;

drop policy if exists itens_checklist_driver_read_active on public.itens_checklist;
drop policy if exists itens_checklist_select_by_permission on public.itens_checklist;
drop policy if exists itens_checklist_insert_by_permission on public.itens_checklist;
drop policy if exists itens_checklist_update_by_permission on public.itens_checklist;
drop policy if exists itens_checklist_delete_by_permission on public.itens_checklist;

create policy itens_checklist_select_by_permission
on public.itens_checklist for select to authenticated
using (
  (select public.npi_has_permission('itens', 'visualizar'))
  or (
    (select public.npi_current_is_driver())
    and situacao = 'Ativo'
    and exists (
      select 1 from public.modelos_checklist mc
      where mc.id = itens_checklist.modelo_checklist_id and mc.situacao = 'Ativo'
    )
  )
);
create policy itens_checklist_insert_by_permission
on public.itens_checklist for insert to authenticated
with check ((select public.npi_has_permission('itens', 'incluir')));
create policy itens_checklist_update_by_permission
on public.itens_checklist for update to authenticated
using ((select public.npi_has_permission('itens', 'alterar')))
with check ((select public.npi_has_permission('itens', 'alterar')));
create policy itens_checklist_delete_by_permission
on public.itens_checklist for delete to authenticated
using ((select public.npi_has_permission('itens', 'excluir')));

-- 10) Protege o histórico: um modelo não pode ser excluído enquanto tiver itens.
-- Os itens antigos também não podem ser apagados se já geraram respostas históricas.
alter table public.itens_checklist
  drop constraint if exists itens_checklist_modelo_checklist_id_fkey;
alter table public.itens_checklist
  add constraint itens_checklist_modelo_checklist_id_fkey
  foreign key (modelo_checklist_id) references public.modelos_checklist(id) on delete restrict;

alter table public.checklist_respostas
  drop constraint if exists checklist_respostas_item_checklist_id_fkey;
alter table public.checklist_respostas
  add constraint checklist_respostas_item_checklist_id_fkey
  foreign key (item_checklist_id) references public.itens_checklist(id) on delete restrict;

commit;

-- RESUMO:
-- * Utilizações são criadas/atualizadas automaticamente ao inserir uma retirada/devolução.
-- * Checklists e respostas ficam disponíveis em modo de consulta para perfis autorizados.
-- * Modelos e itens passam a ter cadastro, edição e desativação conforme permissões.
-- * Nenhum registro fictício é inserido e o histórico existente é preservado/backfillado.
