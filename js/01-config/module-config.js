/* NPI FROTA | Configuração dos módulos, menus, campos e opções.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

/* =====================================================================
   NPI FROTA — configuração dos módulos
   Sistema de gestão de frotas conectado ao Supabase nos módulos-base.

   Organização do arquivo:
     1. Dados dos módulos (títulos e campos de cada tela)
     2. Configurações do sistema (menu, situações, cores, colunas)
     3. Funções auxiliares
     4. Dados (Supabase + estado em memória)
     5. Estado da tela
     6. Menu lateral
     7. Telas (lista/Kanban, dashboard, relatórios)
     8. Formulário (criar / editar / excluir)
     9. Exportar CSV
    10. Tema claro/escuro
    11. Inicialização
   ===================================================================== */

/* =====================================================================
   1. DADOS DOS MÓDULOS
   pageMeta: [título, subtítulo] de cada página.
   fields:   campos do formulário de cada módulo (na ordem em que aparecem).
   ===================================================================== */

const pageMeta = {
  dashboard:['Dashboard','Acompanhe os indicadores gerenciais e a situação operacional da frota.'],
  painel_motorista:['Meu Painel','Consulte somente os veículos atribuídos a você e a quilometragem atual.'],
  empresas:['Empresas','Gerencie as empresas vinculadas à operação.'],
  filiais:['Filiais','Organize as unidades e filiais da empresa.'],
  centros:['Centros de Custo','Classifique despesas e utilizações por departamento.'],
  projetos:['Projetos','Vincule veículos e despesas a projetos.'],
  veiculos:['Veículos','Cadastro, situação e informações completas dos veículos.'],
  motoristas:['Motoristas','Gerencie condutores, CNH e autorizações.'],
  fornecedores:['Fornecedores','Cadastre fornecedores de peças, serviços, pneus e outros materiais.'],
  oficinas:['Oficinas','Cadastre oficinas e prestadores responsáveis pelas manutenções.'],
  postos:['Postos de Combustível','Cadastre os postos utilizados nos abastecimentos da frota.'],
  reservas:['Reservas','Solicitações e aprovações de veículos.'],
  retiradas:['Retirada de Veículo','Registre a entrega do veículo ao motorista.'],
  devolucoes:['Devolução','Registre o retorno, quilometragem e condições do veículo.'],
  utilizacoes:['Utilizações','Histórico de utilização e quilometragem da frota.'],
  checklists:['Checklists','Inspeções de saída e retorno dos veículos.'],
  modelos:['Modelos de Checklist','Configure modelos por categoria de veículo.'],
  itens:['Itens de Checklist','Cadastre os itens de inspeção.'],
  abastecimentos:['Abastecimentos','Controle litros, valores, consumo e comprovantes.'],
  manutencoes:['Manutenções','Acompanhe manutenções preventivas e corretivas.'],
  pneus:['Pneus','Controle estoque, instalação e vida útil dos pneus.'],
  movpneus:['Movimentações de Pneus','Histórico cronológico de instalação, rodízio, remoção, reparo e recapagem.'],
  localizacao_pneus:['Localização dos Pneus','Consulte onde cada pneu está atualmente, em qual veículo, posição ou local de estoque.'],
  multas:['Multas','Controle infrações, condutores, prazos e pagamentos.'],
  documentos:['Documentos','Gerencie documentos e vencimentos dos veículos.'],
  seguros:['Seguros','Controle apólices, coberturas, vigências e seguradoras.'],
  sinistros:['Sinistros','Registre ocorrências, avisos à seguradora, danos, franquias e indenizações.'],
  despesas:['Despesas','Controle os gastos e pagamentos relacionados à frota.'],
  rateios:['Rateios','Distribua despesas por veículos e centros de custo.'],
  relatorios:['Relatórios com filtros','Consulte e exporte informações gerenciais.'],
  usuarios:['Usuários e Acessos','Cadastre usuários no Supabase e atribua perfil, motorista e situação.'],
  perfis:['Perfis e Permissões','Configure o que cada perfil pode visualizar, incluir, alterar, excluir, aprovar e exportar.'],
  atribuicoes_motoristas:['Veículos por Motorista','Defina quais veículos cada motorista pode consultar.'],
  auditoria:['Auditoria','Consulte o histórico de operações realizadas.'],
  notificacoes:['Notificações','Envie comunicados, avisos de sistema e atualizações aos usuários.'],
  sem_acesso:['Acesso não configurado','Seu usuário ainda não possui permissões para abrir módulos do sistema.'],
  trocar:['Trocar usuário','Escolha uma conta já utilizada neste computador ou entre com outro usuário.'],
  sair:['Sair','Encerre sua sessão com segurança.']
};

