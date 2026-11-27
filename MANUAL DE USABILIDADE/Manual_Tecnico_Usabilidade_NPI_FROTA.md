# NPI FROTA

## Manual Técnico e de Usabilidade

**Guia de arquitetura, operação, configuração e manutenção para
desenvolvedores e usuários-chave**

Base documental: `NPI_FROTA_revisao_completa.zip` · 27/11/2026

> **IMPORTANTE:** Este manual descreve o código e os scripts encontrados
> no ZIP analisado. A inspeção dos arquivos não substitui testes no
> Supabase real. Confirme tabelas, RLS, secrets, Edge Functions e
> permissões no ambiente de implantação.

------------------------------------------------------------------------

## 1. Apresentação e finalidade

### NPI FROTA

Sistema web de gestão de frotas da NPI. O projeto centraliza cadastros,
operações de veículos, controles de manutenção, pneus, documentos,
despesas, usuários e relatórios em uma interface web conectada ao
Supabase.

### Escopo deste manual

Este documento descreve a versão contida no arquivo
`NPI_FROTA_revisao_completa.zip`, com base na leitura dos
arquivos-fonte, scripts SQL e documentação incluídos. A inspeção
estática não comprova que o projeto Supabase de produção esteja
configurado ou que todos os fluxos tenham sido testados em navegador.

### Tecnologias identificadas

-   HTML5 e CSS3.
-   JavaScript clássico carregado por scripts no `index.html`.
-   Supabase JavaScript v2.
-   Supabase Auth.
-   PostgreSQL/Supabase.
-   Row Level Security (RLS).
-   Supabase Edge Functions.
-   Lucide para ícones.

## 2. Arquitetura da aplicação

### Modelo de execução

A aplicação é uma interface web estática. O `index.html` monta a
estrutura principal e carrega CSS e JavaScript em uma ordem explícita.
Os arquivos JavaScript compartilham o escopo global clássico; portanto,
a ordem das tags `<script>` é uma dependência arquitetural e não deve
ser reorganizada sem testes.

### Inicialização

`js/00-theme-boot.js` define o tema inicial antes dos estilos. O
Supabase é carregado por CDN, seguido por `supabase-config.js` e
`supabase-client.js`. `js/10-app/init.js` verifica a sessão com
`auth.getSession()`; com sessão válida chama `enterApplication`; sem
sessão apresenta a tela de autenticação.

### Fluxo de dados

As telas usam configuração central de módulos/campos, estado em memória
e camada de repositório Supabase. O repositório mapeia rótulos da
interface para nomes de colunas SQL, carrega dados paginados e mantém
cache temporário por módulo.

### Cache

O repositório define cache de 45 segundos e tamanho de página de 500
registros. Há carregamento de dependências entre módulos e carregamento
específico para dados do dashboard. Ao alterar dados, o fluxo de
aplicação deve invalidar/atualizar os dados relevantes.

### Interface

A estrutura contém sidebar, topbar, área workspace, modal genérico de
formulário, toast, autenticação e tela de inicialização. As páginas são
montadas dinamicamente por módulos JavaScript.

