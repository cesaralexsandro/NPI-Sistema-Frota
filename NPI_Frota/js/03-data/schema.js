/* NPI FROTA | Mapeamento das tabelas, colunas e relacionamentos do Supabase.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

/* =====================================================================
   4. DADOS (Supabase para cadastros-base)
   ===================================================================== */

// Os módulos listados abaixo usam o Supabase. Os demais serão conectados em etapas seguintes.
const READ_ONLY_MODULES = new Set(['utilizacoes', 'checklists']);

const DB_MODULES = new Set(['empresas', 'filiais', 'centros', 'projetos', 'veiculos', 'motoristas', 'fornecedores', 'oficinas', 'postos', 'retiradas', 'devolucoes', 'utilizacoes', 'checklists', 'modelos', 'itens', 'abastecimentos', 'manutencoes', 'pneus', 'movpneus', 'multas', 'documentos', 'seguros', 'sinistros', 'despesas', 'rateios', 'reservas']);

const SUPABASE_MODULES = {
  empresas: { table: 'empresas', columns: {
    'Razão social': 'razao_social', 'Nome fantasia': 'nome_fantasia', 'CNPJ': 'cnpj',
    'Telefone': 'telefone', 'E-mail': 'email', 'Endereço': 'endereco', 'Responsável': 'responsavel', 'Situação': 'situacao'
  }, required: ['Razão social'] },
  filiais: { table: 'filiais', columns: {
    'Empresa': 'empresa_id', 'Nome da filial': 'nome_filial', 'CNPJ': 'cnpj', 'Telefone': 'telefone',
    'Endereço': 'endereco', 'Responsável': 'responsavel', 'Situação': 'situacao'
  }, required: ['Empresa', 'Nome da filial'] },
  centros: { table: 'centros_custo', columns: {
    'Código': 'codigo', 'Descrição': 'descricao', 'Empresa': 'empresa_id', 'Filial': 'filial_id',
    'Centro de custo superior': 'centro_custo_superior_id', 'Responsável': 'responsavel', 'Situação': 'situacao'
  }, required: ['Código', 'Descrição', 'Empresa'] },
  projetos: { table: 'projetos', columns: {
    'Código do projeto': 'codigo_projeto', 'Nome': 'nome', 'Empresa': 'empresa_id', 'Centro de custo': 'centro_custo_id',
    'Data inicial': 'data_inicial', 'Data final': 'data_final', 'Responsável': 'responsavel', 'Situação': 'situacao'
  }, required: ['Código do projeto', 'Nome', 'Empresa'] },
  veiculos: { table: 'veiculos', columns: {
    'Código interno': 'codigo_interno', 'Placa': 'placa', 'Renavam': 'renavam', 'Chassi': 'chassi',
    'Marca': 'marca', 'Modelo': 'modelo', 'Ano de fabricação': 'ano_fabricacao', 'Ano modelo': 'ano_modelo',
    'Cor': 'cor', 'Categoria': 'categoria', 'Combustível': 'combustivel', 'Capacidade do tanque': 'capacidade_tanque',
    'Empresa': 'empresa_id', 'Filial': 'filial_id', 'Centro de custo': 'centro_custo_id', 'Projeto': 'projeto_id',
    'Proprietário': 'proprietario', 'Data de aquisição': 'data_aquisicao', 'Valor de aquisição': 'valor_aquisicao',
    'Quilometragem atual': 'quilometragem_atual', 'Situação': 'situacao'
  }, required: ['Código interno', 'Placa', 'Empresa'] },
  motoristas: { table: 'motoristas', columns: {
    'Nome completo': 'nome_completo', 'CPF': 'cpf', 'RG': 'rg', 'CNH': 'cnh', 'Categoria da CNH': 'categoria_cnh',
    'Validade da CNH': 'validade_cnh', 'Data de nascimento': 'data_nascimento', 'Telefone': 'telefone', 'E-mail': 'email',
    'Empresa': 'empresa_id', 'Filial': 'filial_id', 'Centro de custo': 'centro_custo_id',
    'Data de admissão': 'data_admissao', 'Situação': 'situacao'
  }, required: ['Nome completo', 'Empresa'] },
  fornecedores: { table: 'fornecedores', columns: {
    'Tipo de pessoa': 'tipo_pessoa', 'Razão social / Nome': 'razao_social', 'Nome fantasia': 'nome_fantasia',
    'CPF/CNPJ': 'cpf_cnpj', 'Inscrição estadual': 'inscricao_estadual', 'Categoria de fornecimento': 'categoria',
    'Telefone': 'telefone', 'E-mail': 'email', 'Contato principal': 'contato_principal', 'CEP': 'cep',
    'Endereço': 'endereco', 'Número': 'numero', 'Complemento': 'complemento', 'Bairro': 'bairro',
    'Cidade': 'cidade', 'UF': 'uf', 'Observações': 'observacoes', 'Situação': 'situacao'
  }, required: ['Tipo de pessoa', 'Razão social / Nome'] },
  oficinas: { table: 'oficinas', columns: {
    'Fornecedor vinculado': 'fornecedor_id', 'Nome da oficina': 'nome', 'CNPJ': 'cnpj', 'Telefone': 'telefone',
    'E-mail': 'email', 'Contato responsável': 'contato_responsavel', 'Especialidades': 'especialidades',
    'Prazo médio (dias)': 'prazo_medio_dias', 'CEP': 'cep', 'Endereço': 'endereco', 'Número': 'numero',
    'Complemento': 'complemento', 'Bairro': 'bairro', 'Cidade': 'cidade', 'UF': 'uf',
    'Observações': 'observacoes', 'Situação': 'situacao'
  }, required: ['Nome da oficina'] },
  postos: { table: 'postos_combustivel', columns: {
    'Fornecedor vinculado': 'fornecedor_id', 'Nome do posto': 'nome', 'CNPJ': 'cnpj', 'Bandeira': 'bandeira',
    'Telefone': 'telefone', 'E-mail': 'email', 'Contato': 'contato', 'CEP': 'cep', 'Endereço': 'endereco',
    'Número': 'numero', 'Complemento': 'complemento', 'Bairro': 'bairro', 'Cidade': 'cidade', 'UF': 'uf',
    'Observações': 'observacoes', 'Situação': 'situacao'
  }, required: ['Nome do posto'] },
  reservas: { table: 'reservas', columns: {
    'Solicitante': 'solicitante', 'Motorista': 'motorista_id', 'Veículo': 'veiculo_id',
    'Categoria do veículo': 'categoria_veiculo', 'Data/hora de retirada': 'data_hora_retirada',
    'Data/hora prevista de devolução': 'data_hora_devolucao_prevista', 'Destino': 'destino',
    'Finalidade': 'finalidade', 'Centro de custo': 'centro_custo_id', 'Situação': 'situacao',
    'Observações': 'observacoes'
  }, required: ['Solicitante', 'Data/hora de retirada', 'Data/hora prevista de devolução', 'Situação'] },
  retiradas: { table: 'retiradas', columns: {
    'Veículo': 'veiculo_id', 'Motorista': 'motorista_id', 'Data/hora da retirada': 'data_hora_retirada',
    'Quilometragem inicial': 'quilometragem_inicial', 'Nível de combustível': 'nivel_combustivel',
    'Destino': 'destino', 'Responsável pela liberação': 'responsavel_liberacao', 'Observações': 'observacoes',
    'Situação': 'situacao'
  }, required: ['Veículo', 'Motorista', 'Data/hora da retirada', 'Quilometragem inicial'] },
  devolucoes: { table: 'devolucoes', columns: {
    'Retirada vinculada': 'retirada_id', 'Data/hora da devolução': 'data_hora_devolucao',
    'Quilometragem final': 'quilometragem_final', 'Nível de combustível': 'nivel_combustivel',
    'Condições do veículo': 'condicoes_veiculo', 'Avarias identificadas': 'avarias_identificadas',
    'Responsável pelo recebimento': 'responsavel_recebimento'
  }, required: ['Retirada vinculada', 'Data/hora da devolução', 'Quilometragem final'] },
  utilizacoes: { table: 'utilizacoes', columns: {
    'Veículo': 'veiculo_id', 'Motorista': 'motorista_id', 'Data/hora de saída': 'data_saida',
    'Data/hora de retorno': 'data_retorno', 'Quilometragem inicial': 'quilometragem_inicial',
    'Quilometragem final': 'quilometragem_final', 'Destino': 'destino', 'Finalidade': 'finalidade',
    'Centro de custo': 'centro_custo_id', 'Projeto': 'projeto_id'
  }, required: ['Veículo', 'Data/hora de saída'] },
  checklists: { table: 'checklists', columns: {
    'Modelo de checklist': 'modelo_checklist_id', 'Veículo': 'veiculo_id', 'Motorista': 'motorista_id',
    'Tipo de checklist': 'tipo_checklist', 'Data/hora': 'data_hora', 'Resultado': 'resultado',
    'Observações': 'observacoes', 'Fotografias': 'fotografias', 'Responsável': 'responsavel'
  }, required: ['Veículo', 'Tipo de checklist', 'Data/hora'] },
  modelos: { table: 'modelos_checklist', columns: {
    'Nome do modelo': 'nome', 'Categoria de veículo': 'categoria_veiculo', 'Descrição': 'descricao',
    'Obrigatório na saída': 'obrigatorio_saida', 'Obrigatório na devolução': 'obrigatorio_devolucao',
    'Situação': 'situacao'
  }, required: ['Nome do modelo'] },
  itens: { table: 'itens_checklist', columns: {
    'Modelo de Checklist': 'modelo_checklist_id', 'Descrição do item': 'descricao', 'Grupo': 'grupo',
    'Tipo de resposta': 'tipo_resposta', 'Obrigatório': 'obrigatorio', 'Exige fotografia': 'exige_fotografia',
    'Ordem': 'ordem', 'Situação': 'situacao'
  }, required: ['Modelo de Checklist', 'Descrição do item'] },
  abastecimentos: { table: 'abastecimentos', columns: {
    'Veículo': 'veiculo_id', 'Motorista': 'motorista_id', 'Data/hora': 'data_hora',
    'Posto de combustível': 'posto_combustivel_id', 'Tipo de combustível': 'tipo_combustivel',
    'Quilometragem': 'quilometragem', 'Quantidade de litros': 'quantidade_litros',
    'Valor por litro': 'valor_litro', 'Valor total': 'valor_total',
    'Abastecimento completo?': 'abastecimento_completo', 'Centro de custo': 'centro_custo_id',
    'Projeto': 'projeto_id', 'Nota fiscal': 'nota_fiscal'
  }, required: ['Veículo', 'Data/hora', 'Quilometragem', 'Quantidade de litros', 'Valor por litro', 'Valor total', 'Abastecimento completo?'] },
  manutencoes: { table: 'manutencoes', columns: {
    'Veículo': 'veiculo_id', 'Tipo de manutenção': 'tipo_manutencao', 'Categoria da manutenção': 'categoria',
    'Data de abertura': 'data_abertura', 'Data de execução': 'data_execucao',
    'Quilometragem': 'quilometragem', 'Descrição do problema': 'descricao_problema',
    'Serviços realizados': 'servicos_realizados', 'Oficina': 'oficina_id', 'Peças utilizadas': 'pecas',
    'Valor das peças': 'valor_pecas', 'Mão de obra': 'mao_obra', 'Valor total': 'valor_total',
    'Próxima manutenção': 'proxima_manutencao', 'Quilometragem da próxima revisão': 'quilometragem_proxima_revisao',
    'Centro de custo': 'centro_custo_id', 'Projeto': 'projeto_id', 'Situação': 'situacao'
  }, required: ['Veículo', 'Tipo de manutenção', 'Data de abertura', 'Valor total'] },
  pneus: { table: 'pneus', columns: {
    'Código do pneu': 'codigo_pneu', 'Marca': 'marca', 'Modelo': 'modelo', 'Medida': 'medida',
    'DOT': 'dot', 'Número de série': 'numero_serie', 'Data de aquisição': 'data_aquisicao',
    'Valor de compra': 'valor_compra', 'Fornecedor': 'fornecedor_id', 'Quilometragem inicial': 'quilometragem_inicial',
    'Veículo atual': 'veiculo_atual_id', 'Posição atual': 'posicao_atual',
    'Profundidade inicial (mm)': 'sulco_inicial_mm', 'Profundidade atual (mm)': 'sulco_atual_mm',
    'Pressão recomendada (PSI)': 'pressao_recomendada_psi', 'Pressão atual (PSI)': 'pressao_atual_psi',
    'Vida útil estimada (km)': 'vida_util_estimada_km', 'Recapagens realizadas': 'recapagens',
    'Local de armazenamento': 'localizacao_estoque', 'Situação': 'situacao'
  }, required: ['Código do pneu', 'Medida'] },
  movpneus: { table: 'movimentacoes_pneus', columns: {
    'Pneu': 'pneu_id', 'Veículo': 'veiculo_id', 'Posição de instalação': 'posicao_instalacao',
    'Data': 'data_movimentacao', 'Quilometragem': 'quilometragem', 'Tipo de movimentação': 'tipo_movimentacao',
    'Número da recapagem': 'numero_recapagem', 'Custo da movimentação (R$)': 'custo', 'Motivo': 'motivo', 'Responsável': 'responsavel', 'Profundidade do sulco (mm)': 'sulco_mm',
    'Pressão aferida (PSI)': 'pressao_psi', 'Observações': 'observacoes'
  }, required: ['Pneu', 'Data', 'Tipo de movimentação'] },
  multas: { table: 'multas', columns: {
    'Auto de infração': 'auto_infracao', 'Veículo': 'veiculo_id', 'Motorista responsável': 'motorista_id',
    'Órgão autuador': 'orgao_autuador', 'Código da infração': 'codigo_infracao', 'Descrição': 'descricao',
    'Data/hora': 'data_hora', 'Local': 'local_infracao', 'Valor': 'valor',
    'Vencimento': 'vencimento', 'Prazo para indicação': 'prazo_indicacao', 'Situação': 'situacao'
  }, required: ['Auto de infração', 'Veículo', 'Data/hora', 'Valor'] },
  documentos: { table: 'documentos', columns: {
    'Veículo': 'veiculo_id', 'Tipo de documento': 'tipo_documento', 'Ano de referência': 'ano_referencia',
    'Número': 'numero', 'Data de emissão': 'data_emissao', 'Data de validade': 'data_validade',
    'Valor pago': 'valor_pago', 'Data de pagamento': 'data_pagamento', 'Arquivo digital': 'arquivo_path',
    'Responsável': 'responsavel', 'Situação': 'situacao', 'Observações': 'observacoes'
  }, required: ['Veículo', 'Tipo de documento'] },
  seguros: { table: 'seguros', columns: {
    'Veículo': 'veiculo_id', 'Tipo de seguro': 'tipo_seguro', 'Seguradora': 'seguradora', 'Número da apólice': 'numero_apolice',
    'Corretora': 'corretora', 'Telefone da assistência 24h': 'telefone_assistencia', 'Início da vigência': 'inicio_vigencia',
    'Fim da vigência': 'fim_vigencia', 'Valor do prêmio (R$)': 'valor_premio', 'Valor segurado (R$)': 'valor_segurado',
    'Franquia (R$)': 'franquia', 'Coberturas': 'coberturas', 'Arquivo da apólice': 'arquivo_apolice_path',
    'Situação': 'situacao', 'Observações': 'observacoes'
  }, required: ['Veículo', 'Seguradora', 'Número da apólice', 'Início da vigência', 'Fim da vigência'] },
  sinistros: { table: 'sinistros', columns: {
    'Veículo': 'veiculo_id', 'Seguro vinculado': 'seguro_id', 'Motorista envolvido': 'motorista_id',
    'Tipo de sinistro': 'tipo_sinistro', 'Data/hora da ocorrência': 'data_hora_ocorrencia',
    'Data do aviso à seguradora': 'data_aviso_seguradora', 'Local da ocorrência': 'local_ocorrencia',
    'Descrição do ocorrido': 'descricao', 'Houve terceiros envolvidos?': 'terceiros_envolvidos',
    'Número do B.O.': 'numero_bo', 'Número do sinistro': 'numero_sinistro', 'Valor estimado dos danos (R$)': 'valor_estimado',
    'Valor da franquia (R$)': 'valor_franquia', 'Valor da indenização (R$)': 'valor_indenizacao',
    'Oficina responsável': 'oficina_id', 'Situação': 'situacao', 'Data de encerramento': 'data_encerramento',
    'Anexo do sinistro': 'arquivo_path', 'Observações': 'observacoes'
  }, required: ['Veículo', 'Seguro vinculado', 'Tipo de sinistro', 'Data/hora da ocorrência', 'Descrição do ocorrido'] },
  despesas: { table: 'despesas', columns: {
    'Data de lançamento': 'data_lancamento', 'Vencimento': 'vencimento', 'Data de pagamento': 'data_pagamento',
    'Empresa': 'empresa_id', 'Filial': 'filial_id', 'Veículo': 'veiculo_id', 'Categoria da despesa': 'categoria',
    'Fornecedor': 'fornecedor_id', 'Descrição': 'descricao', 'Documento fiscal': 'documento_fiscal',
    'Valor bruto': 'valor_bruto', 'Desconto': 'desconto', 'Juros': 'juros', 'Valor líquido': 'valor_liquido',
    'Forma de pagamento': 'forma_pagamento', 'Situação': 'situacao', 'Centro de custo': 'centro_custo_id',
    'Projeto': 'projeto_id', 'Observações': 'observacoes'
  }, required: ['Data de lançamento', 'Empresa', 'Categoria', 'Descrição', 'Valor bruto'] },
  rateios: { table: 'rateios', columns: {
    'Despesa vinculada': 'despesa_id', 'Critério de rateio': 'criterio_rateio', 'Veículo': 'veiculo_id',
    'Centro de custo': 'centro_custo_id', 'Projeto': 'projeto_id', 'Percentual': 'percentual',
    'Valor': 'valor', 'Observações': 'observacoes'
  }, required: ['Despesa vinculada', 'Critério de rateio'] }

};

