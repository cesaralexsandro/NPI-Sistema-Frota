/* NPI FROTA | Inicialização do NPI FROTA.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

async function initializeApplication() {
  setTheme(document.documentElement.dataset.theme || 'dark');
  // A aplicação e o formulário de login começam ocultos. Só revelamos
  // um deles depois que o Supabase confirmar se existe uma sessão válida.
  showStartupScreen('Verificando sua sessão...');
  if (!window.npiSupabase) {
    showAuthScreen(window.npiSupabaseError || 'Não foi possível iniciar a conexão Supabase.');
    return;
  }
  try {
    const { data, error } = await window.npiSupabase.auth.getSession();
    if (error) throw error;
    if (data.session) await enterApplication(data.session.user);
    else showAuthScreen('Projeto Supabase configurado. Entre com seu e-mail e senha.');
  } catch (error) {
    showAuthScreen('Erro ao verificar a sessão: ' + error.message);
  }
  window.npiSupabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      stopNotificationRealtime();
      closeNotificationPopover();
      myNotifications = [];
      updateNotificationBellBadge();
      currentUser = null;
      currentProfile = null;
      currentRoleNames = [];
      currentPermissions = {};
      clearSupabaseDataCache();
      showAuthScreen('Sessão encerrada. Entre novamente para continuar.');
    }
  });
}

initializeApplication();
