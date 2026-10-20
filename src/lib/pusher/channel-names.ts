/**
 * Nomes dos canais privados do Pusher. Módulo PURO (sem dependências de servidor): pode ser
 * importado por hooks de cliente. A publicação fica em `./channels` (somente servidor).
 */

/** Canal do app (dados das telas, ex.: tarefas) — só o dono assina. */
export const appChannel = () => "private-app"
export const integrationChannel = (id: string) => `private-integration-${id}`
/** Canal do portal do cliente (dados das telas do cliente). */
export const clientChannel = (clientId: string) => `private-client-${clientId}`

export const CLIENT_CHANNEL_PREFIX = "private-client-"

/**
 * Canal do **histórico de repositórios recentes** de um ator (dono ou usuário de cliente): cada um
 * recebe só as suas próprias mudanças, mesmo quando o dono pré-visualiza o portal.
 */
export const repoRecentsChannel = (actorId: string) => `private-repo-recents-${actorId}`

export const REPO_RECENTS_CHANNEL_PREFIX = "private-repo-recents-"

/**
 * Canal do **Agente Opex** de um usuário real (sessões do chat). Só o próprio usuário assina, e só
 * recebe invalidações `{ id }`: o conteúdo é relido pela API autorizada.
 */
export const opexChannel = (userId: string) => `private-opex-${userId}`

export const OPEX_CHANNEL_PREFIX = "private-opex-"

/**
 * Canal dos **negócios** de um usuário (lista, seletor e entrevista). Só o próprio usuário real
 * assina, com `businesses.use`; payload `{ id }` — só invalidação.
 */
export const businessesChannel = (userId: string) => `private-businesses-${userId}`

export const BUSINESSES_UPDATED_EVENT = "businesses-updated"
