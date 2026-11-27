/* NPI FROTA | Formulários, validação, CRUD e exclusões.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

/* =====================================================================
   8. FORMULÁRIO (criar / editar / excluir)
   ===================================================================== */

// Um campo do formulário, conforme o tipo detectado pelo nome.
function fieldHtml(label, value, index) {
  const type = fieldType(label);
  let input;

  const moduleConfig = SUPABASE_MODULES[page];
  const required = moduleConfig && moduleConfig.required.includes(label) ? 'required' : '';
  const tireManagedFields = ['Quilometragem inicial', 'Veículo atual', 'Posição atual', 'Profundidade atual (mm)', 'Pressão atual (PSI)', 'Recapagens realizadas', 'Situação'];
  const tireManaged = page === 'pneus' && tireManagedFields.includes(label);
  if (page === 'veiculos' && label === 'Placa') {
    const plate = String(value || '').toUpperCase();
    const legacy = /^[A-Z]{3}-?\d{4}$/.test(plate);
    const normalized = legacy ? plate.replace('-', '').replace(/^([A-Z]{3})(\d{4})$/, '$1-$2') : plate.replace(/[^A-Z0-9]/g, '').slice(0, 7);
    const mask = legacy ? 'legacy' : 'mercosul';
    return `<div class="form-row"><label>${label}</label><input name="f${index}" type="text" value="${esc(normalized)}" maxlength="${legacy ? 8 : 7}" minlength="${legacy ? 8 : 7}" pattern="${legacy ? '[A-Za-z]{3}-[0-9]{4}' : '[A-Za-z]{3}[0-9][A-Za-z][0-9]{2}'}" placeholder="${legacy ? 'ABC-1234' : 'ABC1D23'}" autocomplete="off" autocapitalize="characters" spellcheck="false" data-plate-mask="${mask}" required title="${legacy ? 'Formato antigo: 3 letras, hífen e 4 números.' : 'Formato Mercosul: 3 letras, 1 número, 1 letra e 2 números.'}"><small class="form-hint">${legacy ? 'Placa antiga: ABC-1234.' : 'Placa Mercosul: 3 letras + 1 número + 1 letra + 2 números (ABC1D23).'}</small></div>`;
  }
  if (page === 'seguros' && label === 'Arquivo da apólice') {
    const currentFile = value ? '<small class="document-file-current">Já existe uma apólice anexada. Selecione outro arquivo somente para substituir.</small>' : '<small class="document-file-current">Anexe PDF, JPG ou PNG (máximo de 15 MB). O arquivo ficará privado no Supabase.</small>' ;
    return `<div class="form-row full document-file-field"><label>${label}</label><input type="hidden" name="f${index}" value="${esc(value)}"><input type="file" data-vehicle-file="seguros" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><div>${currentFile}</div></div>`;
  }
  if (page === 'sinistros' && label === 'Anexo do sinistro') {
    const currentFile = value ? '<small class="document-file-current">Já existe um anexo. Selecione outro arquivo somente para substituir.</small>' : '<small class="document-file-current">Anexe PDF, JPG ou PNG (máximo de 15 MB). O arquivo ficará privado no Supabase.</small>' ;
    return `<div class="form-row full document-file-field"><label>${label}</label><input type="hidden" name="f${index}" value="${esc(value)}"><input type="file" data-vehicle-file="sinistros" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><div>${currentFile}</div></div>`;
  }
  if (page === 'documentos' && label === 'Arquivo digital') {
    const currentFile = value ? '<small class="document-file-current">Já existe um arquivo anexado. Selecione outro somente se quiser substituí-lo.</small>' : '<small class="document-file-current">Anexe PDF, JPG ou PNG (máximo de 15 MB). O arquivo ficará privado no Supabase.</small>';
    return `<div class="form-row full document-file-field"><label>${label}</label><input type="hidden" name="f${index}" value="${esc(value)}"><input type="file" data-document-file accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><div>${currentFile}</div></div>`;
  }
  if (page === 'movpneus' && label === 'Número da recapagem') {
    return `<div class="form-row" data-recapagem-field hidden><label>${label}</label><input name="f${index}" type="number" min="1" step="1" value="${esc(value)}" readonly title="Número sequencial calculado pelo histórico do pneu."></div>`;
  }
  if (page === 'despesas' && label === 'Valor líquido') {
    return `<div class="form-row"><label>${label}</label><input name="f${index}" type="number" step="0.01" min="0" value="${esc(value)}" readonly data-expense-net title="Calculado automaticamente: valor bruto - desconto + juros."></div>`;
  }
  if (page === 'rateios' && label === 'Percentual') {
    return `<div class="form-row"><label>${label} (%)</label><input name="f${index}" type="number" min="0.0001" max="100" step="0.0001" value="${esc(value)}" data-rateio-percent></div>`;
  }
  if (page === 'rateios' && label === 'Valor') {
    return `<div class="form-row"><label>${label} (R$)</label><input name="f${index}" type="number" min="0.01" step="0.01" value="${esc(value)}" data-rateio-value></div>`;
  }
  // Os três destinos são mantidos como selects ocultos para preservar o mapeamento
  // com as colunas existentes no banco. O usuário escolhe apenas um destino no
  // controle combinado de destino do rateio (veículo ou centro de custo).
  if (page === 'rateios' && ['Veículo', 'Centro de custo'].includes(label)) {
    const relation = RELATION_FIELDS[label];
    const options = recordsOf(relation.module).filter(row => row['Situação'] !== 'Inativo')
      .map(relation.display).filter(Boolean);
    const hiddenSelect = `<select name="f${index}"><option value="">Selecione</option>${options.map(option => `<option value="${esc(option)}" ${option === value ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
    const hiddenField = `<div class="form-row rateio-legacy-target" data-rateio-legacy="${label}" hidden>${hiddenSelect}</div>`;
    if (label !== 'Centro de custo') return hiddenField;
    return `${hiddenField}
      <div class="form-row full rateio-destination-field">
        <label for="rateioTargetType">Destino do rateio</label>
        <div class="form-grid rateio-destination-grid">
          <select id="rateioTargetType" data-rateio-target-type>
            <option value="">Escolha o tipo de destino</option>
            <option value="Veículo">Veículo</option>
            <option value="Centro de custo">Centro de custo</option>
          </select>
          <select data-rateio-target-value disabled><option value="">Primeiro escolha o tipo</option></select>
        </div>
        <small class="form-hint">Cada rateio deve apontar para um veículo ou centro de custo.</small>
      </div>`;
  }
  if (page === 'pneus' && label === 'Veículo atual') {
    return `<div class="form-row"><label>${label}</label><input name="f${index}" type="text" value="${esc(value)}" readonly title="Atualizado automaticamente pelas movimentações do pneu."></div>`;
  }

  if (type === 'status' || type === 'bool' || type === 'lookup' || type === 'choice') {
    let options;
    if (type === 'status') options = statusOptions(page);
    else if (type === 'bool') options = ['Sim', 'Não'];
    else if (type === 'choice') options = CHOICE_OPTIONS[label] || [];
    else if (RELATION_FIELDS[label]) {
      const relation = RELATION_FIELDS[label];
      let sourceRows = recordsOf(relation.module).filter(row => row['Situação'] !== 'Inativo');
      if (label === 'Despesa vinculada') sourceRows = sourceRows.filter(row => row['Situação'] !== 'Cancelada');
      // Uma devolucao so pode ser aberta para uma retirada que ainda esteja em aberto.
      if (label === 'Retirada vinculada') sourceRows = sourceRows.filter(row => row['Situação'] === 'Em aberto');
      options = sourceRows.map(relation.display).filter(Boolean);
    } else if (label === 'Veículo') options = recordsOf('veiculos').map(vehicleLabel);
    else options = recordsOf('motoristas').map(m => m['Nome completo']);

    if (value && !options.includes(value)) options = [value, ...options];
    const placeholder = type === 'status' ? '<option value="">Usar padrão</option>' : '<option value="">Selecione</option>';
    input = `<select name="f${index}" ${required} ${tireManaged ? 'disabled title="Gerenciado automaticamente pelas movimentações de pneus."' : ''}>${placeholder}${options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  } else if (type === 'textarea') {
    input = `<textarea name="f${index}" ${required} ${tireManaged ? 'readonly title="Gerenciado automaticamente pelas movimentações de pneus."' : ''}>${esc(value)}</textarea>`;
  } else {
    const step = type === 'number' ? (label === 'Ano de referência' ? 'step="1" min="2000" max="2100"' : 'step="any"') : '';
    input = `<input name="f${index}" type="${type}" ${step} value="${esc(value)}" ${required} ${tireManaged ? 'readonly title="Gerenciado automaticamente pelas movimentações de pneus."' : ''}>`;
  }

  return `<div class="form-row ${type === 'textarea' ? 'full' : ''}"><label>${label}</label>${input}</div>`;
}

const DOCUMENTS_STORAGE_BUCKET = 'npi-documentos-veiculos';
const DOCUMENT_MAX_FILE_SIZE = 15 * 1024 * 1024;

function validateDocumentFile(file) {
  if (!file) return;
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  const allowedExtensions = /\.(pdf|jpe?g|png)$/i;
  if (!(allowedTypes.includes(file.type) || allowedExtensions.test(file.name))) {
    throw new Error('O arquivo precisa ser PDF, JPG ou PNG.');
  }
  if (file.size > DOCUMENT_MAX_FILE_SIZE) throw new Error('O arquivo ultrapassa o limite de 15 MB.');
}

async function uploadDocumentAttachment(file, vehicleId) {
  validateDocumentFile(file);
  if (!vehicleId) throw new Error('Selecione o veículo antes de anexar o documento.');
  const safeName = file.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${vehicleId}/${unique}-${safeName}`;
  const { data, error } = await window.npiSupabase.storage.from(DOCUMENTS_STORAGE_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream'
  });
  if (error) throw error;
  return data.path;
}

async function openDocumentAttachment(recordId) {
  const record = recordsOf('documentos').find(item => String(item.id) === String(recordId));
  const path = record?.['Arquivo digital'];
  if (!path) { toast('Este documento não possui arquivo anexado.'); return; }
  if (!hasPermission('documentos', 'visualizar')) { toast('Seu perfil não pode visualizar documentos.'); return; }
  const popup = window.open('about:blank', '_blank');
  try {
    const { data, error } = await window.npiSupabase.storage.from(DOCUMENTS_STORAGE_BUCKET).createSignedUrl(path, 300);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Não foi possível gerar o link temporário do arquivo.');
    if (popup) { popup.opener = null; popup.location.href = data.signedUrl; }
    else window.location.href = data.signedUrl;
  } catch (error) {
    if (popup) popup.close();
    console.error('Erro ao abrir documento:', error);
    toast('Não foi possível abrir o arquivo: ' + (error.message || 'verifique as permissões.'));
  }
}

const INSURANCE_STORAGE_BUCKET = 'npi-seguros-sinistros';

async function uploadInsuranceClaimAttachment(file, vehicleId, folder) {
  validateDocumentFile(file);
  if (!vehicleId) throw new Error('Selecione o veículo antes de anexar o arquivo.');
  if (!['apolices', 'sinistros'].includes(folder)) throw new Error('Tipo de anexo inválido.');
  const safeName = file.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${vehicleId}/${folder}/${unique}-${safeName}`;
  const { data, error } = await window.npiSupabase.storage.from(INSURANCE_STORAGE_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream'
  });
  if (error) throw error;
  return data.path;
}

async function openVehicleAttachment(module, recordId) {
  const record = recordsOf(module).find(item => String(item.id) === String(recordId));
  const path = module === 'seguros' ? record?.['Arquivo da apólice'] : record?.['Anexo do sinistro'];
  if (!path) { toast('Este registro não possui arquivo anexado.'); return; }
  if (!hasPermission(module, 'visualizar')) { toast('Seu perfil não pode visualizar este anexo.'); return; }
  const popup = window.open('about:blank', '_blank');
  try {
    const { data, error } = await window.npiSupabase.storage.from(INSURANCE_STORAGE_BUCKET).createSignedUrl(path, 300);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Não foi possível gerar o link temporário do anexo.');
    if (popup) { popup.opener = null; popup.location.href = data.signedUrl; }
    else window.location.href = data.signedUrl;
  } catch (error) {
    if (popup) popup.close();
    console.error('Erro ao abrir anexo de seguro/sinistro:', error);
    toast('Não foi possível abrir o anexo: ' + (error.message || 'verifique as permissões.'));
  }
}


async function openChecklistDetails(checklistId) {
  if (!hasPermission('checklists', 'visualizar')) {
    toast('Seu perfil não permite consultar checklists.');
    return;
  }
  const record = recordsOf('checklists').find(item => String(item.id) === String(checklistId));
  if (!record) { toast('Checklist não encontrado. Atualize a lista e tente novamente.'); return; }
  try {
    const { data, error } = await window.npiSupabase
      .from('checklist_respostas')
      .select('id,descricao_item,resposta,observacao,fotografias,created_at')
      .eq('checklist_id', checklistId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const responses = data || [];
    const detail = document.createElement('div');
    detail.className = 'modal-backdrop open checklist-detail-backdrop';
    detail.id = 'checklistDetailOverlay';
    detail.innerHTML = `
      <section class="modal checklist-detail-modal" role="dialog" aria-modal="true" aria-labelledby="checklistDetailTitle">
        <header class="modal-head">
          <div><span class="eyebrow">HISTÓRICO DE INSPEÇÃO</span><h2 id="checklistDetailTitle">${esc(record['Tipo de checklist'] || 'Checklist')}</h2>
          <p class="checklist-detail-subtitle">${esc(record['Veículo'] || 'Veículo')} · ${esc(record['Motorista'] || 'Motorista')} · ${esc(formatValue('Data/hora', record['Data/hora']))}</p></div>
          <button type="button" class="close-modal" data-checklist-close aria-label="Fechar">×</button>
        </header>
        <div class="checklist-detail-summary">
          <span><small>Resultado</small><b class="tag ${record['Resultado'] === 'Conforme' ? 'ok' : 'warn'}">${esc(record['Resultado'] || 'Não informado')}</b></span>
          <span><small>Responsável</small><b>${esc(record['Responsável'] || '—')}</b></span>
        </div>
        ${record['Observações'] ? `<div class="checklist-detail-notes"><b>Observações gerais</b><p>${esc(record['Observações'])}</p></div>` : ''}
        <div class="checklist-detail-list">
          ${responses.length ? responses.map((response, index) => `
            <article class="checklist-answer-card">
              <div class="checklist-answer-top"><b>${index + 1}. ${esc(response.descricao_item || 'Item do checklist')}</b><span class="tag ${response.resposta === 'Conforme' ? 'ok' : response.resposta === 'Não conforme' ? 'bad' : 'info'}">${esc(response.resposta || 'Sem resposta')}</span></div>
              ${response.observacao ? `<p>${esc(response.observacao)}</p>` : '<small class="muted-note">Sem observações para este item.</small>'}
              ${Array.isArray(response.fotografias) && response.fotografias.length ? `<small class="checklist-photo-note">${response.fotografias.length} arquivo(s) de imagem anexado(s).</small>` : ''}
            </article>`).join('') : '<div class="empty">Este checklist não possui respostas detalhadas registradas.</div>'}
        </div>
        <footer class="modal-actions"><button type="button" class="btn btn-primary" data-checklist-close>Fechar</button></footer>
      </section>`;
    document.body.appendChild(detail);
    const close = () => detail.remove();
    detail.querySelectorAll('[data-checklist-close]').forEach(button => { button.addEventListener('click', close); });
    detail.addEventListener('click', event => { if (event.target === detail) close(); });
    detail.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    detail.querySelector('.close-modal')?.focus();
  } catch (error) {
    console.error('Erro ao consultar respostas do checklist:', error);
    toast('Não foi possível abrir as respostas: ' + (error.message || 'verifique as permissões RLS.'));
  }
}

async function openForm(id) {
  if (READ_ONLY_MODULES.has(page)) { toast('Este histórico é somente para consulta.'); return; }
  const action = id ? 'alterar' : 'incluir';
  if (!hasPermission(page, action)) { toast('Seu perfil não permite esta ação.'); return; }
  const formPage = page;
  try { await ensureSupabaseModulesLoaded([formPage]); }
  catch (error) { toast('Não foi possível carregar os campos do formulário: ' + (error.message || 'erro de conexão.')); return; }
  if (page !== formPage) return;
  editingRecord = id ? recordsOf(page).find(r => String(r.id) === String(id)) : null;
  const labels = (fields[page] || ['Descrição', 'Observações', 'Situação']).filter(label => page !== 'reservas' || label !== 'Situação');

  $('#modalTitle').textContent = (editingRecord ? 'Editar · ' : 'Novo registro · ') + pageMeta[page][0];
  $('#formFields').innerHTML = labels
    .map((label, i) => fieldHtml(label, editingRecord ? editingRecord[label] ?? '' : '', i))
    .join('');
  if (page === 'veiculos') {
    const plateInput = $('#formFields').querySelector('[data-plate-mask]');
    if (plateInput) {
      const formatPlate = () => {
        const raw = plateInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (plateInput.dataset.plateMask === 'legacy') {
          const letters = raw.slice(0, 3).replace(/[^A-Z]/g, '');
          const numbers = raw.slice(3).replace(/[^0-9]/g, '').slice(0, 4);
          plateInput.value = letters + (numbers ? '-' + numbers : '');
        } else {
          const slots = ['letter','letter','letter','number','letter','number','number'];
          let result = '';
          for (const char of raw) {
            const slot = slots[result.length];
            if (!slot) break;
            if ((slot === 'letter' && /[A-Z]/.test(char)) || (slot === 'number' && /[0-9]/.test(char))) result += char;
          }
          plateInput.value = result;
        }
      };
      plateInput.addEventListener('input', formatPlate);
      plateInput.addEventListener('blur', () => {
        const valid = plateInput.dataset.plateMask === 'legacy' ? /^[A-Z]{3}-[0-9]{4}$/.test(plateInput.value) : /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(plateInput.value);
        plateInput.setCustomValidity(valid ? '' : 'Informe a placa completa no formato indicado.');
      });
    }
  }

  if (!editingRecord && page === 'modelos') {
    const form = $('#recordForm');
    const setDefault = (index, value) => { const input = form.elements.namedItem('f' + index); if (input && !input.value) input.value = value; };
    setDefault(3, 'Sim');
    setDefault(4, 'Sim');
    setDefault(5, 'Ativo');
  }
  if (!editingRecord && page === 'itens') {
    const form = $('#recordForm');
    const setDefault = (index, value) => { const input = form.elements.namedItem('f' + index); if (input && !input.value) input.value = value; };
    setDefault(3, 'Condição');
    setDefault(4, 'Sim');
    setDefault(5, 'Não');
    setDefault(6, String(Math.max(0, ...recordsOf('itens').map(item => Number(item.Ordem || 0))) + 10 || 10));
    setDefault(7, 'Ativo');
  }
  if (page === 'despesas') {
    const form = $('#recordForm');
    const gross = form.elements.namedItem('f10');
    const discount = form.elements.namedItem('f11');
    const interest = form.elements.namedItem('f12');
    const net = form.elements.namedItem('f13');
    const launchDate = form.elements.namedItem('f0');
    const status = form.elements.namedItem('f15');
    const paymentDate = form.elements.namedItem('f2');
    if (!editingRecord && launchDate && !launchDate.value) launchDate.value = D(0);
    if (!editingRecord && status && !status.value) status.value = 'Pendente';
    const calculateExpenseNet = () => {
      const total = Number(gross?.value || 0) - Number(discount?.value || 0) + Number(interest?.value || 0);
      if (net) net.value = Number.isFinite(total) ? Math.max(0, total).toFixed(2) : '';
    };
    [gross, discount, interest].forEach(input => input?.addEventListener('input', calculateExpenseNet));
    if (!editingRecord) calculateExpenseNet();
    const syncPaymentDate = () => { if (paymentDate) paymentDate.required = status?.value === 'Paga'; };
    status?.addEventListener('change', syncPaymentDate);
    syncPaymentDate();
  }

  if (page === 'rateios') {
    const form = $('#recordForm');
    const expenseSelect = form.elements.namedItem('f0');
    const criterionSelect = form.elements.namedItem('f1');
    const percentInput = form.querySelector('[data-rateio-percent]');
    const valueInput = form.querySelector('[data-rateio-value]');
    const targetTypeSelect = form.querySelector('[data-rateio-target-type]');
    const targetValueSelect = form.querySelector('[data-rateio-target-value]');
    const targetModules = {
      'Veículo': { module: 'veiculos', field: 'Veículo' },
      'Centro de custo': { module: 'centros', field: 'Centro de custo' },
    };
    const expenseForSelected = () => recordsOf('despesas').find(item => RELATION_FIELDS['Despesa vinculada'].display(item) === expenseSelect?.value);
    const updateRateioCalculation = (source = 'init') => {
      const criterion = criterionSelect?.value || 'Percentual';
      const expense = expenseForSelected();
      const netValue = Number(expense?.['Valor líquido'] || 0);
      if (percentInput) percentInput.readOnly = criterion !== 'Percentual';
      if (valueInput) valueInput.readOnly = criterion !== 'Valor fixo';
      if (!expense || netValue <= 0) return;
      if (criterion === 'Percentual' && percentInput && valueInput) {
        const percent = Number(percentInput.value || 0);
        if (source !== 'value' && (source !== 'init' || percent > 0)) valueInput.value = (netValue * percent / 100).toFixed(2);
      } else if (criterion === 'Valor fixo' && percentInput && valueInput) {
        const amount = Number(valueInput.value || 0);
        if (source !== 'percent' && (source !== 'init' || amount > 0)) percentInput.value = (amount / netValue * 100).toFixed(4);
      }
    };

    // Converte os três campos antigos em um único fluxo visual: tipo + cadastro.
    // O formulário grava o valor escolhido no select interno correspondente.
    const syncRateioDestination = (preferredLabel = '') => {
      if (!targetTypeSelect || !targetValueSelect) return;
      const type = preferredLabel || targetTypeSelect.value;
      const config = targetModules[type];
      ['Veículo', 'Centro de custo'].forEach(label => {
        const hidden = form.querySelector(`[data-rateio-legacy="${label}"] select`);
        if (hidden && label !== type) hidden.value = '';
      });
      targetValueSelect.innerHTML = '<option value="">Selecione o cadastro</option>';
      if (!config) {
        targetValueSelect.disabled = true;
        return;
      }
      const rows = recordsOf(config.module).filter(row => row['Situação'] !== 'Inativo');
      const labels = rows.map(row => RELATION_FIELDS[config.field].display(row)).filter(Boolean);
      targetValueSelect.disabled = false;
      targetValueSelect.innerHTML += labels.map(label => `<option value="${esc(label)}">${esc(label)}</option>`).join('');
      const hidden = form.querySelector(`[data-rateio-legacy="${type}"] select`);
      if (hidden?.value) targetValueSelect.value = hidden.value;
    };
    if (targetTypeSelect && targetValueSelect) {
      const existingTarget = ['Veículo', 'Centro de custo'].find(label => {
        const hidden = form.querySelector(`[data-rateio-legacy="${label}"] select`);
        return Boolean(hidden?.value);
      });
      if (existingTarget) targetTypeSelect.value = existingTarget;
      syncRateioDestination(existingTarget || '');
      targetTypeSelect.addEventListener('change', () => syncRateioDestination(targetTypeSelect.value));
      targetValueSelect.addEventListener('change', () => {
        ['Veículo', 'Centro de custo'].forEach(label => {
          const hidden = form.querySelector(`[data-rateio-legacy="${label}"] select`);
          if (hidden) hidden.value = label === targetTypeSelect.value ? targetValueSelect.value : '';
        });
      });
    }

    criterionSelect?.addEventListener('change', () => updateRateioCalculation('init'));
    expenseSelect?.addEventListener('change', () => updateRateioCalculation('init'));
    percentInput?.addEventListener('input', () => updateRateioCalculation('percent'));
    valueInput?.addEventListener('input', () => updateRateioCalculation('value'));
    updateRateioCalculation('init');
  }

  if (page === 'abastecimentos') {
    const form = $('#recordForm');
    const liters = form.elements.namedItem('f6');
    const price = form.elements.namedItem('f7');
    const total = form.elements.namedItem('f8');
    if (liters && price && total) {
      total.readOnly = true;
      total.title = 'Calculado automaticamente: litros × valor por litro.';
      const calculateTotal = () => {
        if (liters.value === '' || price.value === '') {
          if (!editingRecord) total.value = '';
          return;
        }
        const amount = Number(liters.value) * Number(price.value);
        total.value = Number.isFinite(amount) ? amount.toFixed(2) : '';
      };
      liters.addEventListener('input', calculateTotal);
      price.addEventListener('input', calculateTotal);
      if (!editingRecord) calculateTotal();
    }
  }

  if (page === 'manutencoes') {
    const form = $('#recordForm');
    const partsValue = form.elements.namedItem('f10');
    const laborValue = form.elements.namedItem('f11');
    const totalValue = form.elements.namedItem('f12');
    const openingDate = form.elements.namedItem('f3');
    const vehicleSelect = form.elements.namedItem('f0');
    const mileageInput = form.elements.namedItem('f5');

    if (!editingRecord && openingDate && !openingDate.value) openingDate.value = D(0);
    if (totalValue) {
      totalValue.readOnly = true;
      totalValue.title = 'Calculado automaticamente: valor das peças + mão de obra.';
      const calculateMaintenanceTotal = () => {
        const parts = Number(partsValue?.value || 0);
        const labor = Number(laborValue?.value || 0);
        totalValue.value = (parts + labor).toFixed(2);
      };
      partsValue?.addEventListener('input', calculateMaintenanceTotal);
      laborValue?.addEventListener('input', calculateMaintenanceTotal);
      if (!editingRecord) calculateMaintenanceTotal();
    }
    // Ao escolher o veículo, sugere a quilometragem atualmente cadastrada.
    if (vehicleSelect && mileageInput && !editingRecord) {
      const suggestMileage = () => {
        const selectedVehicle = recordsOf('veiculos').find(vehicle => RELATION_FIELDS['Veículo'].display(vehicle) === vehicleSelect.value);
        if (selectedVehicle && !mileageInput.value) mileageInput.value = selectedVehicle['Quilometragem atual'] || '';
      };
      vehicleSelect.addEventListener('change', suggestMileage);
      suggestMileage();
    }
  }

  if (page === 'seguros' && !editingRecord) {
    const startDate = $('#recordForm').elements.namedItem('f6');
    if (startDate && !startDate.value) startDate.value = D(0);
  }

  if (page === 'sinistros') {
    const form = $('#recordForm');
    const vehicleSelect = form.elements.namedItem('f0');
    const insuranceSelect = form.elements.namedItem('f1');
    const deductibleInput = form.elements.namedItem('f12');
    const occurrenceDate = form.elements.namedItem('f4');
    const noticeDate = form.elements.namedItem('f5');
    const thirdParties = form.elements.namedItem('f8');
    const estimatedValue = form.elements.namedItem('f11');
    if (!editingRecord && thirdParties && !thirdParties.value) thirdParties.value = 'Não';
    if (!editingRecord && estimatedValue && !estimatedValue.value) estimatedValue.value = '0';
    if (!editingRecord && occurrenceDate && !occurrenceDate.value) {
      const now = new Date();
      occurrenceDate.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    if (!editingRecord && noticeDate && !noticeDate.value) noticeDate.value = D(0);
    const updateInsuranceOptions = () => {
      if (!vehicleSelect || !insuranceSelect) return;
      const vehicleLabelValue = vehicleSelect.value;
      const options = recordsOf('seguros').filter(policy => policy['Veículo'] === vehicleLabelValue && !['Cancelado', 'Suspenso', 'Vencido'].includes(policy['Situação']));
      const currentValue = editingRecord?.['Seguro vinculado'] || insuranceSelect.value;
      insuranceSelect.innerHTML = '<option value="">Selecione</option>' + options.map(policy => {
        const label = RELATION_FIELDS['Seguro vinculado'].display(policy);
        return `<option value="${esc(label)}" ${label === currentValue ? 'selected' : ''}>${esc(label)}</option>`;
      }).join('');
      if (currentValue && !options.some(policy => RELATION_FIELDS['Seguro vinculado'].display(policy) === currentValue)) {
        insuranceSelect.insertAdjacentHTML('beforeend', `<option value="${esc(currentValue)}" selected>${esc(currentValue)}</option>`);
      }
    };
    vehicleSelect?.addEventListener('change', () => { if (insuranceSelect) insuranceSelect.value = ''; updateInsuranceOptions(); });
    insuranceSelect?.addEventListener('change', () => {
      if (!deductibleInput || editingRecord) return;
      const policy = recordsOf('seguros').find(item => RELATION_FIELDS['Seguro vinculado'].display(item) === insuranceSelect.value);
      if (policy && (deductibleInput.value === '' || deductibleInput.dataset.autoFilled === 'true')) {
        deductibleInput.value = policy['Franquia (R$)'] || '';
        deductibleInput.dataset.autoFilled = 'true';
      }
    });
    updateInsuranceOptions();
  }

  if (page === 'pneus' && !editingRecord) {
    const acquisition = $('#recordForm').elements.namedItem('f6');
    if (acquisition && !acquisition.value) acquisition.value = D(0);
  }

  if (page === 'multas' && !editingRecord) {
    const infractionDate = $('#recordForm').elements.namedItem('f6');
    if (infractionDate && !infractionDate.value) {
      const now = new Date();
      infractionDate.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
  }

  if (page === 'documentos') {
    const form = $('#recordForm');
    const issueDate = form.elements.namedItem('f4');
    const statusSelect = form.elements.namedItem('f10');
    const responsible = form.elements.namedItem('f9');
    if (!editingRecord && issueDate && !issueDate.value) issueDate.value = D(0);
    if (!editingRecord && statusSelect && !statusSelect.value) statusSelect.value = 'Pendente';
    if (!editingRecord && responsible && !responsible.value) responsible.value = currentProfile?.nome || currentUser?.email || '';
    const typeSelect = form.elements.namedItem('f1');
    const yearInput = form.elements.namedItem('f2');
    const paymentDate = form.elements.namedItem('f7');
    const paymentValue = form.elements.namedItem('f6');
    const syncDocumentRequirements = () => {
      const requiresYear = ['Licenciamento anual', 'IPVA'].includes(typeSelect?.value);
      if (yearInput) yearInput.required = requiresYear;
      const isPaid = statusSelect?.value === 'Pago' && requiresYear;
      if (paymentDate) paymentDate.required = isPaid;
      if (paymentValue) paymentValue.required = isPaid;
    };
    typeSelect?.addEventListener('change', syncDocumentRequirements);
    statusSelect?.addEventListener('change', syncDocumentRequirements);
    syncDocumentRequirements();
  }

  if (page === 'movpneus') {
    const form = $('#recordForm');
    const vehicleSelect = form.elements.namedItem('f1');
    const positionSelect = form.elements.namedItem('f2');
    const dateInput = form.elements.namedItem('f3');
    const kmInput = form.elements.namedItem('f4');
    const movementType = form.elements.namedItem('f5');
    const recapageNumber = form.elements.namedItem('f6');
    const recapageField = form.querySelector('[data-recapagem-field]');
    const tireSelect = form.elements.namedItem('f0');
    if (!editingRecord && dateInput && !dateInput.value) dateInput.value = D(0);
    const selectedTireRecord = () => recordsOf('pneus').find(tire => RELATION_FIELDS['Pneu'].display(tire) === tireSelect?.value);
    const updateRecapageNumber = () => {
      const isRecapageMovement = ['Envio para recapagem', 'Retorno de recapagem'].includes(movementType?.value);
      if (recapageField) recapageField.hidden = !isRecapageMovement;
      if (recapageNumber) {
        recapageNumber.required = isRecapageMovement;
        if (isRecapageMovement) {
          const tire = selectedTireRecord();
          recapageNumber.value = tire ? String(Number(tire['Recapagens realizadas'] || 0) + 1) : '';
        } else {
          recapageNumber.value = '';
        }
      }
    };
    const refreshMovementRequirements = () => {
      const needsVehicle = ['Instalação', 'Rodízio'].includes(movementType?.value);
      if (vehicleSelect) vehicleSelect.required = needsVehicle;
      if (positionSelect) positionSelect.required = needsVehicle;
      updateRecapageNumber();
    };
    movementType?.addEventListener('change', refreshMovementRequirements);
    tireSelect?.addEventListener('change', () => {
      const selectedTire = selectedTireRecord();
      if (vehicleSelect) vehicleSelect.value = selectedTire?.['Veículo atual'] || '';
      if (positionSelect) positionSelect.value = selectedTire?.['Posição atual'] || '';
      if (kmInput) {
        const currentVehicle = recordsOf('veiculos').find(item => RELATION_FIELDS['Veículo'].display(item) === (vehicleSelect?.value || ''));
        kmInput.value = currentVehicle ? (currentVehicle['Quilometragem atual'] || '') : '';
      }
      updateRecapageNumber();
    });
    vehicleSelect?.addEventListener('change', () => {
      const vehicle = recordsOf('veiculos').find(item => RELATION_FIELDS['Veículo'].display(item) === vehicleSelect.value);
      if (kmInput) kmInput.value = vehicle ? (vehicle['Quilometragem atual'] || '') : '';
    });
    refreshMovementRequirements();
  }
  $('#modalBackdrop').classList.add('open');
}

const closeForm = () => $('#modalBackdrop').classList.remove('open');

async function saveForm(event) {
  event.preventDefault();
  if (READ_ONLY_MODULES.has(page)) { toast('Este histórico é somente para consulta.'); return; }
  if (!DB_MODULES.has(page)) { toast('Este módulo ainda não está conectado ao banco.'); return; }
  if (page === 'movpneus' && editingRecord) { toast('O histórico de movimentações de pneus não pode ser editado. Registre uma nova movimentação para corrigir.'); return; }
  if (!hasPermission(page, editingRecord ? 'alterar' : 'incluir')) { toast('Seu perfil não permite esta ação.'); return; }

  const labels = (fields[page] || []).filter(label => page !== 'reservas' || label !== 'Situação');
  const formRecord = {};
  if (page === 'reservas') formRecord['Situação'] = editingRecord ? (editingRecord['Situação'] || 'Pendente') : 'Pendente';
  labels.forEach((label, i) => formRecord[label] = event.target.elements['f' + i].value);
  if (page === 'reservas') {
    const start = new Date(formRecord['Data/hora de retirada']);
    const end = new Date(formRecord['Data/hora prevista de devolução']);
    if (!formRecord['Solicitante']?.trim()) { toast('Informe o solicitante.'); return; }
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      toast('A devolução prevista precisa ser posterior à retirada.'); return;
    }
    if (!formRecord['Veículo'] && !formRecord['Categoria do veículo']) {
      toast('Selecione um veículo ou informe a categoria desejada.'); return;
    }
  }
  if (page === 'veiculos') {
    const plate = String(formRecord['Placa'] || '').toUpperCase();
    if (!(/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(plate) || /^[A-Z]{3}-[0-9]{4}$/.test(plate))) {
      toast('Informe uma placa completa: Mercosul ABC1D23 ou formato antigo ABC-1234.'); return;
    }
    formRecord['Placa'] = plate;
  }
  if (page === 'documentos') {
    const issueDate = formRecord['Data de emissão'];
    const expiryDate = formRecord['Data de validade'];
    if (issueDate && expiryDate && expiryDate < issueDate) { toast('A validade do documento não pode ser anterior à emissão.'); return; }
    if (issueDate && formRecord['Data de pagamento'] && formRecord['Data de pagamento'] < issueDate) { toast('A data de pagamento não pode ser anterior à emissão do documento.'); return; }
    const docType = formRecord['Tipo de documento'];
    const year = formRecord['Ano de referência'];
    if (['Licenciamento anual', 'IPVA'].includes(docType) && (!year || !/^\d{4}$/.test(year))) {
      toast('Informe o ano de referência com quatro dígitos para licenciamento ou IPVA.'); return;
    }
    if (formRecord['Situação'] === 'Pago' && ['Licenciamento anual', 'IPVA'].includes(docType)) {
      if (!formRecord['Data de pagamento'] || formRecord['Valor pago'] === '') { toast('Para marcar IPVA ou licenciamento como pago, informe data e valor do pagamento.'); return; }
    }
    const paid = Number(formRecord['Valor pago'] || 0);
    if (!Number.isFinite(paid) || paid < 0) { toast('Informe um valor pago válido.'); return; }
  }
  if (page === 'seguros') {
    const start = formRecord['Início da vigência'];
    const end = formRecord['Fim da vigência'];
    const premium = Number(formRecord['Valor do prêmio (R$)'] || 0);
    const insured = Number(formRecord['Valor segurado (R$)'] || 0);
    const deductible = Number(formRecord['Franquia (R$)'] || 0);
    if (start && end && end < start) { toast('O fim da vigência não pode ser anterior ao início.'); return; }
    if ([premium, insured, deductible].some(value => !Number.isFinite(value) || value < 0)) { toast('Informe valores válidos e não negativos para prêmio, valor segurado e franquia.'); return; }
  }
  if (page === 'modelos') {
    if (formRecord['Obrigatório na saída'] !== 'Sim' && formRecord['Obrigatório na devolução'] !== 'Sim') {
      toast('Habilite o modelo para checklist de saída, de devolução ou ambos.'); return;
    }
  }
  if (page === 'itens') {
    const order = Number(formRecord['Ordem'] || 0);
    if (!Number.isInteger(order) || order < 0) { toast('A ordem do item precisa ser um número inteiro igual ou maior que zero.'); return; }
    if (formRecord['Tipo de resposta'] !== 'Condição') { toast('O painel do motorista atualmente utiliza o tipo de resposta Condição.'); return; }
    if (formRecord['Exige fotografia'] === 'Sim') { toast('O envio de fotos por item ainda não está disponível no checklist do motorista. Mantenha esta opção como Não.'); return; }
  }
  if (page === 'sinistros') {
    const occurrence = formRecord['Data/hora da ocorrência'];
    const notice = formRecord['Data do aviso à seguradora'];
    if (occurrence && notice && notice < occurrence.slice(0, 10)) { toast('O aviso à seguradora não pode ser anterior à ocorrência.'); return; }
    const monetary = ['Valor estimado dos danos (R$)', 'Valor da franquia (R$)', 'Valor da indenização (R$)'];
    if (monetary.some(label => formRecord[label] !== '' && (!Number.isFinite(Number(formRecord[label])) || Number(formRecord[label]) < 0))) { toast('Informe valores válidos e não negativos para os valores do sinistro.'); return; }
    if (formRecord['Situação'] === 'Encerrado' && !formRecord['Data de encerramento']) { toast('Informe a data de encerramento para finalizar o sinistro.'); return; }
  }
  if (page === 'multas') {
    const amount = Number(formRecord['Valor']);
    if (!Number.isFinite(amount) || amount < 0) { toast('Informe um valor válido para a multa.'); return; }
    const infractionDate = formRecord['Data/hora'];
    const dueDate = formRecord['Vencimento'];
    const indicationDate = formRecord['Prazo para indicação'];
    if (infractionDate && dueDate && dueDate < infractionDate.slice(0, 10)) { toast('O vencimento não pode ser anterior à data da infração.'); return; }
    if (infractionDate && indicationDate && indicationDate < infractionDate.slice(0, 10)) { toast('O prazo de indicação não pode ser anterior à data da infração.'); return; }
  }
  if (page === 'despesas') {
    const gross = Number(formRecord['Valor bruto']);
    const discount = Number(formRecord['Desconto'] || 0);
    const interest = Number(formRecord['Juros'] || 0);
    const net = gross - discount + interest;
    if (!Number.isFinite(gross) || gross <= 0 || discount < 0 || interest < 0 || net < 0) {
      toast('Confira os valores: o valor bruto deve ser maior que zero e o líquido não pode ser negativo.'); return;
    }
    formRecord['Valor líquido'] = net.toFixed(2);
    if (formRecord['Vencimento'] && formRecord['Vencimento'] < formRecord['Data de lançamento']) {
      toast('O vencimento não pode ser anterior à data de lançamento.'); return;
    }
    if (formRecord['Situação'] === 'Paga' && !formRecord['Data de pagamento']) {
      toast('Informe a data de pagamento para uma despesa marcada como Paga.'); return;
    }
    if (formRecord['Data de pagamento'] && formRecord['Situação'] !== 'Paga') {
      toast('Altere a situação para Paga quando informar a data de pagamento.'); return;
    }
  }
  if (page === 'rateios') {
    // O destino é escolhido no controle único (tipo + cadastro) e copiado
    // para o campo relacional correspondente antes de validar/gravar.
    const targetType = event.target.querySelector('[data-rateio-target-type]')?.value || '';
    const targetValue = event.target.querySelector('[data-rateio-target-value]')?.value || '';
    if (targetType && targetValue && ['Veículo', 'Centro de custo'].includes(targetType)) {
      formRecord['Veículo'] = '';
      formRecord['Centro de custo'] = '';
      formRecord[targetType] = targetValue;
    }
    const targetCount = [formRecord['Veículo'], formRecord['Centro de custo']]
      .filter(value => String(value || '').trim() !== '').length;
    if (targetCount !== 1) { toast('Escolha o tipo de destino e depois selecione o cadastro correspondente.'); return; }
    const expense = recordsOf('despesas').find(item => RELATION_FIELDS['Despesa vinculada'].display(item) === formRecord['Despesa vinculada']);
    if (!expense) { toast('Selecione uma despesa válida para ratear.'); return; }
    const criterion = formRecord['Critério de rateio'];
    const expenseNet = Number(expense['Valor líquido'] || 0);
    const rateValue = Number(formRecord['Valor'] || 0);
    const ratePercent = Number(formRecord['Percentual'] || 0);
    if (criterion === 'Percentual' && (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent > 100)) {
      toast('Informe um percentual maior que zero e até 100%.'); return;
    }
    if (criterion === 'Valor fixo' && (!Number.isFinite(rateValue) || rateValue <= 0)) {
      toast('Informe um valor de rateio maior que zero.'); return;
    }
    const otherRates = recordsOf('rateios').filter(item => item['Despesa vinculada'] === formRecord['Despesa vinculada'] && String(item.id) !== String(editingRecord?.id || ''));
    if (otherRates.some(item => item['Critério de rateio'] && item['Critério de rateio'] !== criterion)) {
      toast('Use o mesmo critério em todos os rateios da mesma despesa.'); return;
    }
    if (criterion === 'Percentual') {
      const used = otherRates.reduce((sum, item) => sum + Number(item.Percentual || 0), 0);
      if (used + ratePercent > 100.0001) { toast(`Esse rateio ultrapassa 100%. Já foram distribuídos ${used.toLocaleString('pt-BR')}%.`); return; }
      formRecord['Valor'] = (expenseNet * ratePercent / 100).toFixed(2);
    } else {
      const used = otherRates.reduce((sum, item) => sum + Number(item.Valor || 0), 0);
      if (used + rateValue > expenseNet + 0.005) { toast(`O rateio ultrapassa o valor da despesa. Já foram distribuídos ${money(used)}.`); return; }
      formRecord['Percentual'] = expenseNet > 0 ? (rateValue / expenseNet * 100).toFixed(4) : '0';
    }
  }
  if (page === 'movpneus') {
    const type = formRecord['Tipo de movimentação'];
    if (['Instalação', 'Rodízio'].includes(type) && (!formRecord['Veículo'] || !formRecord['Posição de instalação'])) {
      toast('Para instalação ou rodízio, selecione o veículo e a posição do pneu.');
      return;
    }
    const requiresVehicleKm = ['Instalação', 'Rodízio', 'Remoção'].includes(type) || (type === 'Inspeção' && Boolean(formRecord['Veículo']));
    if (requiresVehicleKm && formRecord['Quilometragem'] === '') {
      toast('Informe a quilometragem do veículo para esta movimentação.');
      return;
    }
    if (['Envio para recapagem', 'Retorno de recapagem'].includes(type)) {
      const recapageNo = Number(formRecord['Número da recapagem']);
      if (!Number.isInteger(recapageNo) || recapageNo < 1) {
        toast('O número da recapagem precisa ser um inteiro positivo.');
        return;
      }
    }
  }
  const submit = event.target.querySelector('button[type="submit"]');
  if (submit) { submit.disabled = true; submit.textContent = 'Salvando...'; }

  try {
    if (page === 'documentos') {
      const file = event.target.querySelector('[data-document-file]')?.files?.[0];
      if (file) {
        const vehicleRecord = recordsOf('veiculos').find(item => RELATION_FIELDS['Veículo'].display(item) === formRecord['Veículo']);
        if (!vehicleRecord) throw new Error('Selecione um veículo válido antes de anexar o documento.');
        formRecord['Arquivo digital'] = await uploadDocumentAttachment(file, vehicleRecord.id);
      }
    }
    if (page === 'seguros' || page === 'sinistros') {
      const file = event.target.querySelector('[data-vehicle-file]')?.files?.[0];
      if (file) {
        const vehicleRecord = recordsOf('veiculos').find(item => RELATION_FIELDS['Veículo'].display(item) === formRecord['Veículo']);
        if (!vehicleRecord) throw new Error('Selecione um veículo válido antes de anexar o arquivo.');
        const folder = page === 'seguros' ? 'apolices' : 'sinistros';
        const field = page === 'seguros' ? 'Arquivo da apólice' : 'Anexo do sinistro';
        formRecord[field] = await uploadInsuranceClaimAttachment(file, vehicleRecord.id, folder);
      }
    }
    const payload = buildSupabasePayload(page, formRecord);
    const table = SUPABASE_MODULES[page].table;
    let result;
    if (editingRecord) {
      result = await window.npiSupabase.from(table).update(payload).eq('id', editingRecord.id);
    } else {
      result = await window.npiSupabase.from(table).insert(payload);
    }
    if (result.error) throw result.error;
    await refreshSupabaseAfterMutation(page);
    closeForm();
    toast(editingRecord ? 'Registro atualizado no Supabase.' : 'Registro salvo no Supabase.');
    renderPage();
  } catch (error) {
    console.error('Erro ao salvar no Supabase:', error);
    if ((page === 'seguros' && error.code === '23505')) {
      toast('Já existe uma apólice com esse número. Confira o número informado.');
    } else if (page === 'sinistros' && error.code === '23505') {
      toast('Já existe um sinistro com esse número. Confira a identificação informada.');
    } else if ((page === 'seguros' || page === 'sinistros') && (error.message || '').toLowerCase().includes('bucket')) {
      toast('O armazenamento de seguros e sinistros ainda não foi configurado. Execute o SQL do módulo.');
    } else if (page === 'multas' && error.code === '23505') {
      toast('Já existe uma multa cadastrada com esse auto de infração. Confira o número do auto.');
    } else if (page === 'documentos' && (error.message || '').toLowerCase().includes('bucket')) {
      toast('O armazenamento de documentos ainda não foi configurado. Execute o SQL do módulo Documentos.');
    } else {
      toast('Não foi possível salvar: ' + (error.message || 'verifique os campos e as permissões RLS.'));
    }
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = 'Salvar registro'; }
  }
}

async function deleteRecord(id) {
  if (READ_ONLY_MODULES.has(page)) { toast('Este histórico é somente para consulta e não pode ser excluído.'); return; }
  if (!DB_MODULES.has(page)) { toast('Este módulo ainda não está conectado ao banco.'); return; }
  if (page === 'retiradas' || page === 'devolucoes') { toast('Registros de retirada e devolução compõem o histórico operacional e não podem ser excluídos por esta tela.'); return; }
  if (page === 'movpneus') { toast('O histórico de movimentações de pneus é permanente e não pode ser excluído por esta tela.'); return; }
  if (!hasPermission(page,'excluir')) { toast('Seu perfil não permite excluir registros.'); return; }
  if (page === 'empresas') { toast('A empresa principal não pode ser excluída por esta tela.'); return; }
  if (page === 'modelos' && recordsOf('itens').some(item => item['Modelo de Checklist'] === (recordsOf('modelos').find(row => String(row.id) === String(id))?.['Nome do modelo'] || ''))) {
    toast('Este modelo possui itens cadastrados. Altere sua situação para Inativo para preservar os checklists anteriores.'); return;
  }
  if (!confirm('Excluir este registro do banco de dados?')) return;
  try {
    const { error } = await window.npiSupabase.from(SUPABASE_MODULES[page].table).delete().eq('id', id);
    if (error) {
      if (page === 'pneus' && error.code === '23503') {
        throw new Error('Este pneu já possui movimentações registradas. Preserve o histórico e altere a situação para Inativo, em vez de excluir.');
      }
      if (page === 'despesas' && error.code === '23503') {
        throw new Error('Esta despesa possui rateios vinculados. Exclua primeiro os rateios ou mantenha a despesa no histórico.');
      }
      if (page === 'itens' && error.code === '23503') {
        throw new Error('Este item já aparece em checklists respondidos. Altere sua situação para Inativo para preservar o histórico.');
      }
      if (page === 'modelos' && error.code === '23503') {
        throw new Error('Este modelo possui itens cadastrados. Altere sua situação para Inativo para preservar a configuração e o histórico.');
      }
      throw error;
    }
    await refreshSupabaseAfterMutation(page);
    toast('Registro excluído do Supabase.');
    renderPage();
  } catch (error) {
    console.error('Erro ao excluir no Supabase:', error);
    toast('Não foi possível excluir: ' + (error.message || 'verifique os vínculos deste registro.'));
  }
}

