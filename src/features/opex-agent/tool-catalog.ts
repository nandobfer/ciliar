import { defineCatalog, type Catalog, type PermissionBranchDef } from "@nandobfer/perfix"
import { INTEGRATION_IDS } from "@/lib/integrations/catalog"
import { OPEX_TOOL_GROUP_LABELS, OPEX_TOOL_GROUPS, type OpexToolGroup } from "./constants"

/**
 * Catálogo das ferramentas do Agente Opex (módulo PURO: tela e servidor).
 *
 * Fonte única dos metadados de cada ferramenta: grupo, rótulo, descrição enviada ao modelo, risco e
 * as permissões Perfix exigidas. A implementação (`server/tools/<grupo>.ts`) só acrescenta a entrada
 * Zod e a execução; o teste `__tests__/features/opex-agent/tools.test.ts` garante que catálogo e
 * implementações andam juntos.
 *
 * ⚠️ Ao criar ou alterar uma funcionalidade, crie/atualize as ferramentas aqui e no grupo do
 * servidor (ver `AGENTS.md`). A seleção na configuração (Integrações › Provedores de IA › Agente
 * Opex) é montada a partir deste catálogo.
 */

/** `read` nunca pede confirmação; `write` pede na política "Toda alteração"; `destructive`, sempre. */
export type OpexToolRisk = "read" | "write" | "destructive"

/** Permissões exigidas: todas as de `all` e, se houver, ao menos uma de `any`. */
export interface OpexToolAccess {
    all?: readonly string[]
    any?: readonly string[]
    /** Texto exibido quando a permissão depende da entrada (ex.: `integrations.{id}.edit`). */
    hint?: string
}

export interface OpexToolMeta {
    name: string
    group: OpexToolGroup
    /** Rótulo curto em pt-BR exibido no card da ferramenta e na configuração. */
    label: string
    /** Descrição enviada ao modelo (e exibida na configuração). */
    description: string
    risk: OpexToolRisk
    access: OpexToolAccess
    /** Sempre ligada (não aparece como desligável na configuração). */
    alwaysOn?: boolean
    /** Card especial no chat para a saída (ex.: token com botão de copiar). */
    display?: "api-token"
}

const ANY_INTEGRATION_VIEW = INTEGRATION_IDS.map((id) => `integrations.${id}.view`)

