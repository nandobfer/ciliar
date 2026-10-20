# Negócios e Agente Entrevistador (M1)

Regras de produto em `docs/modulos/m1-entrevistador-negocio.md`. Código em `src/features/businesses`
(puro: `constants.ts`, `schemas.ts`, `format.ts`, `types.ts`; servidor em `server/`; telas em
`components/`). Um negócio só nasce pela entrevista: não há formulário nem `create_business`.

## Permissões e dono efetivo

- Ramo **Negócios** no catálogo Perfix (sem `viewKey`): `businesses.use` (criar pela entrevista, ver e
  editar os próprios) e `businesses.view_all` (suporte: ver negócios/entrevistas de outros usuários,
  **somente leitura**, auditado com `business.support_view/list/search`).
- **Não exigem o painel** (`admin.access`): `/api/businesses*`, `/api/interview*`, `/api/opex*`, `/api/me*`,
  `/api/access/view-as` e `/api/pusher/auth` (`requiresPanel` em `access/server/policy.ts`). As ferramentas
  administrativas do Agente Opex (grupos fora de `context`/`files`/`businesses`) exigem `admin.access`
  em `canUseOpexTool`; o escopo do Opex exige só `opex.use`.
- **Exceção documentada ao "identidade nunca é simulada"** (decisão do produto): na simulação de
  **usuário**, todas as ações de negócio (entrevista, criação, edição, arquivar, restaurar, excluir) agem
  sobre os negócios do **alvo como dono** (`businessOwnerOf`); a auditoria (`access_audit`) registra o
  **ator real** com o marcador da simulação. Na simulação de **perfil** e sem simulação, o dono é o
  usuário real. O canal Pusher dos negócios é só do usuário real (sem tempo real na simulação).

## Limite de negócios

`roles.limiteNegocios` (`null` = ilimitado; 1–10.000), editado na aba Geral do perfil (`roles.edit`) e
pelas ferramentas `create_role`/`update_role` (`businessLimit`). Vale o **maior** entre os perfis ativos;
qualquer perfil ilimitado vence (`businessLimitOf`). Só ativos contam; restaurar exige vaga. Começar a
entrevista confere a vaga; a conclusão e a restauração conferem de novo dentro de
`businessTransaction` (replica set, majority, **fence por dono** em `business_owner_states`, acesso relido
na transação, sem `admin.access`). Recusa: 409 `BUSINESS_LIMIT_REACHED`.

## Onboarding obrigatório

`mayRequireOnboarding`: `businesses.use` nas permissões efetivas (inclusive simuladas) e **sem** `*`
(administradores nunca são forçados; só `view_all` também não). Sem negócio ativo, `/api/me` devolve
`onboarding.required` e o `protectRoute` responde 403 `ONBOARDING_REQUIRED` a tudo, exceto
`isOnboardingRoute` (própria conta, termos, view-as, Pusher, entrevista, listar/restaurar arquivados e a
logo). O Axios relê a sessão nesse código. O `AccessProvider` mostra a entrevista em **tela cheia sem
sidebar** (só Sair e a faixa de simulação); com arquivados, oferece restaurar um. O "Sem acesso" do P38
deixou de valer: o prestador sem painel vai para `/negocios` (`homeHrefOf`).

## Roteiro e configuração (`/integracoes/ia?aba=agente-entrevistador`)

- Feature `business-interviewer` em `ai_feature_settings`: ativo, `main` (mesmo schema/cartão
  `OpexModelCard` do Opex; provedores com ferramentas: Gemini, Anthropic, OpenAI, DeepSeek) e instruções
  com "Restaurar padrão". `GET/PUT /api/ai/features/business-interviewer` (`integrations.ai.view/edit`).
- **Roteiro versionado** em `interview_scripts` (`version` único, imutável; v0 = roteiro padrão em
  memória). `PUT .../script` grava `version + 1` com a versão da abertura (409 `VERSION_CONFLICT`);
  auditoria `interview_script.update`. Cada campo no máximo uma vez, ao menos uma pergunta ativa.
  Campos: name, type, segment, description, logo, links, availability, goals, currency (o subtipo nunca
  é pergunta). Editor com @dnd-kit (`InterviewScriptCard`) e histórico com visualização.
- **IA indisponível**: `INTERVIEW_UNAVAILABLE` (409) e tela "tente mais tarde"; `notifyInterviewerUnavailable`
  grava `interviewer_alerts` (aviso na aba) e manda e-mail (SMTP, no máximo 1/h) aos usuários ativos com
  `integrations.ai.edit` ou `*`. O teste do hub de IA (health-check) registra o aviso nos logs.

## Entrevista

- `business_interviews`: `ownerId` (dono efetivo), `startedBy` (ator real), `scriptVersion` + cópia das
  `questions`, `answers.{campo} = { status: answered|skipped, value }`, `subtype`, `status`
  (`in_progress`/`completed`), `businessId`. Índice único parcial: **uma em andamento por dono**. Não expira.
- Mensagens em `business_interview_messages` (mesmo formato do Opex; a abertura automática é `kind:
  system` e não aparece) e imagens em `business_interview_files` (PUT assinado, só PNG/JPEG/WebP/GIF até
  o limite de documentos da Plataforma, uma por mensagem; anexo liberado só na pergunta da logo).
