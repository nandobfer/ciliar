# Integrações

## Catálogo

`src/lib/integrations/catalog.ts` é a fonte única. A listagem tem exatamente Pusher, API interna,
Crons, Provedores de IA, SMTP, Storage S3, **Plataforma** (`platform`, M0: página própria
`/integracoes/plataforma`, dados em `/api/platform/*`, ver `platform.md`) e **Autenticação**
(`authentication`, CIL-6: página própria `/integracoes/autenticacao`, métodos de login por protocolo
HTTP/HTTPS e endereços de acesso adicionais em `/api/authentication/settings`, ver `access.md`). Os filhos `ai_opencode`, `ai_gemini`, `ai_anthropic`,
`ai_openai`, `ai_deepseek` e `ai_jev` ficam somente no hub `/integracoes/ia` (Anthropic, OpenAI e
DeepSeek copiados do Opex: API key em Campos privados, teste lista os modelos de texto, variante =
nível de raciocínio). Não há GitHub, Clientes, Google Drive nem features de tarefas.

As interfaces/serviços originais foram copiados: listagem com status, edição e descarte de mudanças,
teste em NDJSON, logs xterm com busca/maximização, Swagger e explorador, configuração e segredos.
IA tem a aba **Provedores** (mesmo card e opções gerais), a aba **Agente Opex**
(`?aba=agente-opex`, ver `opex-agent.md`) e a aba **Agente Entrevistador** (`?aba=agente-entrevistador`,
modelo, instruções e roteiro versionado; ver `businesses.md`) e a aba **Resumo** (`?aba=resumo`, formata e
resume as memórias dos agentes; ver `ai-memories.md`). As abas dos agentes terminam no card **Memórias**. As páginas dos
provedores preservam Configuração, Modelos e Consumo (Gemini não tem Consumo), sem dados importados.

## Persistência e segurança

MongoDB/Mongoose, configuração banco → env legado → default. Segredos AES-256-GCM com
`INTEGRATIONS_ENCRYPTION_KEY`; somente escrita, a resposta traz configuração/origem/erro e nunca
o valor. Auditoria registra alterações sem segredos, logs têm mascaramento e TTL de 48h.
Migrações somente de integrações e índices de consumo de IA; nenhuma migração de negócio do Opex.

Gerenciamento protegido por Auth.js e Perfix: capacidades separadas por integração para visualização,
edição, teste, logs, explorador, tokens e execução manual. Listagem filtrada; componentes somente
leitura onde necessário. Modelos/consumo exigem acesso ao provedor correspondente. O Bearer de
`/api/v1/whoami` e cron secret continuam sendo contratos independentes, sem liberar o administrativo.
Swagger/documentação exigem sessão; o explorador/tester da API interna gera a especificação local
sem encaminhar cookies ao próprio servidor. Tokens têm hash persistido e valor exibido uma única vez.

## Crons e tempo real

Mesmo motor de leases atômicos, reagendamento, execução manual e tick de minuto em
`instrumentation.ts`. Rotinas nativas: `integrations-health-check` (5 min), `opex-files-cleanup`
(60 min, arquivos do chat do agente não enviados em 24 h) e `businesses-purge` (60 min, negócios
arquivados após o prazo da Plataforma e imagens pendentes da entrevista; ver `businesses.md`). Rotinas HTTP podem
ser adicionadas no mesmo editor; agendas por intervalo, diária, semanal ou mensal (Brasília).
Não são registradas rotinas de tarefas/GitHub/desenvolvimento inexistentes no Ciliar.

Pusher suporta cluster e host próprio (Soketi), com polling quando indisponível. A rota
`/api/pusher/auth` exige sessão e capacidades efetivas. `private-app` é restrito ao wildcard;
`private-integration-{id}` exige visualizar a integração; `private-opex-{userId}` só o próprio usuário
real com `opex.use`; `private-businesses-{userId}` só o próprio usuário real com `businesses.use` (os dois
últimos não exigem o painel). Canais arbitrários são recusados.
Status/debug enviam somente invalidações, nunca o conteúdo: clientes relêem pela API reautorizada,
inclusive quando uma assinatura antiga continua existindo após revogação. Login/logout e troca
de simulação limpam caches e desconectam/recriam assinaturas.

## Rotas

- `/integracoes`, `/integracoes/[id]`, `/integracoes/ia`, `/integracoes/ia/[provider]`, `/integracoes/plataforma`,
  `/integracoes/autenticacao` (`/api/authentication/settings`).
- `/api/integrations`, `/api/integrations/[id]`: lista, detalhe e PATCH.
- `/api/integrations/[id]/{test,logs,openapi,explore}`.
- `/api/integrations/internal_api/tokens`, `/api/integrations/internal_api/tokens/[tokenId]`.
- `/api/integrations/[id]/jobs/[jobId]/run`, `/api/routines/scheduler-tick`.
- `/api/ai/providers/[provider]/models`, `/api/ai/providers/{opencode,jev}/usage`.
- `/api/ai/features/opex-agent` (configuração do agente) e `/api/opex/*` (chat; ver `opex-agent.md`).
- `/api/pusher/auth`, `/api/openapi.json`, `/api/docs`, `/api/v1/whoami`.

SMTP testa sem enviar e-mail; Storage S3 testa sem gravar objeto. Configuração de IA/SMTP/S3
somente na tela, sem novas variáveis de ambiente. Não há dados simulados nem sucesso fictício.
SMTP também envia os convites de usuário (opcional). Plataforma testa a disponibilidade do
cadastro público (perfil padrão válido + termos publicados). Exceção às variáveis: as credenciais
OAuth do Google (`AUTH_GOOGLE_ID/SECRET`) ficam no ambiente, pois o login precede a tela. Autenticação
testa se cada protocolo tem um método utilizável (Google exige as credenciais no ambiente).