export const OPEX_TOOL_CATALOG: readonly OpexToolMeta[] = [
    // ── Contexto ──────────────────────────────────────────────────────────────
    {
        name: "get_app_overview",
        group: "context",
        label: "Visão geral",
        risk: "read",
        alwaysOn: true,
        access: {},
        description:
            "Retrato do acesso agora: data/hora, usuário real, simulação ativa (Visualizar como), perfis e permissões efetivas, e quantas ferramentas estão disponíveis por grupo. Bom primeiro passo quando o pedido for amplo.",
    },

    // ── Arquivos do chat ──────────────────────────────────────────────────────
    {
        name: "list_chat_files",
        group: "files",
        label: "Arquivos do chat",
        risk: "read",
        access: {},
        description: "Arquivos enviados nesta sessão do chat (fileId, nome, tipo, tamanho e se já foram enviados numa mensagem).",
    },
    {
        name: "read_chat_file",
        group: "files",
        label: "Ler arquivo",
        risk: "read",
        access: {},
        description: "Lê o conteúdo de texto de um arquivo do chat (txt, md, csv, json, código...), em janelas de até 100 mil caracteres. Use para arquivos grandes ou de mensagens antigas.",
    },

    // ── Negócios (M1) ──────────────────────────────────────────────────────
    {
        name: "list_businesses",
        group: "businesses",
        label: "Listar negócios",
        risk: "read",
        access: { any: ["businesses.use", "businesses.view_all"] },
        description:
            "Negócios do usuário (ativos e arquivados, com a data da exclusão definitiva automática) e as vagas do limite do perfil. Com businesses.view_all (suporte, somente leitura e auditado): os de outro usuário (ownerId) ou a busca por nome em todos (query).",
    },
    {
        name: "get_business",
        group: "businesses",
        label: "Ler negócio",
        risk: "read",
        access: { any: ["businesses.use", "businesses.view_all"] },
        description: "Ficha completa de um negócio (tipo, subtipo, área, links, disponibilidade, moeda, logo e metas). De outro usuário, só com businesses.view_all (auditado).",
    },
    {
        name: "get_business_interview",
        group: "businesses",
        label: "Ler entrevista do negócio",
        risk: "read",
        access: { any: ["businesses.use", "businesses.view_all"] },
        description: "Transcrição da entrevista que criou o negócio e as respostas por pergunta do roteiro (versão usada).",
    },
    {
        name: "update_business",
        group: "businesses",
        label: "Editar negócio",
        risk: "write",
        access: { all: ["businesses.use"] },
        description:
            "Altera a ficha de um negócio ativo do próprio usuário: nome (vazio vira \"Negócio N\"), tipo PF/PJ, subtipo, área/segmento, descrição, links, disponibilidade e moeda. Só os campos informados mudam; links e disponibilidade substituem a lista inteira.",
    },
    {
        name: "archive_business",
        group: "businesses",
        label: "Arquivar negócio",
        risk: "destructive",
        access: { all: ["businesses.use"] },
        description: "Arquiva um negócio do usuário: some do seletor, deixa de contar no limite e é excluído definitivamente depois do prazo da Plataforma (pode ser restaurado antes).",
    },
    {
        name: "restore_business",
        group: "businesses",
        label: "Restaurar negócio",
        risk: "write",
        access: { all: ["businesses.use"] },
        description: "Restaura um negócio arquivado do usuário (exige vaga no limite de negócios ativos do perfil).",
    },
    {
        name: "delete_business",
        group: "businesses",
        label: "Excluir negócio definitivamente",
        risk: "destructive",
        access: { all: ["businesses.use"] },
        description: "Exclui definitivamente um negócio ARQUIVADO do usuário, com metas, entrevista e anexos (irreversível).",
    },

    // ── Usuários ──────────────────────────────────────────────────────────────
    {
        name: "list_users",
        group: "users",
        label: "Listar usuários",
        risk: "read",
        access: { all: ["users.view"] },
        description: "Usuários do painel (id, nome, e-mail, ativo, perfis, se você pode gerenciá-lo, convite pendente, último acesso e versão dos termos aceita), com busca opcional por nome/e-mail e filtro de situação.",
    },
    {
        name: "get_user",
        group: "users",
        label: "Ler usuário",
        risk: "read",
        access: { all: ["users.view"] },
        description: "Um usuário (por id ou e-mail) com os perfis e as permissões efetivas resultantes.",
    },
    {
        name: "create_user",
        group: "users",
        label: "Cadastrar usuário",
        risk: "destructive",
        access: { all: ["users.create"] },
        description:
            "Pré-cadastra (convida) um usuário com nome, e-mail da conta Google, situação e perfis (ids de list_roles). Não há senha: a pessoa entra com o Google usando esse e-mail e recebe os perfis do convite. Opcionalmente envia o convite por e-mail (SMTP configurado).",
    },
    {
        name: "resend_user_invite",
        group: "users",
        label: "Reenviar convite",
        risk: "write",
        access: { all: ["users.create"] },
        description: "Reenvia por e-mail o convite de um usuário ativo que ainda não entrou com o Google (exige o SMTP configurado).",
    },
    {
        name: "update_user",
        group: "users",
        label: "Editar usuário",
        risk: "destructive",
        access: { all: ["users.edit"] },
        description: "Altera nome, situação (ativo/inativo) e/ou perfis de um usuário. Só os campos informados mudam. Não é possível alterar os próprios perfis nem desativar a própria conta.",
    },
    {
        name: "delete_user",
        group: "users",
        label: "Excluir usuário",
        risk: "destructive",
        access: { all: ["users.delete"] },
        description: "Exclui um usuário (não é possível excluir a própria conta nem o último administrador ativo).",
    },

    // ── Perfis ────────────────────────────────────────────────────────────────
    {
        name: "list_permission_catalog",
        group: "roles",
        label: "Catálogo de permissões",
        risk: "read",
        access: { all: ["roles.view"] },
        description: "Árvore de permissões do painel (chave, rótulo e se é sensível), para montar ou explicar perfis.",
    },
    {
        name: "list_roles",
        group: "roles",
        label: "Listar perfis",
        risk: "read",
        access: { all: ["roles.view"] },
        description: "Perfis na ordem da hierarquia (id, nome, descrição, cor, ativo, posição e quantidade de permissões).",
    },
    {
        name: "get_role",
        group: "roles",
        label: "Ler perfil",
        risk: "read",
        access: { all: ["roles.view"] },
        description: "Um perfil (por id ou nome) com as permissões e, se você puder ver usuários, os membros.",
    },
    {
        name: "create_role",
        group: "roles",
        label: "Criar perfil",
        risk: "destructive",
        access: { all: ["roles.edit"] },
        description: "Cria um perfil com nome, descrição, cor (nome da paleta: roxo, azul, verde…), situação, permissões (chaves de list_permission_catalog) e limite de negócios ativos (null = ilimitado). Só concede permissões que você mesmo possui.",
    },
    {
        name: "update_role",
        group: "roles",
        label: "Editar perfil",
        risk: "destructive",
        access: { all: ["roles.edit"] },
        description:
            "Altera nome, descrição, cor, situação, limite de negócios ativos (null = ilimitado), permissões e/ou membros (ids de usuários; exige também users.edit) de um perfil. Só os campos informados mudam; permissões e membros substituem a lista inteira.",
    },
    {
        name: "reorder_roles",
        group: "roles",
        label: "Reordenar perfis",
        risk: "destructive",
        access: { all: ["roles.edit"] },
        description: "Define a ordem da hierarquia dos perfis (lista completa de ids, sem o Administrador, que fica sempre no topo).",
    },
    {
        name: "delete_role",
        group: "roles",
        label: "Excluir perfil",
        risk: "destructive",
        access: { all: ["roles.edit"] },
        description: "Exclui um perfil sem membros (o Administrador não pode ser excluído).",
    },

    // ── Integrações ───────────────────────────────────────────────────────────
    {
        name: "list_integrations",
        group: "integrations",
        label: "Listar integrações",
        risk: "read",
        access: { any: ANY_INTEGRATION_VIEW, hint: "integrations.{id}.view" },
        description: "Integrações que você pode ver, com situação (configurada, saúde do último teste, modo debug).",
    },
    {
        name: "get_integration",
        group: "integrations",
        label: "Ler integração",
        risk: "read",
        access: { any: ANY_INTEGRATION_VIEW, hint: "integrations.{id}.view" },
        description:
            "Configuração de uma integração: valores públicos, quais segredos estão definidos (nunca o valor), saúde e a definição dos campos (chaves e tipos para update_integration).",
    },
    {
        name: "update_integration",
        group: "integrations",
        label: "Configurar integração",
        risk: "destructive",
        access: { any: INTEGRATION_IDS.map((id) => `integrations.${id}.edit`), hint: "integrations.{id}.edit" },
        description:
            "Altera campos públicos, segredos (gravar ou limpar), ambiente ou modo debug de uma integração. Os campos são validados pela definição da integração (veja get_integration). Os crons ficam no campo `jobs` da integração `crons`.",
    },
    {
        name: "test_integration",
        group: "integrations",
        label: "Testar integração",
        risk: "read",
        access: { any: INTEGRATION_IDS.map((id) => `integrations.${id}.test`), hint: "integrations.{id}.test" },
        description: "Executa o teste de conexão da integração e devolve o resultado com o log do teste.",
    },
    {
        name: "list_integration_logs",
        group: "integrations",
        label: "Logs da integração",
        risk: "read",
        access: { any: INTEGRATION_IDS.map((id) => `integrations.${id}.logs`), hint: "integrations.{id}.logs" },
        description: "Últimas linhas do log de uma integração (mascaradas), com filtro opcional de texto.",
    },

    // ── Tokens da API interna ─────────────────────────────────────────────────
    {
        name: "list_api_tokens",
        group: "api-tokens",
        label: "Listar tokens",
        risk: "read",
        access: { all: ["integrations.internal_api.tokens"] },
        description: "Tokens de sistema ativos da API interna (id, nome, prefixo visível, criação e último uso; nunca o valor).",
    },
    {
        name: "create_api_token",
        group: "api-tokens",
        label: "Gerar token",
        risk: "destructive",
        access: { all: ["integrations.internal_api.tokens"] },
        display: "api-token",
        description:
            "Gera um token de sistema da API interna. O valor é exibido uma única vez num card com botão de copiar para o usuário; não repita o valor no texto da resposta.",
    },
    {
        name: "revoke_api_token",
        group: "api-tokens",
        label: "Revogar token",
        risk: "destructive",
        access: { all: ["integrations.internal_api.tokens"] },
        description: "Revoga um token de sistema da API interna (o acesso por ele para na hora).",
    },

    // ── Rotinas ───────────────────────────────────────────────────────────────
    {
        name: "list_routines",
        group: "routines",
        label: "Listar rotinas",
        risk: "read",
        access: { all: ["integrations.crons.view"] },
        description:
            "Rotinas (crons) do agendador interno: configuração (id, agenda, ativa) e estado (última e próxima execução). Para alterar, use update_integration na integração `crons` (campo `jobs`, a lista inteira).",
    },
    {
        name: "run_routine",
        group: "routines",
        label: "Rodar rotina",
        risk: "write",
        access: { all: ["integrations.crons.run"] },
        description: "Executa agora uma rotina salva (não muda a próxima execução agendada).",
    },

    // ── Plataforma ────────────────────────────────────────────────────────────
    {
        name: "get_platform_settings",
        group: "platform",
        label: "Ler configuração da plataforma",
        risk: "read",
        access: { all: ["integrations.platform.view"] },
        description:
            "Configuração da plataforma: perfil padrão do cadastro público (e se o cadastro está disponível), perfis elegíveis, dias até a exclusão definitiva por tipo de item arquivado, limites de documentos e a versão vigente dos termos.",
    },
    {
        name: "update_platform_settings",
        group: "platform",
        label: "Configurar a plataforma",
        risk: "destructive",
        access: { all: ["integrations.platform.edit"] },
        description:
            "Altera o perfil padrão do cadastro público (autoridade: nunca o Administrador, só perfis ativos que você pode atribuir; null desativa o cadastro público), os prazos de exclusão definitiva por tipo e/ou os limites de documentos. Só os campos informados mudam.",
    },
    {
        name: "get_legal_terms",
        group: "platform",
        label: "Ler termos e privacidade",
        risk: "read",
        access: { all: ["integrations.platform.view"] },
        description: "Termos de uso e política de privacidade: versão vigente (ou uma versão específica) com os textos em markdown e o histórico de publicações.",
    },
    {
        name: "update_legal_terms",
        group: "platform",
        label: "Publicar termos e privacidade",
        risk: "destructive",
        access: { all: ["integrations.platform.edit"] },
        description:
            "Publica uma nova versão (imutável) dos termos de uso e/ou da política de privacidade; o texto omitido é mantido da versão vigente. Todos os usuários, inclusive você, ficam bloqueados até aceitar a nova versão no próximo acesso.",
    },
]