- **Motor**: o mesmo do Agente Opex (`hub` em memória, turno em segundo plano, stream NDJSON com
  `snapshot`/reconexão). O contexto de cada turno traz o roteiro, a situação de cada pergunta e a
  próxima. **Ferramentas internas** (`server/interview/tools.ts`, fora do catálogo do Opex): `set_name`,
  `set_type`, `set_segment`, `set_description`, `set_links`, `set_availability`, `set_goals`,
  `set_currency`, `attach_logo` (só dos campos ativos), `skip_question` (recusa obrigatória) e
  `set_subtype`. O servidor valida pelo Zod do campo (URL, PF/PJ, HH:mm início < fim, metas) e o erro
  volta ao modelo, que pede de novo; corrigir = gravar de novo.
- **Metas** (estrutura do M2, `business_goals`): faturamento bruto, `targetCents`, período hora/mês/ano;
  mês/ano recorrente ou específico; hora com janela mês/ano (recorrente ou específico) ou intervalo — o
  usuário decide, o agente não escolhe.
- **Conclusão** (`complete.ts`): respondida a última pergunta, o negócio é criado direto na
  `businessTransaction` (vaga conferida, "Negócio N" pelo contador do dono, logo copiada para
  `businesses/{id}/logo/…` antes e removida se falhar), auditoria `business.create` + `interview.complete`.
  A tela leva ao espaço do negócio. **Descartar** só com outro negócio ativo (409 `INTERVIEW_REQUIRED`),
  apaga respostas, transcrição e imagens (`interview.discard`).
- Telas: `InterviewScreen` (onboarding em tela cheia ou `/negocios/novo` dentro do shell), `InterviewChat`
  (componentes do Opex via `OpexScopeOverride` com `apiBase: /interview`; `OpexComposer` e
  `OpexMessageList` ganharam props opcionais de texto/anexo) e `InterviewProgressPanel`.

## Negócios

- `businesses`: `ownerId`, `number`, nome (vazio → "Negócio N"), tipo, subtipo, área, descrição, logo
  (S3), links, disponibilidade, moeda (BRL), `status` active/archived, `archivedAt`, `interviewId`,
  `version` otimista. Editar/arquivar/restaurar/excluir só pelo dono efetivo.
- `/negocios` (cards, arquivados com a data da exclusão automática, restaurar, excluir definitivamente
  com confirmação explícita), seletor no topo da sidebar (`BusinessSwitcher`, slot `sidebarHeaderItems`
  do `AppShell`; "Novo negócio" indisponível no limite) e `/negocios/[id]` (placeholder "Em
  desenvolvimento" até o M2; a transcrição na tela entra no M2).
- Rotina nativa **`businesses-purge`** (60 min): exclui os arquivados há mais de
  `retentionDays.businesses` (com metas, entrevista e objetos no S3; auditoria `business.purge` com ator
  `system:businesses-purge`) e as imagens pendentes da entrevista com mais de 24 h.
- Tempo real: `businesses-updated` `{ id }` em `private-businesses-{userId}` (só o próprio usuário com
  `businesses.use`).

## APIs

| Rota | Permissão | Descrição |
|---|---|---|
| `GET /api/businesses?status=&ownerId=` | use ou view_all (outro dono: view_all) | Lista + vagas |
| `GET /api/businesses/search?q=` | `businesses.view_all` | Suporte: busca em todos |
| `GET/PATCH/DELETE /api/businesses/[id]` | leitura dono/suporte; alteração `businesses.use` | Ficha; editar; excluir arquivado |
| `POST /api/businesses/[id]/archive` · `/restore` | `businesses.use` | Arquivar; restaurar (vaga) |
| `GET /api/businesses/[id]/logo` · `/interview` | dono ou suporte | Logo; transcrição |
| `GET /api/interview` | `businesses.use` | Disponibilidade + entrevista em andamento |
| `POST /api/interview/sessions` · `GET/DELETE …/[id]` · `GET …/[id]/progress` | `businesses.use` | Começar/retomar; mensagens; descartar; progresso |
| `POST …/[id]/messages` · `/opening` · `/interrupt` · `GET …/[id]/stream` | `businesses.use` | Chat da entrevista |
| `POST …/[id]/files` · `POST /api/interview/files/[id]/complete` · `GET/DELETE /api/interview/files/[id]` | `businesses.use` | Imagem da logo |
| `GET/PUT /api/ai/features/business-interviewer` (+ `/script`) | `integrations.ai.view` / `.edit` | Configuração e roteiro |

## Agente Opex

Grupo **Negócios**: `list_businesses`, `get_business`, `get_business_interview` (read; use ou view_all),
`update_business` (write), `restore_business` (write), `archive_business` e `delete_business`
(destructive). As instruções padrão orientam a criar pela entrevista em `/negocios/novo`.

## Testes

`__tests__/features/businesses/` (MongoMemoryReplSet): limite (maior perfil, ilimitado, arquivados,
restaurar, concorrência), roteiro versionado, validação dos campos, pular obrigatória, conclusão e
"Negócio N", entrevista única, descarte, onboarding/`ONBOARDING_REQUIRED`, purge, isolamento entre donos,
suporte somente leitura e a simulação de usuário (dono = alvo, ator = real).
