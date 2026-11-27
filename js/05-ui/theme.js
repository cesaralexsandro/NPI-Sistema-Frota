/* NPI FROTA | Alternância de tema claro e escuro.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

/* =====================================================================
   10. TEMA CLARO / ESCURO
   ===================================================================== */

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  storage.set('npi-frota-tema', theme);
  $('#themeBtn').innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  refreshIcons();
}

/* =====================================================================
   11. INICIALIZAÇÃO
   ===================================================================== */