const BY_NAME = new Map(OPEX_TOOL_CATALOG.map((tool) => [tool.name, tool]))

export const OPEX_TOOL_NAMES = OPEX_TOOL_CATALOG.map((tool) => tool.name)

export function opexToolMeta(name: string): OpexToolMeta | undefined {
    return BY_NAME.get(name)
}

export function isOpexToolName(name: string): boolean {
    return BY_NAME.has(name)
}

/** Ferramentas sempre ligadas (o contexto). */
export const OPEX_ALWAYS_ON_TOOLS = new Set(OPEX_TOOL_CATALOG.filter((tool) => tool.alwaysOn).map((tool) => tool.name))

const has = (permissions: ReadonlySet<string>, key: string) => permissions.has("*") || permissions.has(key)

/** Grupos do prestador: não exigem o painel. Os demais (administração) exigem também `admin.access`. */
export const OPEX_NO_PANEL_GROUPS: ReadonlySet<OpexToolGroup> = new Set<OpexToolGroup>(["context", "files", "businesses"])

/** As permissões efetivas liberam a ferramenta? (Revalidado no servidor antes de cada execução.) */
export function canUseOpexTool(meta: Pick<OpexToolMeta, "access" | "group">, permissions: ReadonlySet<string>): boolean {
    if (!OPEX_NO_PANEL_GROUPS.has(meta.group) && !has(permissions, "admin.access")) return false
    const { all = [], any } = meta.access
    if (!all.every((key) => has(permissions, key))) return false
    return !any?.length || any.some((key) => has(permissions, key))
}

