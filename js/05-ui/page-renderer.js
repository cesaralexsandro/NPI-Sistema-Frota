/* NPI FROTA | Montagem das páginas e eventos dos componentes renderizados.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

function renderPage() {
  if (!hasPermission(page, 'visualizar')) { page = defaultPageForCurrentUser(); }
  const workspace = $('#workspace');
  const [title, subtitle] = pageMeta[page];
  const isReports = page === 'relatorios';
  $('#pageTitle').textContent = title;
  $('#pageSubtitle').textContent = subtitle;
  $('#crumb').textContent = title;
  document.title = title + ' | NPI FROTA';
  $('#newBtn').hidden = page === 'localizacao_pneus' || READ_ONLY_MODULES.has(page) || !hasPermission(page,'incluir') || !DB_MODULES.has(page);
  $('#exportBtn').hidden = page === 'localizacao_pneus' || !hasPermission(page,'exportar') || page === 'dashboard' || isReports || !DB_MODULES.has(page);
  updateNotificationBellBadge();

  if (page === 'dashboard') workspace.innerHTML = dashboardHtml();
  else if (page === 'painel_motorista') { workspace.innerHTML=''; renderDriverPanel(workspace); }
  else if (page === 'usuarios') { workspace.innerHTML=''; renderUsersAdminPage(workspace); }
  else if (page === 'perfis') { workspace.innerHTML=''; renderPermissionsAdminPage(workspace); }
  else if (page === 'notificacoes') { workspace.innerHTML=''; renderNotificationsAdminPage(workspace); }
  else if (page === 'atribuicoes_motoristas') { workspace.innerHTML=''; renderVehicleAssignmentsPage(workspace); }
  else if (page === 'localizacao_pneus') { workspace.innerHTML = tireLocationPageHtml(); }
  else if (page === 'relatorios') workspace.innerHTML = reportsHtml();
  else if (page === 'sem_acesso') workspace.innerHTML = '<section class="panel access-empty"><i data-lucide="shield-alert"></i><h3>Seu acesso ainda não foi configurado</h3><p>Solicite ao administrador que atribua um perfil e libere as permissões necessárias.</p></section>';
  else if (DB_MODULES.has(page)) workspace.innerHTML = listHtml();
  else workspace.innerHTML = `<div class="empty integration-notice"><b>${esc(title)} ainda não está conectado ao banco.</b><br>O perfil permite acessar este módulo, mas sua integração funcional será feita em uma próxima etapa.</div>`;

  const sectionTabs = sectionTabsHtml(page);
  if (sectionTabs) workspace.insertAdjacentHTML('afterbegin', sectionTabs);
  bindPageEvents(workspace);
  refreshIcons();
}

// Evita disparar duas gravações simultâneas para o mesmo veículo.
const vehicleKanbanUpdatesPending = new Set();

async function updateVehicleStatusFromKanban(vehicleId, nextStatus) {
  const record = recordsOf('veiculos').find(item => item.id === vehicleId);
  if (!record || vehicleKanbanUpdatesPending.has(vehicleId)) return;
  if (!hasPermission('veiculos', 'alterar')) {
    toast('Seu perfil não permite alterar a situação dos veículos.');
    return;
  }

  const previousStatus = record['Situação'] || null;
  if (previousStatus === nextStatus) return;

  vehicleKanbanUpdatesPending.add(vehicleId);
  // Atualização otimista: o cartão muda imediatamente usando os dados já em memória.
  record['Situação'] = nextStatus;
  recordSearchTextCache.delete(record);
  if (page === 'veiculos') refreshRecordsView($('#workspace'));

  try {
    let query = window.npiSupabase
      .from('veiculos')
      .update({ situacao: nextStatus })
      .eq('id', vehicleId);
    // Evita sobrescrever uma alteração feita por outro usuário desde a última leitura.
    query = previousStatus === null
      ? query.is('situacao', null)
      : query.eq('situacao', previousStatus);
    const { data, error } = await query.select('id').single();
    if (error) throw error;
    if (!data) throw new Error('O veículo não foi atualizado. Atualize a página e tente novamente.');
    toast(`Veículo atualizado para "${nextStatus}".`);
  } catch (error) {
    // Rollback local caso a API/RLS rejeite a alteração.
    record['Situação'] = previousStatus || '';
    recordSearchTextCache.delete(record);
    if (page === 'veiculos') refreshRecordsView($('#workspace'));
    toast('Não foi possível alterar a situação: ' + (error?.message || 'Erro desconhecido'));
  } finally {
    vehicleKanbanUpdatesPending.delete(vehicleId);
  }
}

async function decideReservation(reservationId, decision) {
  if (!['Aprovada', 'Recusada'].includes(decision)) return;
  if (!hasPermission('reservas', 'aprovar')) { toast('Seu perfil não permite aprovar ou recusar reservas.'); return; }
  const reservation = recordsOf('reservas').find(item => String(item.id) === String(reservationId));
  if (!reservation || reservation['Situação'] !== 'Pendente') { toast('Esta reserva não está mais pendente. Atualize a tela.'); return; }
  if (decision === 'Recusada' && !confirm('Confirma a recusa desta reserva?')) return;
  try {
    const { error } = await window.npiSupabase.rpc('npi_decide_reservation', {
      p_reservation_id: reservationId,
      p_decision: decision
    });
    if (error) throw error;
    await refreshSupabaseAfterMutation('reservas');
    toast(decision === 'Aprovada' ? 'Reserva aprovada.' : 'Reserva recusada.');
    renderPage();
  } catch (error) {
    console.error('Erro ao decidir reserva:', error);
    toast('Não foi possível concluir a decisão: ' + (error.message || 'verifique a função SQL e as permissões.'));
  }
}

function refreshRecordsView(workspace = $('#workspace')) {
  if (!workspace) return;
  const records = filteredRecords();
  const info = workspace.querySelector('#boardInfo');
  if (info) info.textContent = `${records.length} de ${recordsOf(page).length} registros`;
  const view = workspace.querySelector('#recordsView');
  if (!view) return;
  view.innerHTML = recordsViewHtml(records);
  bindRecordsViewEvents(view);
  refreshIcons();
}

function bindRecordsViewEvents(container) {
  container.querySelectorAll('tbody tr[data-id]').forEach(row => {
    const id = row.dataset.id;
    const checklistButton = row.querySelector('.view-checklist');
    if (checklistButton) checklistButton.onclick = () => { void openChecklistDetails(id); };
    const openDocumentButton = row.querySelector('.open-document');
    if (openDocumentButton) openDocumentButton.onclick = () => { void openDocumentAttachment(id); };
    const openVehicleAttachmentButton = row.querySelector('.open-vehicle-attachment');
    if (openVehicleAttachmentButton) openVehicleAttachmentButton.onclick = () => { void openVehicleAttachment(openVehicleAttachmentButton.dataset.module, id); };
    const approveButtons = row.querySelectorAll('.reservation-approve, .reservation-reject');
    approveButtons.forEach(button => button.onclick = () => { void decideReservation(id, button.dataset.decision); });
    const editButton = row.querySelector('.edit');
    if (editButton) editButton.onclick = () => { void openForm(id); };
    const deleteButton = row.querySelector('.del');
    if (deleteButton) deleteButton.onclick = () => { void deleteRecord(id); };
  });

  container.querySelectorAll('[data-record-page]').forEach(button => {
    button.onclick = () => {
      const nextPage = Number(button.dataset.recordPage);
      if (!Number.isInteger(nextPage) || nextPage < 1) return;
      recordsPage = nextPage;
      refreshRecordsView($('#workspace'));
    };
  });

  container.querySelectorAll('.card').forEach(card => {
    card.onclick = () => { if (hasPermission(page, 'alterar')) void openForm(card.dataset.id); };
    card.ondragstart = event => {
      event.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
    };
    card.ondragend = () => card.classList.remove('dragging');
  });
  container.querySelectorAll('.column').forEach(column => {
    column.ondragover = event => { event.preventDefault(); column.classList.add('drop'); };
    column.ondragleave = () => column.classList.remove('drop');
    column.ondrop = event => {
      event.preventDefault();
      column.classList.remove('drop');
      const id = event.dataTransfer.getData('text/plain');
      if (id && column.dataset.st) void updateVehicleStatusFromKanban(id, column.dataset.st);
    };
  });
}

// Liga os cliques/arrastos dos elementos recém-criados.
function bindPageEvents(workspace) {
  workspace.querySelectorAll('[data-go]').forEach(el => el.onclick = () => goTo(el.dataset.go));
  if (page === 'localizacao_pneus') bindTireLocationEvents(workspace);
  if (page === 'relatorios') bindFinancialReportEvents(workspace);
  workspace.querySelectorAll('[data-rep]').forEach(el => el.onclick = () => {
    if (hasPermission(el.dataset.rep, 'exportar')) exportCsv(el.dataset.rep);
    else toast('Seu perfil não permite exportar este módulo.');
  });
  workspace.querySelectorAll('[data-v]').forEach(el => el.onclick = () => {
    vehicleView.mode = el.dataset.v;
    recordsPage = 1;
    renderPage();
  });

  const statusSelect = $('#statusFilter');
  if (statusSelect) statusSelect.onchange = () => {
    statusFilter = statusSelect.value;
    recordsPage = 1;
    renderPage();
  };

  // A busca mantém o input no DOM e redesenha somente a tabela/quadros.
  const search = $('#tableSearch');
  if (search) search.oninput = () => {
    searchText = search.value;
    recordsPage = 1;
    clearTimeout(recordsSearchTimer);
    const pageAtTyping = page;
    recordsSearchTimer = setTimeout(() => {
      if (pageAtTyping === page) refreshRecordsView(workspace);
    }, 140);
  };

  bindRecordsViewEvents(workspace);
}

