# Autenticação, usuários, perfis e Visualizar como

## Origens e arquitetura

- Login: `LoginPage`, `LoginForm`, `LoginParticleBackground` copiados do Opex, mantendo composição,
  animação e partículas conectadas do tsParticles. Nome Ciliar, movimento reduzido. Desde a CIL-6 o
  cartão mostra **só os métodos habilitados para o protocolo de acesso** (ver "Login por e-mail e senha e
  métodos por protocolo"): o formulário de e-mail e senha (com "Criar conta") e/ou **"Entrar com Google"**
  (os dois limpam simulação/cache/Pusher da aba antes), e links para `/termos` e `/privacidade`. `?erro=`
  (motivos em `features/auth/login-errors.ts`) e `?error=` do Auth.js viram aviso; com o Google habilitado
  e sem `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` o botão fica desabilitado com aviso.
  Cor vem do token `--primary`; hidratação lê o tema com snapshot de servidor neutro.
- Regras/UX de usuários e perfis: referência somente leitura no Shekinah. Árvore de permissões
  e resumo, RoleChip e paleta de tokens foram copiados de lá. Nenhum NestJS, bridge ou domínio de clube.
- Perfix: dependência Git fixada no commit `2ceef0948fcbc99f6943589048b365665912def8`;
  sem link local. Catálogo em `src/features/access/catalog.ts`, sem escopos de dados artificiais.
  Ramo **Agente Opex** com `opex.use` (usar o chat) e `opex.technical` (ver informações técnicas em
  todo chat de agente; ver `opex-agent.md`); ramo **Memórias dos agentes** com `ai_memories.view` e
  `ai_memories.edit` (ver `ai-memories.md`); a configuração do agente usa
  `integrations.ai.view`/`integrations.ai.edit`.
- Auth.js `next-auth@5.0.0-beta.32`, providers **Google** e **Credentials** (e-mail e senha, CIL-6) e JWT,
  sem adapter; `src/auth.ts` com configuração **por requisição** (`useSecureCookies` = acesso HTTPS).
  Credenciais OAuth no ambiente (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`): o login é pré-requisito
  para abrir `/integracoes`, então não ficam na tela. `prompt=select_account`. Cookie HttpOnly,
  Secure só em HTTPS, SameSite padrão do Auth.js, expiração de 8h. Não há recuperação de senha por
  e-mail, MFA nem outros provedores.

## Login Google, vínculo e cadastro público (M0)

`features/auth/server/google-account.ts` (`resolveGoogleAccount`), chamado no callback `signIn`:

1. `email_verified !== true` ou sem e-mail → `nao-verificado`.
2. Conta já vinculada pelo `sub` (`googleSub`, índice único parcial, `select: false`) entra;
   inativa → `inativo`. Atualiza `lastLoginAt`.
3. Mesmo e-mail sem vínculo (convite, CLI ou usuário migrado) → **vínculo automático**
   (update condicionado a `googleSub: null`), mantém perfis/histórico; auditoria `user.google_link`.
4. E-mail já vinculado a outro `sub` → `conta-vinculada` (nunca troca o vínculo).
5. E-mail novo → **cadastro público** numa transação com o fence compartilhado: confere de novo a
   disponibilidade (perfil padrão válido + termos publicados) e cria a conta com o perfil padrão,
   `signupSource: "public"`; auditoria `user.signup` com ator `google-signup`. Indisponível →
   `cadastro-indisponivel` (falha fechado). Duplicidade simultânea resolve na segunda tentativa.

Recusas redirecionam para `/login?erro=<código>`; exceções viram `falha` (logadas, sem detalhes).
O callback `jwt` troca o `sub` do Google pelo ObjectId do usuário vinculado e segue revalidando
conta ativa e `sessionVersion` em todo token.

## Login por e-mail e senha e métodos por protocolo (CIL-6, 27/10/2026)

**Integração "Autenticação"** (`authentication`, página própria `/integracoes/autenticacao`, permissões
`integrations.authentication.view|edit|test|logs`; módulo `src/features/authentication`):

- Coleção singleton `auth_settings` (`_id: "global"`): `methods: { http: AuthMethod[], https: AuthMethod[] }`
  (`google` e/ou `password`, **qualquer combinação, ao menos um por protocolo**), `extraHosts` (até 20),
  `version`, `updatedBy`. Sem registro (ou inválido) vale o padrão **só Google nos dois protocolos**.
- `GET/PUT /api/authentication/settings` (fora de `/api/auth/*`, que é do Auth.js): `authorityTransaction`
  com fence, versão otimista (409 `VERSION_CONFLICT`, rascunho preservado), Zod e auditoria
  `auth_settings.update`. Salvar limpa o cache em memória (`cachedAuthSettings`, 5 s) lido pelo login.
- Tela (`AuthenticationEditorForm`): card **Métodos de autenticação** com os blocos HTTP e HTTPS (caixas
  Google / E-mail e senha; o último método marcado fica travado), avisos de Google sem credenciais no
  ambiente e de Google por HTTP (o Google só aceita retorno HTTP em localhost), marca "Seu acesso atual" e
  confirmação ao mudar os métodos do protocolo em uso; card **Endereços de acesso adicionais** (host sem
  protocolo nem porta, ex.: `217.77.3.47`; o host do `APP_ORIGIN` aparece fixo como oficial).
- Teste da integração: falha se um protocolo só tem Google sem credenciais OAuth; lista os endereços aceitos.

**Protocolo e origem** (`src/features/auth/request-origin.ts`, puro): protocolo = primeiro valor de
`X-Forwarded-Proto` (`http`/`https`), senão o da conexão; host = `X-Forwarded-Host`, senão `Host`. O host
(sem porta) precisa ser o do `APP_ORIGIN` ou estar em `extraHosts` (**qualquer porta**); fora disso a
origem cai no `APP_ORIGIN` com `allowed: false`. `requestAuthContext(headers, url)` (`auth/server/origin.ts`)
devolve a origem resolvida e os métodos do protocolo (vazio em host não permitido).

- `assertMutationOrigin` (agora **assíncrona**) aceita `Origin` igual ao `APP_ORIGIN` (como antes) ou igual
  à origem resolvida de um host permitido, sempre com `x-ciliar-request: 1`.
- Rota `/api/auth/[...nextauth]`: recusa host não permitido (403 `HOST_NOT_ALLOWED`); confere o método de
  `signin|callback/google` e `callback/credentials` (`auth-paths.ts`) **antes do Auth.js** — desabilitado no
  protocolo responde no formato do `signIn` do navegador (`{ url: …/login?erro=metodo-indisponivel&error=MetodoIndisponivel }`,
  403) ou redireciona (303); limita tentativas de senha **por e-mail** (independente do IP; o e-mail é lido do
  corpo form **ou JSON**, os dois formatos que o Auth.js aceita; outro formato é recusado com 400) e, em
  segundo plano, por IP (`cf-connecting-ip`/`x-real-ip`, forjáveis no acesso direto à porta) (429 `RateLimited`); entrega ao Auth.js a requisição na **origem resolvida** (cookies e retorno do Google no
  próprio endereço de acesso). `AUTH_URL`/`NEXTAUTH_URL` são removidas na carga de `src/auth.ts` (fariam o
  Auth.js reescrever tudo para uma origem); `AUTH_URL` só serve de fallback do `APP_ORIGIN`.
- Risco residual documentado: num acesso direto à porta, `X-Forwarded-Proto` pode ser forjado; com a lista
  só de hosts isso não é distinguível, mas o navegador descarta o cookie `Secure` por HTTP e o atacante só
  alcança métodos já liberados para HTTPS.

**`/login`** (`src/app/login/page.tsx`, servidor): resolve protocolo/host por `headers()`, passa `methods`,
`signupAvailable` (método `password` + `signupAvailability()` da Plataforma) e o aviso. **E-mail e senha** (e o
"Criar conta") só aparecem com o método `password`; **"Entrar com Google"** só com `google`; com os dois, um
divisor "ou". Host não permitido: só o aviso "Este endereço de acesso não está autorizado. Acesse por …".
Credenciais inválidas: "E-mail ou senha incorretos." (`credentialsErrorMessage`).

**Senha** (`passwordSchema`: 12 a 128; Argon2id `memoryCost 19456`, `timeCost 2`, da base do Opex em
`auth/server/password.ts`, com hash falso para conta inexistente):

- Provider `Credentials` (`authorize`): Zod, método `password` habilitado na requisição, conta ativa **com
  senha**, `lastLoginAt`; o callback `jwt` aceita o primeiro token do `credentials` (usuário + `sessionVersion`
  do `authorize`) e segue revalidando conta ativa e versão em todo token.
- Admin: senha inicial no cadastro e "Definir/Redefinir/Remover senha" na edição (acima).
- Própria conta: botão **"Alterar senha"/"Criar senha"** (`KeyRound`) no rodapé da sidebar → `PasswordChangeDialog`
  → `POST /api/me/password` (`changeOwnPassword`: limite de tentativas, exige a atual quando existe, nova
  diferente, update condicionado à `sessionVersion`, auditoria `user.password_changed`/`user.password_created`).
  Encerra todas as sessões; a tela faz logout. `/api/me` devolve `user.hasPassword` (nunca o hash).
- **Cadastro público por senha**: `POST /api/public/auth/signup` (origem + marcador, método `password` no
  protocolo, limite por IP) → `signupWithPassword` com as mesmas regras do cadastro Google (fence,
  `signupAvailability`, perfil padrão, falha fechado 409 `SIGNUP_UNAVAILABLE`, `signupSource: "public"`,
  auditoria `user.signup` ator `password-signup`, aceite dos termos no primeiro acesso); e-mail já usado →
  409 `SIGNUP_EMAIL_TAKEN`. O navegador entra em seguida com `signIn("credentials")`.
- **Sequestro prévio**: o cadastro por senha não verifica o e-mail, então grava `passwordUnverified: true`.
  Se o dono do e-mail entrar depois com o Google (e-mail verificado), `resolveGoogleAccount` vincula a conta,
  **remove essa senha** e encerra as sessões (auditoria `user.unverified_password_dropped`). Trocar a própria senha
  ("Alterar senha") **não** limpa a marca (não comprova o dono do e-mail); só a senha definida pelo admin
  ou pelo CLI a limpa. Senhas sem a marca (admin, CLI, criada por quem entrou com o Google) não são descartadas.
- Agente Opex: `get_auth_settings`/`update_auth_settings` (grupo Autenticação) e `set_user_password`/
  `remove_user_password` (Usuários); a senha tem `redact` e nunca volta ao modelo.
- Testes: `__tests__/features/auth/{request-origin,auth-route,auth,login}.test.*`,
  `__tests__/features/authentication/authentication.test.ts` (MongoMemoryReplSet) e `access/users.test.tsx`.
  O `__tests__/setup.ts` fixa `cachedAuthSettings` no padrão (não conecta ao Mongo); quem testa os métodos o redefine.

## Termos de uso e política de privacidade

Versão vigente em `platform_settings.legalVersion` (ver `platform.md`). `resolveAccess` devolve
`legalAcceptanceRequired`/`legalVersion` do **usuário real** (nunca do alvo simulado): sem versão
publicada ninguém é bloqueado; publicada, quem não aceitou exatamente essa versão fica bloqueado.
`protectRoute` responde 403 `TERMS_ACCEPTANCE_REQUIRED` para tudo, exceto `/api/me`,
`/api/me/legal` e `/api/me/legal/accept` (que não exigem `admin.access`, para o cadastro público).
`authorityTransaction` e o Agente Opex também recusam. O `AccessProvider` mostra `LegalAcceptance`
(abas Termos/Política, "Li e aceito", Aceitar e continuar ou Sair); o Axios dispara
`ciliar:terms-required` para reler a sessão. O aceite grava `legalAcceptance { version, acceptedAt }`
só para a versão vigente (409 `LEGAL_VERSION_OUTDATED`) e audita `legal.accept`.

## Sessões e proteção

`APP_ORIGIN` é a única variável de URL do app: a origem pública canônica (nunca o nome do
container), com fallback apenas em `AUTH_URL`; `APP_URL`/`NEXT_PUBLIC_APP_URL` foram removidas.
`AUTH_SECRET` deve ser novo e privado. URLs de autenticação
não derivam de Host arbitrário. Login tem limitação por e-mail/processo e comparação dummy para
conta inexistente. Para múltiplas réplicas, mova o rate limit para um mecanismo compartilhado.

JWT e cada API revalidam conta ativa e `sessionVersion`. Logout revoga as sessões daquela versão.
Inativação incrementa a versão. Mudanças de perfis são relidas no servidor em toda requisição.

`protectRoute`/`withProtectedRoute` protegem APIs independentemente do layout. A política é explícita
e falha fechado para rotas não conhecidas. Mutações exigem origem canônica + `x-ciliar-request: 1`;
o protocolo Auth.js usa seu próprio CSRF, com verificação adicional de origem. Respostas protegidas
são `no-store`. Exceções: protocolo Auth.js, `/api/v1/*` com Bearer e `/api/routines/*` com cron secret.

Sem o aceite da versão vigente dos termos, somente sessão, aceite e logout são liberados. O layout
autenticado isola Pusher do login. Sidebar, páginas, ações e formulários seguem permissões; negar no
cliente não substitui a validação do servidor. A sessão do cliente é revalidada ao focar e a cada 30
segundos. Desde o M1, quem entra sem `admin.access` mas com Negócios vai para `/negocios`
(`homeHrefOf`); rotas de negócio, entrevista e Agente Opex não exigem o painel (`requiresPanel`), e o
onboarding obrigatório responde 403 `ONBOARDING_REQUIRED` (ver `businesses.md`). Perfis têm
`limiteNegocios` (aba Geral; vazio = ilimitado).

Enquanto o `SessionBoundary` valida a sessão (`!mounted || query.isPending`: logo após o login e em
todo F5 autenticado) aparece o `AccessLoadingScreen` (CIL-1), com a identidade do login: o mesmo
`LoginBackdrop` (gradiente radial + partículas), a marca "Ciliar" com brilho pulsando, anel girando
na primária (tokens) e "Carregando acesso" com reticências animadas. É `role="status"`/`aria-live`,
decorações `aria-hidden` e a marca não é heading. Com movimento reduzido fica estático (sem giro,
pulso nem movimento das partículas), só com fade de entrada. Mudança só visual: sem ferramenta do
Agente Opex correspondente.

## Persistência e invariantes

Coleções exclusivas no banco `ciliar`: `users`, `roles`, `role_hierarchy`, `access_audit` (e as da
plataforma, `platform_settings` e `legal_versions`). E-mail normalizado/único; `googleSub` único
parcial e não selecionado por padrão (nunca sai do servidor, nem pela API nem pelo agente).
`signupSource` (`invite`/`public`/`cli`), `lastLoginAt` e `legalAcceptance`. Senha (CIL-6): `passwordHash`
(Argon2id, `select: false`, nunca sai do servidor), `passwordSetAt` e `passwordUnverified`.
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
- O perfil padrão do cadastro público não pode ser inativado nem excluído (409 `DEFAULT_ROLE_IN_USE`).

## Interfaces

As listagens usam os componentes **originais do Opex**, sem variações locais de header/filtros:
`CadastroHeader`, `ListFilters`, `FilterGroup`, `StatusFilterMultiSelect`, `StatusPill`, `TableAction`,
`CadastroTableSkeleton` e feedbacks. A tabela de usuários usa a estrutura/células de `TaskTable`
do Opex (colunas próprias) e o comportamento mobile de `ClienteTaskTable`; a hierarquia usa a
listagem de `IntegrationList`, com drag preservado.
Busca tem o debounce original de 500 ms e status permite selecionar ativos/inativos.

`/usuarios`: busca, status, paginação de 20 itens, cadastro em etapas Geral/Perfis, edição,
exclusão confirmada e resumo de permissões. E-mail somente leitura depois de cadastrado.
Cadastro = **convite** (pré-cadastro do e-mail, com os perfis escolhidos e **senha inicial opcional**,
12 a 128 caracteres com confirmação; o perfil padrão não se aplica). "Enviar convite por e-mail" vem marcado com SMTP configurado
(`GET /api/users/invite`), desabilitado sem SMTP; o envio é depois do commit e falha não desfaz a
conta (aviso). A listagem marca **Convite pendente** (sem `googleSub` e sem senha); a edição tem "Reenviar
convite" (`POST /api/users/[id]/invite`, `users.create`, só ativo, pendente e na hierarquia).
Auditoria `user.invite`. Rascunho é preservado em erro. A edição tem o bloco **Senha** (`UserPasswordSection`):
"Definir/Redefinir senha" (`PUT /api/users/[id]/password`) e "Remover senha" (`DELETE`, com aviso quando não
há Google vinculado), ambos `users.edit` + hierarquia, nunca para a própria conta, encerrando as sessões
(`sessionVersion + 1`); auditoria `user.password_set`/`user.password_removed` sem valores.

Os componentes da árvore (`PermissionTree`, `PermissionModuleCard`, `PermissionTreeNode`) aceitam
`tree`, `catalog`, `lockedKeys` e `renderLeafMeta` (padrão: catálogo de acesso) e são reaproveitados
pela seleção de ferramentas do Agente Opex, no mesmo estilo.

`/perfis`: busca, status e ordenação drag/teclado (@dnd-kit). Administrador fica fixo. `/perfis/novo`
e `/perfis/[id]`: Geral, Permissões, Membros (exige users.view), Auditoria. Na aba Geral a cor é
escolhida pelas bolinhas da paleta (`RoleColorSelect`, radiogroup copiado do crm-marketing-campanhas;
grava o token, nunca o hex). Opções fora da hierarquia
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
**senha opcional** (mascarada, com confirmação; Enter pula) e seleção de perfis ativos: pré-autoriza o
e-mail, vinculado no primeiro "Entrar com Google", e com senha também entra por e-mail e senha. Seleção explícita de Administrador cria o perfil reservado dentro da transação,
inclusive no banco vazio. Não sobrescreve duplicados, não mostra stack/URI/credenciais em erro.
Ator `operator-cli`, `signupSource: "cli"`, conexão fechada ao terminar. Não há bootstrap no startup.

O antigo `pnpm auth:migrate-google` (removia as senhas do login anterior) **foi excluído na CIL-6**: rodá-lo
apagaria as senhas novas.

Usa `MONGODB_URI` do `.env`; somente banco `ciliar` fora dos testes. Fora do Docker, mapeia somente
`SCRIPT_MONGODB_HOST` (default mongodb) para localhost; porta opcional em `SCRIPT_MONGODB_PORT`.
Se o `.env` usa o alias `mongobd`, configure `SCRIPT_MONGODB_HOST=mongobd`. Em container não reescreve
a URI. Para alterar uma conexão de servidor, corrija o ambiente; não use esse helper no aplicativo.

## Permissões dos Negócios por módulo (22/10/2026)

O ramo **Negócios** do catálogo (`src/features/access/catalog.ts`) tem um subgrupo por módulo, cada um
com a própria visualização como `viewKey`. Chaves, ações, dependências e o mapa de telas ficam no módulo
puro `src/features/businesses/permissions.ts` (servidor e navegador).

| Subgrupo | Chaves |
|---|---|
| Meus negócios | `businesses.use` (base: ver os próprios negócios e o painel) · `businesses.create` (entrevista) · `businesses.edit` (ficha, logo, tema) · `businesses.archive` · `businesses.delete`* |
| Atividades, Metas, Documentos, Sucessos, Clientes | `<módulo>.view` · `.edit` (criar, editar, arquivar, restaurar) · `.delete`* |
| Pedidos | `orders.view` · `orders.edit` (rascunho, título IA) · `orders.send`* (enviar, copiar, revogar o link) · `orders.decide` (aceitar, recusar, reabrir, cancelar) |
| Trabalhos | `works.view` · `works.edit` (mover, editar, horas, notas, anexos, arquivar) · `works.columns` · `works.payment`* · `works.delete`* |
| Portfólio | `portfolio.view` · `portfolio.edit` (conteúdo, indexação, itens avulsos, inclusive excluir) · `portfolio.publish`* (publicar, despublicar, endereço) |
| Suporte | `businesses.view_all`* (lê todos os módulos de outros usuários; sem `viewKey`: não ganha `businesses.use`) |

\* sensível.

- **Dependências entre grupos** (`BUSINESS_PERMISSION_REQUIRES`): toda chave exige `businesses.use`;
  `orders.view` → `clients.view` + `activities.view`; `orders.decide` → `works.view`; `works.view` →
  `orders.view`. `normalizeRolePermissions` (Perfix `viewKey` + essas dependências, até estabilizar)
  roda ao salvar o perfil (`createRole`/`updateRole`), ao resolver o acesso (`roleRows`) e no editor
  (`PermissionTree`), que trava a chave exigida por outra marcada (`businessPermissionRequiredBy`).
- **Servidor**: `routePermissions` delega a `businessRoutePermissions` (escrita = base + chave do
  módulo; leitura `[]`, conferida no serviço). `readBusiness(access, id, seção)` deriva o módulo da seção
  (`moduleOfSection`): o dono sem a visualização recebe 403 (`requireModuleRead`) e `editable` reflete a
  edição do módulo. `writeItem(…, permissions)` exige por padrão a edição do módulo do tipo; ações
  especiais passam a chave (enviar/revogar `orders.send`, decisões `orders.decide`, pagamento
  `works.payment`, colunas `works.columns`, exclusão `works.delete`/`<módulo>.delete`, publicar
  `portfolio.publish`). Arquivos: `BUSINESS_FILE_PERMISSIONS` pela finalidade. Novo cliente dentro do
  pedido exige `clients.edit`. As visões globais (`/api/clients|orders|works`) exigem a visualização.
- **Onboarding** só com `businesses.use` + `businesses.create` (sem criar não há como sair da entrevista);
  a entrevista (`/api/interview/**`) exige `businesses.create`.
- **Cliente**: `businessRouteAccess(pathname)` decide as telas do prestador no `AccessProvider` (sem o
  painel): `/clientes`, `/pedidos`, `/trabalhos`, `/negocios/[id]/<página>` e `/negocios/novo`. O menu, a
  barra do espaço (`businessSpaceNavSection(id, can)`), os atalhos e os blocos do dashboard
  (`BusinessDashboardDto.visible`) seguem o módulo; os botões de excluir, enviar, pagar, colunas e
  publicar conferem a chave (`usePermissions`), e o servidor recusa do mesmo jeito.
- **Agente Opex**: cada ferramenta usa a chave do módulo (leitura `any: [<módulo>.view, view_all]`,
  escrita `all: [businesses.use, <chave>]`).
- **Migração** `expand-business-permissions` (`src/lib/db/migrations/expand-business-permissions.ts`):
  uma única vez (marcador em `app_migrations`), todo perfil com `businesses.use` (exceto `*`) ganha todas
  as chaves novas, com `version + 1` e auditoria `role.permissions_migrated` (ator `system`). Ninguém perde
  acesso; depois o administrador reduz o que quiser (a migração não roda de novo).
- Regressão corrigida: o `AccessProvider` tratava como tela do prestador só `/negocios/*`, então
  `/clientes`, `/pedidos` e `/trabalhos` exigiam `admin.access` ("Sem acesso" no perfil sem o painel).
- Testes: `__tests__/features/businesses/permissions-pure.test.ts` e `permissions.test.ts`
  (MongoMemoryReplSet: perfis parciais, dashboard, onboarding e a migração).

## Validação

Testes selecionados em `__tests__/features/{auth,access,platform}`; persistência usa MongoMemoryReplSet
8.0.18 efêmero, sem tocar MONGODB_URI/Docker/dados reais. Inclui concorrência, rollback, escalada,
CSRF, sessão revogada, vínculo/cadastro Google (`auth/google-account.test.ts`), bloqueio por termos,
convite, simulação por aba, movimento reduzido e contratos das APIs.
O download inicial do binário Mongo dos testes requer rede; o pacote core não tem postinstall.
Tipos e lint sem executar build ou suíte completa automaticamente.