const RELATION_FIELDS = {
  'Empresa': { module: 'empresas', column: 'id', display: r => r['Nome fantasia'] || r['Razão social'] },
  'Filial': { module: 'filiais', column: 'id', display: r => r['Nome da filial'] },
  'Centro de custo': { module: 'centros', column: 'id', display: r => `${r.Código} - ${r.Descrição}` },
  'Centro de custo superior': { module: 'centros', column: 'id', display: r => `${r.Código} - ${r.Descrição}` },
  'Projeto': { module: 'projetos', column: 'id', display: r => `${r['Código do projeto']} - ${r.Nome}` },
  'Veículo': { module: 'veiculos', column: 'id', display: r => `${r['Código interno']} · ${r.Marca || ''} ${r.Modelo || ''} (${r.Placa})`.trim() },
  'Motorista': { module: 'motoristas', column: 'id', display: r => r['Nome completo'] },
  'Motorista responsável': { module: 'motoristas', column: 'id', display: r => r['Nome completo'] },
  'Fornecedor vinculado': { module: 'fornecedores', column: 'id', display: r => r['Nome fantasia'] || r['Razão social / Nome'] },
  'Fornecedor': { module: 'fornecedores', column: 'id', display: r => r['Nome fantasia'] || r['Razão social / Nome'] },
  'Oficina': { module: 'oficinas', column: 'id', display: r => r['Nome da oficina'] },
  'Posto de combustível': { module: 'postos', column: 'id', display: r => r['Nome do posto'] },
  'Retirada vinculada': { module: 'retiradas', column: 'id', display: r => `${r['Veículo']} — ${r['Motorista']} · ${r['Data/hora da retirada']}` },
  'Pneu': { module: 'pneus', column: 'id', display: r => `${r['Código do pneu']} · ${r.Marca || ''} ${r.Modelo || ''} (${r.Medida || ''})`.trim() },
  'Modelo de checklist': { module: 'modelos', column: 'id', display: r => r['Nome do modelo'] || '' },
  'Modelo de Checklist': { module: 'modelos', column: 'id', display: r => r['Nome do modelo'] || '' },
  'Seguro vinculado': { module: 'seguros', column: 'id', display: r => `${r['Número da apólice'] || 'Apólice sem número'} · ${r.Seguradora || ''} (${r['Veículo'] || ''})`.trim() },
  'Despesa vinculada': { module: 'despesas', column: 'id', display: r => `${r['Data de lançamento'] || ''} · ${r.Categoria || 'Despesa'} · ${r.Descrição || ''} (${money(r['Valor líquido'] || 0)}) · ${String(r.id || '').slice(0,8)}`.trim() },
  'Motorista envolvido': { module: 'motoristas', column: 'id', display: r => r['Nome completo'] },
  'Oficina responsável': { module: 'oficinas', column: 'id', display: r => r['Nome da oficina'] },
  'Veículo atual': { module: 'veiculos', column: 'id', display: r => `${r['Código interno']} · ${r.Marca || ''} ${r.Modelo || ''} (${r.Placa || ''})`.trim() }
};

