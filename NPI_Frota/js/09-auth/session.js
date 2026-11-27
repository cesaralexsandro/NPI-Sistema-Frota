/* NPI FROTA | Login, validação do perfil e carregamento da sessão.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

async function enterApplication(user) {
  // Mantém a tela de login escondida enquanto valida a sessão restaurada
  // e carrega os dados. Assim, atualizar a página não mostra o login rapidamente.
  showStartupScreen('Validando seu acesso e carregando os cadastros...');
  try {
    const { data: profile, error: profileError } = await window.npiSupabase
      .from('usuarios').select('id,nome,email,empresa_id,situacao,motorista_id').eq('id', user.id).maybeSingle();
    if (profileError) {
      throw new Error('O login foi aceito, mas a tabela usuarios ainda não está liberada. Execute o SQL de acesso da Etapa 3. Detalhe: ' + profileError.message);
    }
    if (!profile || profile.situacao !== 'Ativo') {
      throw new Error('Sua conta ainda está aguardando liberação pelo administrador. Peça ao responsável pelo NPI FROTA para ativar seu usuário e atribuir um perfil de acesso.');
    }

    if (currentUser?.id !== user.id) clearSupabaseDataCache();
    currentUser = user;
    currentProfile = profile;
    await loadAccessControl(user.id);
    const requestedPage = location.hash.slice(1);
    const initialPage = requestedPage && hasPermission(requestedPage, 'visualizar') ? requestedPage : defaultPageForCurrentUser();
    await ensureSupabaseModulesLoaded(getInitialModulesForPage(initialPage), { includeDependencies: initialPage !== 'dashboard' });
    const company = recordsOf('empresas').find(item => item.id === profile.empresa_id);
    currentCompanyName = company ? (company['Nome fantasia'] || company['Razão social']) : 'NPI Tecnologia';
    rememberAuthenticatedAccount(user, profile);
    $('#startupScreen').hidden = true;
    $('#authScreen').hidden = true;
    $('.app-shell').hidden = false;
    renderSidebar();
    // A central de notificações não bloqueia a abertura do painel.
    void initializeNotificationCenter();
    void goTo(initialPage);
  } catch (error) {
    console.error('Falha ao iniciar NPI FROTA:', error);
    showAuthScreen(error.message || 'Não foi possível carregar o NPI FROTA.');
  }
}

$('#loginEmail').addEventListener('input', () => {
  const selected = getRememberedAccounts().find(account => account.id === selectedRememberedAccountId);
  if (selected && selected.email.toLowerCase() !== $('#loginEmail').value.trim().toLowerCase()) {
    selectedRememberedAccountId = null;
    renderRememberedAccounts();
  }
});

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  const button = $('#loginButton');
  button.disabled = true;
  button.textContent = 'Conectando...';
  showAuthMessage('Autenticando com o Supabase...');
  try {
    if (!window.npiSupabase) throw new Error(window.npiSupabaseError || 'Cliente Supabase não inicializado.');
    const { data, error } = await window.npiSupabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await enterApplication(data.user);
  } catch (error) {
    console.error('Erro de autenticação:', error);
    showAuthMessage('Não foi possível entrar: ' + (error.message || 'verifique e-mail e senha.'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar no NPI FROTA';
  }
});

