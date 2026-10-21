# Base, layout e UI

## Origem e preservação

Cópia real do código de `~/code/opex`, não uma recriação visual. Inclui todos os componentes
`src/components/ui`, `list`, `feedback`, `motion`, `wizard`, os hooks compartilhados, modo Vim dos
campos, `globals.css`, configuração Shadcn, Tailwind/PostCSS e o shell/sidebar originais.
Dependências e versões resolvidas foram mantidas, inclusive bibliotecas do catálogo de UI.

O layout raiz usa Inter **local** (`next/font/local`, `src/app/fonts/inter-latin-variable.woff2`), pt-BR, tema escuro fixo, primária `#0B57C4` (azul do crm-marketing-campanhas), TanStack Query, sonner,
Framer Motion. A configuração pública do Pusher fica somente no layout autenticado. Sidebar: 68px no desktop, gaveta expandida no
mobile, mesmo foco/teclado e animações. O símbolo original continua em `public/opex-mark.png`.
Única exceção ao tema fixo: o **espaço de um negócio** (`/negocios/[id]/…`, M2) aplica a cor primária e o modo
claro/escuro do negócio (`html.light` em `globals.css`, `BusinessThemeController`); ver `business-space.md`.
Marca textual e metadados: Ciliar. Preferências/eventos locais usam namespace `ciliar`.

### Fonte sem rede no build

Inter variável Latin, normal, pesos 100–900, `display: swap`, token `--font-sans` preservado.
O WOFF2 oficial e a licença SIL OFL 1.1 estão versionados em `src/app/fonts/` (origem no README
da pasta). Não usar `next/font/google`: ele baixa CSS/fontes durante `next build` e causava
falhas intermitentes de conexão com `fonts.googleapis.com` no Docker. A fonte local é empacotada
pelo Next e servida pelo próprio app; nenhum download de fonte é necessário no build ou no
navegador. Instalação de dependências/imagens Docker continua dependendo de rede quando sem cache.
Teste de regressão: `__tests__/app/local-font.test.ts`.

O header de Visualizar como é a exceção explícita: copiado do Shekinah, fica na coluna de conteúdo
ao lado da sidebar. Seletor em popover, faixa somente durante simulação. Componentes de listagem,
filtros e títulos continuam sendo os originais do Opex; não criar versões locais simplificadas.

Abas: a aba ativa usa sempre a cor principal (`bg-primary text-primary-foreground`), tanto em
`src/components/ui/tabs.tsx` (formulários de usuário e perfil) quanto em `IntegrationTabs`.

## Navegação e acesso

`APP_NAV` (`src/features/layout/navigation.ts`) tem **Negócios** (`businesses.use` ou `view_all`, sem
o painel), **Integrações**, **Usuários** e **Perfis**, filtrados pelas permissões efetivas de cada
usuário/simulação. O seletor de negócio fica no topo da sidebar (`sidebarHeaderItems` do `AppShell`).
`HOME_HREF=/integracoes`; a raiz redireciona para essa tela e quem não tem o painel mas tem Negócios
segue para `/negocios` (`homeHrefOf`). Rotas inexistentes usam a 404 do shell.
O rodapé preserva avatar/versão e tem **Sair**. Login público isolado do shell, copiado do Opex
com tsParticles; o fundo (`LoginBackdrop`) é compartilhado com o loading do shell
(`AccessLoadingScreen`). O shell exige Auth.js e AccessProvider; APIs têm proteção própria, sem depender
de esconder menus nem de middleware. Não há portal ou módulos de tarefas/financeiro/desenvolvimento.
`getLocalUser()` é uma ponte legada para o ator autenticado via AsyncLocalStorage, nunca um bypass.
Detalhes: [Autenticação e acessos](access.md).

## Ambiente

Banco MongoDB exclusivo `ciliar`. `.env` local gerado com segredos novos, nunca copiado do Opex.
O MongoDB local tem um usuário `ciliar_app` com papel `readWrite` restrito ao banco `ciliar`;
senha nova somente no `.env`. Use credenciais próprias também ao preparar outro ambiente.
Desenvolvimento: `pnpm dev --port 3101`; `PORT=3101` no ambiente mantém chamadas internas nessa porta.
Integrações externas começam sem configuração, sem importar banco, credenciais ou logs da origem.

### Migrações de boot

`dbConnect()` (`src/lib/db/index.ts`) roda as migrações de `src/lib/db/migrations/registry.ts` uma
vez por processo e toda chamada espera que terminem. Por isso **nenhuma migração (nem função que
ela chame) pode chamar `dbConnect()`**: ela esperaria a si mesma e todas as requisições que usam o
banco ficariam penduradas (sintoma real: login Google travando até o 504 da Cloudflare). As funções
usadas por migração assumem a conexão aberta (os testes conectam o Mongoose no `beforeAll`). Cada
migração registra `[migration] iniciando`/`concluída` com a duração no log.
