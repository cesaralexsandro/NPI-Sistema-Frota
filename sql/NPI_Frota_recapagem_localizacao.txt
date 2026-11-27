-- NPI FROTA | Número sequencial de recapagem e localização dos pneus.
-- Execute depois das migrações anteriores do módulo de pneus.
-- Seguro para executar novamente: não apaga cadastros nem histórico.

begin;

alter table public.movimentacoes_pneus
  add column if not exists numero_recapagem integer;

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

commit;
