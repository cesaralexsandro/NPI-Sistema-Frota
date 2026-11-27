/* NPI FROTA | Menu lateral, navegação e roteamento de páginas.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

/* =====================================================================
   6. MENU LATERAL
   ===================================================================== */


/* Abas agrupadas para reduzir a quantidade de páginas soltas no menu.
   Cada aba continua usando seu módulo e suas permissões originais. */
function sectionTabsHtml(currentPage) {
  const allowed = (items) => items.filter(key => pageMeta[key] && hasPermission(key, 'visualizar'));
  const render = (items, label, secondary = false) => {
    const visible = allowed(items);
    if (visible.length < 2) return '';
    return `<section class="module-tabs ${secondary ? 'module-tabs-secondary' : ''}" aria-label="${label}">
      ${visible.map(key => `<button type="button" class="module-tab ${key === currentPage ? 'active' : ''}" data-go="${key}">${pageMeta[key][0]}</button>`).join('')}
    </section>`;
  };
  let html = '';
  if (['empresas','filiais'].includes(currentPage)) html += render(['empresas','filiais'], 'Empresas e filiais');
  if (['abastecimentos','manutencoes','pneus','localizacao_pneus','movpneus'].includes(currentPage)) {
    html += render(['abastecimentos','manutencoes','pneus'], 'Controle da frota');
    if (['pneus','localizacao_pneus','movpneus'].includes(currentPage)) html += render(['pneus','localizacao_pneus','movpneus'], 'Gestão de pneus', true);
  }
  return html;
}

function renderSidebar() {
  const sidebar = $('#sidebar');
  // Preserve a posição de rolagem do menu lateral ao reconstruir seus itens.
  // Sem isso, navegar para outra página recria o <nav> e o scroll volta ao topo.
  const previousNav = sidebar.querySelector('nav');
  const previousNavScrollTop = previousNav ? previousNav.scrollTop : 0;
  MENU.forEach((item, i) => {
    const isTireSubpage = ['localizacao_pneus', 'movpneus'].includes(page) && item.items?.includes('pneus');
    if (item.items && (item.items.includes(page) || isTireSubpage)) openGroups.add(i);
  });

  const visible = MENU.map((item, i) => {
    if (item.h) return { ...item, index: i };
    if (item.id) {
      const allowed = item.pages
        ? item.pages.some(key => pageMeta[key] && hasPermission(key, 'visualizar'))
        : hasPermission(item.id, 'visualizar');
      return allowed ? { ...item, index: i } : null;
    }
    const permittedItems = (item.items || []).filter(key => hasPermission(key, 'visualizar'));
    return permittedItems.length ? { ...item, items: permittedItems, index: i } : null;
  });

  const menuHtml = visible.map((item, position) => {
    if (!item) return '';
    if (item.h) {
      const nextHeading = visible.findIndex((next, index) => index > position && next && next.h);
      const sectionItems = visible.slice(position + 1, nextHeading < 0 ? visible.length : nextHeading).filter(Boolean);
      return sectionItems.length ? `<div class="nav-heading">${item.h}</div>` : '';
    }
    if (!item.items && item.id) {
      const selected = item.id === page || (item.pages || []).includes(page);
      return `<button class="nav-item ${selected ? 'active' : ''}" data-p="${item.id}">
        <span class="nav-icon"><i data-lucide="${item.icon}"></i></span>${item.label}
      </button>`;
    }
    const open = openGroups.has(item.index) ? 'open' : '';
    const subItems = item.items.map(key => {
      const selected = key === page || (key === 'pneus' && ['localizacao_pneus','movpneus'].includes(page));
      return `<button data-p="${key}" class="${selected ? 'selected' : ''}">${pageMeta[key][0]}</button>`;
    }).join('');
    return `<button class="nav-item group ${open}" data-g="${item.index}">
        <span class="nav-icon"><i data-lucide="${item.icon}"></i></span>${item.label}
        <i class="chev" data-lucide="chevron-down"></i>
      </button><div class="submenu ${open}" data-sub="${item.index}">${subItems}</div>`;
  }).join('');

  sidebar.innerHTML = `
    <div class="brand"><img class="brand-logo" src="assets/npi-logo.png" alt="NPI Tecnologia">
      <div class="brand-copy"><strong>FROTA</strong><small>Gestão inteligente de frotas</small></div></div>
    <div class="company-switch"><span class="dot"></span><div><b>${esc(currentCompanyName)}</b><small>${esc(currentRoleNames.join(' · '))}</small></div></div>
    <nav>${menuHtml}</nav>
    <div class="sidebar-footer"><div class="avatar"><i data-lucide="user-round"></i></div>
      <div><b>${esc(currentProfile?.nome || currentUser?.email || 'Usuário')}</b><small>${esc(currentUser?.email || 'Sessão Supabase')}</small></div></div>`;

  // Restaura a rolagem depois de recriar o menu. O requestAnimationFrame
  // também cobre ajustes de layout feitos pelo navegador após inserir o HTML.
  const newNav = sidebar.querySelector('nav');
  if (newNav) {
    newNav.scrollTop = previousNavScrollTop;
    requestAnimationFrame(() => {
      if (newNav.isConnected) newNav.scrollTop = previousNavScrollTop;
    });
  }

  sidebar.querySelectorAll('[data-p]').forEach(btn => btn.onclick = () => goTo(btn.dataset.p));
  sidebar.querySelectorAll('[data-g]').forEach(btn => btn.onclick = () => {
    const index = Number(btn.dataset.g);
    const willOpen = !openGroups.has(index);
    willOpen ? openGroups.add(index) : openGroups.delete(index);
    btn.classList.toggle('open', willOpen);
    const sub = sidebar.querySelector(`[data-sub="${index}"]`);
    if (sub) sub.classList.toggle('open', willOpen);
  });
  $('#bellBtn').hidden = !currentUser;
  refreshIcons();
}

