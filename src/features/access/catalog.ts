import { defineCatalog, type PermissionBranchDef } from "@nandobfer/perfix"
import { getIntegrationDef, INTEGRATION_IDS } from "@/lib/integrations/catalog"
import { expandBusinessPermissions } from "@/features/businesses/permissions"

const ALSO = (labels: string) => `Também marca: ${labels}.`

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
    // Um subgrupo por módulo. Toda chave exige `businesses.use` e as dependências entre grupos vêm de
    // `BUSINESS_PERMISSION_REQUIRES` (features/businesses/permissions.ts). O suporte fica fora dos
    // subgrupos com `viewKey`: `view_all` não ganha `businesses.use` (que força a entrevista a quem não tem negócio).
    { id: "negocios", label: "Negócios", children: [
        { id: "negocios_proprios", label: "Meus negócios", viewKey: "businesses.use", children: [
            { key: "businesses.use", label: "Visualizar os próprios negócios e o painel", description: "Base de todos os grupos de Negócios." },
            { key: "businesses.create", label: "Criar negócios (pela entrevista)" },
            { key: "businesses.edit", label: "Editar a ficha, a logo, o tema e o contato" },
            { key: "businesses.archive", label: "Arquivar e restaurar negócios" },
            { key: "businesses.delete", label: "Excluir negócios definitivamente", sensitive: true },
        ] },
        ...([
            ["atividades", "activities", "Atividades", "atividades"],
            ["metas", "goals", "Metas", "metas"],
            ["documentos", "documents", "Documentos", "documentos (inclusive marcar para o portfólio)"],
            ["sucessos", "successes", "Sucessos", "sucessos"],
            ["clientes", "clients", "Clientes", "clientes"],
        ] as const).map(([id, key, label, what]) => ({ id: `negocios_${id}`, label, viewKey: `${key}.view`, children: [
            { key: `${key}.view`, label: "Visualizar" },
            { key: `${key}.edit`, label: `Criar, editar, arquivar e restaurar ${what}` },
            { key: `${key}.delete`, label: "Excluir definitivamente", sensitive: true },
        ] })),
        { id: "negocios_pedidos", label: "Pedidos", viewKey: "orders.view", children: [
            { key: "orders.view", label: "Visualizar pedidos e o histórico de versões", description: ALSO("Clientes › Visualizar e Atividades › Visualizar") },
            { key: "orders.edit", label: "Criar e editar rascunhos e gerar o título com IA" },
            { key: "orders.send", label: "Enviar, copiar, estender e revogar o link público", sensitive: true },
            { key: "orders.decide", label: "Aceitar, recusar, reabrir e cancelar", description: ALSO("Trabalhos › Visualizar (aceitar cria o trabalho)") },
        ] },
        { id: "negocios_trabalhos", label: "Trabalhos", viewKey: "works.view", children: [
            { key: "works.view", label: "Visualizar o quadro, as horas, as notas e os anexos", description: ALSO("Pedidos › Visualizar") },
            { key: "works.edit", label: "Mover, editar, lançar horas, notas e anexos, arquivar e restaurar", description: "Converter em sucesso também exige Sucessos › Criar." },
            { key: "works.columns", label: "Gerenciar as colunas" },
            { key: "works.payment", label: "Marcar, editar e desmarcar o pagamento", sensitive: true },
            { key: "works.delete", label: "Excluir definitivamente", sensitive: true },
        ] },
        { id: "negocios_portfolio", label: "Portfólio", viewKey: "portfolio.view", children: [
            { key: "portfolio.view", label: "Visualizar e pré-visualizar" },
            { key: "portfolio.edit", label: "Editar o conteúdo, as seções, a indexação e os itens avulsos" },
            { key: "portfolio.publish", label: "Publicar, despublicar e trocar o endereço", sensitive: true },
        ] },
        { id: "negocios_suporte", label: "Suporte", children: [
            { key: "businesses.view_all", label: "Ver negócios, entrevistas e todos os módulos de outros usuários (somente leitura, auditado)", sensitive: true },
        ] },
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

/**
 * Dependências completas de um perfil: a visualização do próprio grupo (Perfix) e as dependências
 * entre grupos dos Negócios, até estabilizar. Usado ao salvar o perfil, ao resolver o acesso e no editor.
 */
export function normalizeRolePermissions(selected: Iterable<string>): string[] {
    let current = catalog.normalizePermissionDependencies(selected) as string[]
    for (;;) {
        const next = catalog.normalizePermissionDependencies(expandBusinessPermissions(current)) as string[]
        if (next.length === current.length) return next
        current = next
    }
}
export const can = (permissions: ReadonlySet<string>, key: string) => permissions.has("*") || permissions.has(key)
export const canSeeIntegration = (permissions: ReadonlySet<string>, id: string) => can(permissions, `integrations.${id}.view`)
