# Espaço do negócio (M2)

Regras de produto em `docs/modulos/m2-espaco-negocio.md`. Código em `src/features/businesses` (puro:
`space-schemas.ts`, `theme.ts`, `goal-progress.ts`; servidor em `server/{items,activities,goals,documents,successes,files,space,revenue}.ts`;
telas em `components/space/`; hooks em `hooks/useBusinessSpace.ts`). Base do M1 em `businesses.md`.

## Acesso

- Tudo sob `businesses.use` (dono efetivo, `businessOwnerOf`: o alvo na simulação de usuário, com a
  auditoria no ator real) e `businesses.view_all` (suporte **somente leitura**: cada leitura grava
  `business.support_view` com `after.section` = `ficha`, `activities`, `goals`, `documents`, `successes`,
  `dashboard`, `files`…). Sem permissão nova no Perfix; prazos e limites seguem em
  `integrations.platform.edit`.
- `routePermissions`: `GET /api/businesses/[id]/…` = `[]` (o serviço confere dono/suporte); qualquer
  alteração = `businesses.use`. Só as sub-rotas conhecidas casam (falha fechado). Não exigem o painel.
- **Escrita** (`writeItem` em `server/items.ts`): `businessTransaction` (replica set, fence por dono,
  acesso relido), negócio do dono e **ativo** (arquivado → 409 `BUSINESS_ARCHIVED`), `version` otimista
  por item (409 `VERSION_CONFLICT`), item arquivado não edita (409 `ITEM_ARCHIVED`). Depois do commit:
  remove os objetos devolvidos do S3 e publica `business-space-updated` `{ businessId, kind }` no canal
  `private-businesses-{dono}` (só invalidação; a tela relê pela API).
- Negócio arquivado: o espaço abre **somente leitura** com o aviso e "Restaurar" (decisão do produto).

## Ficha (`/negocios/[id]/ficha`)

- `businesses` ganhou `theme { primaryColor, mode }` (padrão `#0B57C4`/`dark`), `contactEmail`
  (`null` = e-mail da conta do dono, devolvido em `accountEmail`), `contactPhone`, `deadlineAlertDays`
  (3) e `quoteValidityDays` (15). `PATCH /api/businesses/[id]` (`businessUpdateSchema`) aceita todos.
- **Moeda**: `currencyLocked(businessId)` (hoje sempre falso; o M3/M4 contam pedidos/trabalhos) → 409
  `CURRENCY_LOCKED`. Valores não são convertidos: o detalhe traz `valuedItems { activities, goals }` e a
  tela avisa ao trocar.
- **Logo**: envio `purpose: logo` (só PNG/JPEG/WebP/GIF) e `PUT /api/businesses/[id]/logo { fileId }`;
  `DELETE` remove. A anterior sai do S3; auditoria `business.logo.update/remove`. A URL da logo leva
  `?v=` da chave (cache privado de 5 min).
- Identificação (2/3) e Logo/foto (1/3) na mesma linha no desktop
  (`lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`); no celular, empilhados.
- **Logo**: `LogoDropzone` (`components/LogoDropzone.tsx`), a mesma área de soltar/escolher da etapa de
  logo da entrevista: realce ao arrastar (contado por profundidade), prévia com transição (logo atual ou
  blob local), progresso do envio, erro na própria área; troca salva na hora; "Remover" embaixo;
  desabilitada em somente leitura. Movimento reduzido respeitado.
- **Foco**: a Ficha abre sem foco em campo nenhum (`LinksControl autoFocus={false}`; o foco automático
  do último link fazia o navegador rolar até "Sites e redes"); "Adicionar link" foca o campo novo.
- Formulário único (padrão das telas do Opex) com Descartar/Salvar; o rascunho se apoia na versão em
  que foi aberto (`base`) e acompanha atualizações externas enquanto não há alterações locais.

## Tema por negócio

- `theme.ts` é cópia do `crm-marketing-campanhas/src/lib/companies/theme.ts` (contraste WCAG ≥ 4,5:1,
  branco ou `#111111`; inválida/sem contraste → `#0B57C4`; CSS só dos trios HSL calculados, sem
  injeção). **Diferença decidida**: só os destaques mudam (`--primary`, `--primary-foreground`, `--ring`,
  `--sidebar-primary`, `--sidebar-primary-foreground` e `--chart-1` — primeira cor dos gráficos, como
  `hsl(...)`); o fundo da sidebar continua neutro.
