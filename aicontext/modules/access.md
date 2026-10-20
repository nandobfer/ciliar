# Autenticação, usuários, perfis e Visualizar como

## Origens e arquitetura

- Login: `LoginPage`, `LoginForm`, `LoginParticleBackground` copiados do Opex, mantendo composição,
  animação e partículas conectadas do tsParticles. Nome Ciliar, e-mail/senha, movimento reduzido.
  Cor vem do token `--primary`; hidratação lê o tema com snapshot de servidor neutro.
- Regras/UX de usuários e perfis: referência somente leitura no Shekinah. Árvore de permissões
  e resumo, RoleChip e paleta de tokens foram copiados de lá. Nenhum NestJS, bridge ou domínio de clube.
- Perfix: dependência Git fixada no commit `2ceef0948fcbc99f6943589048b365665912def8`;
  sem link local. Catálogo em `src/features/access/catalog.ts`, sem escopos de dados artificiais.
  Ramo **Agente Opex** com `opex.use` (usar o chat); a configuração do agente usa
  `integrations.ai.view`/`integrations.ai.edit`.
- Auth.js `next-auth@5.0.0-beta.32`, Credentials/JWT; `src/auth.ts`. Senhas Argon2id via
  `@node-rs/argon2` (19 MiB, 2 iterações, paralelismo 1). Cookie HttpOnly, Secure em HTTPS,
  SameSite padrão do Auth.js, expiração de 8h. Sem cadastro público, recuperação por e-mail ou MFA.

## Sessões e proteção

`APP_ORIGIN` é a origem pública canônica; `AUTH_SECRET` deve ser novo e privado. URLs de autenticação
não derivam de Host arbitrário. Login tem limitação por e-mail/processo e comparação dummy para
conta inexistente. Para múltiplas réplicas, mova o rate limit para um mecanismo compartilhado.

JWT e cada API revalidam conta ativa e `sessionVersion`. Logout revoga as sessões daquela versão;
trocar senha revoga todas, remove a exigência de primeiro acesso e exige novo login. Inativação
incrementa a versão. Mudanças de perfis são relidas no servidor em toda requisição.

`protectRoute`/`withProtectedRoute` protegem APIs independentemente do layout. A política é explícita
e falha fechado para rotas não conhecidas. Mutações exigem origem canônica + `x-ciliar-request: 1`;
o protocolo Auth.js usa seu próprio CSRF, com verificação adicional de origem. Respostas protegidas
são `no-store`. Exceções: protocolo Auth.js, `/api/v1/*` com Bearer e `/api/routines/*` com cron secret.

No primeiro acesso, somente sessão, troca de senha e logout são liberados. O layout autenticado
isola Pusher do login. Sidebar, páginas, ações e formulários seguem permissões; negar no cliente
não substitui a validação do servidor. A sessão do cliente é revalidada ao focar e a cada 30 segundos.

## Persistência e invariantes

Coleções exclusivas no banco `ciliar`: `users`, `roles`, `role_hierarchy`, `access_audit`.
E-mail normalizado/único, hash não selecionado por padrão. Auditoria não contém senhas/hashes.
Histórico antigo de integrações com ator `local` é preservado; ações humanas usam o ator real.

Alterações de autoridade exigem replica set (ou mongos), transação, majority write concern,
fence compartilhado e versões otimistas. Não há fallback de gravação não transacional: standalone
retorna `REPLICA_SET_REQUIRED`, sem alteração. Nunca configure replica set em Mongo compartilhado
automaticamente. O fence também serializa mudanças concorrentes envolvendo o último administrador.

- Administrador reservado (`slug=admin`, ativo, `*`), posição 0, não removível.
- Metadados nome/descrição/cor podem mudar, não wildcard, slug ou status.
- União de perfis ativos, hierarquia e atribuição sensível são calculadas pelo Perfix.
- Criação/edição de permissões arbitrárias, wildcard e escalada são recusadas.
- Proibidas autoexclusão, autodesativação e mudanças dos próprios perfis.
- Último administrador ativo protegido; conflitos devolvem 409 sem sobrescrever rascunhos.
- Membros e metadados/permissões do perfil salvam atomicamente. Perfis inativos não recebem
  novos membros; perfis com membros não podem ser excluídos. Perfil inativo existente é preservado
  nas atribuições até uma mudança explicitamente autorizada.

## Interfaces

As listagens usam os componentes **originais do Opex**, sem variações locais de header/filtros:
`CadastroHeader`, `ListFilters`, `FilterGroup`, `StatusFilterMultiSelect`, `StatusPill`, `TableAction`,
`CadastroTableSkeleton` e feedbacks. A tabela de usuários usa a estrutura/células de `TaskTable`
do Opex (colunas próprias) e o comportamento mobile de `ClienteTaskTable`; a hierarquia usa a
listagem de `IntegrationList`, com drag preservado.
Busca tem o debounce original de 500 ms e status permite selecionar ativos/inativos.

