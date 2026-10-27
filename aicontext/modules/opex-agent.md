# Módulo: Agente Opex (`src/features/opex-agent/`)

Assistente por chat que executa as funcionalidades do Ciliar com ferramentas (tool calling da AI
SDK), sem limite de passos nem de chamadas. **Copiado do Opex** em 20/10/2026: componentes,
transições, animações, layout, estilos, posições e comportamentos são os originais. Muda o escopo:
no Ciliar o agente age sempre como o **usuário real autenticado**, com as permissões Perfix dele.

## Onde fica e como abre

### Permissões das ferramentas de Negócios

Cada ferramenta usa a chave do módulo (ver "Permissões dos Negócios por módulo" em [access.md](access.md)):
leitura `any: [<módulo>.view, businesses.view_all]`; escrita `all: [businesses.use, <chave>]` — ex.:
`send_order`/`revoke_order_link` = `orders.send`, decisões = `orders.decide`, `mark_work_paid`/`unmark_work_paid` =
`works.payment`, colunas = `works.columns`, `publish_portfolio_changes`/`publish_portfolio`/`unpublish_portfolio`/
`update_portfolio_slug`/`update_portfolio_settings` = `portfolio.publish` (os blocos e a mídia = `portfolio.edit`), `convert_work_to_success` = `works.edit` + `successes.edit`.

### Ferramentas M3: Clientes e Pedidos

Grupos sem painel (chaves `clients.*`/`orders.*` sobre `businesses.use`; leituras também com `businesses.view_all`), implementados
em `server/tools/clients.ts` e `server/tools/orders.ts`. Regras em [orders.md](orders.md).

| Grupo | Ferramentas | Risco |
|---|---|---|
| Clientes | `list_clients`, `get_client` | read |
| Clientes | `create_client`, `update_client`, `restore_client` | write |
| Clientes | `archive_client`, `delete_client` | destructive |
| Pedidos | `list_orders`, `get_order` | read |
| Pedidos | `create_order`, `update_order`, `regenerate_order_title` | write |
| Pedidos | `accept_order`, `reject_order`, `reopen_order` | write |
| Pedidos | `send_order`, `revoke_order_link`, `cancel_order` | destructive |

Todos os writes têm resumo. Enviar só devolve URL com `copyLink: true`, quando o usuário pede;
demais leituras não expõem token. Anexos vêm de arquivos do chat e podem ser ocultos do cliente.
`create_success`/`update_success` também recebem `clientId` (cliente do dono).

### Ferramentas M4: Trabalhos

Grupos sem painel (`work-columns`, `works`, `work-time`, `work-notes`; chaves `works.*` sobre `businesses.use`, leituras
também com `businesses.view_all`), em `server/tools/works.ts`. Regras em [works.md](works.md).

| Grupo | Ferramentas | Risco |
|---|---|---|
| Colunas dos trabalhos | `list_work_columns` | read |
| Colunas dos trabalhos | `create_work_column`, `update_work_column`, `reorder_work_columns` | write |
| Colunas dos trabalhos | `delete_work_column` (só vazia, arquivados contam) | destructive |
| Trabalhos | `list_works`, `get_work` (itens, horas, notas, anexos, pagamentos, movimentações e versões) | read |
| Trabalhos | `move_work` (nunca para/de Pago: `authorize` recusa `paid`), `mark_work_paid` (data/valor/forma; num pago, corrige — W4), `update_work` (itens, horas estimadas, valor, prazo — versão `work`), `restore_work` | write |
| Trabalhos | `unmark_work_paid` (sai do faturamento), `archive_work`, `delete_work` | destructive |
| Horas dos trabalhos | `list_time_entries` | read |
| Horas dos trabalhos | `create_time_entry` (item do pedido ou atividade ativa; data padrão hoje no fuso do turno), `update_time_entry` | write |
| Horas dos trabalhos | `delete_time_entry` | destructive |
| Notas, anexos e sucesso | `add_work_note`, `update_work_note` (só a própria), `add_work_attachment` (arquivos do chat), `convert_work_to_success` (um por trabalho) | write |
| Notas, anexos e sucesso | `delete_work_note` (só a própria) | destructive |