const fields = {
  empresas:['Razão social','Nome fantasia','CNPJ','Telefone','E-mail','Endereço','Responsável','Situação'],
  filiais:['Empresa','Nome da filial','CNPJ','Telefone','Endereço','Responsável','Situação'],
  centros:['Código','Descrição','Empresa','Filial','Centro de custo superior','Responsável','Situação'],
  projetos:['Código do projeto','Nome','Empresa','Centro de custo','Data inicial','Data final','Responsável','Situação'],
  veiculos:['Código interno','Placa','Renavam','Chassi','Marca','Modelo','Ano de fabricação','Ano modelo','Cor','Categoria','Combustível','Capacidade do tanque','Empresa','Filial','Centro de custo','Proprietário','Data de aquisição','Valor de aquisição','Quilometragem atual','Situação'],
  motoristas:['Nome completo','CPF','RG','CNH','Categoria da CNH','Validade da CNH','Data de nascimento','Telefone','E-mail','Empresa','Filial','Centro de custo','Data de admissão','Situação'],
  fornecedores:['Tipo de pessoa','Razão social / Nome','Nome fantasia','CPF/CNPJ','Inscrição estadual','Categoria de fornecimento','Telefone','E-mail','Contato principal','CEP','Endereço','Número','Complemento','Bairro','Cidade','UF','Observações','Situação'],
  oficinas:['Fornecedor vinculado','Nome da oficina','CNPJ','Telefone','E-mail','Contato responsável','Especialidades','Prazo médio (dias)','CEP','Endereço','Número','Complemento','Bairro','Cidade','UF','Observações','Situação'],
  postos:['Fornecedor vinculado','Nome do posto','CNPJ','Bandeira','Telefone','E-mail','Contato','CEP','Endereço','Número','Complemento','Bairro','Cidade','UF','Observações','Situação'],
  reservas:['Solicitante','Motorista','Veículo','Categoria do veículo','Data/hora de retirada','Data/hora prevista de devolução','Destino','Finalidade','Centro de custo','Situação','Observações'],
  retiradas:['Veículo','Motorista','Data/hora da retirada','Quilometragem inicial','Nível de combustível','Destino','Responsável pela liberação','Observações'],
  devolucoes:['Retirada vinculada','Data/hora da devolução','Quilometragem final','Nível de combustível','Condições do veículo','Avarias identificadas','Responsável pelo recebimento'],
  utilizacoes:['Veículo','Motorista','Data/hora de saída','Data/hora de retorno','Quilometragem inicial','Quilometragem final','Destino','Finalidade','Centro de custo'],
  checklists:['Modelo de checklist','Veículo','Motorista','Tipo de checklist','Data/hora','Resultado','Observações','Fotografias','Responsável'],
  modelos:['Nome do modelo','Categoria de veículo','Descrição','Obrigatório na saída','Obrigatório na devolução','Situação'],
  itens:['Modelo de Checklist','Descrição do item','Grupo','Tipo de resposta','Obrigatório','Exige fotografia','Ordem','Situação'],
  abastecimentos:['Veículo','Motorista','Data/hora','Tipo de combustível','Quilometragem','Quantidade de litros','Valor por litro','Valor total','Abastecimento completo?','Centro de custo','Nota fiscal'],
  manutencoes:['Veículo','Tipo de manutenção','Categoria da manutenção','Data de abertura','Data de execução','Quilometragem','Descrição do problema','Serviços realizados','Oficina','Peças utilizadas','Valor das peças','Mão de obra','Valor total','Próxima manutenção','Quilometragem da próxima revisão','Centro de custo','Situação'],
  pneus:['Código do pneu','Marca','Modelo','Medida','DOT','Número de série','Data de aquisição','Valor de compra','Fornecedor','Quilometragem inicial','Veículo atual','Posição atual','Profundidade inicial (mm)','Profundidade atual (mm)','Pressão recomendada (PSI)','Pressão atual (PSI)','Vida útil estimada (km)','Recapagens realizadas','Local de armazenamento','Situação'],
  movpneus:['Pneu','Veículo','Posição de instalação','Data','Quilometragem','Tipo de movimentação','Número da recapagem','Custo da movimentação (R$)','Motivo','Responsável','Profundidade do sulco (mm)','Pressão aferida (PSI)','Observações'],
  multas:['Auto de infração','Veículo','Motorista responsável','Órgão autuador','Código da infração','Descrição','Data/hora','Local','Valor','Vencimento','Prazo para indicação','Situação'],
  documentos:['Veículo','Tipo de documento','Ano de referência','Número','Data de emissão','Data de validade','Valor pago','Data de pagamento','Arquivo digital','Responsável','Situação','Observações'],
  seguros:['Veículo','Tipo de seguro','Seguradora','Número da apólice','Corretora','Telefone da assistência 24h','Início da vigência','Fim da vigência','Valor do prêmio (R$)','Valor segurado (R$)','Franquia (R$)','Coberturas','Arquivo da apólice','Situação','Observações'],
  sinistros:['Veículo','Seguro vinculado','Motorista envolvido','Tipo de sinistro','Data/hora da ocorrência','Data do aviso à seguradora','Local da ocorrência','Descrição do ocorrido','Houve terceiros envolvidos?','Número do B.O.','Número do sinistro','Valor estimado dos danos (R$)','Valor da franquia (R$)','Valor da indenização (R$)','Oficina responsável','Situação','Data de encerramento','Anexo do sinistro','Observações'],
  despesas:['Data de lançamento','Vencimento','Data de pagamento','Empresa','Filial','Veículo','Categoria da despesa','Fornecedor','Descrição','Documento fiscal','Valor bruto','Desconto','Juros','Valor líquido','Forma de pagamento','Situação','Centro de custo','Observações'],
  rateios:['Despesa vinculada','Critério de rateio','Veículo','Centro de custo','Percentual','Valor','Observações'],
  usuarios:['Nome','Login','E-mail','Telefone','Empresa','Filial','Perfil','Situação'],
  perfisusuarios:['Usuário','Perfil','Empresa','Filial','Situação'],
  perfis:['Nome do perfil','Descrição','Situação'],
  permissoes:['Perfil','Módulo','Visualizar','Incluir','Alterar','Excluir','Aprovar','Exportar'],
  auditoria:['Usuário','Módulo','Operação','Registro afetado','Data/hora','IP de origem']
};