`/usuarios`: busca, status, paginação de 20 itens, cadastro em etapas Geral/Perfis, edição,
exclusão confirmada e resumo de permissões. E-mail somente leitura depois de cadastrado.
Senha inicial criada pela interface exige troca no primeiro acesso. Rascunho é preservado em erro.

Os componentes da árvore (`PermissionTree`, `PermissionModuleCard`, `PermissionTreeNode`) aceitam
`tree`, `catalog`, `lockedKeys` e `renderLeafMeta` (padrão: catálogo de acesso) e são reaproveitados
pela seleção de ferramentas do Agente Opex, no mesmo estilo.

`/perfis`: busca, status e ordenação drag/teclado (@dnd-kit). Administrador fica fixo. `/perfis/novo`
e `/perfis/[id]`: Geral, Permissões, Membros (exige users.view), Auditoria. Opções fora da hierarquia
ficam bloqueadas; membros exigem também users.edit. Reordenação usa versão da hierarquia global.

## Visualizar como

Header **copiado do Shekinah**: altura h-12, neutro, seletor à direita dentro da coluna de conteúdo
do `AppShell` (nunca sobre a sidebar). `src/features/view-as/components` contém os originais
`ViewAsSelector`, `ViewAsRoleStep`, `ViewAsUserStep`, `ViewAsStepHeader` e `ViewAsBanner`.
Somente imports/`use client` foram adaptados. Popover compacto em duas etapas, chips de cor,
acesso real marcado, busca de usuário no servidor com debounce de 250 ms/limite de 20 itens.
A faixa âmbar só aparece em simulação. A saída continua disponível mesmo no fallback Sem acesso.
`GET /api/access/view-as?kind=roles|users&q=...` exige administrador real; busca literal escapada,
e-mail e perfis ativos, sem hash/senha. Marcador explícito `none` nas consultas do seletor.
`__tests__/app/copied-ui.test.ts` fixa hashes dos 13 componentes Opex e 5 componentes Shekinah.

O cache de dados fica em um QueryClient próprio por identidade, permissões, perfis/versões e
marcador de simulação. Uma mudança de autoridade descarta o cache anterior antes de mostrar as
telas novamente, sem reaproveitar um frame de dados privilegiados. O editor de perfis mantém a
versão capturada na abertura: refetch não promove um rascunho antigo à versão nova e erros de
refetch não desmontam o formulário. Conflitos preservam o rascunho.

Somente administrador **real** com `*` inicia/troca simulação de perfil ou usuário ativo.
ViewAsProvider do Perfix persiste em sessionStorage por aba. O Axios central e a autorização
Pusher enviam `x-perfix-view-as` explicitamente (inclusive `none`); cookies de outra aba não são
autoridade. Não simulamos identidade: `userId` e auditoria continuam sendo do ator real.

O servidor resolve/revalida alvo e permissões em cada requisição, intersectando com o acesso real.
Faixa persistente com alvo e ação de encerrar, inclusive quando a simulação não acessa o painel.
Trocar/encerrar cancela queries, limpa cache, desconecta Pusher e volta a `/integracoes`.
Login/logout também limpam estado da aba. Alvo inativo ou perda do wildcard encerra a simulação.
Transições são auditadas pelo endpoint `/api/access/view-as`, verificando os alvos no servidor.
Sem efeito no navegador de outro usuário: não é sessão de impersonação.

## CLI e bootstrap

```sh
pnpm user:create
```

`scripts/create-user.ts`: terminal interativo obrigatório; sem argumentos nem pipe. Nome, e-mail,
senha mascarada, confirmação e seleção de perfis ativos. Seleção explícita de Administrador cria
o perfil reservado dentro da transação, inclusive no banco vazio. Não sobrescreve duplicados,
não mostra stack/URI/credenciais em erro, não grava senha em log. Ator `operator-cli`, conexão
fechada ao terminar. Contas operacionais do CLI não exigem troca inicial (mesmo padrão do Shekinah).
Não há bootstrap no startup nem conta com senha padrão.

Usa `MONGODB_URI` do `.env`; somente banco `ciliar` fora dos testes. Fora do Docker, mapeia somente
`SCRIPT_MONGODB_HOST` (default mongodb) para localhost; porta opcional em `SCRIPT_MONGODB_PORT`.
Se o `.env` usa o alias `mongobd`, configure `SCRIPT_MONGODB_HOST=mongobd`. Em container não reescreve
a URI. Para alterar uma conexão de servidor, corrija o ambiente; não use esse helper no aplicativo.

## Validação

Testes selecionados em `__tests__/features/{auth,access}`; persistência usa MongoMemoryReplSet
8.0.18 efêmero, sem tocar MONGODB_URI/Docker/dados reais. Inclui concorrência, rollback, escalada,
CSRF, sessão revogada, primeiro acesso, simulação por aba, movimento reduzido e contratos das APIs.
O download inicial do binário Mongo dos testes requer rede; o pacote core não tem postinstall.
Tipos e lint sem executar build ou suíte completa automaticamente.
