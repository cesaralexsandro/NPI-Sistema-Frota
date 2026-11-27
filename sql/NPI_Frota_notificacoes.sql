-- ============================================================================
-- NPI FROTA | CENTRAL DE NOTIFICAÇÕES
-- Execute uma vez em Supabase > SQL Editor.
-- Reexecutável: cria a tabela/índices/políticas/funções se ainda não existirem.
-- Cada usuário recebe uma linha própria; senhas e tokens não são armazenados.
-- ============================================================================

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  titulo varchar(120) not null,
  mensagem text not null,
  tipo varchar(16) not null default 'info',
  categoria varchar(24) not null default 'sistema',
  destino varchar(50),
  enviada_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  lida_em timestamptz,
  arquivada boolean not null default false,
  constraint notificacoes_tipo_check check (tipo in ('info','success','warning','danger')),
  constraint notificacoes_categoria_check check (categoria in ('atualizacao','recurso','sistema','operacional','manutencao'))
);

create index if not exists notificacoes_usuario_data_idx
  on public.notificacoes(usuario_id, created_at desc) where arquivada = false;
create index if not exists notificacoes_grupo_idx
  on public.notificacoes(grupo_id, created_at desc);
create index if not exists notificacoes_empresa_remetente_idx
  on public.notificacoes(empresa_id, enviada_por, created_at desc);

-- Mantém o módulo visível na matriz; o envio continua reservado ao Administrador.
insert into public.permissoes
  (perfil_id, modulo, visualizar, incluir, alterar, excluir, aprovar, exportar)
select p.id, 'notificacoes', true, true, false, false, false, false
from public.perfis p
where p.nome = 'Administrador' and p.situacao = 'Ativo'
on conflict (perfil_id, modulo) do nothing;

alter table public.notificacoes enable row level security;
revoke all on table public.notificacoes from anon, authenticated;
grant select on table public.notificacoes to authenticated;

drop policy if exists notificacoes_select_propria_ou_admin on public.notificacoes;
create policy notificacoes_select_propria_ou_admin
on public.notificacoes for select to authenticated
using (
  usuario_id = (select auth.uid())
  or (
    empresa_id = (select public.npi_current_empresa_id())
    and (select public.npi_is_admin())
  )
);

