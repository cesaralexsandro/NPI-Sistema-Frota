-- ============================================================================
-- NPI FROTA | MÓDULO DE PNEUS E MOVIMENTAÇÕES
-- Pré-requisitos: Etapas 1, 2 e 3 do banco/perfis já executadas.
-- As tabelas public.pneus e public.movimentacoes_pneus já foram criadas na Etapa 2.
-- Este script complementa as colunas, aplica RLS e mantém o estado do pneu
-- sincronizado por meio do histórico de movimentações.
-- Idempotente: pode ser executado novamente sem apagar cadastros ou histórico.
-- ============================================================================

begin;

-- 1) CAMPOS ADICIONAIS DO CADASTRO DE PNEUS
alter table public.pneus
  add column if not exists empresa_id uuid references public.empresas(id) on delete restrict,
  add column if not exists veiculo_atual_id uuid references public.veiculos(id) on delete restrict,
  add column if not exists posicao_atual text,
  add column if not exists sulco_inicial_mm numeric(5,2),
  add column if not exists sulco_atual_mm numeric(5,2),
  add column if not exists pressao_recomendada_psi numeric(7,2),
  add column if not exists pressao_atual_psi numeric(7,2),
  add column if not exists vida_util_estimada_km numeric(14,1),
  add column if not exists recapagens integer not null default 0,
  add column if not exists localizacao_estoque text;

-- 2) COMPLEMENTOS DO HISTÓRICO DE MOVIMENTAÇÕES
alter table public.movimentacoes_pneus
  add column if not exists empresa_id uuid references public.empresas(id) on delete restrict,
  add column if not exists sulco_mm numeric(5,2),
  add column if not exists pressao_psi numeric(7,2),
  add column if not exists custo numeric(12,2) not null default 0,
  add column if not exists numero_recapagem integer,
  add column if not exists observacoes text;

-- O custo da movimentação registra valores de reparo, recapagem e outros serviços.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.movimentacoes_pneus'::regclass
      and conname = 'movimentacoes_pneus_custo_nonnegative'
  ) then
    alter table public.movimentacoes_pneus
      add constraint movimentacoes_pneus_custo_nonnegative check (custo >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.movimentacoes_pneus'::regclass
      and conname = 'movimentacoes_pneus_numero_recapagem_positive'
  ) then
    alter table public.movimentacoes_pneus
      add constraint movimentacoes_pneus_numero_recapagem_positive
      check (numero_recapagem is null or numero_recapagem >= 1);
  end if;
end;
$$;

-- Se o banco tiver apenas uma empresa cadastrada, vincula automaticamente
-- eventuais pneus antigos sem empresa. Em ambiente multiempresa, faça a
-- vinculação manual dos registros antigos antes de liberá-los no sistema.
do $$
declare
  v_company_count integer;
  v_only_company_id uuid;
begin
  select count(*) into v_company_count from public.empresas;
  if v_company_count = 1 then
    select id into v_only_company_id from public.empresas limit 1;
    update public.pneus set empresa_id = v_only_company_id where empresa_id is null;
    update public.movimentacoes_pneus set empresa_id = v_only_company_id where empresa_id is null;
  end if;
end;
$$;

-- Ajusta o padrão dos pneus novos e normaliza o rótulo inicial da Etapa 2.
alter table public.pneus alter column situacao set default 'Em estoque';
update public.pneus set situacao = 'Em estoque' where situacao = 'Ativo';
update public.pneus set recapagens = 0 where recapagens is null;

-- 3) ÍNDICES
create index if not exists pneus_empresa_situacao_idx
  on public.pneus (empresa_id, situacao);
create index if not exists pneus_veiculo_atual_idx
  on public.pneus (veiculo_atual_id) where veiculo_atual_id is not null;
create unique index if not exists pneus_posicao_veiculo_unica_idx
  on public.pneus (empresa_id, veiculo_atual_id, posicao_atual)
  where situacao = 'Instalado' and veiculo_atual_id is not null and posicao_atual is not null;
create index if not exists movimentacoes_pneus_empresa_data_idx
  on public.movimentacoes_pneus (empresa_id, data_movimentacao desc);