/* =====================================================================
   2. CONFIGURAÇÕES DO SISTEMA
   ===================================================================== */

// Menu lateral. { h } = título de seção, { id } = item direto, { items } = grupo com submenu.
const MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { id: 'painel_motorista', label: 'Meu Painel', icon: 'id-card' },
  { h: 'GESTÃO' },
  { label: 'Cadastros', icon: 'folder-open', items: ['empresas', 'centros', 'veiculos', 'motoristas', 'fornecedores', 'oficinas'] },
  { label: 'Operações', icon: 'arrow-left-right', items: ['reservas', 'retiradas', 'devolucoes', 'utilizacoes', 'checklists', 'modelos', 'itens', 'atribuicoes_motoristas'] },
  { id: 'abastecimentos', label: 'Controle da Frota', icon: 'car', pages: ['abastecimentos', 'manutencoes', 'pneus', 'localizacao_pneus', 'movpneus'] },
  { label: 'Documentos e Ocorrências', icon: 'clipboard-list', items: ['multas', 'documentos', 'seguros', 'sinistros'] },
  { label: 'Financeiro', icon: 'wallet', items: ['despesas', 'rateios'] },
  { label: 'Relatórios', icon: 'bar-chart-3', items: ['relatorios'] },
  { h: 'CONFIGURAÇÕES' },
  { label: 'Administração', icon: 'settings', items: ['usuarios', 'perfis', 'notificacoes', 'auditoria'] },
  { label: 'Sistema', icon: 'list', items: ['trocar', 'sair'] }
];

