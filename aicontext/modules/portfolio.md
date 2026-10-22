# Portfólio (M5)

Regras de produto em `docs/modulos/m5-portfolio.md`. Código em `src/features/portfolio` (puro:
`constants.ts`, `logic.ts` (slug, ordem, WhatsApp, tags), `blocks.ts` (esquema e operações dos blocos),
`resolve.ts` (exibição/lista explícita), `templates.ts` (modelos e conversão do antigo),
`editor-history.ts` (Desfazer/Refazer), `schemas.ts`, `types.ts`; servidor em
`server/{pool,portfolio,media,items,public}.ts`; telas em `components/` (editor em `components/editor/`);
hooks em `hooks/usePortfolio.ts`). Modelos em `businesses/server/models.ts` (`businessModels().portfolios`,
`.portfolioPublications` e `.portfolioItems`), índices pela migração `ensure-business-indexes`.

## Decisões

21/10/2026:

- **D1** Arquivos públicos por **URL pré-assinada do S3** (o MinIO é público), 10 min
  (`PORTFOLIO_FILE_URL_TTL_SECONDS`); a logo tem rota estável no app (favicon/Open Graph).
- **D4** Dos anexos de um sucesso, só as **imagens rasterizadas** são publicadas.
- **D5** Nome do cliente por sucesso, padrão **"Cliente confidencial"**; sucesso sem cliente não mostra a linha.
- **D6** Contato sem e-mail comercial usa o e-mail da conta (P51), com aviso na tela; telefone com `tel:`
  e botão WhatsApp (`wa.me`; sem DDI e 10–11 dígitos → 55).
- **D7** Galeria do item avulso: PNG/JPEG/WebP/GIF (`purpose: portfolio`), até 20, tamanho da Plataforma.
- **D10** O portfólio nasce na primeira abertura pelo dono (despublicado) com o slug sugerido; o slug fica
  reservado mesmo despublicado e só é liberado ao excluir o negócio.

22/10/2026 — **editor de blocos** (estilo montador; substituiu as abas de seções):

- **E1** Blocos **empilhados** (estilo Gutenberg), com bloco **Colunas** (2 ou 3, um nível, só blocos
  simples dentro). Arrastam-se **blocos de seção** (lista de itens) e **itens individuais** (destaque).
- **E2** Blocos: Título, Texto, Imagem, Galeria, Botão, Depoimento, Separador, Colunas, Seção (Serviços,
  Sucessos, Documentos, Itens avulsos) e Item em destaque. **Cabeçalho e contato fixos** (da Ficha).
- **E3** **Rascunho + "Publicar alterações"**; publicado congela só a **montagem** (blocos, ordem, textos
  livres, mídia) — o conteúdo dos itens é lido **ao vivo** e some se for arquivado/desmarcado/inativado.
- **E4** Salvamento **automático** do rascunho (1 s) com **Desfazer/Refazer** (100 passos na sessão).
- **E5** Texto editado **na página** (título e texto) e no painel; texto restrito em **Markdown** com o
  `MarkdownField` existente (`tools`: negrito, itálico, link, lista); exibição só de `p/strong/em/a/ul/ol/li`
  e links http(s)/mailto/tel.
- **E6** Editor funciona no celular: biblioteca e propriedades viram gavetas (`Sheet`); "Desktop/Celular"
  só muda a largura da prévia (os blocos usam container queries `@container`).
- **E7** Publicação, endereço e indexação ficam na aba **Página** do editor; itens avulsos são criados e
  gerenciados pela aba **Conteúdo**.
- **E8** Seção: **"Escolher um a um"** ou **"Todos os disponíveis"** (novos entram sozinhos), ordem
  manual/mais novos/mais antigos/nome, limite, layout grade/lista/carrossel. Estilo por **presets** (fundo
  nenhum/suave/primária, espaçamento P/M/G, alinhamento).
- **E9** **Modelos prontos** (Clássico, Vitrine, Minimalista, em branco) na primeira abertura e em
  "Aplicar modelo"; montados no navegador (com Desfazer) e pelo agente no servidor.
- **E10** **Biblioteca de mídia** reutilizável (`purpose: media`); excluir recusado enquanto em uso no
  rascunho ou no publicado. **Histórico** das 20 últimas publicações com "Restaurar como rascunho".

## Dados

