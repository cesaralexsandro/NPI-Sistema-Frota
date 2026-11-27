/* NPI FROTA | Central de notificações e comunicados administrativos.
   Notificações são gravadas por destinatário no Supabase; o sino atualiza em tempo real. */

let myNotifications = [];
let notificationChannel = null;
let notificationLoadError = '';
let notificationPopoverOpen = false;
let notificationRefreshTimer = null;

const NOTIFICATION_TYPE_META = {
  info: { label: 'Informação', icon: 'info', tone: 'info' },
  success: { label: 'Sucesso', icon: 'check-circle-2', tone: 'success' },
  warning: { label: 'Atenção', icon: 'triangle-alert', tone: 'warning' },
  danger: { label: 'Urgente', icon: 'alert-circle', tone: 'danger' }
};

const NOTIFICATION_CATEGORIES = [
  ['atualizacao', 'Atualização do sistema'],
  ['recurso', 'Novo recurso'],
  ['sistema', 'Aviso do sistema'],
  ['operacional', 'Aviso operacional'],
  ['manutencao', 'Manutenção programada']
];

function notificationDate(value) {
  if (!value) return 'Agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function notificationMeta(type) {
  return NOTIFICATION_TYPE_META[type] || NOTIFICATION_TYPE_META.info;
}

function updateNotificationBellBadge() {
  const badge = $('#bellBadge');
  if (!badge) return;
  const unread = myNotifications.filter(item => !item.lida_em && !item.arquivada).length;
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.hidden = unread === 0;
  badge.setAttribute('aria-label', `${unread} notificações não lidas`);
  $('#bellBtn')?.setAttribute('aria-label', unread ? `Notificações, ${unread} não lidas` : 'Notificações');
}

function renderNotificationPopover() {
  const panel = $('#notificationPopover');
  if (!panel) return;
  const unread = myNotifications.filter(item => !item.lida_em && !item.arquivada).length;
  let content = '';
  if (notificationLoadError) {
    content = `<div class="notification-empty"><i data-lucide="cloud-off"></i><b>Notificações indisponíveis</b><span>${esc(notificationLoadError)}</span><small>Confira se a migração de notificações foi executada no Supabase.</small></div>`;
  } else if (!myNotifications.length) {
    content = '<div class="notification-empty"><i data-lucide="bell-ring"></i><b>Nenhuma notificação</b><span>Quando houver avisos, atualizações ou novos recursos, eles aparecerão aqui.</span></div>';
  } else {
    content = `<div class="notification-list">${myNotifications.map(item => {
      const meta = notificationMeta(item.tipo);
      return `<article class="notification-item ${item.lida_em ? 'is-read' : 'is-unread'}" data-notification-item="${item.id}">
        <span class="notification-item-icon ${meta.tone}"><i data-lucide="${meta.icon}"></i></span>
        <button type="button" class="notification-item-main" data-notification-open="${item.id}" aria-label="Abrir notificação ${esc(item.titulo)}">
          <span class="notification-item-top"><strong>${esc(item.titulo)}</strong>${item.lida_em ? '' : '<i class="notification-unread-dot"></i>'}</span>
          <span class="notification-item-message">${esc(item.mensagem)}</span>
          <span class="notification-item-meta">${esc(NOTIFICATION_CATEGORIES.find(([key]) => key === item.categoria)?.[1] || 'Aviso')} · ${esc(notificationDate(item.created_at))}</span>
        </button>
        <button type="button" class="notification-archive" data-notification-archive="${item.id}" title="Arquivar aviso" aria-label="Arquivar aviso"><i data-lucide="x"></i></button>
      </article>`;
    }).join('')}</div>`;
  }
  panel.innerHTML = `<div class="notification-popover-head"><div><b>Notificações</b><small>${unread ? `${unread} não lida(s)` : 'Tudo em dia'}</small></div><div class="notification-head-actions">${unread ? '<button type="button" class="notification-text-action" id="markAllNotificationsRead">Marcar todas como lidas</button>' : ''}<button type="button" class="notification-close" id="closeNotificationPopover" aria-label="Fechar notificações"><i data-lucide="x"></i></button></div></div>${content}<div class="notification-popover-foot"><span>NPI FROTA · Central de avisos</span></div>`;
  $('#closeNotificationPopover').onclick = closeNotificationPopover;
  $('#markAllNotificationsRead')?.addEventListener('click', markAllNotificationsRead);
  panel.querySelectorAll('[data-notification-open]').forEach(button => button.addEventListener('click', () => openNotification(button.dataset.notificationOpen)));
  panel.querySelectorAll('[data-notification-archive]').forEach(button => button.addEventListener('click', () => archiveNotification(button.dataset.notificationArchive)));
  refreshIcons();
}