create index if not exists movimentacoes_pneus_veiculo_data_idx
  on public.movimentacoes_pneus (veiculo_id, data_movimentacao desc);

-- 4) VÍNCULO AUTOMÁTICO À EMPRESA DO USUÁRIO AUTENTICADO
create or replace function public.npi_set_tire_company_id()
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
    raise exception 'Não foi possível identificar a empresa do usuário autenticado.'
      using errcode = '42501';
  end if;
  if new.empresa_id is null then
    new.empresa_id := v_empresa_id;
  elsif new.empresa_id is distinct from v_empresa_id then
    raise exception 'Não é permitido cadastrar ou alterar pneus de outra empresa.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists pneus_set_empresa on public.pneus;
create trigger pneus_set_empresa
before insert or update on public.pneus
for each row execute function public.npi_set_tire_company_id();

drop trigger if exists movimentacoes_pneus_set_empresa on public.movimentacoes_pneus;
create trigger movimentacoes_pneus_set_empresa
before insert or update on public.movimentacoes_pneus
for each row execute function public.npi_set_tire_company_id();

-- 5) APLICAR O EFEITO OPERACIONAL DE CADA MOVIMENTAÇÃO
-- O histórico é somente de inclusão. Para corrigir um lançamento, registre
-- uma movimentação compensatória em vez de editar/apagar o histórico anterior.
create or replace function public.npi_apply_tire_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pneu public.pneus%rowtype;
  v_veiculo_empresa uuid;
  v_target_vehicle_id uuid;