let pageNavigationToken = 0;

async function goTo(target) {
  if (target === 'sair' || target === 'trocar') {
    window.npiSupabase.auth.signOut().then(({ error }) => {
      if (error) toast('Não foi possível encerrar a sessão: ' + error.message);
      else {
        currentUser = null; currentProfile = null; currentRoleNames = []; currentPermissions = {};
        clearSupabaseDataCache();
        showAuthScreen('Sessão encerrada. Entre novamente para continuar.');
        $('#authFeedback').className = 'auth-feedback success';
      }
    });
    return;
  }
  const destination = pageMeta[target] ? target : defaultPageForCurrentUser();
  if (!hasPermission(destination, 'visualizar')) {
    toast('Seu perfil não tem permissão para acessar esta área.');
    target = defaultPageForCurrentUser();
  } else target = destination;
  page = target;
  statusFilter = '';
  searchText = '';
  recordsPage = 1;
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  $('#sidebar').classList.remove('show');
  renderSidebar();
  window.scrollTo(0, 0);

  const token = ++pageNavigationToken;
  const modules = getPageDataModules(page);
  const includeDependencies = page !== 'dashboard';
  const needsFetch = !areSupabaseModulesFresh(modules, { includeDependencies });
  if (needsFetch) {
    const [title, subtitle] = pageMeta[page];
    $('#pageTitle').textContent = title;
    $('#pageSubtitle').textContent = subtitle;
    $('#crumb').textContent = title;
    document.title = title + ' | NPI FROTA';
    $('#workspace').innerHTML = `<div class="empty data-loading"><i data-lucide="loader-circle"></i><span>Carregando ${esc(title.toLowerCase())}...</span></div>`;
    refreshIcons();
  }
  try {
    await ensureSupabaseModulesLoaded(modules, { includeDependencies });
    if (token === pageNavigationToken && page === target) renderPage();
  } catch (error) {
    console.error('Erro ao carregar dados da página:', error);
    if (token === pageNavigationToken && page === target) {
      $('#workspace').innerHTML = `<div class="empty integration-notice">Não foi possível carregar os dados. ${esc(error.message || 'Verifique sua conexão e tente novamente.')}</div>`;
    }
  }
}

