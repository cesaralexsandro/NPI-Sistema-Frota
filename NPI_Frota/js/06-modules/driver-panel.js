/* NPI FROTA | Painel do motorista, autoatendimento, checklists e utilização.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

async function renderDriverPanel(workspace) {
  if (!currentProfile?.motorista_id) {
    workspace.innerHTML = `<section class="panel access-empty"><i data-lucide="user-round-x"></i><h3>Cadastro de motorista não vinculado</h3><p>Seu login ainda não está associado a um cadastro de motorista. Solicite ao administrador que vincule seu usuário ao cadastro correto.</p></section>`;
    refreshIcons(); return;
  }
  workspace.innerHTML = '<div class="empty">Carregando veículos atribuídos e disponíveis...</div>';
  try {
    const [assignmentsRes, withdrawalsRes, availableRes] = await Promise.all([
      window.npiSupabase.from('motorista_veiculos')
        .select('id,data_inicio,data_fim,ativo,servico,servico_detalhes,veiculos(id,placa,codigo_interno,marca,modelo,categoria,quilometragem_atual,situacao)')
        .eq('motorista_id', currentProfile.motorista_id).eq('ativo', true)
        .lte('data_inicio', new Date().toISOString().slice(0,10))
        .order('data_inicio', { ascending: false }),
      window.npiSupabase.from('retiradas')
        .select('id,veiculo_id,motorista_id,data_hora_retirada,quilometragem_inicial,nivel_combustivel,destino,situacao')
        .eq('motorista_id', currentProfile.motorista_id).eq('situacao', 'Em aberto')
        .order('data_hora_retirada', { ascending: false }),
      window.npiSupabase.rpc('npi_driver_list_available_vehicles')
    ]);
    if (assignmentsRes.error) throw assignmentsRes.error;
    if (withdrawalsRes.error) throw withdrawalsRes.error;
    if (availableRes.error) throw availableRes.error;

    const today = new Date().toISOString().slice(0,10);
    const assignments = (assignmentsRes.data || []).filter(item => item.veiculos && (!item.data_fim || item.data_fim >= today));
    const withdrawalsByVehicle = new Map((withdrawalsRes.data || []).map(row => [row.veiculo_id, row]));
    const vehicles = assignments.map(item => ({
      ...item.veiculos,
      assignment_id: item.id,
      servico: item.servico || '',
      servico_detalhes: item.servico_detalhes || '',
      open_withdrawal: withdrawalsByVehicle.get(item.veiculos.id) || null
    }));
    const availableVehicles = (availableRes.data || []).filter(item => !vehicles.some(assigned => assigned.id === item.id));

    const welcome = `<div class="driver-welcome"><div><span class="eyebrow">ÁREA DO MOTORISTA</span><h2>Olá, ${esc(currentProfile.nome || 'Motorista')}</h2><p>Escolha um veículo disponível, informe o serviço e registre a saída e a devolução com checklist.</p></div><span class="driver-count"><b>${vehicles.length}</b><small>veículo(s) vinculado(s)</small></span></div>`;

    const assignedSection = vehicles.length ? `
      <section class="driver-panel-section">
        <div class="driver-section-heading"><div><span class="eyebrow">SEUS VÍNCULOS</span><h3>Veículos vinculados a você</h3><p>Gerencie a utilização, devolução ou encerramento do vínculo.</p></div></div>
        <div class="driver-vehicle-grid">${vehicles.map(v => {
          const activeWithdrawal = v.open_withdrawal;
          let actionHtml = '';
          if (activeWithdrawal) {
            actionHtml = `<button type="button" class="btn btn-primary driver-action-btn" data-driver-action="return" data-vehicle-id="${esc(v.id)}"><i data-lucide="corner-down-left"></i> Devolver veículo</button><small class="driver-action-note">Retirada aberta · saída em ${new Date(activeWithdrawal.data_hora_retirada).toLocaleString('pt-BR')}</small>`;
          } else if (['Disponível','Reservado'].includes(v.situacao)) {
            actionHtml = `<button type="button" class="btn btn-primary driver-action-btn" data-driver-action="start" data-vehicle-id="${esc(v.id)}"><i data-lucide="key-round"></i> Utilizar veículo</button><small class="driver-action-note">Preencha o checklist antes de sair.</small>`;
          } else {
            actionHtml = `<button type="button" class="btn btn-light driver-action-btn" disabled><i data-lucide="lock"></i> Indisponível</button><small class="driver-action-note">Este veículo não pode ser utilizado no momento.</small>`;
          }
          let unlinkHtml = '';
          if (activeWithdrawal || v.situacao === 'Em utilização') {
            unlinkHtml = `<button type="button" class="btn btn-light driver-action-btn driver-unlink-btn" disabled title="Devolva o veículo antes de se desvincular"><i data-lucide="unlink"></i> Desvincular veículo</button><small class="driver-action-note">Para liberar o veículo, primeiro registre a devolução.</small>`;
          } else {
            unlinkHtml = `<button type="button" class="btn btn-light driver-action-btn driver-unlink-btn" data-driver-unlink data-assignment-id="${esc(v.assignment_id)}" data-vehicle-id="${esc(v.id)}"><i data-lucide="unlink"></i> Desvincular veículo</button>`;
          }
          return `<article class="driver-vehicle-card">
            <div class="driver-vehicle-top"><span class="driver-car-icon"><i data-lucide="car-front"></i></span><span class="status ${TONE[v.situacao] || 'info'}">${esc(v.situacao || 'Sem situação')}</span></div>
            <span class="driver-plate">${esc(v.placa || 'Sem placa')}</span><h3>${esc([v.marca,v.modelo].filter(Boolean).join(' ') || 'Veículo')}</h3>
            <div class="driver-km"><small>Quilometragem atual</small><strong>${Number(v.quilometragem_atual || 0).toLocaleString('pt-BR')} <small>km</small></strong></div>
            <div class="driver-vehicle-meta"><span>Código interno</span><b>${esc(v.codigo_interno || '—')}</b></div>
            <div class="driver-vehicle-meta"><span>Serviço escolhido</span><b>${esc(v.servico || 'Não informado')}</b></div>
            ${v.servico_detalhes ? `<p class="driver-service-details">${esc(v.servico_detalhes)}</p>` : ''}
            <div class="driver-vehicle-actions">${actionHtml}${unlinkHtml}</div>
          </article>`;
        }).join('')}</div>
      </section>` : `
      <section class="panel access-empty driver-no-assignment"><i data-lucide="car-front"></i><h3>Você ainda não possui veículo vinculado</h3><p>Escolha um dos veículos disponíveis abaixo, informe qual serviço vai realizar e confirme a vinculação. Não é necessário solicitar a atribuição ao administrador.</p></section>`;

    const availableSection = `
      <section class="driver-panel-section driver-available-section">
        <div class="driver-section-heading"><div><span class="eyebrow">AUTOATENDIMENTO</span><h3>Veículos disponíveis para você</h3><p>Selecione um veículo e informe o serviço que vai realizar. O veículo ficará reservado para seu usuário.</p></div><span class="driver-available-count">${availableVehicles.length} disponível(is)</span></div>
        ${availableVehicles.length ? `<div class="driver-vehicle-grid">${availableVehicles.map(v => `
          <article class="driver-vehicle-card driver-available-card">
            <div class="driver-vehicle-top"><span class="driver-car-icon"><i data-lucide="car-front"></i></span><span class="status ok">Disponível</span></div>
            <span class="driver-plate">${esc(v.placa || 'Sem placa')}</span><h3>${esc([v.marca,v.modelo].filter(Boolean).join(' ') || 'Veículo')}</h3>
            <div class="driver-km"><small>Quilometragem atual</small><strong>${Number(v.quilometragem_atual || 0).toLocaleString('pt-BR')} <small>km</small></strong></div>
            <div class="driver-vehicle-meta"><span>Código interno</span><b>${esc(v.codigo_interno || '—')}</b></div>
            <div class="driver-vehicle-actions"><button type="button" class="btn btn-primary driver-action-btn" data-driver-choose data-vehicle-id="${esc(v.id)}"><i data-lucide="hand"></i> Vincular a mim</button><small class="driver-action-note">Você informará o serviço antes de confirmar.</small></div>
          </article>`).join('')}</div>` : `<div class="empty driver-no-available"><i data-lucide="car-front"></i><b>Nenhum veículo disponível no momento.</b><span>Veículos em utilização, manutenção ou já reservados para outro motorista não aparecem nesta lista.</span></div>`}
      </section>`;

    workspace.innerHTML = welcome + assignedSection + availableSection;
    bindDriverPanelEvents(workspace, vehicles, availableVehicles);
  } catch (error) {
    console.error('Erro ao carregar painel do motorista:', error);
    workspace.innerHTML = `<div class="empty integration-notice">Não foi possível carregar seus veículos: ${esc(error.message || 'verifique as permissões RLS e execute a atualização do autoatendimento do motorista no Supabase.')}</div>`;
  }
  refreshIcons();
}
async function loadDriverChecklist(vehicle, stage) {
  const { data: models, error: modelsError } = await window.npiSupabase
    .from('modelos_checklist')
    .select('id,nome,categoria_veiculo,obrigatorio_saida,obrigatorio_devolucao,situacao')
    .eq('situacao','Ativo');
  if (modelsError) throw modelsError;
  const requiredFlag = stage === 'Saída' ? 'obrigatorio_saida' : 'obrigatorio_devolucao';
  const category = String(vehicle.categoria || '').trim().toLowerCase();
  const model = (models || []).filter(m => m[requiredFlag]).sort((a,b) => {
    const ca = String(a.categoria_veiculo || '').trim().toLowerCase();
    const cb = String(b.categoria_veiculo || '').trim().toLowerCase();
    const score = c => c && c !== 'todas' && c !== 'todos' ? (c === category ? 0 : 2) : 1;
    return score(ca) - score(cb);
  }).find(m => {
    const c = String(m.categoria_veiculo || '').trim().toLowerCase();
    return !c || ['todas','todos','todas as categorias'].includes(c) || !category || c === category;
  });
  if (!model) throw new Error(`Não existe um modelo de checklist ativo para ${stage.toLowerCase()}. Peça ao administrador para configurar um modelo em Modelos de Checklist.`);

  const { data: items, error: itemsError } = await window.npiSupabase
    .from('itens_checklist')
    .select('id,descricao,grupo,tipo_resposta,obrigatorio,exige_fotografia,ordem')
    .eq('modelo_checklist_id', model.id).eq('situacao','Ativo').order('ordem',{ascending:true});
  if (itemsError) throw itemsError;
  if (!items?.length) throw new Error('O modelo de checklist selecionado ainda não possui itens ativos.');
  return { model, items };
}

function driverChecklistHtml(items, title) {
  const groups = [...new Set(items.map(item => item.grupo || 'Inspeção geral'))];
  return `<section class="driver-checklist-section">
    <div class="driver-checklist-heading"><span class="eyebrow">INSPEÇÃO OBRIGATÓRIA</span><h3>${esc(title)}</h3><p>Marque a condição de cada item. Se encontrar algo fora do normal, descreva no campo de observação.</p></div>
    ${groups.map(group => `<div class="driver-checklist-group"><h4>${esc(group)}</h4>${items.filter(item => (item.grupo || 'Inspeção geral') === group).map(item => `
      <div class="driver-checklist-item" data-check-item="${esc(item.id)}">
        <div class="driver-checklist-item-title"><b>${esc(item.descricao)}</b>${item.obrigatorio ? '<span class="driver-required">Obrigatório</span>' : '<span class="muted-note">Opcional</span>'}</div>
        <select class="driver-check-answer" data-item-id="${esc(item.id)}" data-item-required="${item.obrigatorio ? 'true' : 'false'}" ${item.obrigatorio ? 'required' : ''}>
          <option value="">Selecione a condição</option><option value="Conforme">Conforme</option><option value="Não conforme">Não conforme</option><option value="Não se aplica">Não se aplica</option>
        </select>
        <textarea class="driver-check-observation" rows="2" placeholder="Observação (obrigatória se marcar Não conforme)"></textarea>
      </div>`).join('')}</div>`).join('')}
  </section>`;
}

function bindDriverPanelEvents(workspace, vehicles, availableVehicles = []) {
  workspace.querySelectorAll('[data-driver-choose]').forEach(button => {
    button.addEventListener('click', async () => {
      const vehicle = availableVehicles.find(item => item.id === button.dataset.vehicleId);
      if (!vehicle) return;
      button.disabled = true;
      try {
        await openDriverSelfAssignModal(workspace, vehicle);
      } catch (error) {
        console.error('Erro ao abrir seleção de veículo:', error);
        toast(error.message || 'Não foi possível abrir a seleção do veículo.');
      } finally {
        button.disabled = false;
      }
    });
  });

  workspace.querySelectorAll('[data-driver-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const vehicle = vehicles.find(item => item.id === button.dataset.vehicleId);
      if (!vehicle) return;
      button.disabled = true;
      try {
        await openDriverOperationModal(workspace, vehicle, button.dataset.driverAction);
      } catch (error) {
        console.error('Erro ao abrir operação do motorista:', error);
        toast(error.message || 'Não foi possível abrir o formulário.');
      } finally {
        button.disabled = false;
      }
    });
  });

  // O motorista pode encerrar apenas o próprio vínculo com o veículo.
  // O histórico fica preservado; o banco bloqueia a ação se houver retirada aberta.
  workspace.querySelectorAll('[data-driver-unlink]').forEach(button => {
    button.addEventListener('click', async () => {
      const vehicle = vehicles.find(item => item.id === button.dataset.vehicleId);
      const assignmentId = button.dataset.assignmentId;
      if (!vehicle || !assignmentId) return;
      const vehicleName = [vehicle.placa, vehicle.marca, vehicle.modelo].filter(Boolean).join(' · ');
      const confirmed = window.confirm(
        `Deseja realmente se desvincular do veículo ${vehicleName}?\n\n` +
        'O vínculo ativo será encerrado, mas o histórico de utilização e checklists será preservado.'
      );
      if (!confirmed) return;

      button.disabled = true;
      button.innerHTML = '<i data-lucide="loader-circle"></i> Desvinculando...';
      refreshIcons();
      try {
        const { error } = await window.npiSupabase.rpc('npi_driver_unassign_vehicle', {
          p_assignment_id: assignmentId
        });
        if (error) throw error;
        toast('Vínculo encerrado. O veículo não aparece mais no seu painel.');
        await renderDriverPanel(workspace);
      } catch (error) {
        console.error('Erro ao desvincular veículo:', error);
        toast('Não foi possível se desvincular: ' + (error.message || 'tente novamente.'));
        button.disabled = false;
        button.innerHTML = '<i data-lucide="unlink"></i> Desvincular veículo';
        refreshIcons();
      }
    });
  });
}

async function openDriverSelfAssignModal(workspace, vehicle) {
  const services = [
    'Atendimento funerário',
    'Remoção',
    'Translado',
    'Sepultamento / cortejo',
    'Entrega / retirada de materiais',
    'Apoio operacional',
    'Serviço administrativo',
    'Outro'
  ];
  const overlay = document.createElement('div');
  overlay.className = 'driver-operation-backdrop';
  overlay.id = 'driverSelfAssignModal';
  overlay.innerHTML = `<section class="driver-operation-modal driver-self-assign-modal" role="dialog" aria-modal="true" aria-labelledby="driverSelfAssignTitle">
    <header class="driver-operation-header"><div><span class="eyebrow">AUTOATRIBUIÇÃO DE VEÍCULO</span><h2 id="driverSelfAssignTitle">Vincular veículo a mim</h2><p>${esc(vehicle.placa || '')} · ${esc([vehicle.marca,vehicle.modelo].filter(Boolean).join(' '))}</p></div><button type="button" class="close-modal" data-self-assign-close aria-label="Fechar">×</button></header>
    <div class="driver-self-assign-summary"><span class="driver-car-icon"><i data-lucide="car-front"></i></span><div><b>${esc(vehicle.codigo_interno || 'Veículo disponível')}</b><small>Quilometragem atual: ${Number(vehicle.quilometragem_atual || 0).toLocaleString('pt-BR')} km</small></div></div>
    <form id="driverSelfAssignForm">
      <div class="driver-operation-fields">
        <label class="driver-field-full">Qual serviço você vai realizar?
          <select id="driverSelfAssignService" required><option value="">Selecione o serviço</option>${services.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join('')}</select>
        </label>
        <label class="driver-field-full">Detalhes do serviço <span class="muted-note">(opcional, obrigatório para “Outro”)</span>
          <textarea id="driverSelfAssignDetails" rows="3" maxlength="1000" placeholder="Informe ordem de serviço, setor, local ou outros detalhes"></textarea>
        </label>
      </div>
      <div class="driver-self-assign-notice"><i data-lucide="info"></i><span>Ao confirmar, o veículo ficará reservado para você. A utilização só começa depois que preencher o checklist de saída.</span></div>
      <div class="driver-operation-actions"><button type="button" class="btn btn-light" data-self-assign-close>Cancelar</button><button type="submit" class="btn btn-primary" id="driverSelfAssignSubmit"><i data-lucide="check"></i> Confirmar vinculação</button></div>
    </form>
  </section>`;
  workspace.appendChild(overlay);
  refreshIcons();
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-self-assign-close]').forEach(button => button.addEventListener('click', close));
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  const form = overlay.querySelector('#driverSelfAssignForm');
  const serviceSelect = form.querySelector('#driverSelfAssignService');
  const details = form.querySelector('#driverSelfAssignDetails');
  serviceSelect.addEventListener('change', () => {
    details.required = serviceSelect.value === 'Outro';
    details.placeholder = serviceSelect.value === 'Outro' ? 'Descreva o serviço que será realizado' : 'Informe ordem de serviço, setor, local ou outros detalhes';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const service = serviceSelect.value;
    const serviceDetails = details.value.trim();
    if (!service) { toast('Selecione o serviço que será realizado.'); return; }
    if (service === 'Outro' && !serviceDetails) { toast('Descreva o serviço selecionado como Outro.'); return; }
    const submit = form.querySelector('#driverSelfAssignSubmit');
    submit.disabled = true;
    submit.innerHTML = '<i data-lucide="loader-circle"></i> Vinculando...';
    refreshIcons();
    try {
      const { error } = await window.npiSupabase.rpc('npi_driver_self_assign_vehicle', {
        p_veiculo_id: vehicle.id,
        p_servico: service,
        p_servico_detalhes: serviceDetails || null
      });
      if (error) throw error;
      close();
      toast('Veículo reservado para você. Agora já pode iniciar a utilização com o checklist de saída.');
      await renderDriverPanel(workspace);
    } catch (error) {
      console.error('Erro ao se vincular ao veículo:', error);
      toast('Não foi possível vincular o veículo: ' + (error.message || 'tente novamente.'));
      submit.disabled = false;
      submit.innerHTML = '<i data-lucide="check"></i> Confirmar vinculação';
      refreshIcons();
    }
  });
}

function driverLocalDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// Confirma a divergência com o gestor usando uma sessão Supabase temporária.
// A senha é validada pelo Supabase Auth e nunca é enviada ao PostgreSQL nem armazenada.
async function requestManagerKmAuthorization({ vehicle, requestedKm, currentKm, driverId }) {
  const config = window.NPI_SUPABASE_CONFIG;
  if (!config || !window.supabase?.createClient) {
    throw new Error('Não foi possível iniciar a validação segura do gestor. Confira a configuração do Supabase.');
  }

  const overlay = document.createElement('div');
  overlay.className = 'driver-operation-backdrop driver-manager-auth-backdrop';
  overlay.id = 'driverManagerKmApproval';
  overlay.innerHTML = `
    <section class="driver-operation-modal driver-manager-auth-modal" role="dialog" aria-modal="true" aria-labelledby="driverManagerAuthTitle">
      <header class="driver-operation-header">
        <div><span class="eyebrow">AUTORIZAÇÃO DO GESTOR</span><h2 id="driverManagerAuthTitle">Divergência de quilometragem</h2>
          <p>O hodômetro informado é diferente da última quilometragem confirmada.</p></div>
        <button type="button" class="close-modal" data-manager-auth-close aria-label="Fechar">×</button>
      </header>
      <div class="driver-km-approval-summary">
        <div><small>Veículo</small><strong>${esc(vehicle.placa || vehicle.codigo_interno || 'Veículo')}</strong></div>
        <div><small>Última quilometragem confirmada</small><strong>${Number(currentKm).toLocaleString('pt-BR')} km</strong></div>
        <div><small>Quilometragem informada</small><strong>${Number(requestedKm).toLocaleString('pt-BR')} km</strong></div>
        <div><small>Diferença</small><strong>+${Number(requestedKm - currentKm).toLocaleString('pt-BR')} km</strong></div>
      </div>
      <form id="driverManagerAuthForm" class="driver-manager-auth-form">
        <label>E-mail do gestor ou administrador<input id="driverManagerEmail" type="email" autocomplete="username" required placeholder="gestor@empresa.com"></label>
        <label>Senha do gestor<input id="driverManagerPassword" type="password" autocomplete="current-password" required placeholder="Digite a senha do gestor"></label>
        <label>Justificativa da divergência<textarea id="driverManagerKmReason" rows="2" required maxlength="500" placeholder="Explique por que o hodômetro está diferente"></textarea></label>
        <p class="driver-operation-footnote"><i data-lucide="shield-check"></i> A senha é validada diretamente pelo Supabase Auth. Ela não será salva nem substituirá a sessão do motorista. Somente Gestor de Frota ou Administrador pode aprovar.</p>
        <div class="driver-operation-actions"><button type="button" class="btn btn-light" data-manager-auth-close>Cancelar</button><button type="submit" class="btn btn-primary" id="driverManagerAuthSubmit">Autorizar quilometragem</button></div>
      </form>
      <p class="driver-manager-auth-error" id="driverManagerAuthError" hidden></p>
    </section>`;
  document.body.appendChild(overlay);
  refreshIcons();

  return new Promise((resolve, reject) => {
    const form = overlay.querySelector('#driverManagerAuthForm');
    const submit = overlay.querySelector('#driverManagerAuthSubmit');
    const errorBox = overlay.querySelector('#driverManagerAuthError');
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      callback(value);
    };
    overlay.querySelectorAll('[data-manager-auth-close]').forEach(button => button.addEventListener('click', () => finish(reject, new Error('Autorização cancelada pelo usuário.'))));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(reject, new Error('Autorização cancelada pelo usuário.'));
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const email = form.querySelector('#driverManagerEmail').value.trim();
      const password = form.querySelector('#driverManagerPassword').value;
      const reason = form.querySelector('#driverManagerKmReason').value.trim();
      if (!email || !password || !reason) {
        errorBox.textContent = 'Informe e-mail, senha e justificativa.';
        errorBox.hidden = false;
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Validando gestor...';
      errorBox.hidden = true;

      // Sessão isolada: não altera nem encerra a sessão autenticada do motorista.
      const managerClient = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      try {
        const authResult = await managerClient.auth.signInWithPassword({ email, password });
        if (authResult.error) throw new Error('Não foi possível autenticar o gestor. Confira o e-mail e a senha.');
        const approvalResult = await managerClient.rpc('npi_manager_authorize_vehicle_km', {
          p_veiculo_id: vehicle.id,
          p_motorista_id: driverId,
          p_quilometragem_anterior: currentKm,
          p_quilometragem_solicitada: requestedKm,
          p_justificativa: reason
        });
        if (approvalResult.error) throw approvalResult.error;
        const approvalId = approvalResult.data?.approval_id || approvalResult.data?.id;
        if (!approvalId) throw new Error('O Supabase não retornou o identificador da autorização.');
        await managerClient.auth.signOut({ scope: 'local' });
        finish(resolve, approvalId);
      } catch (error) {
        try { await managerClient.auth.signOut({ scope: 'local' }); } catch { /* sessão temporária descartada */ }
        errorBox.textContent = error.message || 'Não foi possível obter a autorização do gestor.';
        errorBox.hidden = false;
        submit.disabled = false;
        submit.textContent = 'Autorizar quilometragem';
      }
    });
  });
}

