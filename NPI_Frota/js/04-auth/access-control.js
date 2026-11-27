/* NPI FROTA | Perfis, permissões e regras de navegação no cliente.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

function isAdministrator() {
  return currentRoleNames.includes('Administrador');
}

function hasPermission(module, action = 'visualizar') {
  // Projetos e Postos de Combustível foram retirados da operação diária.
  // Mantemos seus mapeamentos/tabelas para preservar vínculos e históricos antigos.
  if (['projetos', 'postos'].includes(module)) return false;
  // A página de localização é uma visão derivada do cadastro de pneus; usa a mesma permissão.
  if (module === 'localizacao_pneus') module = 'pneus';
  if (module === 'sair' || module === 'trocar' || module === 'sem_acesso') return Boolean(currentUser);
  if (!currentUser || !currentProfile) return false;
  // O perfil Motorista é restrito ao próprio painel; todas as outras telas
  // e ações são negadas mesmo que uma permissão antiga ainda exista no banco.
  if (currentRoleNames.includes('Motorista') && !isAdministrator()) {
    return module === 'painel_motorista' && action === 'visualizar' && Boolean(currentPermissions.painel_motorista?.visualizar);
  }
  if (module === 'painel_motorista' && !currentRoleNames.includes('Motorista')) return false;
  if (isAdministrator()) return true;
  if (['usuarios','perfis','auditoria','notificacoes'].includes(module)) return false;
  return Boolean(currentPermissions[module] && currentPermissions[module][action]);
}

function defaultPageForCurrentUser() {
  if (!isAdministrator() && currentRoleNames.includes('Motorista') && hasPermission('painel_motorista','visualizar')) return 'painel_motorista';
  if (currentRoleNames.includes('Financeiro') && hasPermission('despesas','visualizar')) return 'despesas';
  if (currentRoleNames.includes('Manutenção') && hasPermission('manutencoes','visualizar')) return 'manutencoes';
  if (currentRoleNames.includes('Solicitante') && hasPermission('reservas','visualizar')) return 'reservas';
  if (hasPermission('dashboard','visualizar')) return 'dashboard';
  const candidates = Object.keys(MODULE_DEFS);
  return candidates.find(key => hasPermission(key,'visualizar')) || 'sem_acesso';
}

async function loadAccessControl(userId) {
  const { data: links, error: linksError } = await window.npiSupabase
    .from('perfis_usuarios')
    .select('perfil_id, perfis(nome)')
    .eq('usuario_id', userId)
    .eq('situacao', 'Ativo');
  if (linksError) throw new Error('Não foi possível carregar seus perfis de acesso. Execute o SQL de permissões. Detalhe: ' + linksError.message);
  const activeLinks = links || [];
  currentRoleNames = activeLinks.map(item => item.perfis && item.perfis.nome).filter(Boolean);
  if (!activeLinks.length) throw new Error('Seu usuário ainda não possui um perfil de acesso ativo. Peça ao administrador para definir seu perfil em Usuários e Acessos.');

  const profileIds = [...new Set(activeLinks.map(item => item.perfil_id))];
  const { data: permissionRows, error: permissionError } = await window.npiSupabase
    .from('permissoes')
    .select('perfil_id,modulo,visualizar,incluir,alterar,excluir,aprovar,exportar')
    .in('perfil_id', profileIds);
  if (permissionError) throw new Error('Não foi possível carregar a matriz de permissões. Detalhe: ' + permissionError.message);

  currentPermissions = {};
  (permissionRows || []).forEach(row => {
    if (!currentPermissions[row.modulo]) currentPermissions[row.modulo] = {};
    PERMISSION_ACTIONS.forEach(([key]) => {
      currentPermissions[row.modulo][key] = Boolean(currentPermissions[row.modulo][key] || row[key]);
    });
  });
}