`update_work_note`/`delete_work_note` cobrem o que a tela permite (P26). As versões (`version`)
são lidas pelo próprio executor antes de cada escrita.

### Ferramentas M5: Portfólio

Grupos sem painel (`portfolio`, `portfolio-items`; chaves `portfolio.*` sobre `businesses.use`, leituras também com
`businesses.view_all`), em `server/tools/portfolio.ts`. Regras em [portfolio.md](portfolio.md).

| Grupo | Ferramentas | Risco |
|---|---|---|
| Portfólio | `get_portfolio_page` (endereço/URL, página publicada, indexação, blocos do rascunho, alterações não publicadas e problemas, conteúdo disponível, mídia, histórico), `list_portfolio_media` | read |
| Portfólio | `add_portfolio_block` (tipo + propriedades; `parentId`/`column` para dentro de Colunas), `update_portfolio_block`, `move_portfolio_block` (`delta` ou destino), `add_portfolio_media` (imagens do chat), `update_portfolio_settings` (indexação) | write |
| Portfólio | `remove_portfolio_block`, `apply_portfolio_template`, `discard_portfolio_draft`, `restore_portfolio_publication`, `publish_portfolio_changes` (`publishPage`; devolve a URL), `publish_portfolio`, `unpublish_portfolio`, `update_portfolio_slug`, `delete_portfolio_media` | destructive |
| Itens avulsos do portfólio | `list_portfolio_items` | read |
| Itens avulsos do portfólio | `create_portfolio_item`, `update_portfolio_item` (imagens do chat: `fileIds`/`addFileIds`, `removeImageIds`), `restore_portfolio_item` | write |
| Itens avulsos do portfólio | `archive_portfolio_item`, `delete_portfolio_item` | destructive |

- Item **"Agente Opex"** (ícone `Bot`) no rodapé da barra lateral (`AppLayoutShell` passa
  `sidebarFooterItems` ao `AppShell`), **só com a permissão `opex.use`** (ramo "Agente Opex" do catálogo).
- Popover ancorado no item, abertura com spring de escala (Framer Motion, respeitando movimento
  reduzido); **Maximizar** amplia; no celular (< 768 px) abre em tela cheia (Dialog do Radix).
- Atalho global **Ctrl+Shift+O** (⌘+Shift+O no Mac). Ponto pulsando no ícone quando alguma sessão
  está respondendo ou aguarda confirmação.

## Sessões e chat (iguais ao Opex)

- Sessões em abas, sem limite; fechar a aba não exclui. Abas no `localStorage` por usuário real
  (`ciliar:opex-agent:tabs:v1:{userId}`, `usePersistentState` + Zod). Lista **Sessões** com busca
  tolerante (fuse.js), arquivadas, renomear/arquivar/excluir (`AlertDialog`), virtualizada acima de 50.
- Streaming de texto e raciocínio ("Pensando…"), cards de ferramenta animados com duração e
  entrada/saída recolhíveis, rodapé com modelo/tokens/duração, Tentar novamente, Parar, Ir para o fim.