// Opções do campo "Situação" por módulo (os demais usam Ativo/Inativo).
const STATUS = {
  veiculos: ['Disponível', 'Reservado', 'Em utilização', 'Manutenção', 'Inativo'],
  reservas: ['Pendente', 'Aprovada', 'Recusada', 'Concluída'],
  manutencoes: ['Agendada', 'Em andamento', 'Concluída'],
  pneus: ['Em estoque', 'Instalado', 'Em reparo', 'Em recapagem', 'Descartado', 'Inativo'],
  multas: ['Pendente', 'Paga', 'Em recurso'],
  documentos: ['Ativo', 'Pendente', 'Vigente', 'Vencido', 'Pago', 'Cancelado'],
  seguros: ['Ativo', 'A vencer', 'Vencido', 'Suspenso', 'Cancelado'],
  sinistros: ['Aberto', 'Em análise', 'Aguardando documentos', 'Aprovado', 'Negado', 'Encerrado'],
  despesas: ['Pendente', 'Paga', 'Cancelada']
};
const statusOptions = page => STATUS[page] || ['Ativo', 'Inativo'];

// Opções padronizadas para evitar variações na classificação das manutenções.
const CHOICE_OPTIONS = {
  'Tipo de manutenção': ['Preventiva', 'Corretiva', 'Preditiva', 'Inspeção'],
  'Tipo de pessoa': ['Pessoa Física', 'Pessoa Jurídica'],
  'Categoria de fornecimento': ['Peças e acessórios', 'Serviços', 'Combustível', 'Pneus', 'Peças e serviços', 'Outros'],
  'Categoria da manutenção': ['Mecânica', 'Elétrica', 'Pneus', 'Funilaria e pintura', 'Ar-condicionado', 'Revisão geral', 'Outros'],
  'Posição de instalação': ['Dianteiro esquerdo', 'Dianteiro direito', 'Traseiro esquerdo', 'Traseiro direito', 'Estepe', 'Eixo auxiliar', 'Outra'],
  'Tipo de movimentação': ['Instalação', 'Rodízio', 'Remoção', 'Envio para reparo', 'Retorno de reparo', 'Envio para recapagem', 'Retorno de recapagem', 'Inspeção', 'Descarte'],
  'Tipo de documento': ['CRLV-e', 'Licenciamento anual', 'IPVA', 'Laudo de vistoria', 'Tacógrafo', 'Autorização especial', 'Certificado de inspeção', 'Outros'],
  'Tipo de seguro': ['Compreensivo (casco)', 'Responsabilidade civil (terceiros)', 'Roubo e furto', 'Acidentes pessoais de passageiros (APP)', 'Incêndio', 'Vidros', 'Outro'],
  'Tipo de sinistro': ['Colisão', 'Roubo/Furto', 'Incêndio', 'Alagamento ou evento natural', 'Danos a terceiros', 'Quebra de vidros', 'Assistência/Pane', 'Outro'],
  'Categoria da despesa': ['Combustível','Manutenção','Pneus','Multas','Seguro','Documentação','Pedágio','Estacionamento','Lavagem','Peças','Serviços','Despesas administrativas','Outros'],
  'Forma de pagamento': ['PIX','Boleto','Transferência bancária','Cartão corporativo','Dinheiro','Débito automático','Outro'],
  'Critério de rateio': ['Percentual','Valor fixo'],
  'Tipo de resposta': ['Condição']
};

