/* NPI FROTA | Administração de usuários, perfis, permissões e atribuições.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

async function renderUsersAdminPage(workspace) {
  workspace.innerHTML = '<div class="empty">Carregando usuários e perfis...</div>';
  try {
    const [usersRes, profilesRes, driversRes, linksRes] = await Promise.all([
      window.npiSupabase.from('usuarios').select('id,nome,email,empresa_id,situacao,motorista_id').order('nome'),
      window.npiSupabase.from('perfis').select('id,nome').eq('situacao','Ativo').order('nome'),
      window.npiSupabase.from('motoristas').select('id,nome_completo').eq('situacao','Ativo').order('nome_completo'),
      window.npiSupabase.from('perfis_usuarios').select('usuario_id,perfil_id').eq('situacao','Ativo')
    ]);
    for (const result of [usersRes,profilesRes,driversRes,linksRes]) if (result.error) throw result.error;
    const users=usersRes.data||[], profiles=profilesRes.data||[], drivers=driversRes.data||[], links=linksRes.data||[];
    const roleByUser = new Map(links.map(link => [link.usuario_id,link.perfil_id]));
    const rows=users.map(user=>{
      const self=user.id===currentUser.id;
      return `<tr data-user-row="${user.id}"><td><b>${esc(user.nome)}</b><small class="cell-sub">${esc(user.email||'')}</small></td>
        <td><select class="user-role" ${self?'disabled':''}><option value="">Selecione o perfil</option>${profiles.map(role=>`<option value="${role.id}" ${role.id===roleByUser.get(user.id)?'selected':''}>${esc(role.nome)}</option>`).join('')}</select></td>
        <td><select class="user-driver" ${self?'disabled':''}><option value="">Não vinculado</option>${drivers.map(driver=>`<option value="${driver.id}" ${driver.id===user.motorista_id?'selected':''}>${esc(driver.nome_completo)}</option>`).join('')}</select></td>
        <td><select class="user-status" ${self?'disabled':''}><option value="Ativo" ${user.situacao==='Ativo'?'selected':''}>Ativo</option><option value="Inativo" ${user.situacao!=='Ativo'?'selected':''}>Inativo</option></select></td>
        <td>${self?'<span class="muted-note">Conta atual</span>':'<button class="btn btn-primary user-save">Salvar</button>'}</td></tr>`;
    }).join('');
    workspace.innerHTML = `<section class="panel admin-panel"><div class="admin-intro"><div><h3>Contas e acessos</h3><p>Cadastre contas diretamente por esta tela e depois atribua o perfil e, para motoristas, vincule o cadastro de motorista.</p></div><button type="button" class="btn btn-primary" id="openCreateUser"><i data-lucide="user-plus"></i> Cadastrar usuário</button></div>
      <form class="create-user-form" id="createUserForm" hidden><div class="create-user-grid"><div><label for="newUserName">Nome completo</label><input id="newUserName" type="text" maxlength="120" autocomplete="name" required placeholder="Nome do usuário"></div><div><label for="newUserEmail">E-mail</label><input id="newUserEmail" type="email" maxlength="254" autocomplete="email" required placeholder="usuario@empresa.com"></div><div><label for="newUserPassword">Senha inicial</label><input id="newUserPassword" type="password" minlength="8" autocomplete="new-password" required placeholder="Mínimo de 8 caracteres"></div></div><div class="create-user-actions"><small>A conta será criada como Inativa. Depois selecione o perfil na tabela e clique em Salvar para liberar o acesso.</small><button type="button" class="btn btn-light" id="cancelCreateUser">Cancelar</button><button type="submit" class="btn btn-primary">Criar conta</button></div></form>
      <div class="table-scroll"><table class="admin-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Cadastro de motorista</th><th>Situação</th><th>Ação</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Nenhum usuário encontrado.</td></tr>'}</tbody></table></div></section>`;
    const createUserForm = workspace.querySelector('#createUserForm');
    workspace.querySelector('#openCreateUser')?.addEventListener('click', () => { createUserForm.hidden = false; workspace.querySelector('#newUserName')?.focus(); });
    workspace.querySelector('#cancelCreateUser')?.addEventListener('click', () => { createUserForm.reset(); createUserForm.hidden = true; });
    createUserForm?.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = createUserForm.querySelector('button[type="submit"]');
      const nome = workspace.querySelector('#newUserName').value.trim();
      const email = workspace.querySelector('#newUserEmail').value.trim().toLowerCase();
      const password = workspace.querySelector('#newUserPassword').value;
      if (!nome || !email || password.length < 8) { toast('Informe nome, e-mail válido e senha com pelo menos 8 caracteres.'); return; }
      submit.disabled = true; submit.textContent = 'Criando...';
      try {
        const { data, error } = await window.npiSupabase.functions.invoke('npi-create-user', { body: { nome, email, password } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast('Conta criada. Agora atribua o perfil na tabela para liberar o acesso.');
        await renderUsersAdminPage(workspace);
      } catch (error) {
        console.error('Erro ao criar usuário:', error);
        toast('Não foi possível criar a conta: ' + (error.message || 'verifique a configuração da função segura.'));
        submit.disabled = false; submit.textContent = 'Criar conta';
      }
    });

    workspace.querySelectorAll('.user-save').forEach(button=>button.onclick=async()=>{
      const row=button.closest('[data-user-row]');
      const roleId=row.querySelector('.user-role').value;
      const chosenRole=profiles.find(role=>role.id===roleId);
      const driverId=chosenRole?.nome==='Motorista' ? (row.querySelector('.user-driver').value||null) : null;
      const situation=row.querySelector('.user-status').value;
      if(!roleId){toast('Selecione um perfil para este usuário.');return;}
      if(chosenRole?.nome==='Motorista'&&!driverId){toast('Vincule o cadastro de motorista antes de ativar esse perfil.');return;}
      button.disabled=true;button.textContent='Salvando...';
      try{
        const {error}=await window.npiSupabase.rpc('npi_admin_set_user_access',{
          p_usuario_id:row.dataset.userRow,p_perfil_id:roleId,p_motorista_id:driverId,p_situacao:situation
        });
        if(error)throw error;
        toast('Perfil e permissões do usuário atualizados.');
        await renderUsersAdminPage(workspace);
      }catch(error){toast('Não foi possível salvar o acesso: '+(error.message||'verifique o SQL de permissões.'));button.disabled=false;button.textContent='Salvar';}
    });
  } catch(error) {
    console.error('Erro ao carregar administração de usuários:',error);
    workspace.innerHTML=`<div class="empty integration-notice">Não foi possível abrir Usuários e Acessos: ${esc(error.message||'verifique se executou o SQL de perfis e permissões.')}</div>`;
  }
  refreshIcons();
}

async function renderPermissionsAdminPage(workspace, selectedProfileId = '') {
  workspace.innerHTML = '<div class="empty">Carregando perfis e permissões...</div>';
  try {
    const {data:profiles,error}=await window.npiSupabase.from('perfis').select('id,nome,descricao').eq('situacao','Ativo').order('nome');
    if(error)throw error;
    const list=profiles||[];
    if(!list.length){workspace.innerHTML='<div class="empty">Nenhum perfil ativo encontrado.</div>';return;}
    const activeId=selectedProfileId||list[0].id;
    const activeRole=list.find(role=>role.id===activeId)||list[0];
    const {data:permissionRows,error:permissionError}=await window.npiSupabase.from('permissoes').select('*').eq('perfil_id',activeRole.id);
    if(permissionError)throw permissionError;
    const permissionMap=new Map((permissionRows||[]).map(row=>[row.modulo,row]));
    const adminRole=activeRole.nome==='Administrador';
    const matrix=Object.entries(MODULE_DEFS).map(([module,label])=>{
      const row=permissionMap.get(module)||{};
      const adminOnly=['usuarios','perfis','auditoria','notificacoes'].includes(module);
      const roleLocked=(activeRole.nome==='Motorista' && module!=='painel_motorista') || (activeRole.nome!=='Motorista' && module==='painel_motorista');
      const locked=adminRole||adminOnly||roleLocked;
      const checks=PERMISSION_ACTIONS.map(([action,caption])=>{
        const actionLocked=locked || (activeRole.nome==='Motorista' && module==='painel_motorista' && action!=='visualizar');
        return `<td><label class="permission-check" title="${caption}"><input type="checkbox" data-module="${module}" data-action="${action}" ${!actionLocked && row[action]?'checked':''} ${actionLocked?'disabled':''}><span>${caption}</span></label></td>`;
      }).join('');
      return `<tr><td><b>${esc(label)}</b><small class="cell-sub">${esc(module)}</small></td>${checks}</tr>`;
    }).join('');
    workspace.innerHTML=`<section class="panel admin-panel"><div class="admin-intro"><div><h3>Matriz de permissões</h3><p>Escolha um perfil e marque as ações que ele poderá executar em cada módulo.</p></div><div class="role-selector"><label for="rolePermissionSelect">Perfil</label><select id="rolePermissionSelect">${list.map(role=>`<option value="${role.id}" ${role.id===activeRole.id?'selected':''}>${esc(role.nome)}</option>`).join('')}</select></div></div>
      ${adminRole?'<div class="admin-callout">O perfil Administrador mantém acesso total para evitar bloqueio do sistema. Crie outro perfil para personalizar permissões.</div>':''}
      <div class="table-scroll"><table class="admin-table permission-table"><thead><tr><th>Módulo</th>${PERMISSION_ACTIONS.map(([,caption])=>`<th>${caption}</th>`).join('')}</tr></thead><tbody>${matrix}</tbody></table></div>
      <div class="admin-actions"><button class="btn btn-primary" id="saveRolePermissions" ${adminRole?'disabled':''}>Salvar permissões</button><span class="muted-note">As alterações passam a valer quando o usuário entrar novamente.</span></div>
      <div class="create-role"><div><b>Criar perfil personalizado</b><small>O novo perfil começa sem permissões. Depois selecione-o e configure a matriz.</small></div><input id="newRoleName" type="text" maxlength="80" placeholder="Nome do perfil"><input id="newRoleDescription" type="text" maxlength="180" placeholder="Descrição (opcional)"><button class="btn btn-light" id="createRoleButton">Criar perfil</button></div>
    </section>`;
    $('#rolePermissionSelect').onchange=()=>renderPermissionsAdminPage(workspace,$('#rolePermissionSelect').value);
    $('#saveRolePermissions').onclick=async buttonEvent=>{
      const button=buttonEvent.currentTarget;button.disabled=true;button.textContent='Salvando...';
      try{
        const permissions=Object.keys(MODULE_DEFS).map(module=>{
          const row={perfil_id:activeRole.id,modulo:module};
          const adminOnly=['usuarios','perfis','auditoria','notificacoes'].includes(module);
          const roleLocked=(activeRole.nome==='Motorista' && module!=='painel_motorista') || (activeRole.nome!=='Motorista' && module==='painel_motorista');
          PERMISSION_ACTIONS.forEach(([action])=>{
            const driverActionLocked=activeRole.nome==='Motorista' && module==='painel_motorista' && action!=='visualizar';
            row[action]=(adminOnly||roleLocked||driverActionLocked)?false:Boolean(workspace.querySelector(`input[data-module="${module}"][data-action="${action}"]`)?.checked);
          });
          return row;
        });
        const {error}=await window.npiSupabase.from('permissoes').upsert(permissions,{onConflict:'perfil_id,modulo'});
        if(error)throw error;
        toast('Matriz de permissões salva. Os usuários precisarão entrar novamente para atualizar o menu.');
      }catch(error){toast('Erro ao salvar permissões: '+(error.message||'verifique as políticas RLS.'));}
      finally{button.disabled=false;button.textContent='Salvar permissões';}
    };
    $('#createRoleButton').onclick=async()=>{
      const name=$('#newRoleName').value.trim(),description=$('#newRoleDescription').value.trim();
      if(!name){toast('Informe o nome do perfil.');return;}
      const {data:newRole,error}=await window.npiSupabase.from('perfis').insert({nome:name,descricao:description||null,situacao:'Ativo'}).select('id').single();
      if(error){toast('Não foi possível criar o perfil: '+error.message);return;}
      toast('Perfil criado. Agora configure suas permissões.');await renderPermissionsAdminPage(workspace,newRole.id);
    };
  }catch(error){
    console.error('Erro ao carregar matriz de permissões:',error);
    workspace.innerHTML=`<div class="empty integration-notice">Não foi possível carregar os perfis: ${esc(error.message||'verifique o SQL de permissões.')}</div>`;
  }
}

async function renderVehicleAssignmentsPage(workspace) {
  workspace.innerHTML='<div class="empty">Carregando motoristas, veículos e atribuições...</div>';
  try{
    const [driversRes,vehiclesRes,assignmentsRes]=await Promise.all([
      window.npiSupabase.from('motoristas').select('id,nome_completo').eq('situacao','Ativo').order('nome_completo'),
      window.npiSupabase.from('veiculos').select('id,placa,marca,modelo').order('placa'),
      window.npiSupabase.from('motorista_veiculos').select('id,motorista_id,veiculo_id,data_inicio,data_fim,ativo,motoristas(nome_completo),veiculos(placa,marca,modelo)').order('created_at',{ascending:false})
    ]);
    for(const result of [driversRes,vehiclesRes,assignmentsRes])if(result.error)throw result.error;
    const drivers=driversRes.data||[],vehicles=vehiclesRes.data||[],assignments=assignmentsRes.data||[];
    const rows=assignments.map(item=>`<tr><td>${esc(item.motoristas?.nome_completo||'—')}</td><td>${esc([item.veiculos?.placa,item.veiculos?.marca,item.veiculos?.modelo].filter(Boolean).join(' · '))}</td><td>${esc(item.data_inicio||'—')}</td><td>${esc(item.data_fim||'—')}</td><td><span class="status ${item.ativo?'ok':'bad'}">${item.ativo?'Ativo':'Encerrado'}</span></td><td>${item.ativo?`<button class="btn btn-light assignment-close" data-assignment-id="${item.id}">Encerrar</button>`:''}</td></tr>`).join('');
    workspace.innerHTML=`<section class="panel admin-panel"><div class="admin-intro"><div><h3>Atribuir veículos aos motoristas</h3><p>O motorista só consegue consultar os veículos com atribuição ativa ao seu cadastro.</p></div></div>
      <form id="vehicleAssignmentForm" class="assignment-form"><div><label>Motorista</label><select id="assignmentDriver" required><option value="">Selecione</option>${drivers.map(d=>`<option value="${d.id}">${esc(d.nome_completo)}</option>`).join('')}</select></div>
      <div><label>Veículo</label><select id="assignmentVehicle" required><option value="">Selecione</option>${vehicles.map(v=>`<option value="${v.id}">${esc([v.placa,v.marca,v.modelo].filter(Boolean).join(' · '))}</option>`).join('')}</select></div>
      <div><label>Início da atribuição</label><input id="assignmentStart" type="date" value="${new Date().toISOString().slice(0,10)}" required></div><button class="btn btn-primary" type="submit">Atribuir veículo</button></form>
      <div class="table-scroll"><table class="admin-table"><thead><tr><th>Motorista</th><th>Veículo</th><th>Início</th><th>Fim</th><th>Situação</th><th>Ação</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Nenhuma atribuição cadastrada.</td></tr>'}</tbody></table></div></section>`;
    $('#vehicleAssignmentForm').onsubmit=async event=>{
      event.preventDefault();const button=event.submitter;button.disabled=true;button.textContent='Salvando...';
      const {error}=await window.npiSupabase.from('motorista_veiculos').insert({
        empresa_id:currentProfile.empresa_id,motorista_id:$('#assignmentDriver').value,
        veiculo_id:$('#assignmentVehicle').value,data_inicio:$('#assignmentStart').value,ativo:true
      });
      if(error)toast('Não foi possível atribuir: '+error.message);else{toast('Veículo atribuído ao motorista.');await renderVehicleAssignmentsPage(workspace);}
      if(button.isConnected){button.disabled=false;button.textContent='Atribuir veículo';}
    };
    workspace.querySelectorAll('.assignment-close').forEach(button=>button.onclick=async()=>{
      if(!confirm('Deseja encerrar esta atribuição?'))return;
      const {error}=await window.npiSupabase.from('motorista_veiculos').update({ativo:false,data_fim:new Date().toISOString().slice(0,10)}).eq('id',button.dataset.assignmentId);
      if(error)toast('Não foi possível encerrar: '+error.message);else{toast('Atribuição encerrada.');await renderVehicleAssignmentsPage(workspace);}
    });
  }catch(error){
    console.error('Erro ao carregar atribuições:',error);
    workspace.innerHTML=`<div class="empty integration-notice">Não foi possível abrir as atribuições: ${esc(error.message||'verifique o SQL de permissões.')}</div>`;
  }
}

// ---------- Montagem da página ----------

