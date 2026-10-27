# Base, layout e UI

## Origem e preservação

Cópia real do código de `~/code/opex`, não uma recriação visual. Inclui todos os componentes
`src/components/ui`, `list`, `feedback`, `motion`, `wizard`, os hooks compartilhados, modo Vim dos
campos, `globals.css`, configuração Shadcn, Tailwind/PostCSS e o shell/sidebar originais.
Dependências e versões resolvidas foram mantidas, inclusive bibliotecas do catálogo de UI.

O layout raiz usa Inter **local** (`next/font/local`, `src/app/fonts/inter-latin-variable.woff2`), pt-BR, TanStack Query, sonner e
Framer Motion. A configuração pública do Pusher fica somente no layout autenticado. O símbolo original continua em `public/opex-mark.png`.
Marca textual e metadados: Ciliar. Preferências/eventos locais usam namespace `ciliar`.

### Tema claro e visual do crm-marketing-campanhas (22/10/2026)

- **Claro por padrão**: `:root` de `globals.css` = tokens do `:root` do `~/code/sipal/crm-marketing-campanhas`
  (fundo `0 0% 98%`, cards brancos, bordas `240 5.9% 90%`, primária `#0B57C4`, raio `0.5rem`, barra de rolagem cinza).
  Sem opção de escuro por usuário; o `<html>` não tem classe e o Toaster segue o claro.
- **Escuro (`.dark`)** só em três lugares: o espaço de um negócio com modo escuro (`BusinessThemeController`), as páginas
  públicas dele (orçamento/portfólio, `applyDocumentMode` de `src/lib/ui/document-theme.ts`) e o **login** (decisão: fica
  como era, escuro — `.dark` no `main` já no HTML do servidor e no `<html>` enquanto aberto).
- **Sidebar** = degradê `from-sidebar to-sidebar-primary` (`#0B57C4` → 18% mais escuro; dentro de um negócio, a cor dele)
  com classes `white/` e `black/` como no crm (não há mais `--sidebar-accent`/`--sidebar-border`).
- **`tw-animate-css`** importado no `globals.css`: as classes `animate-in`/`fade-in-0`/`zoom-in-95` dos popovers, seleções,
  diálogos, menus e gavetas passam a animar (no crm elas não têm efeito; decisão do produto).
- Componentes `src/components/ui` são os mesmos do crm (botão, campos, seleção, popover, calendário, `DatePicker`,
  `DateRangeCalendar`, `PresetDateRangeFilter`, diálogo, card, tabela). Cores semânticas fixas como no crm (`-600/-700` no claro,
  com `dark:` quando o componente já tinha). Sem brilhos na cor primária (marca do escuro do Opex).
- Exceção: o espaço de um negócio (`/negocios/[id]/…`, M2) aplica a cor primária e o modo claro/escuro do negócio; ver `business-space.md`.
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

Abas: `src/components/ui/tabs.tsx` como no crm — aba ativa `bg-background text-foreground shadow-sm` sobre o trilho `bg-muted`.

## Navegação e acesso

`APP_NAV` (`src/features/layout/navigation.ts`) tem **Negócios** (Negócios, Clientes, Pedidos e Trabalhos, cada um pela visualização do módulo
ou `view_all`, sem o painel — `businessRouteAccess`), **Integrações**, **Usuários** e **Perfis**, filtrados pelas permissões efetivas de cada
usuário/simulação.

### Casca (cópia do `AppShell` do crm)

- **Barra lateral** só com os itens globais (+ Agente Opex): 240px, recolhível no desktop (preferência em `localStorage`
  `ciliar-sidebar-collapsed`, 68px recolhida), gaveta abaixo de 1024px. Marca com as iniciais; rodapé com iniciais, nome,
  perfil (· versão) e **Sair**.
- **Cabeçalho** `h-14 bg-card`: ☰ no celular, caminho `[seletor de negócio] / título da página` (`text-xs font-semibold`) e,
  para administradores reais, o "Visualizar como" à direita; a faixa da simulação fica acima. `ViewAsControls` (barra própria)
  só nas telas fora da casca (onboarding, sem acesso).
- **Seletor de negócio** (`BusinessSwitcher`, cópia do `CompanySwitcher`): `SearchPicker` com os negócios ativos do último
  acesso para o nunca acessado, busca sem acento, "Novo negócio" (limite do perfil) e "Ver todos os negócios"; fora de um negócio
  mostra "Escolher negócio". Ordem/último acesso em `business-space.md`.
- **Abas do negócio** (`BusinessSpaceTabs`) na linha abaixo do cabeçalho (`subheader` do `AppShell`); o título do cabeçalho vem
  delas (`titleItems`). Testes: `__tests__/features/layout/shell-ui.test.tsx`.
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
