/**
 * Permissões dos Negócios por módulo — módulo PURO (servidor e navegador).
 *
 * `businesses.use` é a base (ver os próprios negócios e o painel); cada módulo tem a sua
 * visualização e as suas ações. `businesses.view_all` (suporte) lê tudo, somente leitura, em
 * qualquer módulo. Dependências entre grupos (`BUSINESS_PERMISSION_REQUIRES`) são aplicadas ao
 * salvar o perfil e ao resolver o acesso, junto da dependência de visualização do Perfix.
 */

export const BUSINESS_PERMISSIONS = {
    use: "businesses.use",
    create: "businesses.create",
    edit: "businesses.edit",
    archive: "businesses.archive",
    delete: "businesses.delete",
    viewAll: "businesses.view_all",
} as const

export const BUSINESS_MODULES = ["activities", "goals", "documents", "successes", "clients", "orders", "works", "portfolio"] as const
export type BusinessModule = (typeof BUSINESS_MODULES)[number]

export const BUSINESS_MODULE_LABELS: Record<BusinessModule, string> = {
    activities: "Atividades",
    goals: "Metas",
    documents: "Documentos",
    successes: "Sucessos",
    clients: "Clientes",
    orders: "Pedidos",
    works: "Trabalhos",
    portfolio: "Portfólio",
}

/** Ações de cada módulo (a primeira é a visualização). */
export const BUSINESS_MODULE_ACTIONS = {
    activities: ["view", "edit", "delete"],
    goals: ["view", "edit", "delete"],
    documents: ["view", "edit", "delete"],
    successes: ["view", "edit", "delete"],
    clients: ["view", "edit", "delete"],
    orders: ["view", "edit", "send", "decide"],
    works: ["view", "edit", "columns", "payment", "delete"],
    portfolio: ["view", "edit", "publish"],
} as const satisfies Record<BusinessModule, readonly string[]>

export type BusinessModuleAction<M extends BusinessModule = BusinessModule> = (typeof BUSINESS_MODULE_ACTIONS)[M][number]

/** Chave da ação do módulo (`orders.send`). */
export function modulePermission<M extends BusinessModule>(area: M, action: BusinessModuleAction<M>): string {
    return `${area}.${action}`
}
export const viewPermission = (area: BusinessModule) => `${area}.view`
export const editPermission = (area: BusinessModule) => `${area}.edit`

/** Todas as chaves dos negócios, exceto o suporte (o que um prestador com acesso completo tem). */
export const BUSINESS_FULL_PERMISSIONS: readonly string[] = [
    BUSINESS_PERMISSIONS.use,
    BUSINESS_PERMISSIONS.create,
    BUSINESS_PERMISSIONS.edit,
    BUSINESS_PERMISSIONS.archive,
    BUSINESS_PERMISSIONS.delete,
    ...BUSINESS_MODULES.flatMap((area) => (BUSINESS_MODULE_ACTIONS[area] as readonly string[]).map((action) => `${area}.${action}`)),
]

/**
 * Dependências entre grupos: a chave à esquerda também marca as da direita. Toda chave de negócio
 * exige `businesses.use`; as demais vêm do que a tela precisa mostrar.
 */
export const BUSINESS_PERMISSION_REQUIRES: Readonly<Record<string, readonly string[]>> = {
    ...Object.fromEntries(BUSINESS_FULL_PERMISSIONS.filter((key) => key !== BUSINESS_PERMISSIONS.use).map((key) => [key, [BUSINESS_PERMISSIONS.use]])),
    // O pedido mostra o cliente e as atividades.
    "orders.view": [BUSINESS_PERMISSIONS.use, "clients.view", "activities.view"],
    // Aceitar cria o trabalho e leva até ele.
    "orders.decide": [BUSINESS_PERMISSIONS.use, "works.view"],
    // O trabalho é a continuação do pedido aceito.
    "works.view": [BUSINESS_PERMISSIONS.use, "orders.view"],
}