- **"Ver informações técnicas" (`opex.technical`)**, no ramo "Agente Opex" (depende de `opex.use`), vale
  para **todo chat de agente** do Ciliar (Agente Opex e a entrevista do Agente Entrevistador, que usam os
  mesmos componentes) pelo hook `useOpexTechnicalDetails` (permissões efetivas, respeita "Visualizar
  como"). Sem ela: sem o rodapé (modelo, tokens, duração), sem o modelo no cabeçalho do painel, sem o
  bloco "Raciocínio" (só "Pensando…"), e o card da ferramenta mostra só ícone, rótulo e estado (sem
  expandir, sem nome técnico, duração ou texto do erro). Erro/interrupção com "Tentar novamente", a
  confirmação (resumo e botões) e o card do token gerado continuam. **Só na interface** (decisão do
  produto): a API segue enviando os dados completos.
- Título e resumo por subagente próprio (ou o principal); turnos em segundo plano (`server/hub.ts`).
- **Arquivos no chat** pelo Storage S3 com PUT assinado, progresso real, colar/arrastar, limites
  configuráveis (até 50 por mensagem, até 100 MB). Pendentes somem em 24 h pela rotina
  **`opex-files-cleanup`** (Integrações › Crons, 60 min). Entrega ao modelo por provedor
  (`opexFileDelivery`): Gemini lê imagem/PDF/áudio/vídeo; Anthropic e OpenAI imagem/PDF; DeepSeek só
  referência; textos sempre inline (até 100 mil caracteres).

## Segurança (diferenças em relação ao Opex)

- **Sessões privadas do usuário real** (`opex_sessions.userId`): sessão de outro usuário responde
  **404**. Não há portal do cliente nem escopo de cliente.
- **Escopo do servidor** (`server/scope.ts`): `{ userId, viewAsHeader, sessionVersion, timeZone? }` da
  requisição (`timeZone` = fuso do navegador, `x-ciliar-timezone`, usado no progresso das metas). O
  acesso nunca é guardado pronto: `resolveScopeAccess` relê conta ativa, versão da
  sessão de login, perfis e simulação (`resolveAccess`) e exige `opex.use` (desde o M1 sem
  `admin.access`: o prestador também conversa). As ferramentas fora dos grupos sem painel
  (`OPEX_NO_PANEL_GROUPS`: `context`, `files`, `docs`, negócios e seus módulos) exigem também
  `admin.access` (`canUseOpexTool`).
- **Antes de cada ferramenta** (`server/authorize.ts`): relê o acesso, confere que o agente segue
  ativo e a ferramenta segue ligada, confere as permissões do catálogo e as que dependem da entrada
  (`authorize` da ferramenta, ex.: `integrations.{id}.edit`). A execução roda em
  `requestAccess.run(access)` com o contexto revalidado; os comandos (`authorityTransaction`)
  autorizam de novo — três camadas independentes.
- **Visualizar como**: o marcador `x-perfix-view-as` da aba vai em cada requisição (o stream NDJSON
  também envia). O turno usa as permissões simuladas; a identidade, as sessões e a auditoria
  continuam do ator real. A simulação ativa vai no contexto do turno (fim da mensagem do usuário).
- **Confirmação**: Confirmar/Cancelar usa o escopo da requisição de decisão e revalida tudo antes de
  executar. Entradas com segredo (senha, credencial) só aguardam cifradas (`secretBox`); sem
  `INTEGRATIONS_ENCRYPTION_KEY` a ação é recusada (503 `OPEX_SECRET_BOX_REQUIRED`).
- **Tempo real**: `opex-session-updated`/`opex-session-deleted` em `private-opex-{userId}` (só o
  próprio usuário assina, com `opex.use`), payload `{ id }` — só invalidação. Configuração alterada
  publica `ai-feature-updated` em `private-integration-ai`.
- Senhas e segredos não ficam no histórico enviado ao modelo nem nos cards (`redact`). O **token da
  API interna** gerado pelo agente é exceção pedida pelo usuário: o valor volta ao modelo e aparece
  num card próprio com **Copiar** (`OpexApiTokenCard`); nos detalhes do card fica mascarado.

## Configuração

- Aba **"Agente Opex"** em `/integracoes/ia?aba=agente-opex` (`AiEditorForm` + `AI_TABS`), salva em
  `ai_feature_settings` (`feature: "opex-agent"`). Ver exige `integrations.ai.view`; salvar,
  `integrations.ai.edit` (botões ocultos sem a permissão; o servidor confere).
- A aba tem as seções **Geral**, **Ferramentas** e **Memórias** (`AgentSettingsTabs`, `?secao=`; Memórias
  só com `ai_memories.view`). Geral e Ferramentas são um formulário só: trocar de seção mantém o
  rascunho e o Salvar de qualquer uma grava tudo (erro de validação volta para Geral).
- Agente principal e subagente de título (provedor, modelo, variante; temperatura e máximo de
  tokens nos provedores com amostragem), instruções com "Restaurar padrão", política de confirmação,
  **ferramentas** e "Arquivos no chat".
- Provedores do agente: **Gemini, Anthropic, OpenAI e DeepSeek** (o OpenCode não executa ferramentas).
- **Ferramentas**: árvore no mesmo estilo das permissões de perfis (`PermissionTree`,
  `PermissionModuleCard`, `PermissionTreeNode` com `tree`/`catalog`/`lockedKeys`/`renderLeafMeta`):
  um módulo por grupo, caixa tri-state, contador, busca, risco e permissão exigida em cada folha;
  destrutivas como sensíveis. Grava `disabledTools` (ferramenta nova nasce ligada); nomes fora do
  catálogo dão 400 `OPEX_TOOL_UNKNOWN`. O contexto (`get_app_overview`) é sempre ligado.
- **Confirmação por ferramenta**: cada folha tem "Pede confirmação" (valor efetivo + "personalizado").
  Padrão pelo risco (`defaultToolConfirms`): `destructive` pede; `write` só na política "Toda
  alteração"; `read` não pede. O ajuste fica em `confirmationOverrides` (só o que difere do padrão;
  `toolConfirms`/`needsConfirmation`), vale para todas as ferramentas, inclusive leitura e destrutivas
  (decisão do produto; a folha avisa "Ação destrutiva sem confirmação").