## 3. Estrutura de diretórios

  -----------------------------------------------------------------------------------
  Caminho                                         Responsabilidade
  ----------------------------------------------- -----------------------------------
  `index.html`                                    Ponto de entrada, estrutura visual,
                                                  importação de CSS, bibliotecas
                                                  externas e scripts.

  `css/`                                          Estilos separados por
                                                  responsabilidade: base, sidebar,
                                                  topbar, conteúdo, dashboard,
                                                  listas, relatórios, modais/toasts,
                                                  responsividade, autenticação,
                                                  administração, painel do motorista,
                                                  notificações e histórico de
                                                  checklist.

  `js/00-theme-boot.js`                           Inicialização antecipada do tema.

  `js/01-config/module-config.js`                 Metadados das páginas, campos dos
                                                  formulários, menu, situações,
                                                  opções, colunas e configurações
                                                  centrais.

  `js/02-core/`                                   Helpers e estado compartilhado da
                                                  aplicação.

  `js/03-data/`                                   Schema/mapeamento de módulos e
                                                  repositório Supabase.

  `js/04-auth/`                                   Carregamento e avaliação de
                                                  perfis/permissões.

  `js/05-ui/`                                     Navegação, renderização, listas,
                                                  dashboard/relatórios e tema.

  `js/06-modules/`                                Funcionalidades especializadas:
                                                  painel do motorista, administração,
                                                  notificações e localização de
                                                  pneus.

  `js/07-features/`                               Formulários e exportação.

  `js/08-app/`                                    Eventos e interações gerais da
                                                  interface.

  `js/09-auth/`                                   Interface de autenticação e
                                                  gerenciamento de sessão.

  `js/10-app/init.js`                             Inicialização da aplicação.

  `supabase/functions/npi-create-user/index.ts`   Edge Function para criação segura
                                                  de usuários no Supabase Auth.

  `sql/`                                          Scripts de estrutura, permissões e
                                                  funcionalidades adicionais do
                                                  banco.

  `docs/`                                         Guias específicos de módulos e
                                                  funcionalidades.
  -----------------------------------------------------------------------------------

## 4. Menu e módulos funcionais

-   **Dashboard e Meu Painel:** Dashboard apresenta indicadores
    gerenciais; Meu Painel é a experiência restrita do motorista e
    consulta veículos atribuídos.
-   **Cadastros:** Empresas, Centros de Custo, Veículos, Motoristas,
    Fornecedores e Oficinas. Filiais são acessadas na área de Empresas
    por navegação interna, conforme a configuração de navegação.
-   **Operações:** Reservas, Retiradas, Devoluções, Utilizações,
    Checklists, Modelos de Checklist, Itens de Checklist e atribuições
    de veículos a motoristas.
-   **Controle da Frota:** Grupo consolidado com Abastecimentos,
    Manutenções e Pneus. Dentro da área de pneus também existem páginas
    de Localização dos Pneus e Movimentações de Pneus.
-   **Documentos e Ocorrências:** Multas, Documentos, Seguros e
    Sinistros.
-   **Financeiro:** Despesas e Rateios.
-   **Relatórios:** Área de relatórios gerenciais e exportação conforme
    as permissões.
-   **Administração:** Usuários e Acessos, Perfis e Permissões,
    Notificações e Auditoria.
-   **Sistema:** Páginas de troca de usuário e saída aparecem na
    configuração do menu. A troca de usuário deve ser validada na versão
    implantada: o botão de avatar na topbar está comentado no código de
    eventos como visual, sem ação de troca associada.

## 5. Guia de usabilidade

### Acesso

A aplicação verifica a sessão salva. Se não houver sessão válida,
apresenta login por e-mail e senha. O formulário também apresenta contas
utilizadas anteriormente neste computador, quando disponíveis.

### Navegação

Use o menu lateral para abrir os módulos. Alguns grupos abrem submenus;
Empresas e Controle da Frota são itens consolidados com páginas/abas
internas. O breadcrumb e o título indicam a página atual.

### Tema

O botão de tema na barra superior alterna entre claro e escuro. O tema
inicial é preparado antes dos estilos para reduzir mudança visual
durante a abertura.

### Cadastros

Abra o módulo e use **Novo registro**. Preencha os campos obrigatórios e
salve. Para editar, use a ação de edição da linha; exclusão depende de
permissão e das regras específicas do módulo.

### Placas

Novas placas usam o padrão Mercosul `ABC1D23`: três letras, um número,
uma letra e dois números. O campo limita o tamanho e filtra os
caracteres. Registros antigos `ABC-1234` continuam editáveis no formato
legado.

### Reservas

O formulário contém solicitante, motorista, veículo ou categoria,
retirada, devolução prevista, destino, finalidade, centro de custo e
observações. A situação não deve ser escolhida no formulário; novas
reservas devem iniciar como **Pendente**. Usuários com permissão
`reservas.aprovar` podem aprovar ou recusar reservas pendentes. A RPC do
banco grava aprovador e horário e verifica sobreposição de reservas
aprovadas para o mesmo veículo.

