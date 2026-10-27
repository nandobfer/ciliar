// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { Briefcase, Plug } from "lucide-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const state = vi.hoisted(() => ({
    pathname: "/negocios",
    push: vi.fn(),
    denied: new Set<string>(),
    list: null as unknown,
    detail: null as unknown,
}))
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push, replace: vi.fn() }) }))
vi.mock("@nandobfer/perfix/react", () => ({
    usePermissions: () => ({ can: (key: string) => !state.denied.has(key), canAny: (keys: string[]) => keys.some((key) => !state.denied.has(key)), realIsAdmin: false }),
}))
vi.mock("@/features/businesses/hooks/useBusinesses", () => ({
    useBusinesses: () => ({ data: state.list, isLoading: false, refetch: vi.fn() }),
    useBusiness: () => ({ data: state.detail }),
    useBusinessesRealtime: () => undefined,
}))
vi.mock("@/features/access/components/AccessProvider", () => ({
    useAppSession: () => ({ session: { user: { id: "u1", name: "Ana Souza" }, access: { simulation: null, roles: [{ nome: "Prestador" }] } }, logout: vi.fn() }),
}))
vi.mock("@/features/view-as/components/ViewAsBanner", () => ({ ViewAsBanner: () => null }))
vi.mock("@/features/view-as/components/ViewAsSelector", () => ({ ViewAsSelector: () => <button type="button">Visualizar como</button> }))
vi.mock("@/lib/pusher/RealtimeStatusBanner", () => ({ RealtimeStatusBanner: () => null }))
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }))
vi.mock("@/lib/pusher/client", () => ({ resetPusherClient: vi.fn() }))
vi.mock("@tsparticles/react", () => ({ default: () => null, ParticlesProvider: ({ children }: { children: unknown }) => children }))
vi.mock("@tsparticles/slim", () => ({ loadSlim: vi.fn() }))

import { AppShell } from "@/features/layout/components/AppShell"
import { BusinessSwitcher } from "@/features/businesses/components/BusinessSwitcher"
import { BusinessSpaceTabs } from "@/features/businesses/components/space/BusinessSpaceTabs"
import { formatAccessTime, searchBusinesses, sortByRecentAccess } from "@/features/businesses/recent-access"
import { LoginPage } from "@/features/auth/components/LoginPage"

const A = "a".repeat(24)
const B = "b".repeat(24)
const C = "c".repeat(24)
const business = (id: string, name: string, lastAccessedAt: string | null, status = "active") => ({ id, name, lastAccessedAt, status, logo: null, theme: { primaryColor: "#FF6600", mode: "light" } })

beforeEach(() => {
    state.pathname = "/negocios"
    state.denied = new Set()
    state.detail = null
    state.list = {
        items: [business(A, "Zeta Fotos", null), business(B, "Ateliê Café", "2026-10-22T09:00:00Z"), business(C, "Arquivado", "2026-10-23T09:00:00Z", "archived")],
        capacity: { limit: 2, active: 2, archived: 1, vacancy: false, canCreate: false },
    }
})
afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    window.localStorage.clear()
})

describe("seletor de negócio: ordem e busca (puro)", () => {
    it("último acesso primeiro, nunca acessados no fim em ordem alfabética; busca sem acento nem maiúsculas", () => {
        const items = [{ name: "Beta", lastAccessedAt: null }, { name: "Alfa", lastAccessedAt: null }, { name: "Gama", lastAccessedAt: "2026-10-01T00:00:00Z" }, { name: "Delta", lastAccessedAt: "2026-10-20T00:00:00Z" }]
        expect(sortByRecentAccess(items).map((item) => item.name)).toEqual(["Delta", "Gama", "Alfa", "Beta"])
        expect(searchBusinesses([{ name: "Ateliê Café" }, { name: "Zeta" }], "CAFE").map((item) => item.name)).toEqual(["Ateliê Café"])
        const now = new Date(2026, 9, 22, 12, 0)
        expect(formatAccessTime(new Date(2026, 9, 22, 10, 5).toISOString(), now)).toBe("hoje, 10:05")
        expect(formatAccessTime(new Date(2026, 9, 21, 17, 40).toISOString(), now)).toBe("ontem, 17:40")
        expect(formatAccessTime(new Date(2025, 8, 28).toISOString(), now)).toBe("28 set 2025")
    })
})