-- Envio em lote: somente Administrador pode publicar avisos para usuários da própria empresa.
create or replace function public.npi_enviar_notificacao(
  p_titulo text,
  p_mensagem text,
  p_tipo text default 'info',
  p_categoria text default 'sistema',
  p_destino text default null,
  p_publico_alvo text default 'empresa',
  p_perfis text[] default null,
  p_usuarios uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_empresa_id uuid;
  v_grupo_id uuid := gen_random_uuid();
  v_count integer := 0;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_mensagem text := btrim(coalesce(p_mensagem, ''));
begin
  if v_user_id is null then raise exception 'Faça login para enviar uma notificação.'; end if;
  if not public.npi_is_admin() then raise exception 'Somente Administradores podem enviar comunicados.'; end if;

  select u.empresa_id into v_empresa_id
  from public.usuarios u
  where u.id = v_user_id and u.situacao = 'Ativo';
  if v_empresa_id is null then raise exception 'A empresa do usuário não foi encontrada ou está inativa.'; end if;

  if length(v_titulo) < 3 or length(v_titulo) > 120 then
    raise exception 'O título deve ter entre 3 e 120 caracteres.';
  end if;
  if length(v_mensagem) < 1 or length(v_mensagem) > 3000 then
    raise exception 'A mensagem deve ter entre 1 e 3.000 caracteres.';
  end if;
  if coalesce(p_tipo, 'info') not in ('info','success','warning','danger') then raise exception 'Tipo de notificação inválido.'; end if;
  if coalesce(p_categoria, 'sistema') not in ('atualizacao','recurso','sistema','operacional','manutencao') then raise exception 'Categoria de notificação inválida.'; end if;
  if coalesce(p_publico_alvo, 'empresa') not in ('empresa','perfis','usuarios') then raise exception 'Público destinatário inválido.'; end if;
  if p_publico_alvo = 'perfis' and coalesce(cardinality(p_perfis), 0) = 0 then raise exception 'Selecione pelo menos um perfil.'; end if;
  if p_publico_alvo = 'usuarios' and coalesce(cardinality(p_usuarios), 0) = 0 then raise exception 'Selecione pelo menos um usuário.'; end if;

  if p_destino is not null and p_destino <> all(array[
    'dashboard','painel_motorista','empresas','filiais','centros','projetos','veiculos','motoristas',
    'fornecedores','oficinas','postos','reservas','retiradas','devolucoes','utilizacoes','checklists',
    'modelos','itens','abastecimentos','manutencoes','pneus','movpneus','localizacao_pneus',
    'multas','documentos','seguros','sinistros','despesas','rateios','relatorios','usuarios','perfis',
    'atribuicoes_motoristas','auditoria'
  ]::text[]) then
    raise exception 'A área de destino informada não é válida.';
  end if;

  insert into public.notificacoes (
    grupo_id, empresa_id, usuario_id, titulo, mensagem, tipo, categoria, destino, enviada_por
  )
  select
    v_grupo_id, v_empresa_id, u.id, v_titulo, v_mensagem,
    coalesce(p_tipo, 'info'), coalesce(p_categoria, 'sistema'), p_destino, v_user_id
  from public.usuarios u
  where u.empresa_id = v_empresa_id
    and u.situacao = 'Ativo'
    and case coalesce(p_publico_alvo, 'empresa')
      when 'empresa' then true
      when 'perfis' then exists (
        select 1
        from public.perfis_usuarios pu
        join public.perfis p on p.id = pu.perfil_id and p.situacao = 'Ativo'
        where pu.usuario_id = u.id
          and pu.empresa_id = v_empresa_id
          and pu.situacao = 'Ativo'
          and p.nome = any(coalesce(p_perfis, array[]::text[]))
      )
      when 'usuarios' then u.id = any(coalesce(p_usuarios, array[]::uuid[]))
      else false
    end;

  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Nenhum usuário ativo foi encontrado para os destinatários selecionados.'; end if;
  return v_count;
end;
$$;

create or replace function public.npi_marcar_notificacao_lida(p_notificacao_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Faça login para atualizar notificações.'; end if;
  update public.notificacoes
     set lida_em = coalesce(lida_em, now())
   where id = p_notificacao_id and usuario_id = auth.uid();
end;
$$;

create or replace function public.npi_marcar_todas_notificacoes_lidas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Faça login para atualizar notificações.'; end if;
  update public.notificacoes
     set lida_em = now()
   where usuario_id = auth.uid() and lida_em is null and arquivada = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.npi_arquivar_notificacao(p_notificacao_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Faça login para arquivar notificações.'; end if;
  update public.notificacoes
     set arquivada = true
   where id = p_notificacao_id and usuario_id = auth.uid();
end;
$$;

revoke all on function public.npi_enviar_notificacao(text,text,text,text,text,text,text[],uuid[]) from public, anon;
revoke all on function public.npi_marcar_notificacao_lida(uuid) from public, anon;
revoke all on function public.npi_marcar_todas_notificacoes_lidas() from public, anon;
revoke all on function public.npi_arquivar_notificacao(uuid) from public, anon;
grant execute on function public.npi_enviar_notificacao(text,text,text,text,text,text,text[],uuid[]) to authenticated;
grant execute on function public.npi_marcar_notificacao_lida(uuid) to authenticated;
grant execute on function public.npi_marcar_todas_notificacoes_lidas() to authenticated;
grant execute on function public.npi_arquivar_notificacao(uuid) to authenticated;

-- Habilita eventos em tempo real no sino, sem falhar se a tabela já estiver publicada.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes'
     ) then
    execute 'alter publication supabase_realtime add table public.notificacoes';
  end if;
end;
$$;

comment on table public.notificacoes is 'Central de avisos individuais do NPI FROTA, incluindo atualizações e comunicados.';
