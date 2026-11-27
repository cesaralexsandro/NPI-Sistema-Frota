-- ============================================================================
-- NPI FROTA | MOTORISTA PODE ENCERRAR O PRÓPRIO VÍNCULO COM UM VEÍCULO
-- Pré-requisito: permissões/perfis e Painel do Motorista já instalados.
-- Execute uma vez em Supabase > SQL Editor. É seguro reexecutar.
--
-- Segurança e histórico:
-- * O motorista só encerra uma atribuição vinculada ao próprio cadastro.
-- * Não apaga o motorista, o veículo, a atribuição nem o histórico.
-- * Apenas define ativo=false e data_fim=current_date.
-- * Impede a desvinculação se o veículo tiver retirada em aberto ou estiver
--   com situação Em utilização. O motorista deve registrar a devolução antes.
-- ============================================================================

begin;

create or replace function public.npi_driver_unassign_vehicle(
  p_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motorista_id uuid;
  v_empresa_id uuid;
  v_assignment public.motorista_veiculos%rowtype;
  v_veiculo_situacao text;
begin
  if not (select public.npi_current_is_driver()) then
    raise exception using message = 'Somente usuários com perfil Motorista podem se desvincular pelo Meu Painel.';
  end if;

  v_motorista_id := (select public.npi_current_motorista_id());
  v_empresa_id := (select public.npi_current_empresa_id());

  if v_motorista_id is null or v_empresa_id is null then
    raise exception using message = 'Seu usuário não está vinculado a um motorista ativo.';
  end if;

  select mv.* into v_assignment
  from public.motorista_veiculos mv
  where mv.id = p_assignment_id
    and mv.motorista_id = v_motorista_id
    and mv.empresa_id = v_empresa_id
    and mv.ativo = true
    and mv.data_inicio <= current_date
    and (mv.data_fim is null or mv.data_fim >= current_date)
  for update;

  if not found then
    raise exception using message = 'Este vínculo não está ativo ou não pertence ao seu cadastro.';
  end if;

  -- Bloqueia e trava o veículo antes de conferir retiradas em aberto.
  -- Assim, uma retirada concorrente não pode começar durante a desvinculação.
  select v.situacao into v_veiculo_situacao
  from public.veiculos v
  where v.id = v_assignment.veiculo_id
    and v.empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception using message = 'O veículo deste vínculo não foi encontrado na sua empresa.';
  end if;

  if exists (
    select 1
    from public.retiradas r
    where r.veiculo_id = v_assignment.veiculo_id
      and r.situacao = 'Em aberto'
  ) then
    raise exception using message = 'Não é possível se desvincular enquanto houver uma retirada em aberto. Registre a devolução primeiro.';
  end if;

  if coalesce(v_veiculo_situacao, '') = 'Em utilização' then
    raise exception using message = 'O veículo consta como Em utilização. Solicite a conferência da operação antes de se desvincular.';
  end if;

  update public.motorista_veiculos
  set ativo = false,
      data_fim = current_date
  where id = v_assignment.id
    and motorista_id = v_motorista_id
    and empresa_id = v_empresa_id
    and ativo = true;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment.id,
    'veiculo_id', v_assignment.veiculo_id,
    'data_fim', current_date,
    'mensagem', 'Vínculo encerrado. O histórico foi preservado.'
  );
end;
$$;

revoke all on function public.npi_driver_unassign_vehicle(uuid) from public, anon;
grant execute on function public.npi_driver_unassign_vehicle(uuid) to authenticated;

commit;

-- Teste: entre como motorista e use o botão "Desvincular veículo" no Meu Painel.