// Cor da etiqueta de cada situação: ok (verde), warn (laranja), bad (vermelho), info (azul).
const TONE = {
  'Disponível': 'ok', 'Ativo': 'ok', 'Aprovada': 'ok', 'Concluída': 'ok', 'Paga': 'ok', 'Vigente': 'ok', 'Pago': 'ok',
  'Reservado': 'info', 'Agendada': 'info',
  'Em utilização': 'warn', 'Pendente': 'warn', 'Em andamento': 'warn', 'Em recurso': 'warn',
  'Manutenção': 'bad', 'Inativo': 'bad', 'Recusada': 'bad', 'Cancelada': 'bad', 'Vencido': 'bad', 'Cancelado': 'bad',
  'A vencer': 'warn', 'Suspenso': 'warn', 'Aberto': 'info', 'Em análise': 'warn', 'Aguardando documentos': 'warn', 'Aprovado': 'ok', 'Negado': 'bad', 'Encerrado': 'ok',
  'Em estoque': 'ok', 'Instalado': 'info', 'Em reparo': 'warn', 'Em recapagem': 'warn', 'Descartado': 'bad'
};

// Cores usadas no Kanban e na rosca do dashboard.
const STATUS_COLOR = {
  'Disponível': '#2e9b57', 'Reservado': '#667eea', 'Em utilização': '#f2a43c',
  'Manutenção': '#e64b43', 'Inativo': '#94a3b8'
};

// Colunas mostradas na tabela. Módulos que não estão aqui mostram os 4 primeiros campos + Situação.
const TABLE_COLUMNS = {
  fornecedores: ['Razão social / Nome', 'Nome fantasia', 'CPF/CNPJ', 'Categoria de fornecimento', 'Telefone', 'Cidade', 'Situação'],
  oficinas: ['Nome da oficina', 'CNPJ', 'Telefone', 'Especialidades', 'Cidade', 'Situação'],
  veiculos: ['Marca', 'Modelo', 'Placa', 'Ano de fabricação', 'Quilometragem atual', 'Situação'],
  motoristas: ['Nome completo', 'CPF', 'Categoria da CNH', 'Validade da CNH', 'Situação'],
  retiradas: ['Veículo', 'Motorista', 'Data/hora da retirada', 'Quilometragem inicial', 'Situação'],
  devolucoes: ['Retirada vinculada', 'Data/hora da devolução', 'Quilometragem final', 'Responsável pelo recebimento'],
  utilizacoes: ['Veículo','Motorista','Data/hora de saída','Data/hora de retorno','Quilometragem inicial','Quilometragem final','Destino','Finalidade','Centro de custo'],
  checklists: ['Tipo de checklist','Veículo','Motorista','Data/hora','Resultado','Responsável'],
  modelos: ['Nome do modelo','Categoria de veículo','Obrigatório na saída','Obrigatório na devolução','Situação'],
  itens: ['Descrição do item','Modelo de Checklist','Grupo','Tipo de resposta','Obrigatório','Exige fotografia','Ordem','Situação'],
  abastecimentos: ['Veículo', 'Motorista', 'Data/hora', 'Quantidade de litros', 'Valor total'],
  manutencoes: ['Veículo', 'Tipo de manutenção', 'Data de abertura', 'Valor total', 'Situação'],
  pneus: ['Código do pneu', 'Marca', 'Modelo', 'Medida', 'DOT', 'Profundidade atual (mm)', 'Veículo atual', 'Situação'],
  movpneus: ['Pneu', 'Veículo', 'Posição de instalação', 'Data', 'Quilometragem', 'Tipo de movimentação', 'Número da recapagem', 'Custo da movimentação (R$)'],
  reservas: ['Solicitante', 'Veículo ou categoria', 'Data/hora de retirada', 'Data/hora prevista de devolução', 'Situação'],
  multas: ['Auto de infração', 'Veículo', 'Motorista responsável', 'Data/hora', 'Valor', 'Vencimento', 'Prazo para indicação', 'Situação'],
  documentos: ['Veículo', 'Tipo de documento', 'Ano de referência', 'Número', 'Data de validade', 'Valor pago', 'Situação'],
  seguros: ['Veículo', 'Tipo de seguro', 'Seguradora', 'Número da apólice', 'Fim da vigência', 'Valor do prêmio (R$)', 'Situação'],
  sinistros: ['Número do sinistro', 'Veículo', 'Seguro vinculado', 'Número do B.O.', 'Tipo de sinistro', 'Data/hora da ocorrência', 'Valor estimado dos danos (R$)', 'Situação'],
  despesas: ['Data de lançamento','Categoria da despesa','Descrição','Veículo','Fornecedor','Valor bruto','Valor líquido','Vencimento','Situação'],
  rateios: ['Despesa vinculada','Critério de rateio','Veículo','Centro de custo','Percentual','Valor']
};