- **Memórias** (card no fim da aba, `AgentMemoriesCard`): instruções permanentes do agente, nas
  instruções de sistema de cada turno. Ver `ai-memories.md`.

## Ferramentas

Catálogo puro em `tool-catalog.ts` (nome, grupo, rótulo, descrição, risco, permissões, `display`);
implementação em `server/tools/<grupo>.ts` via `defineTool(nome, { input, execute, ... })`, sempre
chamando o serviço real com o `AccessContext` revalidado (nunca HTTP).

| Grupo | Ferramentas | Permissões |
|---|---|---|
| Contexto (sempre) | `get_app_overview` | — |
| Arquivos do chat | `list_chat_files`, `read_chat_file` | — |
| Documentação do app | `list_app_docs`, `read_app_doc` (inteiro, por seção ou em janelas), `search_app_docs` | — (o público de cada arquivo é filtrado na execução; ver abaixo) |
| Negócios (M1/M2) | `list_businesses` (do último acessado, `lastAccessedAt`, como o seletor do cabeçalho), `get_business`, `get_business_interview`, `update_business` (ficha, tema, contato, prazos, `removeLogo`), `set_business_logo` (imagem do chat), `restore_business`, `archive_business`*, `delete_business`* (só arquivado) | `businesses.use` (leitura também `businesses.view_all`); não há `create_business` (só pela entrevista) |
| Atividades do negócio (M2) | `list_activities`, `get_activity` (histórico do valor/hora), `create_activity`, `update_activity`, `restore_activity`, `archive_activity`*, `delete_activity`* | `businesses.use` (leitura também `businesses.view_all`) |
| Metas do negócio (M2) | `list_goals` (atual + linha do tempo), `get_current_goal`, `get_goal_progress` (fuso do navegador do turno), `create_goal` (nova atual; a anterior vai para o histórico), `update_goal` (nova versão), `restore_goal` (arquivada → atual), `archive_goal`* (a anterior volta a valer), `delete_goal`* (só arquivada) | idem |
| Documentos do negócio (M2) | `list_documents`, `get_document`, `create_document` (arquivo do chat copiado para o negócio), `update_document` (metadados), `restore_document`, `archive_document`*, `delete_document`* | idem |
| Sucessos do negócio (M2) | `list_successes`, `get_success`, `create_success` (`fileIds` do chat), `update_success` (`addFileIds`/`removeAttachmentIds`), `restore_success`, `archive_success`*, `delete_success`* | idem |
| Clientes e Pedidos (M3) | ver "Ferramentas M3" acima | idem |
| Trabalhos (M4) | ver "Ferramentas M4" acima: colunas, trabalhos, horas, notas/anexos/sucesso | idem |
| Memórias dos agentes | `list_agent_memories`, `get_agent_memory`, `create_agent_memory`, `update_agent_memory`, `delete_agent_memory`* (`agent` = enum de `src/features/ai/agents.ts`, inclusive o próprio Agente Opex) | `ai_memories.view` / `ai_memories.edit` |
| Usuários | `list_users`, `get_user` (com `loginMethods`), `create_user`* (convite sem senha, `sendInvite`), `resend_user_invite`, `update_user`*, `delete_user`*, `set_user_password`* (outro usuário; `redact` da senha, nunca devolvida; encerra as sessões), `remove_user_password`* | `users.view/create/edit/delete` |
| Perfis | `list_permission_catalog`, `list_roles`, `get_role`, `create_role`*, `update_role`* (com `businessLimit`), `reorder_roles`*, `delete_role`* | `roles.view/edit` (+ `users.edit` para membros) |
| Integrações | `list_integrations`, `get_integration`, `update_integration`*, `test_integration`, `list_integration_logs` | `integrations.{id}.view/edit/test/logs` |
| Tokens da API interna | `list_api_tokens`, `create_api_token`*, `revoke_api_token`* | `integrations.internal_api.tokens` |
| Rotinas | `list_routines`, `run_routine` | `integrations.crons.view/run` |
| Plataforma | `get_platform_settings`, `update_platform_settings`* (perfil padrão = autoridade; prazos; documentos), `get_legal_terms`, `update_legal_terms`* (publica nova versão; todos reaceitam) | `integrations.platform.view/edit` |
| Autenticação | `get_auth_settings` (métodos por protocolo, endereços extras, Google configurado), `update_auth_settings`* (http/https: google e/ou password, ao menos um; lista completa de endereços; só o informado muda) | `integrations.authentication.view/edit` |