- `BusinessThemeController` (montado no `AppLayoutShell`): com `/negocios/[id]/…` aberto, injeta
  `<style id="ciliar-business-theme">` com `:root, :root.light { … }` (vale nos portais) e, no modo
  claro, troca `.dark` por `.light` no `<html>`. Fora do espaço (telas globais, `/negocios`,
  `/negocios/novo`, administração) volta ao escuro padrão. O `BusinessSpaceLayout` aplica o mesmo tema
  no `style` do contêiner.
- **Modo claro**: tokens em `html.light` (`globals.css`), copiados do `:root` do crm (o Opex não tem modo
  claro); sidebar neutra (fundo do card, acento/borda dos tokens claros).
- **Pré-visualização ao vivo**: `theme-preview.ts` (store externo); a ficha publica o rascunho e o limpa ao
  sair. Portfólio (M5), link do orçamento (M3) e e-mails reutilizam `theme.ts`.

## Navegação

- Com um negócio aberto, a barra lateral ganha a seção **Negócio** (`space-nav.ts`): Dashboard, Ficha,
  Atividades, Metas, Documentos e Sucessos. `/negocios/[id]` entra em `persistentHrefs` (a casca não
  remonta entre as páginas; o layout anima o conteúdo).
- **Rolagem**: como o `<main>` da casca é o mesmo entre as páginas, o `BusinessSpaceLayout` volta o
  `APP_SCROLL_CONTAINER_ID` ao topo a cada troca de rota, e os links do espaço (itens da sidebar com
  `NavItemDef.scroll: false`, atalhos do dashboard) usam `scroll={false}` para o Next não rolar até o
  segmento novo (era o que abria a Ficha no meio da página).
- Não há página da transcrição (decisão P55): a entrevista fica na API `GET /api/businesses/[id]/interview`
  e na ferramenta `get_business_interview` do agente.
- `src/app/(app)/negocios/[id]/layout.tsx` → `BusinessSpaceLayout` (contexto `useBusinessSpace`).
- Criar/editar itens em **diálogo** sobre a lista (padrão do Opex), com `ConfirmDialog` para arquivar e
  excluir (excluir exige "Entendo que é irreversível").

## Itens

Cada tipo tem `status` active/archived, `archivedAt`, `version`, `createdBy/updatedBy`; arquivar some das
listas, restaurar volta, excluir definitivamente só arquivado (manual) ou pela rotina após
`retentionDays.{activities|goals|documents|successes}` da Plataforma. Auditoria
`business.{activity|goal|document|success}.{create|update|archive|restore|delete|purge}` (`update` com
antes/depois; atividade com valor/hora anterior e novo).

- **Atividades** (`business_activities`): nome, descrição, categoria (sugestões: `GET …/categories?kind=`),
  `hourlyRateCents` (inteiro ≥ 0, moeda do negócio), `active`. **Histórico de preço** em
  `business_activity_prices` (`fromCents` null na criação, `toCents`, ator real, simulação), visível no
  diálogo da atividade. Pedidos/trabalhos (M3/M4) congelam o valor.
