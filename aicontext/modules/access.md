# Autenticação, usuários, perfis e Visualizar como

## Origens e arquitetura

- Login: `LoginPage`, `LoginForm`, `LoginParticleBackground` copiados do Opex, mantendo composição,
  animação e partículas conectadas do tsParticles. Nome Ciliar, movimento reduzido. Desde o M0 o
  cartão tem só **"Entrar com Google"** (limpa simulação/cache/Pusher da aba antes) e links para
  `/termos` e `/privacidade`. `?erro=` (motivos em `features/auth/login-errors.ts`) e `?error=` do
  Auth.js viram aviso; sem `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` o botão fica desabilitado com aviso.
  Cor vem do token `--primary`; hidratação lê o tema com snapshot de servidor neutro.
- Regras/UX de usuários e perfis: referência somente leitura no Shekinah. Árvore de permissões
  e resumo, RoleChip e paleta de tokens foram copiados de lá. Nenhum NestJS, bridge ou domínio de clube.
- Perfix: dependência Git fixada no commit `2ceef0948fcbc99f6943589048b365665912def8`;
  sem link local. Catálogo em `src/features/access/catalog.ts`, sem escopos de dados artificiais.
  Ramo **Agente Opex** com `opex.use` (usar o chat); a configuração do agente usa
  `integrations.ai.view`/`integrations.ai.edit`.
- Auth.js `next-auth@5.0.0-beta.32`, provider **Google** (único) e JWT, sem adapter; `src/auth.ts`.
  Credenciais OAuth no ambiente (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`): o login é pré-requisito
  para abrir `/integracoes`, então não ficam na tela. `prompt=select_account`. Cookie HttpOnly,
  Secure em HTTPS, SameSite padrão do Auth.js, expiração de 8h. Não há e-mail/senha, Argon2,
  recuperação de senha, MFA nem outros provedores.

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
segundos. Até o M1, quem entra sem `admin.access` (ex.: perfil padrão sem painel) vê "Sem acesso".

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
`signupSource` (`invite`/`public`/`cli`), `lastLoginAt` e `legalAcceptance`. Não há senha.
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
Cadastro = **convite** (pré-cadastro sem senha do e-mail Google, com os perfis escolhidos; o
perfil padrão não se aplica). "Enviar convite por e-mail" vem marcado com SMTP configurado
(`GET /api/users/invite`), desabilitado sem SMTP; o envio é depois do commit e falha não desfaz a
conta (aviso). A listagem marca **Convite pendente** (sem `googleSub`); a edição tem "Reenviar
convite" (`POST /api/users/[id]/invite`, `users.create`, só ativo, pendente e na hierarquia).
Auditoria `user.invite`. Rascunho é preservado em erro.

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

`scripts/create-user.ts`: terminal interativo obrigatório; sem argumentos nem pipe. Nome, e-mail
da conta Google e seleção de perfis ativos (sem senha): pré-autoriza o e-mail, vinculado no primeiro
"Entrar com Google". Seleção explícita de Administrador cria o perfil reservado dentro da transação,
inclusive no banco vazio. Não sobrescreve duplicados, não mostra stack/URI/credenciais em erro.
Ator `operator-cli`, `signupSource: "cli"`, conexão fechada ao terminar. Não há bootstrap no startup.

`pnpm auth:migrate-google` (`scripts/migrate-google-auth.ts` → `removeLegacyPasswords`): confirmação
interativa, remove `passwordHash`/`mustChangePassword` antigos de todos os usuários (idempotente,
audita `users.legacy_passwords_removed`). Os usuários atuais, inclusive administradores, passam a
entrar com o Google usando o mesmo e-mail (vínculo automático).

Usa `MONGODB_URI` do `.env`; somente banco `ciliar` fora dos testes. Fora do Docker, mapeia somente
`SCRIPT_MONGODB_HOST` (default mongodb) para localhost; porta opcional em `SCRIPT_MONGODB_PORT`.
Se o `.env` usa o alias `mongobd`, configure `SCRIPT_MONGODB_HOST=mongobd`. Em container não reescreve
a URI. Para alterar uma conexão de servidor, corrija o ambiente; não use esse helper no aplicativo.

## Validação

Testes selecionados em `__tests__/features/{auth,access,platform}`; persistência usa MongoMemoryReplSet
8.0.18 efêmero, sem tocar MONGODB_URI/Docker/dados reais. Inclui concorrência, rollback, escalada,
CSRF, sessão revogada, vínculo/cadastro Google (`auth/google-account.test.ts`), bloqueio por termos,
convite, simulação por aba, movimento reduzido e contratos das APIs.
O download inicial do binário Mongo dos testes requer rede; o pacote core não tem postinstall.
Tipos e lint sem executar build ou suíte completa automaticamente.