begin
  select p.* into v_pneu
  from public.pneus p
  where p.id = new.pneu_id
  for update;

  if not found then
    raise exception 'Pneu não encontrado.' using errcode = '23503';
  end if;

  if v_pneu.empresa_id is distinct from new.empresa_id then
    raise exception 'O pneu e a movimentação precisam pertencer à mesma empresa.'
      using errcode = '23514';
  end if;

  v_target_vehicle_id := coalesce(new.veiculo_id, v_pneu.veiculo_atual_id);
  if v_target_vehicle_id is not null then
    select v.empresa_id into v_veiculo_empresa
    from public.veiculos v
    where v.id = v_target_vehicle_id;
    if not found then
      raise exception 'Veículo informado não encontrado.' using errcode = '23503';
    end if;
    if v_veiculo_empresa is distinct from new.empresa_id then
      raise exception 'O pneu e o veículo precisam pertencer à mesma empresa.'
        using errcode = '23514';
    end if;
  end if;

  if new.quilometragem is not null and new.quilometragem < 0 then
    raise exception 'A quilometragem não pode ser negativa.' using errcode = '23514';
  end if;
  if new.sulco_mm is not null and new.sulco_mm < 0 then
    raise exception 'A profundidade do sulco não pode ser negativa.' using errcode = '23514';
  end if;
  if new.pressao_psi is not null and new.pressao_psi < 0 then
    raise exception 'A pressão aferida não pode ser negativa.' using errcode = '23514';
  end if;

  -- O número da recapagem é sequencial e calculado a partir das recapagens concluídas.
  if btrim(new.tipo_movimentacao) in ('Envio para recapagem', 'Retorno de recapagem') then
    if new.numero_recapagem is null then
      raise exception 'Informe o número da recapagem.' using errcode = '23514';
    end if;
    if new.numero_recapagem <> coalesce(v_pneu.recapagens, 0) + 1 then
      raise exception 'O número esperado para esta recapagem é %.', coalesce(v_pneu.recapagens, 0) + 1
        using errcode = '23514';
    end if;
  elsif new.numero_recapagem is not null then
    raise exception 'O número da recapagem só pode ser informado em movimentações de recapagem.' using errcode = '23514';
  end if;

  if v_pneu.veiculo_atual_id is not null
     and new.veiculo_id is not null
     and new.veiculo_id is distinct from v_pneu.veiculo_atual_id
     and btrim(new.tipo_movimentacao) <> 'Instalação' then
    raise exception 'A movimentação deve apontar para o veículo em que o pneu está instalado. Faça a remoção antes de instalar em outro veículo.'
      using errcode = '23514';
  end if;

  case btrim(new.tipo_movimentacao)
    when 'Instalação' then
      if new.veiculo_id is null or nullif(btrim(new.posicao_instalacao), '') is null then
        raise exception 'Para instalar um pneu, informe o veículo e a posição.' using errcode = '23514';
      end if;
      if new.quilometragem is null then
        raise exception 'Informe a quilometragem do veículo na instalação.' using errcode = '23514';
      end if;
      if v_pneu.situacao in ('Instalado', 'Descartado', 'Inativo', 'Em reparo', 'Em recapagem') then
        raise exception 'Este pneu não pode ser instalado enquanto estiver com situação %.', v_pneu.situacao
          using errcode = '23514';
      end if;
      if exists (
        select 1 from public.pneus p
        where p.empresa_id = new.empresa_id
          and p.veiculo_atual_id = new.veiculo_id
          and p.posicao_atual = btrim(new.posicao_instalacao)
          and p.situacao = 'Instalado'
          and p.id <> new.pneu_id
      ) then
        raise exception 'Já existe outro pneu instalado nesta posição do veículo.' using errcode = '23505';
      end if;
      update public.pneus
      set situacao = 'Instalado',
          veiculo_atual_id = new.veiculo_id,
          posicao_atual = btrim(new.posicao_instalacao),
          quilometragem_inicial = coalesce(quilometragem_inicial, new.quilometragem),
          sulco_atual_mm = coalesce(new.sulco_mm, sulco_atual_mm, sulco_inicial_mm),
          pressao_atual_psi = coalesce(new.pressao_psi, pressao_atual_psi),
          localizacao_estoque = null
      where id = new.pneu_id;

    when 'Rodízio' then
      if v_pneu.situacao <> 'Instalado' or v_pneu.veiculo_atual_id is null then
        raise exception 'Só é possível fazer rodízio de um pneu que esteja instalado.' using errcode = '23514';
      end if;
      if new.veiculo_id is null or nullif(btrim(new.posicao_instalacao), '') is null then
        raise exception 'Para registrar o rodízio, informe o veículo e a nova posição.' using errcode = '23514';
      end if;
      if new.quilometragem is null then
        raise exception 'Informe a quilometragem do veículo no rodízio.' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.pneus p
        where p.empresa_id = new.empresa_id
          and p.veiculo_atual_id = new.veiculo_id
          and p.posicao_atual = btrim(new.posicao_instalacao)
          and p.situacao = 'Instalado'
          and p.id <> new.pneu_id
      ) then
        raise exception 'Já existe outro pneu instalado nesta posição do veículo.' using errcode = '23505';
      end if;
      update public.pneus
      set veiculo_atual_id = new.veiculo_id,
          posicao_atual = btrim(new.posicao_instalacao),
          sulco_atual_mm = coalesce(new.sulco_mm, sulco_atual_mm),
          pressao_atual_psi = coalesce(new.pressao_psi, pressao_atual_psi)
      where id = new.pneu_id;

    when 'Remoção' then
      if v_pneu.situacao <> 'Instalado' then
        raise exception 'Só é possível remover um pneu que esteja instalado.' using errcode = '23514';
      end if;
      if new.quilometragem is null then
        raise exception 'Informe a quilometragem do veículo na remoção.' using errcode = '23514';
      end if;
      update public.pneus
      set situacao = 'Em estoque', veiculo_atual_id = null, posicao_atual = null,
          sulco_atual_mm = coalesce(new.sulco_mm, sulco_atual_mm),
          pressao_atual_psi = coalesce(new.pressao_psi, pressao_atual_psi)
      where id = new.pneu_id;

    when 'Envio para reparo' then
      if v_pneu.situacao in ('Descartado', 'Inativo', 'Em reparo', 'Em recapagem') then
        raise exception 'Pneu descartado, inativo ou já em serviço não pode ser enviado para reparo.' using errcode = '23514';
      end if;
      update public.pneus
      set situacao = 'Em reparo', veiculo_atual_id = null, posicao_atual = null,
          sulco_atual_mm = coalesce(new.sulco_mm, sulco_atual_mm),
          pressao_atual_psi = coalesce(new.pressao_psi, pressao_atual_psi)
      where id = new.pneu_id;

    when 'Retorno de reparo' then
      if v_pneu.situacao <> 'Em reparo' then
        raise exception 'O pneu não está registrado como Em reparo.' using errcode = '23514';
      end if;
      update public.pneus
      set situacao = 'Em estoque',
          sulco_atual_mm = coalesce(new.sulco_mm, sulco_atual_mm),
          pressao_atual_psi = coalesce(new.pressao_psi, pressao_atual_psi)
      where id = new.pneu_id;

    when 'Envio para recapagem' then
      if v_pneu.situacao in ('Descartado', 'Inativo', 'Em recapagem', 'Em reparo') then
        raise exception 'Este pneu não pode ser enviado para recapagem na situação atual.' using errcode = '23514';
      end if;
      update public.pneus
      set situacao = 'Em recapagem', veiculo_atual_id = null, posicao_atual = null,
          sulco_atual_mm = coalesce(new.sulco_mm, sulco_atual_mm),
          pressao_atual_psi = coalesce(new.pressao_psi, pressao_atual_psi)
      where id = new.pneu_id;

    when 'Retorno de recapagem' then
      if v_pneu.situacao <> 'Em recapagem' then
        raise exception 'O pneu não está registrado como Em recapagem.' using errcode = '23514';
      end if;
      update public.pneus
      set situacao = 'Em estoque', recapagens = new.numero_recapagem,
          sulco_atual_mm = coalesce(new.sulco_mm, sulco_atual_mm),
          pressao_atual_psi = coalesce(new.pressao_psi, pressao_atual_psi)
      where id = new.pneu_id;

    when 'Inspeção' then
      if v_pneu.situacao in ('Descartado', 'Inativo', 'Em reparo', 'Em recapagem') then
        raise exception 'Não é possível inspecionar um pneu descartado ou que esteja em reparo/recapagem.' using errcode = '23514';
      end if;
      update public.pneus
      set sulco_atual_mm = coalesce(new.sulco_mm, sulco_atual_mm),
          pressao_atual_psi = coalesce(new.pressao_psi, pressao_atual_psi)
      where id = new.pneu_id;

    when 'Descarte' then
      update public.pneus
      set situacao = 'Descartado', veiculo_atual_id = null, posicao_atual = null,
          localizacao_estoque = null
      where id = new.pneu_id;

    else
      raise exception 'Tipo de movimentação de pneu não reconhecido: %.', new.tipo_movimentacao
        using errcode = '23514';
  end case;

  return new;
