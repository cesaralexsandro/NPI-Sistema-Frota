/* NPI FROTA | Visão atual da localização dos pneus.
   É uma página derivada: usa os cadastros pneus e movimentacoes_pneus, sem criar outra tabela. */

function latestTireMovement(tire) {
  const tireLabel = RELATION_FIELDS['Pneu'].display(tire);
  return recordsOf('movpneus')
    .filter(movement => movement['Pneu'] === tireLabel)
    .sort((a, b) => String(b['Data'] || '').localeCompare(String(a['Data'] || '')))[0] || null;
}

function tireCurrentLocation(tire) {
  const status = tire['Situação'] || '—';
  if (status === 'Instalado') {
    return [tire['Veículo atual'] || 'Veículo não identificado', tire['Posição atual'] || 'Posição não informada'].join(' · ');
  }
  if (status === 'Em estoque') return tire['Local de armazenamento'] || 'Estoque · local não informado';
  if (status === 'Em reparo') return 'Em reparo · conferir oficina/responsável no histórico';
  if (status === 'Em recapagem') return 'Em recapagem · conferir recapadora no histórico';
  if (status === 'Descartado') return 'Descartado';
  return tire['Local de armazenamento'] || status;
}

function tireLocationRows() {
  return recordsOf('pneus').map(tire => {
    const last = latestTireMovement(tire);
    return {
      tire,
      last,
      code: tire['Código do pneu'] || 'Sem código',
      description: `${tire.Marca || ''} ${tire.Modelo || ''} ${tire.Medida ? `(${tire.Medida})` : ''}`.trim() || 'Pneu sem descrição',
      status: tire['Situação'] || '—',
      location: tireCurrentLocation(tire),
      recaps: Number(tire['Recapagens realizadas'] || 0)
    };
  });
}

function tireLocationPageHtml(searchValue = '', statusValue = '') {
  const allRows = tireLocationRows();
  const needle = String(searchValue || '').trim().toLowerCase();
  const rows = allRows.filter(item => {
    const matchesSearch = !needle || [item.code, item.description, item.status, item.location,
      item.last?.['Tipo de movimentação'], item.last?.['Responsável']].join(' ').toLowerCase().includes(needle);
    const matchesStatus = !statusValue || item.status === statusValue;
    return matchesSearch && matchesStatus;
  });
  const installed = allRows.filter(item => item.status === 'Instalado').length;
  const stock = allRows.filter(item => item.status === 'Em estoque').length;
  const inService = allRows.filter(item => ['Em reparo', 'Em recapagem'].includes(item.status)).length;
  const discarded = allRows.filter(item => item.status === 'Descartado').length;
  const statuses = [...new Set(allRows.map(item => item.status).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
  const statusOptionsHtml = statuses.map(status => `<option value="${esc(status)}" ${status === statusValue ? 'selected' : ''}>${esc(status)}</option>`).join('');
  const table = rows.length ? `
    <section class="table-card"><div class="table-scroll"><table>
      <thead><tr><th>Código</th><th>Pneu</th><th>Situação</th><th>Localização atual</th><th>Recapagens</th><th>Última movimentação</th><th>Data</th></tr></thead>
      <tbody>${rows.map(item => `
        <tr>
          <td class="strong">${esc(item.code)}</td>
          <td>${esc(item.description)}</td>
          <td><span class="tag ${TONE[item.status] || 'info'}">${esc(item.status)}</span></td>
          <td>${esc(item.location)}</td>
          <td>${item.recaps}</td>
          <td>${esc(item.last?.['Tipo de movimentação'] || 'Sem movimentação')}</td>
          <td>${esc(item.last?.['Data'] ? formatValue('Data', item.last['Data']) : '—')}</td>
        </tr>`).join('')}</tbody>
    </table></div></section>` : '<div class="empty">Nenhum pneu corresponde aos filtros selecionados.</div>';

  const historyButton = hasPermission('movpneus', 'visualizar')
    ? '<button class="btn btn-light" data-go="movpneus"><i data-lucide="history"></i> Ver histórico completo</button>'
    : '';

  return `
    <div class="stats tire-location-stats">
      <article class="stat-card"><div class="stat-top">Instalados <span class="stat-icon"><i data-lucide="truck"></i></span></div><div class="stat-value">${installed}</div><div class="stat-foot">Em veículos e posições</div></article>
      <article class="stat-card"><div class="stat-top">Em estoque <span class="stat-icon"><i data-lucide="warehouse"></i></span></div><div class="stat-value">${stock}</div><div class="stat-foot">Disponíveis para instalação</div></article>
      <article class="stat-card"><div class="stat-top">Em serviço <span class="stat-icon"><i data-lucide="wrench"></i></span></div><div class="stat-value">${inService}</div><div class="stat-foot">Reparo ou recapagem</div></article>
      <article class="stat-card"><div class="stat-top">Descartados <span class="stat-icon"><i data-lucide="ban"></i></span></div><div class="stat-value">${discarded}</div><div class="stat-foot">Fora de operação</div></article>
    </div>
    <div class="toolbar tire-location-toolbar">
      <input class="search" id="tireLocationSearch" placeholder="Pesquisar por código, pneu, veículo ou posição..." value="${esc(searchValue)}">
      <select class="filter" id="tireLocationStatus"><option value="">Todas as situações</option>${statusOptionsHtml}</select>
      <span class="board-info">${rows.length} de ${allRows.length} pneus</span>
      ${historyButton}
    </div>
    ${table}`;
}

function bindTireLocationEvents(workspace) {
  const search = workspace.querySelector('#tireLocationSearch');
  const status = workspace.querySelector('#tireLocationStatus');
  const rerender = (keepFocus = false) => {
    const searchValue = search?.value || '';
    const statusValue = status?.value || '';
    const cursor = search?.selectionStart ?? searchValue.length;
    workspace.innerHTML = tireLocationPageHtml(searchValue, statusValue);
    bindTireLocationEvents(workspace);
    refreshIcons();
    if (keepFocus) {
      const next = workspace.querySelector('#tireLocationSearch');
      next?.focus();
      next?.setSelectionRange(cursor, cursor);
    }
  };
  search?.addEventListener('input', () => rerender(true));
  status?.addEventListener('change', () => rerender(false));
}