/** Acrescenta (até estabilizar) as dependências entre grupos. Mantém a ordem de entrada e `*`. */
export function expandBusinessPermissions(selected: Iterable<string>): string[] {
    const out = [...new Set(selected)]
    if (out.includes("*")) return out
    const present = new Set(out)
    for (let index = 0; index < out.length; index += 1) {
        for (const required of BUSINESS_PERMISSION_REQUIRES[out[index]!] ?? []) {
            if (present.has(required)) continue
            present.add(required)
            out.push(required)
        }
    }
    return out
}

/** Chaves marcadas que exigem `key` (para travar a desmarcação no editor de perfis). */
export function businessPermissionRequiredBy(key: string, selected: ReadonlySet<string>): string[] {
    return [...selected].filter((other) => other !== key && (BUSINESS_PERMISSION_REQUIRES[other] ?? []).includes(key))
}

type Can = (key: string) => boolean

/** Ler o módulo: o dono com a base e a visualização do módulo, ou o suporte. */
export function canReadModule(can: Can, area: BusinessModule): boolean {
    return (can(BUSINESS_PERMISSIONS.use) && can(viewPermission(area))) || can(BUSINESS_PERMISSIONS.viewAll)
}

/** Ação do próprio negócio (o suporte nunca altera). */
export function canModule<M extends BusinessModule>(can: Can, area: M, action: BusinessModuleAction<M>): boolean {
    return can(BUSINESS_PERMISSIONS.use) && can(modulePermission(area, action))
}

/** Ver os negócios (próprios ou de suporte). */
export function canSeeBusinesses(can: Can): boolean {
    return can(BUSINESS_PERMISSIONS.use) || can(BUSINESS_PERMISSIONS.viewAll)
}

/** Chave da exclusão definitiva de um item do espaço (os itens avulsos são parte da edição do portfólio). */
export function itemDeletePermission(kind: string): string {
    return kind === "portfolioItems" ? "portfolio.edit" : `${kind}.delete`
}

/** Módulo de cada seção de leitura (`readBusiness`) e de cada tipo de invalidação do espaço. */
export const BUSINESS_SECTION_MODULES: Readonly<Record<string, BusinessModule>> = {
    activities: "activities",
    goals: "goals",
    documents: "documents",
    successes: "successes",
    orders: "orders",
    works: "works",
    portfolio: "portfolio",
    portfolioItems: "portfolio",
    "portfolio-items": "portfolio",
}

/** Módulo da seção (`works.columns` → `works`); `null` para a ficha, arquivos etc. */
export function moduleOfSection(section: string): BusinessModule | null {
    return BUSINESS_SECTION_MODULES[section.split(".")[0]!] ?? null
}

/**
 * Página do app → permissões (qualquer uma basta). As telas do prestador não exigem o painel
 * (`admin.access`); `null` = não é tela de negócio.
 */
export function businessRouteAccess(pathname: string): ((can: Can) => boolean) | null {
    if (pathname === "/clientes" || pathname.startsWith("/clientes/")) return (can) => canReadModule(can, "clients")
    if (pathname === "/pedidos" || pathname.startsWith("/pedidos/")) return (can) => canReadModule(can, "orders")
    if (pathname === "/trabalhos" || pathname.startsWith("/trabalhos/")) return (can) => canReadModule(can, "works")
    if (pathname.startsWith("/previa-portfolio/")) return (can) => canReadModule(can, "portfolio")
    if (pathname === "/negocios/novo") return (can) => can(BUSINESS_PERMISSIONS.use) && can(BUSINESS_PERMISSIONS.create)
    if (pathname === "/negocios" || pathname.startsWith("/negocios/")) {
        const segment = pathname.split("/")[3]
        const area = segment ? BUSINESS_SPACE_SEGMENT_MODULES[segment] : undefined
        return area ? (can) => canReadModule(can, area) : canSeeBusinesses
    }
    return null
}

/** Segmento da página do espaço (`/negocios/[id]/<segmento>`) → módulo. */
export const BUSINESS_SPACE_SEGMENT_MODULES: Readonly<Record<string, BusinessModule>> = {
    atividades: "activities",
    metas: "goals",
    documentos: "documents",
    sucessos: "successes",
    pedidos: "orders",
    trabalhos: "works",
    portfolio: "portfolio",
}