describe("seletor de negócio no cabeçalho", () => {
    it("lista só os ativos do último acessado para o nunca acessado, navega e avisa o limite do perfil", () => {
        render(<BusinessSwitcher />)
        fireEvent.click(screen.getByRole("button", { name: "Trocar de negócio (atual: Escolher negócio)" }))
        const list = screen.getByRole("listbox", { name: /Seus negócios/ })
        const options = within(list).getAllByRole("option")
        expect(options.map((option) => option.textContent)).toEqual([expect.stringContaining("Ateliê Café"), expect.stringContaining("Zeta Fotos")])
        expect(options[1]!.textContent).toContain("Nunca acessado")
        expect(screen.queryByText("Arquivado")).toBeNull()
        expect(screen.getByText(/Limite de negócios ativos/)).toBeTruthy()
        expect(screen.getByRole("link", { name: /Novo negócio/ }).getAttribute("aria-disabled")).toBe("true")
        expect(screen.getByRole("link", { name: /Ver todos os negócios/ }).getAttribute("href")).toBe("/negocios")
        fireEvent.change(screen.getByRole("textbox", { name: "Buscar negócio" }), { target: { value: "zeta" } })
        fireEvent.click(screen.getByRole("option", { name: /Zeta Fotos/ }))
        expect(state.push).toHaveBeenCalledWith(`/negocios/${A}`)
    })

    it("mostra o negócio aberto no caminho, inclusive arquivado", () => {
        state.pathname = `/negocios/${C}/pedidos`
        render(<BusinessSwitcher />)
        expect(screen.getByRole("button", { name: "Trocar de negócio (atual: Arquivado)" })).toBeTruthy()
    })
})

describe("abas do negócio", () => {
    it("só os módulos visíveis, com a aba aberta marcada", () => {
        state.denied = new Set(["portfolio.view", "businesses.view_all"])
        state.pathname = `/negocios/${A}/pedidos/${B}`
        render(<BusinessSpaceTabs businessId={A} />)
        const nav = screen.getByRole("navigation", { name: "Páginas do negócio" })
        const links = within(nav).getAllByRole("link")
        expect(links.map((link) => link.textContent)).toEqual(["Dashboard", "Ficha", "Atividades", "Metas", "Documentos", "Sucessos", "Pedidos", "Trabalhos"])
        expect(within(nav).getByRole("link", { name: "Pedidos" }).getAttribute("aria-current")).toBe("page")
        expect(within(nav).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull()
    })
})

describe("casca (cópia do crm)", () => {
    const sections = [{ id: "negocios", label: "Negócios", items: [{ href: "/negocios", label: "Negócios", title: "Negócios", icon: Briefcase }] }, { id: "sistema", label: "Sistema", items: [{ href: "/integracoes", label: "Integrações", title: "Integrações", icon: Plug }] }]

    it("cabeçalho com o caminho [contexto] / título, linha abaixo e menu lateral recolhível salvo no navegador", () => {
        state.pathname = "/integracoes/ia"
        render(
            <AppShell brand={{ name: "Ciliar", subtitle: "Negócios", homeHref: "/negocios" }} sections={sections} navLabel="Menu principal" ownerName="Ana" context={<span>Seletor</span>} subheader={<div>Abas</div>}>
                <p>Conteúdo</p>
            </AppShell>,
        )
        const header = screen.getByRole("banner")
        expect(within(header).getByText("Seletor")).toBeTruthy()
        expect(within(header).getByRole("heading", { level: 1 }).textContent).toBe("Integrações")
        expect(screen.getByText("Abas")).toBeTruthy()
        expect(screen.getByRole("link", { name: "Integrações" }).getAttribute("aria-current")).toBe("page")
        expect(screen.getByText("Prestador")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Recolher menu" }))
        expect(window.localStorage.getItem("ciliar-sidebar-collapsed")).toBe("1")
        expect(screen.getByRole("button", { name: "Expandir menu" })).toBeTruthy()
    })

    it("título vem dos itens informados (aba do negócio aberto)", () => {
        state.pathname = `/negocios/${A}/metas`
        render(
            <AppShell brand={{ name: "Ciliar", homeHref: "/negocios" }} sections={sections} navLabel="Menu principal" ownerName="Ana" titleItems={[{ href: `/negocios/${A}/metas`, label: "Metas", title: "Metas", icon: Briefcase }]}>
                <p>Conteúdo</p>
            </AppShell>,
        )
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Metas")
    })
})

describe("login", () => {
    it("continua escuro no app claro e devolve o tema ao sair", () => {
        document.documentElement.className = ""
        const view = render(<QueryClientProvider client={new QueryClient()}><LoginPage /></QueryClientProvider>)
        expect(document.documentElement.classList.contains("dark")).toBe(true)
        expect(screen.getByRole("main").className).toContain("dark")
        view.unmount()
        expect(document.documentElement.classList.contains("dark")).toBe(false)
    })
})
