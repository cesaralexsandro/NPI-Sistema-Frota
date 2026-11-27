-- NPI FROTA | Reservas: RLS, aprovação auditável e prevenção de conflito de agenda
-- Execute no Supabase SQL Editor. Não remove nem recria a tabela nem seus registros.

do $$
begin
  if to_regclass('public.reservas') is null then
    raise exception 'A tabela public.reservas não existe.';
  end if;
  if to_regprocedure('public.npi_is_admin()') is null
     or to_regprocedure('public.npi_has_permission(text,text)') is null then
    raise exception 'Execute primeiro o SQL de perfis e permissões do NPI FROTA.';
  end if;
end $$;

grant select, insert, update, delete on public.reservas to authenticated;
alter table public.reservas enable row level security;

drop policy if exists reservas_select_role on public.reservas;
drop policy if exists reservas_insert_role on public.reservas;
drop policy if exists reservas_update_role on public.reservas;
drop policy if exists reservas_delete_role on public.reservas;

create policy reservas_select_role on public.reservas for select to authenticated
using ((select public.npi_is_admin()) or (select public.npi_has_permission('reservas','visualizar')));
create policy reservas_insert_role on public.reservas for insert to authenticated
with check ((select public.npi_is_admin()) or (select public.npi_has_permission('reservas','incluir')));
create policy reservas_update_role on public.reservas for update to authenticated
using ((select public.npi_is_admin()) or (select public.npi_has_permission('reservas','alterar')))
with check ((select public.npi_is_admin()) or (select public.npi_has_permission('reservas','alterar')));
create policy reservas_delete_role on public.reservas for delete to authenticated
using ((select public.npi_is_admin()) or (select public.npi_has_permission('reservas','excluir')));

create or replace function public.npi_decide_reservation(p_reservation_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva public.reservas%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if p_decision not in ('Aprovada','Recusada') then raise exception 'Decisão inválida.'; end if;
  if not (select public.npi_is_admin())
     and not (select public.npi_has_permission('reservas','aprovar')) then
    raise exception 'Seu perfil não possui permissão para aprovar reservas.';
  end if;

  select * into v_reserva from public.reservas where id=p_reservation_id for update;
  if not found then raise exception 'Reserva não encontrada.'; end if;
  if v_reserva.situacao <> 'Pendente' then raise exception 'A reserva não está mais pendente.'; end if;
  if v_reserva.data_hora_devolucao_prevista <= v_reserva.data_hora_retirada then
    raise exception 'A devolução prevista precisa ser posterior à retirada.';
  end if;

  if p_decision = 'Aprovada' and v_reserva.veiculo_id is not null and exists (
    select 1 from public.reservas r
    where r.id <> v_reserva.id
      and r.veiculo_id = v_reserva.veiculo_id
      and r.situacao = 'Aprovada'
      and r.data_hora_retirada < v_reserva.data_hora_devolucao_prevista
      and r.data_hora_devolucao_prevista > v_reserva.data_hora_retirada
  ) then
    raise exception 'Este veículo já possui uma reserva aprovada nesse período.';
  end if;

  perform set_config('npi.reservation_decision', 'on', true);
  update public.reservas
     set situacao = p_decision,
         aprovado_por = auth.uid(),
         aprovado_em = now()
   where id = p_reservation_id;
end;
$$;
revoke all on function public.npi_decide_reservation(uuid,text) from public, anon;
grant execute on function public.npi_decide_reservation(uuid,text) to authenticated;

-- Impede que o status seja alterado diretamente pelo formulário/API.
create or replace function public.npi_guard_reservation_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.situacao is distinct from 'Pendente' then
      raise exception 'Novas reservas devem iniciar como Pendente.';
    end if;
  elsif new.situacao is distinct from old.situacao then
    if current_setting('npi.reservation_decision', true) is distinct from 'on' then
      raise exception 'A situação da reserva só pode ser alterada pelo fluxo de aprovação.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists reservas_guard_status on public.reservas;
create trigger reservas_guard_status before insert or update of situacao on public.reservas
for each row execute function public.npi_guard_reservation_status();