function tableColumns(page) {
  if (TABLE_COLUMNS[page]) return TABLE_COLUMNS[page];
  const list = fields[page] || [];
  const first = list.slice(0, 4);
  const addStatus = list.includes('Situação') && !first.includes('Situação');
  return addStatus ? [...first, 'Situação'] : first;
}

// De onde vêm os gastos do gráfico do dashboard: [campo da data, campo do valor].
const SPEND_SOURCES = {
  abastecimentos: ['Data/hora', 'Valor total'],
  manutencoes: ['Data de abertura', 'Valor total'],
  multas: ['Data/hora', 'Valor'],
  despesas: ['Data de lançamento', 'Valor líquido']
};

// Cartões da tela de Relatórios: [título, ícone, descrição, módulo exportado].
const REPORTS = [
  ['Relação de veículos', 'car', 'Cadastro completo e situação da frota.', 'veiculos'],
  ['Fornecedores', 'truck', 'Cadastro de fornecedores e contatos.', 'fornecedores'],
  ['Oficinas', 'wrench', 'Oficinas e prestadores de manutenção.', 'oficinas'],
  ['Utilização da frota', 'arrow-left-right', 'Períodos, motoristas e quilometragem.', 'utilizacoes'],
  ['Abastecimentos e consumo', 'fuel', 'Litros, valores e consumo médio.', 'abastecimentos'],
  ['Manutenções', 'wrench', 'Preventivas, corretivas e custos.', 'manutencoes'],
  ['Despesas', 'receipt', 'Gastos por categoria e centro de custo.', 'despesas'],
  ['Pneus', 'circle-dot', 'Estoque, instalação, inspeção e vida útil.', 'pneus'],
  ['Movimentações de pneus', 'arrow-left-right', 'Instalação, rodízio, remoção, reparo e descarte.', 'movpneus'],
  ['Multas', 'triangle-alert', 'Infrações, prazos e pagamentos.', 'multas'],
  ['Documentos', 'file-text', 'Vencimentos dos veículos.', 'documentos'],
  ['Seguros e apólices', 'shield-check', 'Apólices, coberturas, prêmios e vigências.', 'seguros'],
  ['Sinistros', 'shield-alert', 'Ocorrências, franquias e indenizações.', 'sinistros'],
  ['Rateios', 'pie-chart', 'Distribuição de despesas por veículo e centro de custo.', 'rateios'],
  ['Motoristas', 'users', 'Condutores e validade da CNH.', 'motoristas']
];
