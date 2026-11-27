/* NPI FROTA | Mensagens de autenticação e contas lembradas neste navegador.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

function showAuthMessage(message, type = '') {
  const feedback = $('#authFeedback');
  feedback.textContent = message;
  feedback.className = 'auth-feedback' + (type ? ' ' + type : '');
}

function showStartupScreen(message = 'Verificando sua sessão...') {
  const startup = $('#startupScreen');
  if (startup) {
    startup.hidden = false;
    $('#startupMessage').textContent = message;
  }
  $('#authScreen').hidden = true;
  $('.app-shell').hidden = true;
}

const REMEMBERED_ACCOUNTS_KEY = 'npi-frota-contas-utilizadas-v1';
let selectedRememberedAccountId = null;

function getRememberedAccounts() {
  try {
    const parsed = JSON.parse(storage.get(REMEMBERED_ACCOUNTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(account => account && account.id && account.email);
  } catch {
    return [];
  }
}

function saveRememberedAccounts(accounts) {
  // Guarda apenas identificador e dados de exibição. Senhas e tokens nunca são armazenados aqui.
  storage.set(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 12)));
}

function rememberAuthenticatedAccount(user, profile) {
  if (!user || !user.id || !user.email) return;
  const account = {
    id: String(user.id),
    email: String(user.email),
    name: String(profile?.nome || user.user_metadata?.name || user.email.split('@')[0]),
    roles: currentRoleNames.join(' · '),
    company: currentCompanyName,
    lastUsed: new Date().toISOString()
  };
  const accounts = getRememberedAccounts().filter(item => item.id !== account.id);
  accounts.unshift(account);
  saveRememberedAccounts(accounts);
  renderRememberedAccounts();
}

function renderRememberedAccounts() {
  const section = $('#rememberedAccounts');
  const list = $('#rememberedAccountList');
  if (!section || !list) return;
  const accounts = getRememberedAccounts();
  section.hidden = accounts.length === 0;
  list.innerHTML = accounts.map(account => {
    const initials = (account.name || account.email).trim().slice(0, 1).toUpperCase();
    const selected = selectedRememberedAccountId === account.id;
    const details = [account.roles, account.company].filter(Boolean).join(' · ');
    return `<div class="remembered-account ${selected ? 'selected' : ''}">
      <button type="button" class="remembered-account-select" data-remember-account="${esc(account.id)}" aria-pressed="${selected}">
        <span class="remembered-account-avatar">${esc(initials)}</span>
        <span class="remembered-account-copy"><b>${esc(account.name || account.email)}</b><small>${esc(account.email)}</small>${details ? `<em>${esc(details)}</em>` : ''}</span>
        <span class="remembered-account-action">${selected ? 'Selecionado' : 'Selecionar'}</span>
      </button>
      <button type="button" class="remembered-account-remove" data-remove-remembered="${esc(account.id)}" aria-label="Remover ${esc(account.email)} desta lista" title="Remover desta lista">×</button>
    </div>`;
  }).join('');
}

function showAuthScreen(message) {
  $('#startupScreen').hidden = true;
  $('.app-shell').hidden = true;
  $('#authScreen').hidden = false;
  selectedRememberedAccountId = null;
  renderRememberedAccounts();
  if (message) showAuthMessage(message);
}

$('#rememberedAccountList').addEventListener('click', event => {
  const removeButton = event.target.closest('[data-remove-remembered]');
  if (removeButton) {
    const accountId = removeButton.dataset.removeRemembered;
    const remaining = getRememberedAccounts().filter(account => account.id !== accountId);
    saveRememberedAccounts(remaining);
    if (selectedRememberedAccountId === accountId) {
      selectedRememberedAccountId = null;
      $('#loginEmail').value = '';
      $('#loginPassword').value = '';
    }
    renderRememberedAccounts();
    showAuthMessage('Conta removida somente da lista deste computador. A conta continua cadastrada no Supabase.', 'success');
    return;
  }

  const selectButton = event.target.closest('[data-remember-account]');
  if (!selectButton) return;
  const account = getRememberedAccounts().find(item => item.id === selectButton.dataset.rememberAccount);
  if (!account) return;
  selectedRememberedAccountId = account.id;
  $('#loginEmail').value = account.email;
  $('#loginPassword').value = '';
  renderRememberedAccounts();
  showAuthMessage(`Conta ${account.email} selecionada. Digite a senha para continuar.`, 'success');
  $('#loginPassword').focus();
});

