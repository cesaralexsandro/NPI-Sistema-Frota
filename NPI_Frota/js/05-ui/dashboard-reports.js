/* NPI FROTA | Indicadores, alertas, gráficos e atalhos de relatórios.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

// ---------- Dashboard ----------

// Últimos n meses: [{ key: '2026-11', label: 'nov' }, ...]
function lastMonths(n) {
  const months = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
    });
  }
  return months;
}

// Soma os gastos de um mês (opcionalmente só de um módulo, ex.: 'abastecimentos').
function monthlySpend(monthKey, onlySource) {
  let total = 0;
  for (const source in SPEND_SOURCES) {
    if (onlySource && source !== onlySource) continue;
    const [dateField, valueField] = SPEND_SOURCES[source];
    recordsOf(source).forEach(r => {
      if ((r[dateField] || '').slice(0, 7) === monthKey) total += Number(r[valueField]) || 0;
    });
  }
  return total;
}

// Pendências dos próximos 30 dias (documentos, CNH, apólices, reservas, manutenções).
function buildAlerts() {
  const alerts = [];
  const today = D(0);
  const limit = D(30);

  const dueSoon = (source, dateField, titleOf, includeRecord = () => true) => {
    recordsOf(source).filter(r => includeRecord(r) && r[dateField] && r[dateField] <= limit).forEach(r => alerts.push({
      title: titleOf(r),
      sub: (r[dateField] < today ? 'Vencido em ' : 'Vence em ') + formatValue(dateField, r[dateField]),
      overdue: r[dateField] < today,
      page: source
    }));
  };
  dueSoon('documentos', 'Data de validade', r => `${r['Tipo de documento'] || 'Documento'} · ${r['Veículo'] || ''}`, r => !['Pago', 'Cancelado'].includes(r['Situação']));
  dueSoon('motoristas', 'Validade da CNH', r => `CNH · ${r['Nome completo']}`);
  dueSoon('seguros', 'Fim da vigência', r => `Apólice · ${r['Veículo'] || ''}`, r => !['Cancelado', 'Suspenso', 'Vencido'].includes(r['Situação']));
  recordsOf('sinistros').filter(r => !['Encerrado', 'Negado'].includes(r['Situação'])).forEach(r => alerts.push({
    title: `Sinistro em aberto · ${r['Veículo'] || ''}`,
    sub: `${r['Tipo de sinistro'] || 'Ocorrência'} · ${r['Situação'] || 'Aberto'}`,
    page: 'sinistros'
  }));
  dueSoon('manutencoes', 'Próxima manutenção', r => `Revisão · ${r['Veículo'] || ''}`);
  dueSoon('despesas', 'Vencimento', r => `Despesa · ${r.Descrição || r.Categoria || ''} · ${money(r['Valor líquido'] || 0)}`, r => r['Situação'] === 'Pendente');

  // Multas pendentes: alertas separados para vencimento e prazo de indicação do condutor.
  recordsOf('multas').filter(r => r['Situação'] === 'Pendente' && r['Vencimento'] && r['Vencimento'] <= limit).forEach(r => alerts.push({
    title: `Multa pendente · ${r['Auto de infração'] || r['Veículo'] || ''}`,
    sub: (r['Vencimento'] < today ? 'Vencida em ' : 'Vence em ') + formatValue('Vencimento', r['Vencimento']),
    overdue: r['Vencimento'] < today,
    page: 'multas'
  }));
  recordsOf('multas').filter(r => ['Pendente', 'Em recurso'].includes(r['Situação']) && r['Prazo para indicação'] && r['Prazo para indicação'] <= limit).forEach(r => alerts.push({
    title: `Prazo de indicação · ${r['Auto de infração'] || r['Veículo'] || ''}`,
    sub: (r['Prazo para indicação'] < today ? 'Prazo vencido em ' : 'Indicar condutor até ') + formatValue('Prazo para indicação', r['Prazo para indicação']),
    overdue: r['Prazo para indicação'] < today,
    page: 'multas'
  }));

  recordsOf('reservas').filter(r => r['Situação'] === 'Pendente').forEach(r => alerts.push({
    title: `Reserva aguardando aprovação · ${r.Solicitante}`,
    sub: formatValue('Data/hora de retirada', r['Data/hora de retirada']),
    page: 'reservas'
  }));
  recordsOf('manutencoes').filter(r => r['Situação'] === 'Em andamento').forEach(r => alerts.push({
    title: `Manutenção em andamento · ${r['Veículo']}`,
    sub: r['Tipo de manutenção'] || '',
    page: 'manutencoes'
  }));
  recordsOf('pneus').filter(r => r['Profundidade atual (mm)'] !== '' && r['Profundidade atual (mm)'] != null)
    .filter(r => Number(r['Profundidade atual (mm)']) <= 3)
    .forEach(r => alerts.push({
      title: `Atenção ao pneu ${r['Código do pneu']}`,
      sub: Number(r['Profundidade atual (mm)']) <= 1.6
        ? `Sulco crítico: ${formatValue('Profundidade atual (mm)', r['Profundidade atual (mm)'])}`
        : `Sulco baixo: ${formatValue('Profundidade atual (mm)', r['Profundidade atual (mm)'])}`,
      overdue: Number(r['Profundidade atual (mm)']) <= 1.6,
      page: 'pneus'
    }));
  return alerts;
}

function statCardsHtml(vehicles) {
  const count = status => vehicles.filter(v => v['Situação'] === status).length;
  const percent = n => Math.round(n / (vehicles.length || 1) * 100) + '% da frota total';
  const cards = [
    ['Veículos cadastrados', vehicles.length, 'car', vehicles.length + ' no total'],
    ['Disponíveis', count('Disponível'), 'check', percent(count('Disponível'))],
    ['Em utilização', count('Em utilização'), 'arrow-left-right', percent(count('Em utilização'))],
    ['Em manutenção', count('Manutenção'), 'wrench', percent(count('Manutenção'))]
  ];
  return `<div class="grid stats">${cards.map(([label, value, icon, foot]) => `
    <article class="stat-card">
      <div class="stat-top">${label}<span class="stat-icon"><i data-lucide="${icon}"></i></span></div>
      <div class="stat-value">${value}</div>
      <div class="stat-foot">${foot}</div>
    </article>`).join('')}</div>`;
}

function expensesChartHtml() {
  const months = lastMonths(12);
  const monthKeys = new Set(months.map(month => month.key));
  const totalsByMonth = new Map(months.map(month => [month.key, 0]));
  const fuelByMonth = new Map(months.map(month => [month.key, 0]));

  // Percorre cada fonte uma única vez, em vez de varrer os mesmos registros
  // 24 vezes (12 meses × total/combustível) a cada renderização do Dashboard.
  for (const [source, [dateField, valueField]] of Object.entries(SPEND_SOURCES)) {
    recordsOf(source).forEach(record => {
      const monthKey = String(record[dateField] || '').slice(0, 7);
      if (!monthKeys.has(monthKey)) return;
      const value = Number(record[valueField]) || 0;
      totalsByMonth.set(monthKey, (totalsByMonth.get(monthKey) || 0) + value);
      if (source === 'abastecimentos') fuelByMonth.set(monthKey, (fuelByMonth.get(monthKey) || 0) + value);
    });
  }

  const totals = months.map(month => totalsByMonth.get(month.key) || 0);
  const fuel = months.map(month => fuelByMonth.get(month.key) || 0);
  if (!totals.some(value => value) && !fuel.some(value => value)) {
    return `
      <section class="panel">
        <div class="panel-title"><h3>Despesas da frota</h3><small>Últimos 12 meses</small></div>
        <div class="empty">Nenhuma despesa ou abastecimento cadastrado.</div>
      </section>`;
  }

  const max = Math.max(...totals, 1);
  const bars = months.map((month, index) => `
    <div class="bar-group" title="${month.label}: ${money(totals[index])} (combustível ${money(fuel[index])})">
      <div class="bar" style="height:${totals[index] / max * 100}%"></div>
      <div class="bar alt" style="height:${fuel[index] / max * 100}%"></div>
      <span class="bar-label">${month.label}</span>
    </div>`).join('');

  return `
    <section class="panel">
      <div class="panel-title"><h3>Despesas da frota</h3><small>Últimos 12 meses</small></div>
      <div class="chart-wrap">${bars}</div>
      <div class="legend"><span><i></i>Despesas</span><span><i class="alt"></i>Combustível</span></div>
    </section>`;
}

function statusDonutHtml(vehicles) {
  const count = status => vehicles.filter(v => v['Situação'] === status).length;

  // Monta o gradiente cônico da rosca: cada situação ocupa uma fatia proporcional.
  let start = 0;
  const slices = STATUS.veiculos.map(status => {
    const end = start + count(status) / (vehicles.length || 1) * 100;
    const slice = `${STATUS_COLOR[status]} ${start}% ${end}%`;
    start = end;
    return slice;
  });
  const gradient = vehicles.length ? slices.join(',') : 'var(--line) 0 100%';

  const legend = STATUS.veiculos
    .map(status => `<span style="--c:${STATUS_COLOR[status]}">${status} · ${count(status)}</span>`)
    .join('');

  return `
    <section class="panel">
      <div class="panel-title"><h3>Situação dos veículos</h3><small>Distribuição atual</small></div>
      <div class="donut-area">
        <div class="donut" style="background:conic-gradient(${gradient})"><b>${vehicles.length}</b></div>
        <div class="donut-legend">${legend}</div>
      </div>
    </section>`;
}

function recentVehiclesHtml(vehicles) {
  const rows = vehicles.slice(0, 5).map(v => `
    <tr>
      <td class="strong">${esc(v.Marca)} ${esc(v.Modelo)}</td>
      <td><span class="plate">${esc(v.Placa)}</span></td>
      <td><span class="tag ${TONE[v['Situação']] || 'info'}">${esc(v['Situação'] || '')}</span></td>
    </tr>`).join('') || '<tr><td colspan="3" class="empty">Sem veículos.</td></tr>';

  return `
    <section class="table-card">
      <div class="table-head"><h3>Veículos recentes</h3><a data-go="veiculos">Ver todos →</a></div>
      <div class="table-scroll">
        <table><thead><tr><th>Veículo</th><th>Placa</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </section>`;
}

function alertsHtml(alerts) {
  const items = alerts.map(a => `
    <div class="alert ${a.overdue ? 'bad' : ''}" data-go="${a.page}">
      <div class="alert-icon"><i data-lucide="triangle-alert"></i></div>
      <div><b>${esc(a.title)}</b><small>${esc(a.sub)}</small></div>
    </div>`).join('') || '<div class="empty">Nenhuma pendência.</div>';

  return `
    <section class="panel">
      <div class="panel-title"><h3>Alertas e pendências</h3><small>Próximos 30 dias</small></div>
      ${items}
    </section>`;
}

function dashboardHtml() {
  const vehicles = recordsOf('veiculos');
  return statCardsHtml(vehicles)
    + `<div class="grid dashboard-grid">${expensesChartHtml()}${statusDonutHtml(vehicles)}</div>`
    + `<div class="grid bottom-grid">${recentVehiclesHtml(vehicles)}${alertsHtml(buildAlerts())}</div>`;
}

// ---------- Relatórios financeiros ----------

const financialReportState = {
  from: `${new Date().getFullYear()}-01-01`,
  to: D(0),
  companyId: '',
  branchId: '',
  category: '',
  status: '',
  group: 'categoria'
};

function financeReportRaw(module) {
  return supabaseRawModuleRows?.get(module) || [];
}

function financeReportLookup(module, id, fallback = '') {
  if (!id) return fallback || 'Não informado';
  const row = financeReportRaw(module).find(item => String(item.id) === String(id));
  if (!row) return fallback || 'Cadastro não localizado';
  return dbRowDisplay(module, row, Object.fromEntries(supabaseRawModuleRows));
}

function financeReportDate(value) {
  return String(value || '').slice(0, 10);
}

function financeReportFilteredExpenses() {
  const filters = financialReportState;
  return financeReportRaw('despesas').filter(row => {
    const date = financeReportDate(row.data_lancamento);
    if (filters.from && date && date < filters.from) return false;
    if (filters.to && date && date > filters.to) return false;
    if (filters.companyId && String(row.empresa_id || '') !== filters.companyId) return false;
    if (filters.branchId && String(row.filial_id || '') !== filters.branchId) return false;
    if (filters.category && String(row.categoria || '') !== filters.category) return false;
    if (filters.status && String(row.situacao || '') !== filters.status) return false;
    return true;
  }).sort((a, b) => financeReportDate(b.data_lancamento).localeCompare(financeReportDate(a.data_lancamento)));
}

function financeReportRateValue(rate, expense) {
  const storedValue = Number(rate.valor);
  if (Number.isFinite(storedValue) && storedValue > 0) return storedValue;
  const percentage = Number(rate.percentual);
  if (Number.isFinite(percentage) && percentage > 0) return (Number(expense.valor_liquido) || 0) * percentage / 100;
  return 0;
}

function financeReportGroupRows(expenses) {
  const groupKey = financialReportState.group;
  const allocationColumns = {
    veiculo: ['veiculo_id', 'veiculos', 'veiculo_id'],
    centro: ['centro_custo_id', 'centros', 'centro_custo_id'],
  };
  const aggregates = new Map();
  const add = (label, amount, expenseId) => {
    const key = label || 'Não informado';
    if (!aggregates.has(key)) aggregates.set(key, { label: key, value: 0, ids: new Set(), items: 0 });
    const item = aggregates.get(key);
    item.value += Number(amount) || 0;
    if (expenseId) item.ids.add(String(expenseId));
    item.items += 1;
  };

  if (allocationColumns[groupKey]) {
    const [dimensionColumn, lookupModule] = allocationColumns[groupKey];
    const rawRates = hasPermission('rateios', 'visualizar') ? financeReportRaw('rateios') : [];
    const ratesByExpense = new Map();
    rawRates.forEach(rate => {
      const key = String(rate.despesa_id);
      if (!ratesByExpense.has(key)) ratesByExpense.set(key, []);
      ratesByExpense.get(key).push(rate);
    });
    expenses.forEach(expense => {
      const rates = ratesByExpense.get(String(expense.id)) || [];
      const net = Number(expense.valor_liquido) || 0;
      if (rates.length) {
        let allocated = 0;
        rates.forEach(rate => {
          const amount = financeReportRateValue(rate, expense);
          allocated += amount;
          const targetId = rate[dimensionColumn];
          const targetLabel = targetId
            ? financeReportLookup(lookupModule, targetId)
            : 'Rateado em outro destino';
          add(targetLabel, amount, expense.id);
        });
        const remainder = Math.max(0, net - allocated);
        if (remainder > 0.009) add('Saldo não rateado', remainder, expense.id);
      } else {
        const directId = expense[dimensionColumn];
        const label = directId
          ? financeReportLookup(lookupModule, directId)
          : 'Sem destino cadastrado';
        add(label, net, expense.id);
      }
    });
  } else {
    expenses.forEach(expense => {
      let label = 'Não informado';
      if (groupKey === 'categoria') label = expense.categoria || label;
      else if (groupKey === 'situacao') label = expense.situacao || label;
      else if (groupKey === 'mes') {
        const month = financeReportDate(expense.data_lancamento).slice(0, 7);
        label = month ? month.split('-').reverse().join('/') : 'Sem data';
      } else if (groupKey === 'fornecedor') label = financeReportLookup('fornecedores', expense.fornecedor_id, expense.fornecedor || 'Sem fornecedor');
      add(label, Number(expense.valor_liquido) || 0, expense.id);
    });
  }

  return [...aggregates.values()]
    .map(item => ({ label: item.label, value: item.value, count: item.ids.size }))
    .sort((a, b) => b.value - a.value);
}

function financeReportModel() {
  const expenses = financeReportFilteredExpenses();
  const rates = hasPermission('rateios', 'visualizar') ? financeReportRaw('rateios') : [];
  const expenseIds = new Set(expenses.map(row => String(row.id)));
  const relevantRates = rates.filter(rate => expenseIds.has(String(rate.despesa_id)));
  const total = expenses.reduce((sum, row) => sum + (Number(row.valor_liquido) || 0), 0);
  const paid = expenses.filter(row => row.situacao === 'Paga').reduce((sum, row) => sum + (Number(row.valor_liquido) || 0), 0);
  const pending = expenses.filter(row => row.situacao === 'Pendente').reduce((sum, row) => sum + (Number(row.valor_liquido) || 0), 0);
  const today = D(0);
  const overdue = expenses.filter(row => row.situacao === 'Pendente' && row.vencimento && row.vencimento < today)
    .reduce((sum, row) => sum + (Number(row.valor_liquido) || 0), 0);
  const expenseById = new Map(expenses.map(row => [String(row.id), row]));
  const allocated = relevantRates.reduce((sum, rate) => {
    const expense = expenseById.get(String(rate.despesa_id));
    return sum + (expense ? financeReportRateValue(rate, expense) : 0);
  }, 0);
  return {
    expenses, total, paid, pending, overdue, allocated,
    unallocated: Math.max(0, total - allocated),
    groups: financeReportGroupRows(expenses)
  };
}

function financeReportSelectOptions(items, valueOf, labelOf, selected, placeholder) {
  return `<option value="">${esc(placeholder)}</option>${items.map(item => {
    const value = String(valueOf(item) ?? '');
    return `<option value="${esc(value)}" ${value === String(selected || '') ? 'selected' : ''}>${esc(labelOf(item))}</option>`;
  }).join('')}`;
}

function financeReportCsv(filename, headers, rows) {
  const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const content = [headers.map(quote).join(';'), ...rows.map(row => row.map(quote).join(';'))].join('\r\n');
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  toast('Relatório exportado em CSV.');
}

function financeReportDetailRows(expenses) {
  return expenses.map(row => ({
    date: financeReportDate(row.data_lancamento),
    category: row.categoria || '',
    description: row.descricao || '',
    vehicle: financeReportLookup('veiculos', row.veiculo_id, 'Sem veículo'),
    supplier: financeReportLookup('fornecedores', row.fornecedor_id, row.fornecedor || 'Sem fornecedor'),
    costCenter: financeReportLookup('centros', row.centro_custo_id, 'Sem centro de custo'),
    due: row.vencimento || '',
    status: row.situacao || '',
    value: Number(row.valor_liquido) || 0
  }));
}

function reportsHtml() {
  if (!hasPermission('despesas', 'visualizar')) {
    return `<section class="panel"><div class="empty">Seu perfil não possui permissão para consultar os relatórios financeiros. Solicite acesso ao administrador.</div></section>`;
  }

  const model = financeReportModel();
  const companies = financeReportRaw('empresas');
  const branches = financeReportRaw('filiais').filter(row => !financialReportState.companyId || String(row.empresa_id) === financialReportState.companyId);
  const categories = [...new Set(financeReportRaw('despesas').map(row => row.categoria).filter(Boolean))].sort();
  const statuses = [...new Set(financeReportRaw('despesas').map(row => row.situacao).filter(Boolean))].sort();
  const companyHtml = financeReportSelectOptions(companies, row => row.id, row => dbRowDisplay('empresas', row), financialReportState.companyId, 'Todas as empresas');
  const branchHtml = financeReportSelectOptions(branches, row => row.id, row => dbRowDisplay('filiais', row), financialReportState.branchId, 'Todas as filiais');
  const categoryHtml = financeReportSelectOptions(categories, value => value, value => value, financialReportState.category, 'Todas as categorias');
  const statusHtml = financeReportSelectOptions(statuses, value => value, value => value, financialReportState.status, 'Todas as situações');
  const groupOptions = [
    ['categoria', 'Categoria da despesa'], ['situacao', 'Situação'], ['mes', 'Mês de lançamento'],
    ['veiculo', 'Veículo / rateio'], ['centro', 'Centro de custo / rateio'],
    ['fornecedor', 'Fornecedor']
  ];
  const groupHtml = groupOptions.map(([value, label]) => `<option value="${value}" ${financialReportState.group === value ? 'selected' : ''}>${label}</option>`).join('');
  const groupTotal = model.groups.reduce((sum, row) => sum + row.value, 0) || 1;
  const groupRows = model.groups.map(row => {
    const share = Math.min(100, Math.max(0, row.value / groupTotal * 100));
    return `<tr><td class="strong">${esc(row.label)}</td><td>${row.count}</td><td class="finance-report-money">${money(row.value)}</td><td><div class="finance-report-share"><span><i style="width:${share.toFixed(2)}%"></i></span><b>${share.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b></div></td></tr>`;
  }).join('')
    || '<tr><td colspan="4" class="empty">Não há dados para os filtros selecionados.</td></tr>';
  const detailRows = financeReportDetailRows(model.expenses);
  const detailHtml = detailRows.slice(0, 100).map(row => `
    <tr><td>${esc(row.date ? row.date.split('-').reverse().join('/') : '—')}</td><td>${esc(row.category)}</td><td>${esc(row.description)}</td><td>${esc(row.vehicle)}</td><td>${esc(row.supplier)}</td><td>${esc(row.status)}</td><td class="finance-report-money">${money(row.value)}</td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">Nenhuma despesa encontrada para este período.</td></tr>';

  const exportTiles = REPORTS.filter(([, , , source]) => hasPermission(source, 'exportar')).map(([title, icon, text, source]) => `
    <button class="report-tile" data-rep="${source}" type="button"><i data-lucide="${icon}"></i><h3>${esc(title)}</h3><p>${esc(text)} <b>Baixar CSV</b></p></button>`).join('');

  return `
    <section class="panel finance-report-panel">
      <div class="panel-title"><div><h3>Análise financeira da frota</h3><small>Despesas e distribuição por rateios</small></div><span class="finance-report-record-count">${model.expenses.length} lançamento(s)</span></div>
      <div class="finance-report-filters">
        <label>Data inicial<input type="date" id="financeReportFrom" value="${esc(financialReportState.from)}"></label>
        <label>Data final<input type="date" id="financeReportTo" value="${esc(financialReportState.to)}"></label>
        <label>Empresa<select id="financeReportCompany">${companyHtml}</select></label>
        <label>Filial<select id="financeReportBranch">${branchHtml}</select></label>
        <label>Categoria<select id="financeReportCategory">${categoryHtml}</select></label>
        <label>Situação<select id="financeReportStatus">${statusHtml}</select></label>
        <label class="finance-report-group-filter">Agrupar por<select id="financeReportGroup">${groupHtml}</select></label>
      </div>
      <div class="finance-report-actions">
        <button type="button" class="btn btn-primary" id="applyFinanceReport"><i data-lucide="filter"></i> Aplicar filtros</button>
        <button type="button" class="btn btn-light" id="clearFinanceReport"><i data-lucide="rotate-ccw"></i> Limpar</button>
        <span class="finance-report-filter-note">Os valores são calculados sobre as despesas filtradas; cada despesa é contabilizada uma única vez no resumo.</span>
      </div>
    </section>

    <div class="grid finance-report-kpis">
      <article class="stat-card"><div class="stat-top">Total líquido<span class="stat-icon"><i data-lucide="wallet"></i></span></div><div class="stat-value">${money(model.total)}</div><div class="stat-foot">${model.expenses.length} despesa(s) no filtro</div></article>
      <article class="stat-card"><div class="stat-top">Total pago<span class="stat-icon"><i data-lucide="check-circle"></i></span></div><div class="stat-value">${money(model.paid)}</div><div class="stat-foot">Situação Paga</div></article>
      <article class="stat-card"><div class="stat-top">Pendente<span class="stat-icon"><i data-lucide="clock"></i></span></div><div class="stat-value">${money(model.pending)}</div><div class="stat-foot">Despesas aguardando pagamento</div></article>
      <article class="stat-card"><div class="stat-top">Vencido<span class="stat-icon"><i data-lucide="alert-triangle"></i></span></div><div class="stat-value">${money(model.overdue)}</div><div class="stat-foot">Pendentes com vencimento anterior a hoje</div></article>
      <article class="stat-card"><div class="stat-top">Distribuído em rateios<span class="stat-icon"><i data-lucide="pie-chart"></i></span></div><div class="stat-value">${money(model.allocated)}</div><div class="stat-foot">Valores vinculados a destinos de rateio</div></article>
      <article class="stat-card"><div class="stat-top">Saldo não rateado<span class="stat-icon"><i data-lucide="layers"></i></span></div><div class="stat-value">${money(model.unallocated)}</div><div class="stat-foot">Valor sem distribuição em rateios</div></article>
    </div>

    <section class="panel finance-report-table-panel">
      <div class="panel-title"><div><h3>Resumo por ${esc(groupOptions.find(item => item[0] === financialReportState.group)?.[1] || 'categoria')}</h3><small>Distribuição dos valores dentro dos filtros selecionados</small></div><button type="button" class="btn btn-light" id="exportFinanceSummary" ${hasPermission('despesas', 'exportar') ? '' : 'disabled'}><i data-lucide="download"></i> Exportar resumo</button></div>
      <div class="table-scroll"><table><thead><tr><th>Grupo</th><th>Despesas</th><th>Valor</th><th>Participação</th></tr></thead><tbody>${groupRows}</tbody></table></div>
      ${['veiculo','centro'].includes(financialReportState.group) && !hasPermission('rateios','visualizar') ? '<p class="finance-report-warning">Seu perfil não tem permissão para consultar rateios. A visão considera apenas os vínculos diretos das despesas.</p>' : ''}
    </section>

    <section class="panel finance-report-table-panel">
      <div class="panel-title"><div><h3>Lançamentos detalhados</h3><small>${Math.min(detailRows.length, 100)} de ${detailRows.length} lançamento(s) exibido(s)</small></div><button type="button" class="btn btn-light" id="exportFinanceDetails" ${hasPermission('despesas', 'exportar') ? '' : 'disabled'}><i data-lucide="download"></i> Exportar lançamentos</button></div>
      <div class="table-scroll"><table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Veículo</th><th>Fornecedor</th><th>Situação</th><th>Valor líquido</th></tr></thead><tbody>${detailHtml}</tbody></table></div>
    </section>

    <section class="panel finance-report-table-panel">
      <div class="panel-title"><div><h3>Outras exportações</h3><small>Baixe os dados dos módulos aos quais seu perfil tem acesso.</small></div></div>
      <div class="grid report-grid">${exportTiles || '<div class="empty">Seu perfil não possui permissões de exportação para outros módulos.</div>'}</div>
    </section>`;
}

function bindFinancialReportEvents(workspace) {
  const companySelect = workspace.querySelector('#financeReportCompany');
  const branchSelect = workspace.querySelector('#financeReportBranch');
  if (companySelect && branchSelect) companySelect.onchange = () => {
    const companyId = companySelect.value;
    financialReportState.companyId = companyId;
    financialReportState.branchId = '';
    const branches = financeReportRaw('filiais').filter(row => !companyId || String(row.empresa_id) === companyId);
    branchSelect.innerHTML = financeReportSelectOptions(branches, row => row.id, row => dbRowDisplay('filiais', row), '', 'Todas as filiais');
  };

  const apply = workspace.querySelector('#applyFinanceReport');
  if (apply) apply.onclick = () => {
    const from = workspace.querySelector('#financeReportFrom')?.value || '';
    const to = workspace.querySelector('#financeReportTo')?.value || '';
    if (from && to && from > to) { toast('A data inicial não pode ser posterior à data final.'); return; }
    financialReportState.from = from;
    financialReportState.to = to;
    financialReportState.companyId = workspace.querySelector('#financeReportCompany')?.value || '';
    financialReportState.branchId = workspace.querySelector('#financeReportBranch')?.value || '';
    financialReportState.category = workspace.querySelector('#financeReportCategory')?.value || '';
    financialReportState.status = workspace.querySelector('#financeReportStatus')?.value || '';
    financialReportState.group = workspace.querySelector('#financeReportGroup')?.value || 'categoria';
    workspace.innerHTML = reportsHtml();
    bindPageEvents(workspace);
    refreshIcons();
  };
  const clear = workspace.querySelector('#clearFinanceReport');
  if (clear) clear.onclick = () => {
    financialReportState.from = `${new Date().getFullYear()}-01-01`;
    financialReportState.to = D(0);
    financialReportState.companyId = '';
    financialReportState.branchId = '';
    financialReportState.category = '';
    financialReportState.status = '';
    financialReportState.group = 'categoria';
    workspace.innerHTML = reportsHtml();
    bindPageEvents(workspace);
    refreshIcons();
  };
  const exportSummary = workspace.querySelector('#exportFinanceSummary');
  if (exportSummary) exportSummary.onclick = () => {
    if (!hasPermission('despesas','exportar')) { toast('Seu perfil não permite exportar despesas.'); return; }
    const model = financeReportModel();
    financeReportCsv('npi-frota-resumo-financeiro.csv', ['Grupo','Despesas','Valor','Participação (%)'],
      model.groups.map(row => [row.label, row.count, row.value.toFixed(2).replace('.',','), (row.value / (model.total || 1) * 100).toFixed(2).replace('.',',')]));
  };
  const exportDetails = workspace.querySelector('#exportFinanceDetails');
  if (exportDetails) exportDetails.onclick = () => {
    if (!hasPermission('despesas','exportar')) { toast('Seu perfil não permite exportar despesas.'); return; }
    const rows = financeReportDetailRows(financeReportFilteredExpenses());
    financeReportCsv('npi-frota-lancamentos-financeiros.csv',
      ['Data','Categoria','Descrição','Veículo','Fornecedor','Centro de custo','Vencimento','Situação','Valor líquido'],
      rows.map(row => [row.date,row.category,row.description,row.vehicle,row.supplier,row.costCenter,row.due,row.status,row.value.toFixed(2).replace('.',',')]));
  };
}

// ---------- Administração de perfis, usuários e veículos atribuídos ----------