async function openDriverOperationModal(workspace, vehicle, action) {
  const isStart = action === 'start';
  const withdrawal = vehicle.open_withdrawal;
  if (!isStart && !withdrawal) throw new Error('Não existe retirada em aberto deste veículo vinculada ao seu usuário.');
  const stage = isStart ? 'Saída' : 'Devolução';
  const { model, items } = await loadDriverChecklist(vehicle, stage);
  const kmStart = Number(isStart ? vehicle.quilometragem_atual || 0 : withdrawal.quilometragem_inicial || 0);
  const title = isStart ? 'Utilizar veículo' : 'Devolver veículo';
  const overlay = document.createElement('div');
  overlay.className = 'driver-operation-backdrop';
  overlay.id = 'driverOperationModal';
  overlay.innerHTML = `<section class="driver-operation-modal" role="dialog" aria-modal="true" aria-labelledby="driverOperationTitle">
    <header class="driver-operation-header"><div><span class="eyebrow">${isStart ? 'RETIRADA DO VEÍCULO' : 'DEVOLUÇÃO DO VEÍCULO'}</span><h2 id="driverOperationTitle">${title}</h2><p>${esc(vehicle.placa || '')} · ${esc([vehicle.marca,vehicle.modelo].filter(Boolean).join(' '))}</p>${vehicle.servico ? `<small class="driver-selected-service">Serviço: ${esc(vehicle.servico)}${vehicle.servico_detalhes ? ` · ${esc(vehicle.servico_detalhes)}` : ''}</small>` : ''}</div><button type="button" class="close-modal" data-driver-close aria-label="Fechar">×</button></header>
    <form id="driverOperationForm" data-operation="${action}">
      <div class="driver-operation-fields">
        <label>Quilometragem ${isStart ? 'de saída' : 'final'} (km)<input id="driverOperationKm" type="number" min="${kmStart}" step="0.1" value="${kmStart}" required>${isStart ? '<small class="driver-km-hint">Se a quilometragem estiver acima da última registrada, será necessária autorização do gestor.</small>' : ''}</label>
        <label>Nível de combustível (%)<input id="driverOperationFuel" type="number" min="0" max="100" step="1" placeholder="Ex.: 80" required></label>
        ${isStart ? '<label class="driver-field-full">Destino / local de utilização<input id="driverOperationDestination" type="text" maxlength="180" placeholder="Informe o destino" required></label>' : `<label class="driver-field-full">Data e hora da devolução<input id="driverReturnDateTime" type="datetime-local" min="${driverLocalDateTimeValue(new Date(withdrawal.data_hora_retirada))}" max="${driverLocalDateTimeValue(new Date())}" value="${driverLocalDateTimeValue(new Date())}" required><small class="driver-km-hint">Informe o momento efetivo em que o veículo foi devolvido.</small></label><label class="driver-field-full">Condição geral na devolução<select id="driverOperationCondition" required><option value="">Selecione</option><option value="Sem novas avarias aparentes">Sem novas avarias aparentes</option><option value="Com avarias ou danos">Com avarias ou danos</option></select></label><label class="driver-field-full">Descreva avarias ou ocorrências<textarea id="driverOperationDamage" rows="2" placeholder="Informe danos, ocorrências ou escreva Nenhuma"></textarea></label>`}
      </div>
      ${driverChecklistHtml(items, `Checklist de ${stage.toLowerCase()}`)}
      <label class="driver-field-full driver-general-observation">Observações gerais<textarea id="driverOperationNotes" rows="2" placeholder="Observações adicionais (opcional)"></textarea></label>
      <div class="driver-operation-actions"><button type="button" class="btn btn-light" data-driver-close>Cancelar</button><button type="submit" class="btn btn-primary" id="driverOperationSubmit">${isStart ? 'Confirmar retirada' : 'Confirmar devolução'}</button></div>
      <p class="driver-operation-footnote"><i data-lucide="shield-check"></i> O checklist e a operação serão registrados no histórico do NPI FROTA.</p>
    </form>
  </section>`;
  workspace.appendChild(overlay);
  refreshIcons();
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-driver-close]').forEach(button => button.addEventListener('click', close));
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  const form = overlay.querySelector('#driverOperationForm');
  form.querySelectorAll('.driver-check-answer').forEach(select => {
    select.addEventListener('change', () => {
      const note = select.closest('.driver-checklist-item').querySelector('.driver-check-observation');
      if (select.value === 'Não conforme') {
        note.required = true;
        note.classList.add('driver-note-required');
      } else {
        note.required = false;
        note.classList.remove('driver-note-required');
      }
    });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('#driverOperationSubmit');
    const responses = [];
    let invalidChecklist = false;
    form.querySelectorAll('.driver-checklist-item').forEach(itemEl => {
      const select = itemEl.querySelector('.driver-check-answer');
      const note = itemEl.querySelector('.driver-check-observation');
      if (select.value) responses.push({ item_id: select.dataset.itemId, resposta: select.value, observacao: note.value.trim() });
      if (select.required && !select.value) invalidChecklist = true;
      if (select.value === 'Não conforme' && !note.value.trim()) invalidChecklist = true;
    });
    if (invalidChecklist) { toast('Complete os itens obrigatórios e descreva os que estiverem Não conforme.'); return; }
    if (!responses.length) { toast('Preencha o checklist antes de continuar.'); return; }
    const km = Number(form.querySelector('#driverOperationKm').value);
    const fuel = Number(form.querySelector('#driverOperationFuel').value);
    if (!Number.isFinite(km) || km < kmStart) { toast(`A quilometragem deve ser igual ou superior a ${kmStart.toLocaleString('pt-BR')} km.`); return; }
    if (!Number.isFinite(fuel) || fuel < 0 || fuel > 100) { toast('Informe o nível de combustível entre 0 e 100%.'); return; }
    let returnDateTimeIso = null;
    if (!isStart) {
      const returnDateTimeValue = form.querySelector('#driverReturnDateTime')?.value;
      const returnDate = returnDateTimeValue ? new Date(returnDateTimeValue) : null;
      const withdrawalDate = new Date(withdrawal.data_hora_retirada);
      if (!returnDate || Number.isNaN(returnDate.getTime())) { toast('Informe a data e a hora da devolução.'); return; }
      if (returnDate < withdrawalDate) { toast('A devolução não pode ocorrer antes da retirada.'); return; }
      if (returnDate > new Date()) { toast('A data e hora da devolução não podem estar no futuro.'); return; }
      returnDateTimeIso = returnDate.toISOString();
    }
    const notes = form.querySelector('#driverOperationNotes').value.trim();
    submit.disabled = true;
    submit.textContent = 'Registrando...';
    try {
      let result;
      if (isStart) {
        const destination = form.querySelector('#driverOperationDestination').value.trim();
        if (!destination) throw new Error('Informe o destino ou local de utilização.');
        // Consulta a quilometragem no banco novamente para não aprovar com um valor desatualizado na tela.
        const latestKmResult = await window.npiSupabase.from('veiculos')
          .select('quilometragem_atual').eq('id', vehicle.id).single();
        if (latestKmResult.error) throw latestKmResult.error;
        const latestKm = Number(latestKmResult.data?.quilometragem_atual || 0);
        if (km < latestKm) throw new Error(`A quilometragem informada (${km.toLocaleString('pt-BR')} km) é menor que a última confirmada (${latestKm.toLocaleString('pt-BR')} km). Verifique o hodômetro.`);
        let kmApprovalId = null;
        if (km > latestKm) {
          submit.disabled = false;
          submit.textContent = 'Aguardando autorização...';
          kmApprovalId = await requestManagerKmAuthorization({
            vehicle,
            requestedKm: km,
            currentKm: latestKm,
            driverId: currentProfile.motorista_id
          });
          submit.disabled = true;
          submit.textContent = 'Registrando...';
        }
        result = await window.npiSupabase.rpc('npi_driver_start_vehicle_use', {
          p_veiculo_id: vehicle.id,
          p_quilometragem_inicial: km,
          p_nivel_combustivel: fuel,
          p_destino: destination,
          p_observacoes: notes,
          p_modelo_checklist_id: model.id,
          p_respostas: responses,
          p_autorizacao_km_id: kmApprovalId
        });
      } else {
        const condition = form.querySelector('#driverOperationCondition').value;
        const damage = form.querySelector('#driverOperationDamage').value.trim();
        if (!condition) throw new Error('Informe a condição geral do veículo.');
        if (condition === 'Com avarias ou danos' && !damage) throw new Error('Descreva as avarias ou danos identificados.');
        result = await window.npiSupabase.rpc('npi_driver_return_vehicle', {
          p_retirada_id: withdrawal.id,
          p_quilometragem_final: km,
          p_nivel_combustivel: fuel,
          p_condicoes_veiculo: condition + (notes ? ` | Observações: ${notes}` : ''),
          p_avarias_identificadas: damage,
          p_modelo_checklist_id: model.id,
          p_respostas: responses,
          p_data_hora_devolucao: returnDateTimeIso
        });
      }
      if (result.error) throw result.error;
      // Invalida o cache da operação e dos históricos criados pelos gatilhos do banco.
      await ensureSupabaseModulesLoaded(
        isStart ? ['retiradas', 'utilizacoes', 'checklists'] : ['retiradas', 'devolucoes', 'utilizacoes', 'checklists'],
        { forceModules: isStart ? ['retiradas', 'utilizacoes', 'checklists'] : ['retiradas', 'devolucoes', 'utilizacoes', 'checklists'] }
      );
      close();
      toast(isStart ? 'Retirada registrada com checklist.' : 'Devolução registrada. Quilometragem e situação atualizadas.');
      await renderDriverPanel(workspace);
    } catch (error) {
      console.error('Erro ao registrar operação do motorista:', error);
      toast('Não foi possível registrar: ' + (error.message || 'verifique as permissões e tente novamente.'));
      submit.disabled = false;
      submit.textContent = isStart ? 'Confirmar retirada' : 'Confirmar devolução';
    }
  });
}