`*` `destructive` (por padrão pede Confirmar/Cancelar; ajustável por ferramenta). Regra testada: exclusão, credencial, senha,
token e mudança de autoridade são destrutivas (`update_*` inclusive: `update_legal_terms` é
destrutiva porque bloqueia todos os usuários até o novo aceite). `create_user` é um convite sem
senha (login só Google); `resend_user_invite` é `write`. Nenhuma ferramenta devolve `googleSub`.
Sem o aceite dos termos vigentes o agente recusa (`TERMS_ACCEPTANCE_REQUIRED`). A configuração do
próprio agente não tem ferramenta.

## Documentação viva (`aicontext/`)

O agente responde perguntas sobre como o app funciona consultando este diretório **em tempo real**
(CIL-5), sem cópia do conteúdo no código nem cache.

- Grupo `docs` (sem painel, risco `read`): `list_app_docs` (caminho, título, seções, data),
  `read_app_doc` (`path`, `section` opcional pelo título, `offset`/`limit` até 100 mil caracteres) e
  `search_app_docs` (palavras-chave sem diferença de acentos/maiúsculas; trechos com documento,
  seção e linha). Pura: `app-docs.ts`; disco: `server/app-docs.ts`; ferramentas: `server/tools/docs.ts`.
- **Leitura do disco a cada chamada** (`process.cwd()/aicontext`): só `README.md` e
  `modules/<nome>.md`; `..`, caminhos absolutos, outras extensões e links simbólicos são recusados;
  até 512 KB por arquivo. Em produção o Dockerfile copia `aicontext/` para a imagem (cada deploy
  leva a versão atual); no `app-dev` o Compose Watch sincroniza o diretório.
