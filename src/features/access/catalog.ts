import { defineCatalog, type PermissionBranchDef } from "@nandobfer/perfix"
import { getIntegrationDef, INTEGRATION_IDS } from "@/lib/integrations/catalog"

export const PERMISSION_TREE = [
    { id: "painel", label: "Painel", children: [{ key: "admin.access", label: "Acessar o painel" }] },
    { id: "usuarios", label: "Usuários", viewKey: "users.view", children: [
        { key: "users.view", label: "Visualizar" },
        { key: "users.create", label: "Cadastrar", sensitive: true },
        { key: "users.edit", label: "Editar e atribuir perfis", sensitive: true },
        { key: "users.delete", label: "Excluir", sensitive: true },
    ] },
    { id: "perfis", label: "Perfis", viewKey: "roles.view", children: [
        { key: "roles.view", label: "Visualizar" },
        { key: "roles.edit", label: "Administrar perfis e permissões", sensitive: true },
    ] },
    { id: "agente_opex", label: "Agente Opex", viewKey: "opex.use", children: [
        { key: "opex.use", label: "Usar o chat do agente" },
        // Vale para todo chat de agente do Ciliar (Agente Opex e Agente Entrevistador); só na interface.
        { key: "opex.technical", label: "Ver informações técnicas" },
    ] },
    { id: "memorias_agentes", label: "Memórias dos agentes", viewKey: "ai_memories.view", children: [
        { key: "ai_memories.view", label: "Ver as memórias" },
        { key: "ai_memories.edit", label: "Criar, editar e excluir memórias", sensitive: true },
    ] },
    // Sem `viewKey`: o suporte (`view_all`) não ganha `businesses.use` (que força a entrevista a quem não tem negócio).
    { id: "negocios", label: "Negócios", children: [
        { key: "businesses.use", label: "Criar (pela entrevista), ver e editar os próprios negócios" },
        { key: "businesses.view_all", label: "Suporte: ver negócios e entrevistas de outros usuários (somente leitura, auditado)", sensitive: true },
    ] },
    { id: "integracoes", label: "Integrações", children: INTEGRATION_IDS.map(id => ({
        id: `integration_${id}`, label: getIntegrationDef(id).name, viewKey: `integrations.${id}.view`, children: [
            { key: `integrations.${id}.view`, label: "Visualizar" },
            { key: `integrations.${id}.edit`, label: "Configurar", sensitive: true },
            { key: `integrations.${id}.test`, label: "Testar conexão", sensitive: true },
            { key: `integrations.${id}.logs`, label: "Consultar logs", sensitive: true },
            { key: `integrations.${id}.explore`, label: "Usar explorador", sensitive: true },
            ...(id === "internal_api" ? [{ key: "integrations.internal_api.tokens", label: "Gerenciar tokens", sensitive: true }] : []),
            ...(id === "crons" ? [{ key: "integrations.crons.run", label: "Executar rotinas", sensitive: true }] : []),
        ],
    })) },
] as const satisfies readonly PermissionBranchDef[]

export const catalog = defineCatalog(PERMISSION_TREE)
export const can = (permissions: ReadonlySet<string>, key: string) => permissions.has("*") || permissions.has(key)
export const canSeeIntegration = (permissions: ReadonlySet<string>, id: string) => can(permissions, `integrations.${id}.view`)