- `business_portfolios` (únicos `businessId` e `slug`): `published`, `publishedAt`, `indexable`,
  `draft { blocks, version, updatedAt, updatedBy }`, `live { blocks, number, publishedAt, publishedBy }`,
  `started` (modelo já escolhido), `version` (configuração/publicação). Blocos guardados como dados
  livres e validados por `portfolioBlocksSchema` ao ler (`readBlocks` descarta só o bloco inválido).
- `business_portfolio_publications` (único `businessId+number`): blocos de cada publicação; mantém as
  últimas `PORTFOLIO_PUBLICATIONS_KEEP` (20).
- Mídia: `business_files` com `purpose: media`, `itemId: "portfolio-media"` (`PORTFOLIO_MEDIA_OWNER`).
- **Publicação independe do status do negócio**: arquivado responde 404; restaurar devolve o estado (P29).
- **Elegíveis** (`server/pool.ts` → `ContentPool`): sucesso ativo; documento ativo com `portfolio: true`;
  atividade ativa (`status` e `active`); item avulso ativo. Escolhido que deixa de ser elegível some da
  página e fica no bloco (o editor mostra "N indisponíveis"); volta sozinho.
- Excluir um conteúdo (manual ou purge) tira as referências do rascunho e do publicado (`itemCleanup` →
  `pruneContentRef`, na mesma transação, com `draft.version + 1`).
- `business_portfolio_items`: `ItemBase` + título, descrição, `images`, `url`, `date`, `tags`
  (`BUSINESS_ITEM_KINDS`, prazo `retentionDays.portfolioItems`).
- Excluir/purgar o negócio apaga portfólio, publicações, itens e arquivos (`deleteBusinessData`).
- Migração de boot `convert-portfolio-blocks` (idempotente, sem `dbConnect`): o portfólio antigo vira
  blocos de Seção "escolhidos", rascunho = publicado (nº 1, ator `system`), campos antigos removidos.

## Regras

- **Rascunho** (`PUT …/portfolio/draft { blocks, draftVersion }`, `portfolio.edit`): página inteira,
  versão conferida → 409 `PORTFOLIO_DRAFT_CONFLICT` (o editor pede "Recarregar"); imagens precisam
  estar na mídia → 400 `PORTFOLIO_MEDIA_NOT_FOUND`. Sem auditoria por salvamento automático.
- **Publicar alterações** (`portfolio.publish`): confere `draftVersion` e `version`; `publishProblems`
  (título vazio, imagem sem arquivo ou sem texto alternativo, botão sem rótulo/link inválido,
  depoimento incompleto) → 400 `PORTFOLIO_DRAFT_INVALID` com `details.problems`; grava `live`, a
  publicação no histórico e, com `publishPage`, liga a página. Ligar a página sem nenhuma publicação →
  409 `PORTFOLIO_NOTHING_PUBLISHED`.
