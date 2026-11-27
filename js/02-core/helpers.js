/* NPI FROTA | Funções utilitárias compartilhadas.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */


/* =====================================================================
   3. FUNÇÕES AUXILIARES
   ===================================================================== */

const $ = selector => document.querySelector(selector);

// Protege textos digitados pelo usuário antes de colocá-los no HTML.
function esc(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text ?? '').replace(/[&<>"']/g, ch => map[ch]);
}

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Data (AAAA-MM-DD) de hoje + n dias.
function D(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// Acesso ao localStorage sem quebrar caso o navegador bloqueie.
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignora */ } }
};

const refreshIcons = () => window.lucide && lucide.createIcons();

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2400);
}

const vehicleLabel = v => `${v.Modelo} · ${v.Placa}`;

// Descobre o tipo de input de cada campo pelo nome dele.
function fieldType(label) {
  if (label === 'Situação') return 'status';
  if (CHOICE_OPTIONS[label]) return 'choice';
  if (/data\/hora|^data de saída|^data de retorno/i.test(label)) return 'datetime-local';
  if (/e-mail/i.test(label)) return 'email';
  // Relacionamentos precisam ser selects, mesmo quando o nome contém palavras
  // como "custo" (ex.: Centro de custo). Esta verificação deve vir antes
  // da regra numérica para não renderizar um input number no lugar da lista.
  if (/^(veículo|motorista)$/i.test(label) || RELATION_FIELDS[label]) return 'lookup';
  if (/prazo médio|^ordem$/i.test(label)) return 'number';
  if (/^data|validade|vencimento|^início|^fim da|prazo|^próxima manutenção$/i.test(label)) return 'date';
  if (/valor|custo|prêmio|franquia|quantidade|litros|quilometragem|percentual|mão de obra|desconto|juros|capacidade|^ano|sulco|profundidade|pressão|psi|vida útil|recapagem|prazo médio/i.test(label)) return 'number';
  if (/observa|descrição|avaria|cobertura|serviços|condições|problema|peças utilizadas/i.test(label) && !/^descrição do item$/i.test(label)) return 'textarea';
  if (/\?$|obrigat|exige|visualizar|incluir|alterar|excluir|aprovar|exportar/i.test(label)) return 'bool';
  return 'text';
}

// Formata um valor para exibição (data BR, moeda, litros, km).
function formatValue(label, value) {
  if (value === undefined || value === null || value === '') return '—';
  const type = fieldType(label);
  if (type === 'date') return value.split('-').reverse().join('/');
  if (type === 'datetime-local') {
    // Campos timestamptz do Supabase chegam em ISO (normalmente com Z).
    // Converte para o fuso local do navegador e mostra data + hora sem segundos.
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const datePart = parsed.toLocaleDateString('pt-BR');
      const timePart = parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${datePart} ${timePart}`;
    }
    const [date, time] = String(value).split('T');
    return `${date ? date.split('-').reverse().join('/') : '—'}${time ? ' ' + time.slice(0,5) : ''}`;
  }
  if (/valor|custo|prêmio|franquia|peças|mão de obra|desconto|juros/i.test(label)) return money(+value);
  if (/percentual/i.test(label)) return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%';
  if (/litros/i.test(label)) return value + ' L';
  if (/quilometragem|vida útil/i.test(label)) return Number(value).toLocaleString('pt-BR') + ' km';
  if (/sulco|profundidade/i.test(label)) return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mm';
  if (/pressão|psi/i.test(label)) return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' PSI';
  return value;
}