- **Metas** (`business_goals`, as mesmas da entrevista) — **uma meta ativa por negócio** (`server/goals.ts`):
  - `status`: `active` (a atual), `superseded` (histórico, somente leitura: não edita, não arquiva, não
    restaura, não exclui, nunca expira) ou `archived`. `activePeriods [{ from, to|null }]` guarda cada
    período em que foi a ativa; `supersededAt/By/Reason` (`new` = outra meta criada, `edit` = nova
    versão, `restore` = uma arquivada restaurada).
  - **Criar** = nova atual; a anterior vira `superseded/new`. **Editar** a atual cria uma **nova versão**
    (id novo; a anterior vira `superseded/edit`; sem mudança, nada grava; `version` otimista).
    **Arquivar** só a atual: a `superseded` mais recente (`supersededAt`) volta a ser a ativa, ou o
    negócio fica sem meta (`{ archived, current }`). **Restaurar** só arquivada: vira a atual e a atual
    vira `superseded/restore`. **Excluir** só arquivada. O prazo da Plataforma vale só para arquivadas.
  - Índice único parcial `one_active_goal_per_business` (`{ businessId }` com `status: "active"`),
    criado por `ensureGoalIndexes` na migração de boot `ensure-business-indexes` **depois** de
    normalizar (várias ativas → a mais recente fica, as outras `superseded` até a criação da seguinte;
    sem `activePeriods` → preenchido). Não fica no schema (o autoIndex falharia com dados antigos).
  - Entrevista (M1): uma meta só (`goalsSchema` max 1); entrevistas antigas com várias: a última fica
    ativa e as outras entram como substituídas (`insertBusiness`).
  - Progresso calculado
  na leitura (`goal-progress.ts` + `goalsProgress`): janela corrente (mês/ano recorrente com histórico
  desde a criação, até 12; específicas e intervalo com situação `active/upcoming/ended`). **Fuso**: o
  navegador manda `x-ciliar-timezone` (Axios central) → `access.timeZone` (`protectRoute`) e
  `scope.timeZone` no Agente Opex; inválido/ausente = `America/Sao_Paulo` (`lib/timezone.ts`).
  Faturamento por `measureGoalWindows` (`server/revenue.ts`): zero até o M4 (trabalhos em Pago pela data
  do pagamento); meta por hora sem horas → indisponível. Metas fora de vigor: janelas só até a última
  vez em que foram a ativa.