### Motoristas

O perfil Motorista deve estar associado a um cadastro em Motoristas e a
veículos atribuídos. O Meu Painel apresenta informações dos veículos
vinculados e fluxos de checklist/uso conforme os scripts e permissões
instalados.

### Exportação

O botão Exportar é condicionado à permissão `exportar` do módulo. A
disponibilidade e os campos exportados variam por módulo.

### Notificações

A central de notificações fica na barra superior. O carregamento é
iniciado sem bloquear a abertura do painel.

## 6. Modelo de dados e integração Supabase

### Configuração pública

`supabase-config.js` contém a URL do projeto e a chave publicável. A
chave publicável pode estar no navegador, mas não substitui RLS. Nunca
inserir `sb_secret` ou `service_role` em arquivos HTML/JS, no
repositório público ou em variáveis expostas ao cliente.

### Mapeamento

`js/03-data/schema.js` define `DB_MODULES` e `SUPABASE_MODULES`. Cada
módulo mapeia rótulos exibidos no formulário para colunas da tabela.
Alterações de rótulo, coluna, tipo de campo ou obrigatoriedade devem ser
refletidas nesse arquivo e no banco.

### Repositório

`js/03-data/supabase-repository.js` realiza consultas, paginação,
transformação entre linhas SQL e registros de interface, resolução de
relacionamentos e cache. Ao adicionar um módulo, revisar schema,
relações, dependências, permissões, RLS e consultas.

### Tabelas identificadas

Os mapeamentos incluem, entre outras, `empresas`, `filiais`,
`centros_custo`, `veiculos`, `motoristas`, `fornecedores`, `oficinas`,
`postos`, `retiradas`, `devolucoes`, `utilizacoes`, `checklists`,
`modelos_checklist`/`itens_checklist`, `abastecimentos`, `manutencoes`,
`pneus`, movimentações de pneus, `multas`, `documentos`, `seguros`,
`sinistros`, `despesas`, `rateios` e `reservas`. Confirmar nomes e
colunas no banco real antes de migrar.

### Reservas

A estrutura observada na captura do usuário inclui: `id`, `solicitante`,
`motorista_id`, `veiculo_id`, `categoria_veiculo`, `data_hora_retirada`,
`data_hora_devolucao_prevista`, `destino`, `finalidade`,
`centro_custo_id`, `projeto_id`, `situacao`, `observacoes`,
`aprovado_por`, `aprovado_em` e `created_at`. `projeto_id` é legado e
não deve ser removido sem avaliar registros e dependências.

### RLS

A existência de `GRANT` não substitui políticas RLS. As policies devem
limitar `SELECT`/`INSERT`/`UPDATE`/`DELETE` conforme identidade e
permissões. Testar cada perfil com sessão real; usuário administrador e
usuário comum não devem ser considerados equivalentes.

## 7. Autenticação, usuários e permissões

### Autenticação

O login usa Supabase Auth com `signInWithPassword` e a sessão é
verificada no início da aplicação. O evento `SIGNED_OUT` limpa estado e
cache e retorna à tela de autenticação.

### Perfis

O guia de acesso do projeto descreve perfis iniciais Administrador,
Gestor de Frota, Motorista, Manutenção, Financeiro, Solicitante e
Supervisor. Os perfis e suas permissões efetivas devem ser confirmados
na tabela de permissões do Supabase.

### Ações

A matriz considera `visualizar`, `incluir`, `alterar`, `excluir`,
`aprovar` e `exportar`. A interface esconde ações sem permissão, mas a
segurança final precisa ser imposta por RLS e funções SQL.

### Criar usuário

A tela Administração \> Usuários e Acessos chama
`supabase.functions.invoke('npi-create-user')`. A Edge Function valida a
sessão, verifica se o solicitante é administrador e cria a conta no
Auth. A documentação `CONFIGURAR_CADASTRO_USUARIO.txt` descreve
publicação e uso. A conta nasce Inativa; depois atribuir perfil e, para
motorista, o cadastro correspondente.