- Descartar rascunho, aplicar modelo e restaurar publicação (`portfolio.edit`) trocam o rascunho.
- **Slug** (`logic.ts`): `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3–60, reservados em `PORTFOLIO_RESERVED_SLUGS`;
  troca: 409 `PORTFOLIO_SLUG_TAKEN`; o antigo deixa de funcionar na hora.
- Escrita só do dono efetivo (`writeItem`: `businessOwnerOf`, fence, acesso relido, negócio ativo).
  Suporte (`businesses.view_all`) lê, vê o histórico e pré-visualiza (auditado, seção `portfolio`).
- Auditoria: `business.portfolio.{create,update,publish,unpublish,slug,publish_changes,discard_draft,
  template,restore_publication,media_add,media_delete}` (antes/depois com o resumo dos blocos) e
  `business.portfolio_item.*`. Invalidação `business-space-updated { kind: "portfolio" | "portfolioItems" }`.

## Página pública

- `src/app/p/[slug]/page.tsx`, `GET /api/public/portfolio/[slug]` e `/logo`, sem sessão, limite por IP.
- `buildPublicPortfolio` resolve os blocos **publicados** com o conteúdo elegível ao vivo
  (`resolveBlocks` → `publicBlocks`, que tira vazios/indisponíveis/incompletos) e assina só os arquivos
  mostrados (`referencedFiles`). Lista explícita: cabeçalho (nome, logo, descrição, área), contato, tema e
  os blocos; serviços sem valores; cliente só com `showClient`. Nunca valores, disponibilidade, pedidos
  ou trabalhos.
- Arquivos: `viewUrl` (imagens e PDF) e `downloadUrl`; SVG/demais só baixam; `urlsExpireAt` e
  `useFreshPortfolio` relêem antes de abrir um arquivo vencido.
- Renderização compartilhada em `components/BlocksView.tsx` (página pública, pré-visualização e editor).

## Editor (`/negocios/[id]/portfolio`)

- `PortfolioEditor`: barra superior (Desfazer/Refazer, Desktop/Celular, situação do salvamento,
  problemas, Pré-visualizar, "Publicar alterações"/"Publicar página" + menu Aplicar modelo, Histórico,
  Descartar rascunho); esquerda `LibraryPanel` (Blocos | Conteúdo com busca, itens avulsos e mídia |
  Página); centro `EditorCanvas`; direita `Inspector` (propriedades ou a árvore dos blocos).
- Arrastar (dnd-kit): blocos e seções da biblioteca, conteúdos (viram destaque ou entram numa seção da
  mesma fonte), imagens da mídia (viram Imagem) e os blocos da página (alça na barra do bloco). Pontos
  de soltar só aparecem onde cabe (`dropProblem`). Clique/Enter na biblioteca insere depois do selecionado.
- Teclado: Enter/Espaço seleciona; Delete exclui; Ctrl+D duplica; Ctrl+Z, Ctrl+Shift+Z/Ctrl+Y; Esc tira a
  seleção (fora dos campos de texto). ↑/↓ na barra do bloco e na árvore. Anúncios pt-BR (`aria-live`).
- `useDraftEditor`: estado + histórico, salvamento com versão, "Recarregar" no conflito, `flush` antes de
  publicar/descartar/restaurar, aviso ao sair com alterações não salvas.
- Somente leitura para suporte, negócio arquivado ou sem `portfolio.edit`; sem `portfolio.publish` o
  rascunho é editável e "Publicar" fica bloqueado.
- Pré-visualização `/previa-portfolio/[id]` mostra o **rascunho**.

## APIs

Permissões `portfolio.view/edit/publish` sobre `businesses.use` (ver "Permissões dos Negócios por módulo"
em [access.md](access.md)).

| Rota | Permissão | Descrição |
|---|---|---|
| `GET /api/businesses/[id]/portfolio` | dono/suporte | Editor (cria na primeira abertura do dono) |
| `PATCH …/portfolio` | `portfolio.publish` | Indexação (`version`) |
| `PUT …/portfolio/draft` | `portfolio.edit` | Salvamento automático do rascunho |
| `POST …/portfolio/publish-changes` | `portfolio.publish` | Publicar alterações (`publishPage`) |
| `POST …/portfolio/discard-draft` · `/template` · `/history/[n]/restore` | `portfolio.edit` | Ações do rascunho |
| `GET …/portfolio/history` | dono/suporte | Últimas publicações |
| `GET/POST …/portfolio/media` · `DELETE …/media/[fileId]` | dono/suporte · `portfolio.edit` | Mídia |
| `POST …/portfolio/publish` · `/unpublish` · `PUT …/slug` · `GET …/slug?check=` | `portfolio.publish` | Página e endereço |
| `GET …/portfolio/preview` | dono/suporte | Rascunho como o visitante veria |
| `…/portfolio-items/**` | dono/suporte · `portfolio.edit` | Itens avulsos |
| `GET /api/public/portfolio/[slug]` · `/logo` | público (limite por IP) | Página e logo |

## Agente Opex

Grupos `portfolio` e `portfolio-items` (tabela em [opex-agent.md](opex-agent.md)). O agente edita o
rascunho pelos mesmos serviços (`savePortfolioDraft` com a versão lida na hora) e publica com
`publish_portfolio_changes`.

## Testes

`__tests__/features/portfolio/`: `portfolio-pure.test.ts` (slug, blocos e colunas, mover/duplicar,
proporção, referências, problemas de publicação, histórico, resolvedor e lista pública, modelos,
conversão do antigo, rotas e catálogo), `portfolio.test.ts` (MongoMemoryReplSet: criação, rascunho e
versão, publicar com problemas, lista explícita e conteúdo ao vivo, histórico/restaurar/descartar/modelo,
mídia em uso, conteúdo excluído saindo dos blocos, permissões, arquivado, endereço, simulação, exclusão,
itens avulsos, migração e ferramentas) e `portfolio-ui.test.tsx` (página pública e editor: inserir,
salvamento automático, Desfazer, teclado, destaque, modelos, problemas, somente leitura).