function createEmptyDatabase() {
  const data = {};
  Object.keys(fields).forEach(module => { data[module] = []; });
  return { seq: 0, data };
}
let db = createEmptyDatabase();
const saveDatabase = () => {}; // módulos conectados não gravam mais no localStorage
const recordsOf = module => db.data[module] || (db.data[module] = []);
let currentUser = null;
let currentProfile = null;
let currentCompanyName = 'NPI Tecnologia';
let currentRoleNames = [];
let currentPermissions = {};

// Rótulos dos módulos usados na matriz de permissões do administrador.
const MODULE_DEFS = {
  dashboard:'Dashboard gerencial', painel_motorista:'Painel do motorista', empresas:'Empresas', filiais:'Filiais',
  centros:'Centros de custo', veiculos:'Veículos', motoristas:'Motoristas',
  fornecedores:'Fornecedores', oficinas:'Oficinas', reservas:'Reservas',
  retiradas:'Retiradas', devolucoes:'Devoluções', utilizacoes:'Utilizações', checklists:'Checklists', modelos:'Modelos de checklist',
  itens:'Itens de checklist', abastecimentos:'Abastecimentos', manutencoes:'Manutenções', pneus:'Pneus', movpneus:'Movimentações de pneus',
  multas:'Multas', documentos:'Documentos', seguros:'Seguros', sinistros:'Sinistros', despesas:'Despesas', rateios:'Rateios', relatorios:'Relatórios',
  usuarios:'Usuários', perfis:'Perfis e permissões', notificacoes:'Notificações', atribuicoes_motoristas:'Veículos por motorista', auditoria:'Auditoria'
};
const PERMISSION_ACTIONS = [
  ['visualizar','Visualizar'],['incluir','Incluir'],['alterar','Alterar'],['excluir','Excluir'],['aprovar','Aprovar'],['exportar','Exportar']
];