### Edge Function

Arquivo-fonte: `supabase/functions/npi-create-user/index.ts`. A chave de
serviço deve existir apenas nos secrets/ambiente seguro da Edge
Function. Não copiar a chave para `supabase-config.js`.

### Atenção à documentação herdada

Alguns guias antigos em `docs/` ainda descrevem criação manual em
Authentication \> Users. Para esta versão, prevalece o fluxo mais
recente documentado em `CONFIGURAR_CADASTRO_USUARIO.txt` e implementado
em `administration.js`: usar o botão **Cadastrar usuário** e a Edge
Function.

## 8. Reservas: fluxo e configuração

### Pré-requisitos

A tabela `public.reservas` deve existir e conter as colunas esperadas. O
SQL de perfis/permissões deve ter sido aplicado antes do script
`NPI_Frota_reservas_aprovacao.sql`, pois ele verifica `npi_is_admin()` e
`npi_has_permission(text,text)`.

### Script

`NPI_Frota_reservas_aprovacao.sql` concede privilégios SQL ao papel
`authenticated`, ativa RLS, recria as policies específicas, cria a RPC
`npi_decide_reservation` e o trigger `npi_guard_reservation_status`. O
script não recria a tabela nem apaga os registros.

### Decisão

A RPC aceita apenas **Aprovada** ou **Recusada**, exige sessão e
permissão `reservas.aprovar` (ou administrador), exige reserva pendente
e valida período. Na aprovação, verifica sobreposição temporal com outra
reserva aprovada para o mesmo veículo. Grava `aprovado_por = auth.uid()`
e `aprovado_em = now()`.

### Proteção de situação

O trigger exige que novos registros comecem como Pendente e bloqueia
alteração direta da situação fora do fluxo de decisão. A função RPC usa
uma configuração local de transação para permitir a mudança autorizada.

### Limites

A prevenção de conflito descrita verifica reservas aprovadas para o
mesmo veículo. Não equivale a um motor completo de disponibilidade: não
confirma conflito com utilizações/retiradas existentes nem resolve
automaticamente reservas sem veículo definido. Validar estes cenários
antes de uso operacional.

## 9. Instalação e publicação

1.  **Preparação:** faça backup da pasta atual e do banco antes de
    atualizar. Extraia o ZIP mantendo a pasta `NPI_Frota` e abra a pasta
    no VS Code com Live Server ou publique a pasta em hospedagem web
    estática compatível.
2.  **Configuração:** confirme URL e chave publicável em
    `supabase-config.js`. Não altere a chave para `service_role`.
    Verifique se o projeto Supabase é o correto.
3.  **Banco:** leia os scripts em `sql/` e execute somente os que
    correspondem às etapas ainda não aplicadas. Respeite dependências:
    perfis/permissões antes do SQL de aprovação de reservas. Não execute
    scripts repetidamente sem verificar se são idempotentes e sem
    backup.
4.  **Edge Function:** publique `npi-create-user` a partir do diretório
    `supabase/functions/npi-create-user` com Supabase CLI, vinculando ao
    `project-ref` correto. Confirme no painel Edge Functions que o nome
    e endpoint terminam em `/functions/v1/npi-create-user`. Verifique
    secrets/variáveis disponíveis no ambiente.
5.  **Primeiro acesso:** entre com a conta administradora, valide perfil
    e permissões, depois atribua os perfis dos demais usuários. Saia e
    entre novamente após alterações de perfil para recarregar o contexto
    de acesso.

## 10. Rotina de testes antes de liberar

-   **Autenticação:** login válido, senha inválida, sessão persistente,
    logout, sessão expirada e acesso de usuário inativo.
-   **Permissões:** testar cada ação (`visualizar`, `incluir`,
    `alterar`, `excluir`, `aprovar`, `exportar`) com pelo menos um
    usuário autorizado e outro não autorizado. Confirmar bloqueio no
    banco, não apenas ocultação na interface.
