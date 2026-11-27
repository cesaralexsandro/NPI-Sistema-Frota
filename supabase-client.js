/* Inicializa o cliente oficial Supabase JS v2 (carregado via CDN no index.html). */
(function () {
  const config = window.NPI_SUPABASE_CONFIG;
  if (!config || !config.url || !config.publishableKey) {
    window.npiSupabaseError = 'Configuração do Supabase incompleta.';
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    window.npiSupabaseError = 'A biblioteca Supabase não carregou. Verifique sua conexão com a internet.';
    return;
  }
  window.npiSupabase = window.supabase.createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();
