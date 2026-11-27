/* NPI FROTA | Busca, filtros, tabela e Kanban.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

/* =====================================================================
   7. TELAS
   ===================================================================== */

// ---------- Lista de registros (tabela e Kanban) ----------

// Aplica busca e filtro de situação.
function searchableRecordText(record) {
  if (!recordSearchTextCache.has(record)) {
    recordSearchTextCache.set(record, Object.values(record).join(' ').toLocaleLowerCase('pt-BR'));
  }
  return recordSearchTextCache.get(record);
}

function filteredRecords() {
  const text = searchText.trim().toLocaleLowerCase('pt-BR');
  return recordsOf(page).filter(record => {
    const matchStatus = !statusFilter || record['Situação'] === statusFilter;
    const matchText = !text || searchableRecordText(record).includes(text);
    return matchStatus && matchText;
  });
}

// Conteúdo de uma célula da tabela (etiqueta de situação, placa ou texto formatado).
function cellHtml(label, value, record) {
  if (page === 'documentos' && label === 'Arquivo digital') return value ? `<span class="tag info">Anexado</span>` : '—';
  if (page === 'seguros' && label === 'Arquivo da apólice') return value ? `<span class="tag info">Apólice anexada</span>` : '—';
  if (page === 'sinistros' && label === 'Anexo do sinistro') return value ? `<span class="tag info">Anexo disponível</span>` : '—';
  if (label === 'Situação' && value) return `<span class="tag ${TONE[value] || 'info'}">${esc(value)}</span>`;
  if (label === 'Placa' && value) return `<span class="plate">${esc(value)}</span>`;
  return esc(formatValue(label, value));
}

function toolbarHtml(shown, total) {
  const hasStatus = (fields[page] || []).includes('Situação');

  const viewButtons = page !== 'veiculos' ? '' : `
    <div class="view-buttons">
      <button class="view-btn ${vehicleView.mode === 'kanban' ? 'active' : ''}" data-v="kanban"><i data-lucide="columns-3"></i>Kanban</button>
      <button class="view-btn ${vehicleView.mode === 'lista' ? 'active' : ''}" data-v="lista"><i data-lucide="list"></i>Lista</button>
    </div>`;

  const statusSelect = !hasStatus ? '' : `
    <select class="filter" id="statusFilter">
      <option value="">Todas as situações</option>
      ${statusOptions(page).map(s => `<option ${s === statusFilter ? 'selected' : ''}>${s}</option>`).join('')}
    </select>`;

  return `
    <div class="toolbar">
      ${viewButtons}
      <input class="search" id="tableSearch" placeholder="Pesquisar por descrição, código ou informação..." value="${esc(searchText)}">
      ${statusSelect}
      <span class="board-info" id="boardInfo">${shown} de ${total} registros</span>
    </div>`;
}

function kanbanHtml(records) {
  const columns = statusOptions('veiculos').map(status => {
    const cards = records.filter(r => r['Situação'] === status).map(r => `
      <div class="card" draggable="${hasPermission('veiculos','alterar') ? 'true' : 'false'}" data-id="${r.id}">
        <div class="card-title">${esc(r.Marca)} ${esc(r.Modelo)}</div>
        <div class="card-company"><span class="plate">${esc(r.Placa)}</span></div>
        <div class="card-bottom">
          <span class="mini-avatar">${esc((r.Marca || '?')[0])}</span>
          ${esc(r['Ano de fabricação'] || '')} · ${esc(formatValue('Quilometragem atual', r['Quilometragem atual']))}
        </div>
      </div>`).join('');
    const count = records.filter(r => r['Situação'] === status).length;
    return `
      <div class="column" data-st="${status}">
        <div class="column-header" style="--c:${STATUS_COLOR[status]}">
          <h3>${status}</h3><div class="column-meta">${count} veículo(s)</div>
        </div>
        <div class="deal-list">${cards}</div>
      </div>`;
  }).join('');
  return `<div class="board">${columns}</div>`;
}

function tableHtml(records) {
  if (!records.length) {
    return `<div class="empty">Nenhum registro encontrado. Clique em <b>Novo registro</b> para começar.</div>`;
  }
  const columns = tableColumns(page);
  const head = columns.map(c => `<th>${c}</th>`).join('') + '<th></th>';
  const rows = records.map(record => `
    <tr data-id="${record.id}">
      ${columns.map((c, i) => `<td class="${i === 0 ? 'strong' : ''}">${cellHtml(c, record[c], record)}</td>`).join('')}
      <td>
        <div class="row-actions">
          ${page === 'documentos' && record['Arquivo digital'] ? '<button class="open-document" title="Abrir documento"><i data-lucide="file-down"></i></button>' : ''}
          ${page === 'seguros' && record['Arquivo da apólice'] ? '<button class="open-vehicle-attachment" data-module="seguros" title="Abrir apólice"><i data-lucide="file-down"></i></button>' : ''}
          ${page === 'sinistros' && record['Anexo do sinistro'] ? '<button class="open-vehicle-attachment" data-module="sinistros" title="Abrir anexo do sinistro"><i data-lucide="file-down"></i></button>' : ''}
          ${page === 'checklists' ? '<button class="view-checklist" title="Ver respostas do checklist"><i data-lucide="clipboard-list"></i></button>' : ''}
          ${page === 'reservas' && record['Situação'] === 'Pendente' && hasPermission('reservas','aprovar') ? `<button class="reservation-approve" data-decision="Aprovada" title="Aprovar reserva"><i data-lucide="check"></i></button><button class="reservation-reject" data-decision="Recusada" title="Recusar reserva"><i data-lucide="x"></i></button>` : ''}
          ${hasPermission(page,'alterar') && !READ_ONLY_MODULES.has(page) && page !== 'movpneus' ? '<button class="edit" title="Editar"><i data-lucide="pencil"></i></button>' : ''}
          ${hasPermission(page,'excluir') && !READ_ONLY_MODULES.has(page) && !['empresas','movpneus'].includes(page) ? '<button class="del" title="Excluir"><i data-lucide="trash-2"></i></button>' : ''}
        </div>
      </td>
    </tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function recordsViewHtml(records) {
  if (page === 'veiculos' && vehicleView.mode === 'kanban') return kanbanHtml(records);
  const totalPages = Math.max(1, Math.ceil(records.length / RECORDS_PAGE_SIZE));
  recordsPage = Math.min(Math.max(1, recordsPage), totalPages);
  const start = (recordsPage - 1) * RECORDS_PAGE_SIZE;
  const visibleRecords = records.slice(start, start + RECORDS_PAGE_SIZE);
  const pagination = records.length > RECORDS_PAGE_SIZE ? `
    <div class="records-pagination">
      <span>Mostrando ${start + 1}–${Math.min(start + RECORDS_PAGE_SIZE, records.length)} de ${records.length}</span>
      <div class="records-pagination-actions">
        <button type="button" class="btn btn-light" data-record-page="${recordsPage - 1}" ${recordsPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Página ${recordsPage} de ${totalPages}</span>
        <button type="button" class="btn btn-light" data-record-page="${recordsPage + 1}" ${recordsPage >= totalPages ? 'disabled' : ''}>Próxima</button>
      </div>
    </div>` : '';
  return `<section class="table-card"><div class="table-scroll">${tableHtml(visibleRecords)}</div></section>${pagination}`;
}

function listHtml() {
  const records = filteredRecords();
  const toolbar = toolbarHtml(records.length, recordsOf(page).length);
  return `${toolbar}<div id="recordsView">${recordsViewHtml(records)}</div>`;
}