async function refreshMyNotifications() {
  if (!currentUser || !window.npiSupabase) return;
  try {
    const { data, error } = await window.npiSupabase.from('notificacoes')
      .select('id,grupo_id,titulo,mensagem,tipo,categoria,destino,created_at,lida_em,arquivada')
      .eq('usuario_id', currentUser.id).eq('arquivada', false)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    myNotifications = data || [];
    notificationLoadError = '';
  } catch (error) {
    notificationLoadError = error.message || 'Não foi possível consultar a central.';
    console.warn('NPI FROTA: não foi possível carregar notificações.', error);
  }
  updateNotificationBellBadge();
  if (notificationPopoverOpen) renderNotificationPopover();
}

function scheduleNotificationRefresh(delay = 250) {
  clearTimeout(notificationRefreshTimer);
  notificationRefreshTimer = setTimeout(() => { void refreshMyNotifications(); }, delay);
}

async function initializeNotificationCenter() {
  myNotifications = [];
  notificationLoadError = '';
  await refreshMyNotifications();
  startNotificationRealtime();
}

function startNotificationRealtime() {
  stopNotificationRealtime();
  if (!currentUser || !window.npiSupabase) return;
  notificationChannel = window.npiSupabase.channel(`npi-notificacoes-${currentUser.id}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${currentUser.id}`
    }, payload => {
      const notice = payload.new;
      if (notice && notice.id && !myNotifications.some(item => item.id === notice.id)) {
        myNotifications.unshift(notice);
        myNotifications = myNotifications.slice(0, 50);
        updateNotificationBellBadge();
        if (notificationPopoverOpen) renderNotificationPopover();
      }
      if (notice && notice.titulo) toast(`Nova notificação: ${notice.titulo}`);
      scheduleNotificationRefresh();
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${currentUser.id}`
    }, () => scheduleNotificationRefresh())
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('NPI FROTA: canal em tempo real de notificações indisponível:', status);
      }
    });
}

function stopNotificationRealtime() {
  if (notificationChannel && window.npiSupabase) {
    window.npiSupabase.removeChannel(notificationChannel);
  }
  notificationChannel = null;
}

async function toggleNotificationPopover() {
  const panel = $('#notificationPopover');
  if (!panel || !currentUser) return;
  notificationPopoverOpen = !notificationPopoverOpen;
  panel.hidden = !notificationPopoverOpen;
  $('#bellBtn')?.setAttribute('aria-expanded', notificationPopoverOpen ? 'true' : 'false');
  if (notificationPopoverOpen) {
    await refreshMyNotifications();
    renderNotificationPopover();
  }
}

function closeNotificationPopover() {
  const panel = $('#notificationPopover');
  if (panel) panel.hidden = true;
  notificationPopoverOpen = false;
  $('#bellBtn')?.setAttribute('aria-expanded', 'false');
}

async function openNotification(id) {
  const item = myNotifications.find(row => row.id === id);
  if (!item) return;
  if (!item.lida_em) {
    const { error } = await window.npiSupabase.rpc('npi_marcar_notificacao_lida', { p_notificacao_id: id });
    if (error) { toast('Não foi possível marcar como lida: ' + error.message); return; }
  }
  await refreshMyNotifications();
  closeNotificationPopover();
  if (item.destino && pageMeta[item.destino] && hasPermission(item.destino, 'visualizar')) {
    goTo(item.destino);
  } else if (item.destino && pageMeta[item.destino]) {
    toast('Você não tem acesso à área indicada nesta notificação.');
  }
}

async function markAllNotificationsRead() {
  const { error } = await window.npiSupabase.rpc('npi_marcar_todas_notificacoes_lidas');
  if (error) { toast('Não foi possível atualizar as notificações: ' + error.message); return; }
  await refreshMyNotifications();
  toast('Todas as notificações foram marcadas como lidas.');
}

async function archiveNotification(id) {
  const { error } = await window.npiSupabase.rpc('npi_arquivar_notificacao', { p_notificacao_id: id });
  if (error) { toast('Não foi possível arquivar: ' + error.message); return; }
  await refreshMyNotifications();
}

function notificationAudienceFields(audience, profiles, users) {
  if (audience === 'perfis') {
    return `<div class="notification-form-row full"><label for="notificationProfiles">Perfis destinatários</label><select id="notificationProfiles" multiple required size="5">${profiles.map(profile => `<option value="${esc(profile.nome)}">${esc(profile.nome)}</option>`).join('')}</select><small>Use Ctrl (Windows) ou Command (Mac) para selecionar mais de um perfil.</small></div>`;
  }
  if (audience === 'usuarios') {
    return `<div class="notification-form-row full"><label for="notificationUsers">Usuários destinatários</label><select id="notificationUsers" multiple required size="6">${users.map(user => `<option value="${user.id}">${esc(user.nome || user.email)} · ${esc(user.email || '')}</option>`).join('')}</select><small>Selecione um ou mais usuários ativos da empresa.</small></div>`;
  }
  return '<div class="notification-form-row full notification-audience-hint">O aviso será enviado a todas as contas ativas da empresa vinculada.</div>';
}

function notificationDestinationOptions() {
  const excluded = new Set(['trocar', 'sair', 'sem_acesso', 'notificacoes']);
  return Object.entries(pageMeta).filter(([key]) => !excluded.has(key))
    .map(([key, value]) => `<option value="${key}">${esc(value[0])}</option>`).join('');
}

function groupSentNotifications(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const key = row.grupo_id || row.id;
    if (!groups.has(key)) groups.set(key, { ...row, total: 0, read: 0 });
    const group = groups.get(key);
    group.total += 1;
    if (row.lida_em) group.read += 1;
  });
  return [...groups.values()];
}

async function renderNotificationsAdminPage(workspace) {
  workspace.innerHTML = '<div class="empty">Carregando central administrativa...</div>';
  if (!isAdministrator()) {
    workspace.innerHTML = '<section class="panel access-empty"><i data-lucide="shield-alert"></i><h3>Acesso restrito</h3><p>Somente administradores podem enviar comunicados gerais do NPI FROTA.</p></section>';
    refreshIcons();
    return;
  }
  try {
    const [usersResult, profilesResult, sentResult] = await Promise.all([
      window.npiSupabase.from('usuarios').select('id,nome,email,situacao').eq('empresa_id', currentProfile.empresa_id).eq('situacao', 'Ativo').order('nome'),
      window.npiSupabase.from('perfis').select('id,nome').eq('situacao', 'Ativo').order('nome'),
      window.npiSupabase.from('notificacoes').select('id,grupo_id,titulo,mensagem,tipo,categoria,destino,created_at,usuario_id,lida_em').eq('empresa_id', currentProfile.empresa_id).eq('enviada_por', currentUser.id).order('created_at', { ascending: false }).limit(250)
    ]);
    for (const result of [usersResult, profilesResult, sentResult]) if (result.error) throw result.error;
    const users = usersResult.data || [];
    const profiles = profilesResult.data || [];
    const sentGroups = groupSentNotifications(sentResult.data || []);
    const historyHtml = sentGroups.slice(0, 20).map(item => {
      const meta = notificationMeta(item.tipo);
      const audience = item.total === users.length ? 'Toda a empresa' : `${item.total} destinatário(s)`;
      return `<article class="notification-history-item"><span class="notification-history-icon ${meta.tone}"><i data-lucide="${meta.icon}"></i></span><div class="notification-history-copy"><div class="notification-history-title"><b>${esc(item.titulo)}</b><span class="notification-type-pill ${meta.tone}">${esc(meta.label)}</span></div><p>${esc(item.mensagem)}</p><small>${esc(NOTIFICATION_CATEGORIES.find(([key]) => key === item.categoria)?.[1] || 'Aviso')} · ${esc(notificationDate(item.created_at))} · ${audience}</small></div><div class="notification-history-read"><b>${item.read}/${item.total}</b><small>lidas</small></div></article>`;
    }).join('');

    workspace.innerHTML = `<section class="panel notification-admin-panel">
      <div class="notification-admin-intro"><div><span class="eyebrow">COMUNICAÇÃO INTERNA</span><h3>Enviar aviso aos usuários</h3><p>Comunique atualizações, novos recursos, avisos operacionais ou manutenções programadas. As mensagens aparecem no sino de notificações de cada destinatário.</p></div><span class="notification-admin-mark"><i data-lucide="send"></i></span></div>
      <form id="notificationComposeForm" class="notification-compose">
        <div class="notification-form-row"><label for="notificationTitle">Título</label><input id="notificationTitle" maxlength="120" placeholder="Ex.: Novo módulo de pneus disponível" required></div>
        <div class="notification-form-row"><label for="notificationType">Tipo de aviso</label><select id="notificationType"><option value="info">Informação</option><option value="success">Novidade / sucesso</option><option value="warning">Atenção</option><option value="danger">Urgente</option></select></div>
        <div class="notification-form-row"><label for="notificationCategory">Categoria</label><select id="notificationCategory">${NOTIFICATION_CATEGORIES.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></div>
        <div class="notification-form-row"><label for="notificationAudience">Destinatários</label><select id="notificationAudience"><option value="empresa">Todos os usuários ativos da empresa</option><option value="perfis">Um ou mais perfis</option><option value="usuarios">Usuários específicos</option></select></div>
        <div id="notificationAudienceFields" class="notification-audience-fields full">${notificationAudienceFields('empresa', profiles, users)}</div>
        <div class="notification-form-row full"><label for="notificationMessage">Mensagem</label><textarea id="notificationMessage" maxlength="3000" rows="5" placeholder="Escreva o que os usuários precisam saber..." required></textarea><small>Máximo de 3.000 caracteres.</small></div>
        <div class="notification-form-row full"><label for="notificationDestination">Abrir uma área do sistema ao clicar (opcional)</label><select id="notificationDestination"><option value="">Não direcionar</option>${notificationDestinationOptions()}</select></div>
        <div class="notification-compose-actions"><span><i data-lucide="shield-check"></i> Envio restrito ao administrador. Cada usuário recebe sua própria cópia.</span><button type="submit" class="btn btn-primary" id="sendNotificationButton"><i data-lucide="send"></i> Enviar notificação</button></div>
      </form>
    </section>
    <section class="panel notification-history-panel"><div class="notification-history-heading"><div><h3>Comunicados enviados</h3><p>Acompanhe quantos destinatários já leram cada aviso.</p></div><span class="notification-history-count">${sentGroups.length} envio(s)</span></div>
      <div class="notification-history-list">${historyHtml || '<div class="notification-empty-inline">Nenhum comunicado enviado por esta conta ainda.</div>'}</div>
    </section>`;

    const audienceSelect = $('#notificationAudience');
    const audienceFields = $('#notificationAudienceFields');
    audienceSelect.onchange = () => { audienceFields.innerHTML = notificationAudienceFields(audienceSelect.value, profiles, users); };
    $('#notificationComposeForm').onsubmit = async event => {
      event.preventDefault();
      const title = $('#notificationTitle').value.trim();
      const message = $('#notificationMessage').value.trim();
      const audience = audienceSelect.value;
      const selectedProfiles = [...(workspace.querySelector('#notificationProfiles')?.selectedOptions || [])].map(option => option.value);
      const selectedUsers = [...(workspace.querySelector('#notificationUsers')?.selectedOptions || [])].map(option => option.value);
      if (!title || !message) { toast('Preencha o título e a mensagem.'); return; }
      if (audience === 'perfis' && !selectedProfiles.length) { toast('Selecione ao menos um perfil destinatário.'); return; }
      if (audience === 'usuarios' && !selectedUsers.length) { toast('Selecione ao menos um usuário destinatário.'); return; }
      const button = $('#sendNotificationButton');
      button.disabled = true; button.textContent = 'Enviando...';
      try {
        const { data, error } = await window.npiSupabase.rpc('npi_enviar_notificacao', {
          p_titulo: title,
          p_mensagem: message,
          p_tipo: $('#notificationType').value,
          p_categoria: $('#notificationCategory').value,
          p_destino: $('#notificationDestination').value || null,
          p_publico_alvo: audience,
          p_perfis: audience === 'perfis' ? selectedProfiles : null,
          p_usuarios: audience === 'usuarios' ? selectedUsers : null
        });
        if (error) throw error;
        toast(`Notificação enviada para ${Number(data) || 0} usuário(s).`);
        await refreshMyNotifications();
        await renderNotificationsAdminPage(workspace);
      } catch (error) {
        console.error('Erro ao enviar notificação:', error);
        toast('Não foi possível enviar: ' + (error.message || 'verifique a migração e as permissões.'));
        button.disabled = false; button.innerHTML = '<i data-lucide="send"></i> Enviar notificação';
        refreshIcons();
      }
    };
  } catch (error) {
    console.error('Erro na central administrativa de notificações:', error);
    workspace.innerHTML = `<div class="empty integration-notice">Não foi possível abrir a central de notificações: ${esc(error.message || 'Execute o SQL de notificações no Supabase.')}</div>`;
  }
  refreshIcons();
}

// Fecha o painel ao clicar fora dele, sem interferir nos botões internos.
document.addEventListener('click', event => {
  if (!event.target.closest('.notification-anchor') && notificationPopoverOpen) closeNotificationPopover();
});