- **Público por arquivo** (`APP_DOC_AUDIENCE`): quem usa o agente (inclusive o prestador) lê os
  módulos de funcionalidade; `access.md`, `integrations.md` e `deployment.md` exigem `admin.access`.
  **Arquivo fora do mapa conta como restrito**; o teste `app-docs.test.ts` falha se algum `.md` real
  não estiver classificado. Restrito, inexistente ou inválido dão o mesmo erro (não revela existência).
  O filtro usa as permissões efetivas do turno (respeita "Visualizar como").
- **Instruções**: além da linha no padrão, o runner acrescenta sempre (mesmo com instruções
  personalizadas) a regra `appDocsInstructions` quando alguma ferramenta `docs` está no turno:
  consultar antes de responder, responder conforme a documentação e dizer quando ela não cobre o
  assunto. Sem `admin.access`, explicar na linguagem da tela, sem coleções, arquivos, chaves de
  permissão, rotas ou infraestrutura.

## APIs

| Rota | Permissão | Descrição |
|---|---|---|
| `GET/PUT /api/ai/features/opex-agent` | `integrations.ai.view` / `.edit` | Configuração (+ `toolCounts`, disponibilidade) |
| `GET /api/opex/status` | `opex.use` | Disponibilidade, modelo e limites para o painel |
| `GET/POST /api/opex/sessions` | `opex.use` | Sessões do usuário; criar (com `text` opcional) |
| `GET/PATCH/DELETE /api/opex/sessions/[id]` | `opex.use` | Detalhe; renomear/arquivar; excluir (com arquivos) |
| `POST /api/opex/sessions/[id]/messages` | `opex.use` | `{ text?, fileIds? }` (409 `OPEX_SESSION_BUSY`/`OPEX_UNAVAILABLE`) |
| `POST /api/opex/sessions/[id]/files` · `POST /api/opex/files/[id]/complete` · `GET/DELETE /api/opex/files/[id]` | `opex.use` | Arquivos (reserva, confirmação, conteúdo, remoção) |
| `GET /api/opex/sessions/[id]/stream` | `opex.use` | NDJSON `snapshot`, deltas, ferramentas, `turn-end`, `ping` |
| `POST /api/opex/sessions/[id]/interrupt` · `POST /api/opex/actions/[id]` | `opex.use` | Parar; confirmar/cancelar |

Todas passam por `withProtectedRoute` (sessão, origem/CSRF nas mutações, `admin.access`, política
explícita em `access/server/policy.ts`).

## Dados

`src/lib/db/models/Opex.ts`: `opex_sessions` (`userId`), `opex_messages`, `opex_pending_actions`
(entrada cifrada, apagada após a decisão) e `opex_files` (só metadados; objetos em `opex/…` no S3).
Índices pela migração `ensure-opex-indexes`. Consumo em `ai_consumption_logs`, origens
`opex-agent`/`opex-title`. Auditoria `AgenteOpex` (sessões e decisões); as ferramentas auditam pelos
próprios serviços (ator real, com a simulação).

## Testes

`__tests__/features/opex-agent/`: `pure`, `files`, `app-docs` (seções, busca, público, caminhos
inválidos e link simbólico, leitura em tempo real, mapa completo, ferramentas no `aicontext` real), `runner` (catálogo do turno por permissões,
simulação no contexto, regra da documentação nas instruções, sessão revogada, 404 entre usuários), `confirmations` (revalidação, contexto
de acesso, segredo sem chave), `tools` (catálogo × implementações, permissões conhecidas no Perfix,
regra de destrutivas, redação, autorização, canal e rotas), `tools-persistence` (serviços reais em
`MongoMemoryReplSet`) e `opex-ui` (cards, token com copiar, árvore de ferramentas).