/** Permissões exigidas, para exibir na configuração. */
export function opexToolPermissionLabel(meta: Pick<OpexToolMeta, "access">): string | null {
    if (meta.access.hint) return meta.access.hint
    return meta.access.all?.length ? meta.access.all.join(" + ") : null
}

/** Ferramentas ligadas a partir das desligadas guardadas (as sempre ligadas nunca saem). */
export function enabledOpexToolNames(disabledTools: readonly string[]): string[] {
    const disabled = new Set(disabledTools)
    return OPEX_TOOL_NAMES.filter((name) => OPEX_ALWAYS_ON_TOOLS.has(name) || !disabled.has(name))
}

/** Desligadas a partir das marcadas na árvore (nomes desconhecidos e sempre ligadas são ignorados). */
export function disabledOpexToolNames(enabled: Iterable<string>): string[] {
    const on = new Set(enabled)
    return OPEX_TOOL_NAMES.filter((name) => !OPEX_ALWAYS_ON_TOOLS.has(name) && !on.has(name))
}

/**
 * Árvore da seleção de ferramentas, no mesmo formato das permissões de perfis: um módulo por grupo,
 * uma folha por ferramenta. Destrutivas aparecem como sensíveis (borda âmbar). Sem `viewKey`: marcar
 * uma ferramenta não liga outra.
 */
export const OPEX_TOOL_TREE: readonly PermissionBranchDef[] = OPEX_TOOL_GROUPS.map((group) => ({
    id: `tools_${group}`,
    label: OPEX_TOOL_GROUP_LABELS[group].label,
    description: OPEX_TOOL_GROUP_LABELS[group].description,
    children: OPEX_TOOL_CATALOG.filter((tool) => tool.group === group).map((tool) => ({
        key: tool.name,
        label: tool.label,
        description: tool.description,
        ...(tool.risk === "destructive" ? { sensitive: true } : {}),
    })),
})).filter((branch) => branch.children.length > 0)

// Árvore montada em tempo de execução: sem tipos literais das chaves (evita a inferência recursiva do Perfix).
const defineToolCatalog = defineCatalog as unknown as (tree: readonly PermissionBranchDef[]) => Catalog
export const opexToolTreeCatalog = defineToolCatalog(OPEX_TOOL_TREE)
