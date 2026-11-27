/* NPI FROTA | Estado compartilhado da interface.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

/* =====================================================================
   5. ESTADO DA TELA
   ===================================================================== */

let page = 'dashboard';        // módulo aberto
let statusFilter = '';         // filtro de situação
let searchText = '';           // texto da busca
let editingRecord = null;      // registro aberto no formulário (null = novo)
const vehicleView = { mode: 'kanban' };   // veículos: 'kanban' ou 'lista'
const openGroups = new Set();             // grupos do menu que estão abertos


// Paginação local das listagens e atualização leve da busca.
let recordsPage = 1;
const RECORDS_PAGE_SIZE = 50;
let recordsSearchTimer = null;
const recordSearchTextCache = new WeakMap();