end;
$$;

drop trigger if exists movimentacoes_pneus_apply_state on public.movimentacoes_pneus;
create trigger movimentacoes_pneus_apply_state
after insert on public.movimentacoes_pneus
for each row execute function public.npi_apply_tire_movement();

-- 5) RLS E PERMISSÕES DO BANCO
alter table public.pneus enable row level security;
alter table public.movimentacoes_pneus enable row level security;

grant select, insert, update, delete on public.pneus to authenticated;
revoke all on public.pneus from anon;
grant select, insert on public.movimentacoes_pneus to authenticated;
revoke all on public.movimentacoes_pneus from anon;
revoke update, delete on public.movimentacoes_pneus from authenticated;

drop policy if exists pneus_select_role on public.pneus;
create policy pneus_select_role on public.pneus
for select to authenticated
using (
  empresa_id = (select public.npi_current_empresa_id())
  and (select public.npi_has_permission('pneus', 'visualizar'))
);

drop policy if exists pneus_insert_role on public.pneus;
create policy pneus_insert_role on public.pneus
for insert to authenticated
with check (
  empresa_id = (select public.npi_current_empresa_id())
  and (select public.npi_has_permission('pneus', 'incluir'))
);

drop policy if exists pneus_update_role on public.pneus;
create policy pneus_update_role on public.pneus
for update to authenticated
using (
  empresa_id = (select public.npi_current_empresa_id())
  and (select public.npi_has_permission('pneus', 'alterar'))
)
with check (
  empresa_id = (select public.npi_current_empresa_id())
  and (select public.npi_has_permission('pneus', 'alterar'))
);