-   **Cadastros:** criar, editar, consultar e excluir registros de teste
    em empresas, filiais, veículos, motoristas e cadastros auxiliares.
    Validar relacionamentos e campos obrigatórios.
-   **Placas:** testar `ABC1D23` válido, caracteres em posições
    incorretas, comprimento excedente e edição `ABC-1234` legado.
-   **Reservas:** criar reserva pendente, tentar editar situação
    diretamente, aprovar com usuário autorizado, recusar outra, tentar
    aprovar com usuário sem permissão, testar devolução anterior à
    retirada e duas reservas sobrepostas para o mesmo veículo.
-   **Operações:** testar retirada/devolução, quilometragem, checklists
    de saída/retorno e vínculo de motorista/veículo.
-   **Frota e financeiro:** testar abastecimentos, manutenção, pneus,
    movimentações, multas, documentos, seguros, sinistros, despesas e
    rateios; conferir cálculos e histórico.
-   **Interface:** testar tema claro/escuro, navegação consolidada,
    responsividade, notificações e exportação.

## 11. Pendências e pontos de atenção desta versão

### Validação de produção

A leitura do ZIP e a verificação de sintaxe não comprovam acesso ao
Supabase real, policies efetivas, Edge Function implantada, dados
existentes ou comportamento em todos os navegadores.

### Troca de usuário

A configuração de menu contém a página `trocar`, mas o código de eventos
comenta que o avatar da topbar é apenas visual e não executa a troca.
Validar a navegação específica antes de prometer a funcionalidade.

### Projetos e Postos

O menu principal não apresenta esses módulos como itens de navegação
independentes, mas `module-config.js`/`schema.js` ainda contêm metadados
e mapeamentos de projetos e postos; schema de abastecimentos ainda pode
conter relacionamento legado de posto. A remoção do menu não significa
exclusão do código, das tabelas ou dos vínculos históricos.

### Auditoria

Existe página Administração \> Auditoria no menu, mas o alcance e
completude de uma trilha geral precisam ser verificados no banco e nos
eventos efetivamente registrados.

### Fotos/checklists

Os scripts e a interface preveem checklists e fotografias em
determinados fluxos; validar Storage, políticas de arquivos, upload e
leitura no ambiente real.

### Atualização de documentação

Há guias específicos em `docs/`. Antes de alterar a aplicação,
compare-os com o código atual; alguns documentos herdados podem
descrever etapas anteriores.

## 12. Guia rápido para o próximo desenvolvedor

### Antes de alterar

Faça backup do ZIP e do banco. Leia `index.html` para entender a ordem
de carregamento. Localize primeiro a configuração em `module-config.js`
e o mapeamento em `schema.js`.

### Ao adicionar campo

Atualize o formulário em `module-config.js`, mapeamento SQL em
`schema.js`, coluna/tipo no Supabase, `required`/relacionamentos se
aplicável, exibição da tabela e regras RLS. Teste criar, ler, atualizar
e excluir.

### Ao adicionar módulo

Defina `pageMeta`, `fields`, `MENU`, `STATUS`/`CHOICE_OPTIONS` e
`TABLE_COLUMNS`; adicione `DB_MODULES` e `SUPABASE_MODULES`; configure
dependências/relacionamentos no repository; crie policies RLS e
permissões; revise relatórios e exportação.

### Ao mexer em autenticação

Preserve a ordem de scripts e não exponha `service_role`. Teste usuário
inativo, perfil sem permissão e sessão expirada.

### Padrão de entrega

Entregue migração SQL versionada, documentação atualizada, evidência de
testes e lista explícita de pendências. Não declare validado em produção
sem teste no projeto Supabase de destino.

------------------------------------------------------------------------

**Documento de referência:** Manual Técnico e de Usabilidade do NPI
FROTA.\
**Uso recomendado:** manter este arquivo na pasta `docs/` do repositório
GitHub e atualizá-lo junto com mudanças relevantes na aplicação.
