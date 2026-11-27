-- NPI FROTA | Adiciona o campo de custo às movimentações de pneus.
-- Seguro para executar mais de uma vez; não altera nem apaga registros existentes.

begin;

alter table public.movimentacoes_pneus
  add column if not exists custo numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.movimentacoes_pneus'::regclass
      and conname = 'movimentacoes_pneus_custo_nonnegative'
  ) then
    alter table public.movimentacoes_pneus
      add constraint movimentacoes_pneus_custo_nonnegative check (custo >= 0);
  end if;
end;
$$;

commit;
