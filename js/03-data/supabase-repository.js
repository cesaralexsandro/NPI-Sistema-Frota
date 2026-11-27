/* NPI FROTA | Leitura, conversão e gravação dos cadastros conectados.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

function dbRowDisplay(module, row, rawRows = {}) {
  if (!row) return '';
  if (module === 'empresas') return row.nome_fantasia || row.razao_social || '';
  if (module === 'filiais') return row.nome_filial || '';
  if (module === 'centros') return `${row.codigo || ''} - ${row.descricao || ''}`.trim();
  if (module === 'projetos') return `${row.codigo_projeto || ''} - ${row.nome || ''}`.trim();
  if (module === 'veiculos') return `${row.codigo_interno || ''} · ${row.marca || ''} ${row.modelo || ''} (${row.placa || ''})`.trim();
  if (module === 'motoristas') return row.nome_completo || '';
  if (module === 'modelos') return row.nome || '';
  if (module === 'itens') {
    const model = (rawRows.modelos || []).find(item => item.id === row.modelo_checklist_id);
    return `${row.descricao || 'Item'} · ${model?.nome || 'Modelo não informado'}`;
  }
  if (module === 'utilizacoes') {
    const vehicle = (rawRows.veiculos || []).find(item => item.id === row.veiculo_id);
    const driver = (rawRows.motoristas || []).find(item => item.id === row.motorista_id);
    return `${vehicle ? dbRowDisplay('veiculos', vehicle, rawRows) : 'Veículo'} — ${driver?.nome_completo || 'Motorista'} · ${row.data_saida || ''}`;
  }
  if (module === 'checklists') {
    const vehicle = (rawRows.veiculos || []).find(item => item.id === row.veiculo_id);
    const driver = (rawRows.motoristas || []).find(item => item.id === row.motorista_id);
    return `${row.tipo_checklist || 'Checklist'} — ${vehicle ? dbRowDisplay('veiculos', vehicle, rawRows) : 'Veículo'} · ${driver?.nome_completo || 'Motorista'}`;
  }
  if (module === 'despesas') return `${row.data_lancamento || ''} · ${row.categoria || 'Despesa'} · ${row.descricao || ''} (${money(row.valor_liquido || 0)})`.trim();
  if (module === 'rateios') {
    const expense = (rawRows.despesas || []).find(item => item.id === row.despesa_id);
    return `${expense ? dbRowDisplay('despesas', expense, rawRows) : 'Despesa'} · ${row.criterio_rateio || ''} · ${Number(row.percentual || 0).toLocaleString('pt-BR')}%`;
  }
  if (module === 'seguros') {
    const vehicle = (rawRows.veiculos || []).find(item => item.id === row.veiculo_id);
    const vehicleLabel = vehicle ? dbRowDisplay('veiculos', vehicle, rawRows) : '';
    return `${row.numero_apolice || 'Apólice sem número'} · ${row.seguradora || ''} (${vehicleLabel})`.trim();
  }
  if (module === 'fornecedores') return row.nome_fantasia || row.razao_social || '';
  if (module === 'oficinas') return row.nome || '';
  if (module === 'postos') return row.nome || '';
  if (module === 'pneus') return `${row.codigo_pneu || ''} · ${row.marca || ''} ${row.modelo || ''} (${row.medida || ''})`.trim();
  if (module === 'movpneus') {
    const tire = (rawRows.pneus || []).find(item => item.id === row.pneu_id);
    const vehicle = (rawRows.veiculos || []).find(item => item.id === row.veiculo_id);
    return `${tire ? dbRowDisplay('pneus', tire, rawRows) : 'Pneu'} — ${vehicle ? dbRowDisplay('veiculos', vehicle, rawRows) : 'Sem veículo'} · ${row.tipo_movimentacao || ''}`;
  }
  if (module === 'retiradas') {
    const vehicle = (rawRows.veiculos || []).find(item => item.id === row.veiculo_id);
    const driver = (rawRows.motoristas || []).find(item => item.id === row.motorista_id);
    return `${vehicle ? dbRowDisplay('veiculos', vehicle, rawRows) : 'Veículo'} — ${driver ? driver.nome_completo : 'Motorista'} · ${row.data_hora_retirada || ''}`;
  }
  return '';
}

function mapSupabaseRow(module, row, rawRows) {
  const config = SUPABASE_MODULES[module];
  const record = { id: row.id };
  Object.entries(config.columns).forEach(([label, column]) => {
    const relation = RELATION_FIELDS[label];
    if (relation && column.endsWith('_id')) {
      const refRow = (rawRows[relation.module] || []).find(item => item.id === row[column]);
      const cachedRef = recordsOf(relation.module).find(item => item.id === row[column]);
      const legacySnapshot = module === 'pneus' && label === 'Fornecedor' ? row.fornecedor
        : module === 'manutencoes' && label === 'Oficina' ? row.oficina
        : module === 'abastecimentos' && label === 'Posto de combustível' ? row.posto_combustivel
        : module === 'despesas' && label === 'Fornecedor' ? row.fornecedor
        : '';
      // Ao atualizar apenas um módulo, usa os relacionamentos já carregados em memória.
      record[label] = refRow ? dbRowDisplay(relation.module, refRow, rawRows)
        : cachedRef ? relation.display(cachedRef) : (legacySnapshot || '');
    } else if (fieldType(label) === 'bool') {
      record[label] = row[column] === true ? 'Sim' : 'Não';
    } else {
      record[label] = row[column] == null ? '' : row[column];
    }
  });
  return record;
}

// Cache em memória por módulo: evita recarregar tabelas inteiras ao navegar.
const SUPABASE_DATA_TTL_MS = 45_000;
const SUPABASE_QUERY_PAGE_SIZE = 500;
const supabaseModuleLoadedAt = new Map();
const supabaseModulePromises = new Map();
const supabaseRawModuleRows = new Map();
let supabaseCacheGeneration = 0;

// O Dashboard só precisa dos módulos que realmente alimentam os indicadores atuais.
const DASHBOARD_DATA_MODULES = ['empresas', 'veiculos', 'motoristas', 'abastecimentos', 'manutencoes', 'pneus', 'multas', 'documentos', 'seguros', 'sinistros', 'despesas'];

function getPageDataModules(pageKey) {
  if (pageKey === 'dashboard') return [...DASHBOARD_DATA_MODULES];
  if (pageKey === 'relatorios') return ['despesas', 'rateios'];
  if (pageKey === 'localizacao_pneus') return ['pneus', 'movpneus', 'veiculos'];
  return SUPABASE_MODULES[pageKey] ? [pageKey] : [];
}

function collectSupabaseModuleDependencies(requestedModules) {
  const collected = new Set();
  const visit = module => {
    if (!module || collected.has(module) || !SUPABASE_MODULES[module]) return;
    collected.add(module);
    Object.keys(SUPABASE_MODULES[module].columns).forEach(label => {
      const relation = RELATION_FIELDS[label];
      if (relation?.module) visit(relation.module);
    });
  };
  requestedModules.forEach(visit);
  return [...collected];
}

function isSupabaseModuleFresh(module) {
  const loadedAt = supabaseModuleLoadedAt.get(module);
  return Boolean(loadedAt && Date.now() - loadedAt < SUPABASE_DATA_TTL_MS);
}

function areSupabaseModulesFresh(modules, options = {}) {
  const expanded = options.includeDependencies === false ? [...new Set(modules || [])] : collectSupabaseModuleDependencies(modules);
  return expanded.every(module => !hasPermission(module, 'visualizar') || isSupabaseModuleFresh(module));
}

function clearSupabaseDataCache() {
  // Invalida também respostas assíncronas iniciadas por uma sessão anterior.
  supabaseCacheGeneration += 1;
  supabaseModuleLoadedAt.clear();
  supabaseModulePromises.clear();
  supabaseRawModuleRows.clear();
  Object.keys(SUPABASE_MODULES).forEach(module => { db.data[module] = []; });
}

async function fetchSupabaseModuleRows(module) {
  const config = SUPABASE_MODULES[module];
  const extraColumns = {
    pneus: ['fornecedor'],
    despesas: ['fornecedor'],
    manutencoes: ['oficina'],
    abastecimentos: ['posto_combustivel']
  }[module] || [];
  const columns = [...new Set(['id', ...Object.values(config.columns), ...extraColumns, 'created_at'])];
  const rows = [];
  for (let offset = 0; ; offset += SUPABASE_QUERY_PAGE_SIZE) {
    let query = window.npiSupabase.from(config.table)
      .select(columns.join(','))
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + SUPABASE_QUERY_PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Não foi possível carregar ${pageMeta[module][0]}: ${error.message}`);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < SUPABASE_QUERY_PAGE_SIZE) break;
  }
  return rows;
}

async function loadSingleSupabaseModule(module) {
  if (supabaseModulePromises.has(module)) return supabaseModulePromises.get(module);
  const promise = (async () => {
    if (!hasPermission(module, 'visualizar')) {
      db.data[module] = [];
      supabaseModuleLoadedAt.set(module, Date.now());
      return [];
    }
    const rows = await fetchSupabaseModuleRows(module);
    return rows;
  })();
  supabaseModulePromises.set(module, promise);
  try {
    return await promise;
  } finally {
    if (supabaseModulePromises.get(module) === promise) supabaseModulePromises.delete(module);
  }
}

async function loadSupabaseData(options = {}) {
  const generation = supabaseCacheGeneration;
  const requested = options.modules ? [...new Set(options.modules)] : Object.keys(SUPABASE_MODULES);
  const modules = options.includeDependencies === false
    ? requested.filter(module => Boolean(SUPABASE_MODULES[module]))
    : collectSupabaseModuleDependencies(requested);
  const forceModules = new Set(options.forceModules || (options.force ? modules : []));
  const toLoad = modules.filter(module => forceModules.has(module) || !isSupabaseModuleFresh(module));
  if (!toLoad.length) return;

  // Consultas independentes executadas em paralelo; cada tabela é paginada para
  // não depender do limite máximo padrão de linhas da API REST do Supabase.
  const loadedRows = await Promise.all(toLoad.map(async module => {
    const rows = await loadSingleSupabaseModule(module);
    return [module, rows];
  }));
  if (generation !== supabaseCacheGeneration) return;
  loadedRows.forEach(([module, rows]) => {
    supabaseRawModuleRows.set(module, rows);
    supabaseModuleLoadedAt.set(module, Date.now());
  });

  // Guarda as linhas brutas em memória e remapeia também módulos que dependem
  // de uma tabela recém-carregada. Assim, um Dashboard leve pode carregar só
  // os indicadores e completar os nomes de relacionamentos ao abrir cada módulo.
  const rawRows = Object.fromEntries(supabaseRawModuleRows);
  const newlyLoaded = new Set(toLoad);
  const modulesToRemap = new Set(toLoad);
  for (const cachedModule of supabaseRawModuleRows.keys()) {
    const directDependencies = Object.keys(SUPABASE_MODULES[cachedModule].columns)
      .map(label => RELATION_FIELDS[label]?.module).filter(Boolean);
    if (directDependencies.some(dependency => newlyLoaded.has(dependency))) modulesToRemap.add(cachedModule);
  }
  modulesToRemap.forEach(module => {
    const rows = supabaseRawModuleRows.get(module) || [];
    db.data[module] = rows.map(row => mapSupabaseRow(module, row, rawRows));
  });
}

async function ensureSupabaseModulesLoaded(modules, options = {}) {
  if (!modules?.length) return;
  return loadSupabaseData({
    modules,
    forceModules: options.forceModules || [],
    includeDependencies: options.includeDependencies !== false
  });
}

function getInitialModulesForPage(pageKey) {
  const modules = new Set(['empresas', ...getPageDataModules(pageKey)]);
  return [...modules];
}

async function refreshSupabaseAfterMutation(module) {
  const relatedRefresh = {
    retiradas: ['retiradas', 'utilizacoes', 'checklists', 'veiculos'],
    devolucoes: ['devolucoes', 'retiradas', 'utilizacoes', 'checklists', 'veiculos'],
    modelos: ['modelos', 'itens'],
    itens: ['itens'],
    abastecimentos: ['abastecimentos', 'veiculos'],
    manutencoes: ['manutencoes', 'veiculos'],
    movpneus: ['movpneus', 'pneus', 'veiculos'],
    seguros: ['seguros', 'sinistros'],
    sinistros: ['sinistros'],
    despesas: ['despesas', 'rateios'],
    rateios: ['rateios']
  };
  const forceModules = relatedRefresh[module] || [module];
  return ensureSupabaseModulesLoaded(forceModules, { forceModules });
}

function buildSupabasePayload(module, formRecord) {
  const config = SUPABASE_MODULES[module];
  const payload = {};
  for (const [label, column] of Object.entries(config.columns)) {
    // Campos retirados da interface não devem ser enviados como NULL ao editar um registro.
    // Assim, colunas legadas (ex.: projeto/posto) e seus dados existentes são preservados.
    if (!Object.prototype.hasOwnProperty.call(formRecord, label)) continue;
    // Estado operacional do pneu é controlado exclusivamente pelo histórico de movimentações.
    if (module === 'pneus' && ['Quilometragem inicial', 'Veículo atual', 'Posição atual', 'Profundidade atual (mm)', 'Pressão atual (PSI)', 'Recapagens realizadas', 'Situação'].includes(label)) continue;
    const value = formRecord[label] == null ? '' : String(formRecord[label]).trim();
    const relation = RELATION_FIELDS[label];
    if (relation && column.endsWith('_id')) {
      if (!value) {
        if (config.required.includes(label)) throw new Error(`Selecione um cadastro no campo "${label}".`);
        payload[column] = null;
        if (module === 'pneus' && label === 'Fornecedor') payload.fornecedor = null;
        if (module === 'manutencoes' && label === 'Oficina') payload.oficina = null;
        if (module === 'abastecimentos' && label === 'Posto de combustível') payload.posto_combustivel = null;
        continue;
      }
      const ref = recordsOf(relation.module).find(item => relation.display(item) === value);
      if (!ref) {
        const legacyColumn = module === 'pneus' && label === 'Fornecedor' ? 'fornecedor'
          : module === 'manutencoes' && label === 'Oficina' ? 'oficina'
          : module === 'abastecimentos' && label === 'Posto de combustível' ? 'posto_combustivel'
          : null;
        if (legacyColumn) {
          // Compatibilidade com registros anteriores que guardavam o nome como texto.
          payload[column] = null;
          payload[legacyColumn] = value;
          continue;
        }
        throw new Error(`Selecione um cadastro válido no campo "${label}".`);
      }
      payload[column] = ref.id;
      if (module === 'pneus' && label === 'Fornecedor') payload.fornecedor = relation.display(ref);
      if (module === 'manutencoes' && label === 'Oficina') payload.oficina = relation.display(ref);
      if (module === 'abastecimentos' && label === 'Posto de combustível') payload.posto_combustivel = relation.display(ref);
      continue;
    }
    if (value === '') {
      if (config.required.includes(label)) throw new Error(`Preencha o campo obrigatório: ${label}.`);
      if (label === 'Situação') continue; // usa o padrão definido no banco
      // A tabela manutencoes mantém os custos como NOT NULL; campos vazios equivalem a R$ 0,00.
      if (module === 'manutencoes' && ['Valor das peças', 'Mão de obra'].includes(label)) {
        payload[column] = 0;
        continue;
      }
      if (module === 'despesas' && ['Desconto', 'Juros'].includes(label)) {
        payload[column] = 0;
        continue;
      }
      payload[column] = null;
      continue;
    }
    if (fieldType(label) === 'datetime-local') {
      // Converte o horario local do navegador para ISO com fuso explicito antes de gravar timestamptz.
      const dateValue = new Date(value);
      if (Number.isNaN(dateValue.getTime())) throw new Error(`Data/hora inválida no campo "${label}".`);
      payload[column] = dateValue.toISOString();
    } else if (fieldType(label) === 'number') {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) throw new Error(`Valor inválido no campo "${label}".`);
      payload[column] = numberValue;
    } else if (fieldType(label) === 'bool') {
      payload[column] = value.toLowerCase() === 'sim' || value.toLowerCase() === 'true';
    } else {
      payload[column] = value;
    }
  }
  return payload;
}

