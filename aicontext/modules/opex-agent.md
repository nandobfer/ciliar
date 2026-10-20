# Módulo: Agente Opex (`src/features/opex-agent/`)

Assistente por chat que executa as funcionalidades do Ciliar com ferramentas (tool calling da AI
SDK), sem limite de passos nem de chamadas. **Copiado do Opex** em 20/10/2026: componentes,
transições, animações, layout, estilos, posições e comportamentos são os originais. Muda o escopo:
no Ciliar o agente age sempre como o **usuário real autenticado**, com as permissões Perfix dele.

## Onde fica e como abre

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
- Título e resumo por subagente próprio (ou o principal); turnos em segundo plano (`server/hub.ts`).
- **Arquivos no chat** pelo Storage S3 com PUT assinado, progresso real, colar/arrastar, limites
  configuráveis (até 50 por mensagem, até 100 MB). Pendentes somem em 24 h pela rotina
  **`opex-files-cleanup`** (Integrações › Crons, 60 min). Entrega ao modelo por provedor
  (`opexFileDelivery`): Gemini lê imagem/PDF/áudio/vídeo; Anthropic e OpenAI imagem/PDF; DeepSeek só
  referência; textos sempre inline (até 100 mil caracteres).

## Segurança (diferenças em relação ao Opex)

- **Sessões privadas do usuário real** (`opex_sessions.userId`): sessão de outro usuário responde
  **404**. Não há portal do cliente nem escopo de cliente.
- **Escopo do servidor** (`server/scope.ts`): `{ userId, viewAsHeader, sessionVersion }` da
  requisição. O acesso nunca é guardado pronto: `resolveScopeAccess` relê conta ativa, versão da
  sessão de login, perfis e simulação (`resolveAccess`) e exige `admin.access` + `opex.use`.
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
- Agente principal e subagente de título (provedor, modelo, variante; temperatura e máximo de
  tokens nos provedores com amostragem), instruções com "Restaurar padrão", política de confirmação,
  **ferramentas** e "Arquivos no chat".
- Provedores do agente: **Gemini, Anthropic, OpenAI e DeepSeek** (o OpenCode não executa ferramentas).
- **Ferramentas**: árvore no mesmo estilo das permissões de perfis (`PermissionTree`,
  `PermissionModuleCard`, `PermissionTreeNode` com `tree`/`catalog`/`lockedKeys`/`renderLeafMeta`):
  um módulo por grupo, caixa tri-state, contador, busca, risco e permissão exigida em cada folha;
  destrutivas como sensíveis. Grava `disabledTools` (ferramenta nova nasce ligada); nomes fora do
  catálogo dão 400 `OPEX_TOOL_UNKNOWN`. O contexto (`get_app_overview`) é sempre ligado.

## Ferramentas

Catálogo puro em `tool-catalog.ts` (nome, grupo, rótulo, descrição, risco, permissões, `display`);
implementação em `server/tools/<grupo>.ts` via `defineTool(nome, { input, execute, ... })`, sempre
chamando o serviço real com o `AccessContext` revalidado (nunca HTTP).

| Grupo | Ferramentas | Permissões |
|---|---|---|
| Contexto (sempre) | `get_app_overview` | — |
| Arquivos do chat | `list_chat_files`, `read_chat_file` | — |
| Usuários | `list_users`, `get_user`, `create_user`* (convite sem senha, `sendInvite`), `resend_user_invite`, `update_user`*, `delete_user`* | `users.view/create/edit/delete` |
| Perfis | `list_permission_catalog`, `list_roles`, `get_role`, `create_role`*, `update_role`*, `reorder_roles`*, `delete_role`* | `roles.view/edit` (+ `users.edit` para membros) |
| Integrações | `list_integrations`, `get_integration`, `update_integration`*, `test_integration`, `list_integration_logs` | `integrations.{id}.view/edit/test/logs` |
| Tokens da API interna | `list_api_tokens`, `create_api_token`*, `revoke_api_token`* | `integrations.internal_api.tokens` |
| Rotinas | `list_routines`, `run_routine` | `integrations.crons.view/run` |
| Plataforma | `get_platform_settings`, `update_platform_settings`* (perfil padrão = autoridade; prazos; documentos), `get_legal_terms`, `update_legal_terms`* (publica nova versão; todos reaceitam) | `integrations.platform.view/edit` |

`*` `destructive` (sempre pede Confirmar/Cancelar). Regra testada: exclusão, credencial, senha,
token e mudança de autoridade são destrutivas (`update_*` inclusive: `update_legal_terms` é
destrutiva porque bloqueia todos os usuários até o novo aceite). `create_user` é um convite sem
senha (login só Google); `resend_user_invite` é `write`. Nenhuma ferramenta devolve `googleSub`.
Sem o aceite dos termos vigentes o agente recusa (`TERMS_ACCEPTANCE_REQUIRED`). A configuração do
próprio agente não tem ferramenta.

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

`__tests__/features/opex-agent/`: `pure`, `files`, `runner` (catálogo do turno por permissões,
simulação no contexto, sessão revogada, 404 entre usuários), `confirmations` (revalidação, contexto
de acesso, segredo sem chave), `tools` (catálogo × implementações, permissões conhecidas no Perfix,
regra de destrutivas, redação, autorização, canal e rotas), `tools-persistence` (serviços reais em
`MongoMemoryReplSet`) e `opex-ui` (cards, token com copiar, árvore de ferramentas).
