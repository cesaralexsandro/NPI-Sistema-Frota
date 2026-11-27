/* NPI FROTA | Eventos globais da interface.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

$('#recordForm').addEventListener('submit', saveForm);
$('#cancelModal').onclick = closeForm;
$('#closeModal').onclick = closeForm;
$('#modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeForm(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeForm(); });

$('#newBtn').onclick = () => {
  if (DB_MODULES.has(page) && hasPermission(page,'incluir')) void openForm();
};
$('#exportBtn').onclick = () => { if (DB_MODULES.has(page) && hasPermission(page,'exportar')) exportCsv(page); };
$('#bellBtn').onclick = event => { event.stopPropagation(); toggleNotificationPopover(); };
$('#helpButton').onclick = () => toast('NPI FROTA · dados de cadastros conectados ao Supabase.');
// O avatar permanece visualmente na barra superior, mas não executa troca de usuário.
$('#mobileMenu').onclick = () => $('#sidebar').classList.toggle('show');
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