drop policy if exists pneus_delete_role on public.pneus;
create policy pneus_delete_role on public.pneus
for delete to authenticated
using (
  empresa_id = (select public.npi_current_empresa_id())
  and (select public.npi_has_permission('pneus', 'excluir'))
);

drop policy if exists movimentacoes_pneus_select_role on public.movimentacoes_pneus;
create policy movimentacoes_pneus_select_role on public.movimentacoes_pneus
for select to authenticated
using (
  empresa_id = (select public.npi_current_empresa_id())
  and (select public.npi_has_permission('movpneus', 'visualizar'))
);

drop policy if exists movimentacoes_pneus_insert_role on public.movimentacoes_pneus;
create policy movimentacoes_pneus_insert_role on public.movimentacoes_pneus
for insert to authenticated
with check (
  empresa_id = (select public.npi_current_empresa_id())
  and (select public.npi_has_permission('movpneus', 'incluir'))
  and exists (
    select 1 from public.pneus p
    where p.id = movimentacoes_pneus.pneu_id
      and p.empresa_id = (select public.npi_current_empresa_id())
  )
  and (
    movimentacoes_pneus.veiculo_id is null
    or exists (
      select 1 from public.veiculos v
      where v.id = movimentacoes_pneus.veiculo_id
        and v.empresa_id = (select public.npi_current_empresa_id())
    )
  )
);

-- 6) PERMISSÕES INICIAIS PARA OS PERFIS OPERACIONAIS.
-- Não sobrescreve escolhas personalizadas que já existam na matriz.
insert into public.permissoes
  (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, d.modulo, d.visualizar, d.incluir, d.alterar, d.excluir, d.aprovar, d.exportar
from public.perfis p
cross join (values
  ('pneus', true, true, true, false, false, true),
  ('movpneus', true, true, false, false, false, true)
) as d(modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
where p.nome = 'Gestor de Frota'
on conflict (perfil_id, modulo) do nothing;

insert into public.permissoes
  (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, d.modulo, d.visualizar, d.incluir, d.alterar, d.excluir, d.aprovar, d.exportar
from public.perfis p
cross join (values
  ('pneus', true, true, true, false, false, true),
  ('movpneus', true, true, false, false, false, true)
) as d(modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
where p.nome = 'Manutenção'
on conflict (perfil_id, modulo) do nothing;

-- O perfil Supervisor pode consultar e exportar o módulo, sem movimentar pneus.
insert into public.permissoes
  (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, d.modulo, d.visualizar, d.incluir, d.alterar, d.excluir, d.aprovar, d.exportar
from public.perfis p
cross join (values
  ('pneus', true, false, false, false, false, true),
  ('movpneus', true, false, false, false, false, true)
) as d(modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
where p.nome = 'Supervisor'
on conflict (perfil_id, modulo) do nothing;

-- O histórico é imutável para todos os perfis: somente consulta e inclusão.
update public.permissoes
set alterar = false, excluir = false
where modulo = 'movpneus';

-- 7) TRIGGERS DE ATUALIZAÇÃO DE updated_at (se a função da Etapa 1 estiver disponível).
drop trigger if exists pneus_updated_at on public.pneus;
create trigger pneus_updated_at before update on public.pneus
for each row execute function public.npi_set_updated_at();
drop trigger if exists movimentacoes_pneus_updated_at on public.movimentacoes_pneus;
create trigger movimentacoes_pneus_updated_at before update on public.movimentacoes_pneus
for each row execute function public.npi_set_updated_at();

-- 8) PROTEGER AS FUNÇÕES AUXILIARES.
revoke all on function public.npi_set_tire_company_id() from public;
revoke all on function public.npi_apply_tire_movement() from public;

commit;

-- FIM. Nenhum pneu ou movimento fictício é inserido por este script.