- **Página de Metas** (`GoalsPage`): sem filtros nem lista. Coluna principal com a atual em destaque
  (`CurrentGoalHighlight`: barra animada, atingido, alvo, falta, dias restantes; Editar = "Salvar nova
  versão"; Arquivar confirma dizendo qual meta volta a valer) e as janelas anteriores; coluna direita
  (`lg:grid-cols-[minmax(0,1fr)_18rem]`, fixa ao rolar) com a **linha do tempo** vertical (Atual, Nova
  versão, Substituída, Arquivada + períodos ativos); clicar abre os detalhes somente leitura (arquivada:
  Restaurar como atual / Excluir definitivamente). `GET /goals` → `{ current, history, editable }`.
- **Documentos** (`business_documents`): nome, categoria, descrição, `portfolio` (M5) e um arquivo.
  Trocar o arquivo remove o anterior.
- **Sucessos** (`business_successes`): título, descrição, data, resultado e anexos (até 20);
  `clientId`/`workId` reservados para o M3/M4.
- **Arquivos** (`business_files`): `POST /api/businesses/[id]/files` (reserva + PUT assinado,
  `businesses/tmp/{id}/…`), `POST …/files/[fid]/complete` (HeadObject, tamanho real, cópia para
  `businesses/{negócio}/files/{id}/{nome}`), `GET …/files/[fid]` (inline só imagem/PDF/texto; SVG e
  demais como download, CSP `sandbox`), `DELETE` (só pendente). Limites de Integrações › Plataforma
  (tamanho e tipos; tipo pelo navegador ou extensão). O item vincula (`claimBusinessFiles`, mesma
  finalidade, pendente e pronto); arquivos de documento não viram anexo de sucesso.
- **Dashboard**: ver a seção abaixo.

## Dashboard (`/negocios/[id]`)

- **Período** (`dashboard-period.ts`, padrão do `period.ts` do Opex): Mês atual (padrão), 3, 6 ou 12
  meses, guardado no navegador (`ciliar:business-dashboard:period:v1`, igual para todos os negócios). O
  servidor calcula as datas a partir do "hoje" no fuso do usuário (`dashboardBuckets`): mês atual = um
  ponto por dia (dia 1 até hoje); 3/6/12 meses = um ponto por mês, incluindo o atual.
- `GET /api/businesses/[id]/dashboard?period=` (Zod; inválido → 400) → `server/dashboard.ts`
  (`getBusinessDashboard`): `kpis`, a meta atual (`goal`) com progresso, `counts` dos atalhos e `charts`.
- **Título**: o nome do negócio (com a logo, `leading` do `DashboardHeader`, e o subtítulo
  `businessSubtitle`) no lugar de "Dashboard"; a linha pequena com o nome do `BusinessSpaceLayout` some
  só no dashboard (fica nas demais páginas).
- **Layout**: cabeçalho `DashboardHeader` (copiado do Opex, genérico no período) com Atualizar; grade
  `lg:grid-cols-[minmax(0,1fr)_18rem]` — coluna principal com os indicadores (`DashboardKpis`), a meta atual numa linha inteira
  (`CurrentGoalHighlight` com "Ver metas"; sem meta, "Definir meta") e os gráficos; coluna direita com os atalhos (fixos ao rolar; no celular, no fim).
- **Componentes** copiados do Opex sem alteração: `src/components/charts/` (`ChartCard`, `BarsChart`,
  `RankedBarsCard`, `DonutChart`, `TrendLineChart`, `EmptyChart`, `ChartDataTable`, `palette` sem as
  cores do quadro, `use-chart-animation`, `types`) e `src/components/dashboard/` (`DashboardKpis` com
  `className` opcional, `DashboardHeader`). Valores monetários vão aos gráficos em unidades da moeda.
- **Indicadores**: faturamento bruto no período, meta atual (% atingido), atividades ativas, valor/hora médio,
  documentos e sucessos no período.
- **Gráficos**: faturamento bruto × a meta mensal que valia em cada mês (`goalActiveIn` pela linha do
  tempo + `monthlyTargetOf`),
  valor por hora (8 maiores), evolução do valor/hora (5 maiores, último preço do histórico até cada
  ponto; `null` antes de existir), sucessos no período (pela data do sucesso ou do cadastro) e
  atividades/documentos por categoria ("Sem categoria" agrupada). O de faturamento mostra
  "Sem faturamento no período" enquanto `hasRevenue` for falso (até o M4, decisão P58). O gráfico
  "Progresso das metas ativas" saiu (uma meta só, já na linha da meta atual; P63).

## Rotina

`businesses-purge` (60 min): negócios (com todos os itens e arquivos), `purgeArchivedItems` (por tipo,
`system:businesses-purge`), imagens pendentes da entrevista e `cleanupPendingBusinessFiles` (envios não
usados há mais de 24 h).

## APIs

| Rota | Permissão | Descrição |
|---|---|---|
| `GET/PATCH /api/businesses/[id]` | dono/suporte · `businesses.use` | Ficha (tema, contato, prazos, `valuedItems`, `currencyLocked`) |
| `GET/PUT/DELETE /api/businesses/[id]/logo` | dono/suporte · `businesses.use` | Logo |
| `GET /api/businesses/[id]/dashboard?period=` | dono/suporte | Indicadores, metas, contagens e gráficos do período |
| `GET /api/businesses/[id]/categories?kind=` | dono/suporte | Categorias já usadas (atividades/documentos) |
| `GET/POST /api/businesses/[id]/{activities,goals,documents,successes}?status=` | dono/suporte · `businesses.use` | Lista (`{ items, editable }`); criar |
| `GET/PATCH/DELETE …/{tipo}/[itemId]` · `POST …/archive` · `/restore` | dono/suporte · `businesses.use` | Item (atividade com histórico de preço) |
| `POST …/files` · `POST …/files/[fid]/complete` · `GET/DELETE …/files/[fid]` | `businesses.use` · dono/suporte | Arquivos |

## Agente Opex

Grupos `business-activities`, `business-goals`, `business-documents`, `business-successes` (sem painel),
mais `set_business_logo` e os novos campos de `update_business` (ver tabela em `opex-agent.md`).
`create_document`, os anexos de `create_success`/`update_success` e `set_business_logo` copiam o arquivo
do chat (`loadSessionFile` → `importChatFile`, com os limites da Plataforma).

## Testes

`__tests__/features/businesses/space-pure.test.ts` (tema, janelas, fuso, entradas, rotas, navegação e
catálogo), `space.test.ts` (MongoMemoryReplSet: ficha/logo, atividades e histórico, isolamento, suporte,
simulação, negócio arquivado, metas/dashboard, arquivos e limites, sucessos, exclusão do negócio,
purge por tipo, gráficos do dashboard e ferramentas do agente), `space-ui.test.tsx` (tema na tela e
progresso) e `space-layout-ui.test.tsx` (título = nome do negócio, período, atalhos à direita, Ficha em duas colunas,
sem foco ao abrir, logo por arrastar e somente leitura).
