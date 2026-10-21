import { describe, expect, it } from "vitest"
import { routePermissions } from "@/features/access/server/policy"
import { businessThemeCss, businessThemeStyle, contrastRatio, readableForeground, resolveTheme } from "@/features/businesses/theme"
import { goalWindows, windowProgress } from "@/features/businesses/goal-progress"
import { activityCreateSchema, businessThemeSchema, documentCreateSchema, successCreateSchema } from "@/features/businesses/space-schemas"
import { businessUpdateSchema } from "@/features/businesses/schemas"
import { DEFAULT_TIME_ZONE, normalizeTimeZone, todayKeyIn } from "@/lib/timezone"
import { canUseOpexTool, opexToolMeta } from "@/features/opex-agent/tool-catalog"
import { businessSpaceNavSection } from "@/features/businesses/components/space/space-nav"
import { mediaTypeOf } from "@/features/businesses/server/files"
import { bucketLabel, businessDashboardPeriodSchema, dashboardBuckets } from "@/features/businesses/dashboard-period"
import { categorySlices, rateTrendRows } from "@/features/businesses/server/dashboard"

/** Espaço do negócio (M2): regras puras (tema, janelas das metas, fuso, entradas, rotas e catálogo). */

describe("tema do negócio", () => {
    it("foreground por contraste WCAG; cor inválida ou sem contraste cai na padrão #0B57C4", () => {
        expect(readableForeground("#0B57C4")).toBe("#FFFFFF")
        expect(readableForeground("#FFE066")).toBe("#111111")
        expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0)
        expect(resolveTheme({ primaryColor: "#FFE066" })).toMatchObject({ primary: "#FFE066", primaryForeground: "#111111", neutral: false, mode: "dark" })
        expect(resolveTheme({ primaryColor: "vermelho" })).toMatchObject({ primary: "#0B57C4", neutral: true })
        // Cinza médio: nem branco nem quase-preto chegam a 4,5:1.
        expect(resolveTheme({ primaryColor: "#777777" })).toMatchObject({ primary: "#0B57C4", neutral: true })
        expect(resolveTheme({ primaryColor: "#0B57C4", mode: "light" }).mode).toBe("light")
    })

    it("só os destaques mudam (sidebar neutra) e o CSS sai só dos trios HSL calculados", () => {
        const style = businessThemeStyle({ primaryColor: "#0B57C4" }) as Record<string, string>
        expect(Object.keys(style).sort()).toEqual(["--chart-1", "--primary", "--primary-foreground", "--ring", "--sidebar-primary", "--sidebar-primary-foreground"])
        expect(style["--chart-1"]).toBe("hsl(215 89.4% 40.6%)")
        expect(style["--primary"]).toBe("215 89.4% 40.6%")
        expect(style).not.toHaveProperty("--sidebar")
        const css = businessThemeCss({ primaryColor: "#0B57C4;} body{display:none" })
        expect(css.startsWith(":root, :root.light {")).toBe(true)
        expect(css).not.toContain("display")
        expect(css).toContain("--primary: 215 89.4% 40.6%;")
        expect(css).toContain("--chart-1: hsl(215 89.4% 40.6%);")
    })

    it("entrada do tema: #RRGGBB (maiúsculo) e modo dark/light", () => {
        expect(businessThemeSchema.parse({ primaryColor: "#0b57c4", mode: "light" })).toEqual({ primaryColor: "#0B57C4", mode: "light" })
        expect(businessThemeSchema.safeParse({ primaryColor: "red", mode: "dark" }).success).toBe(false)
        expect(businessThemeSchema.safeParse({ primaryColor: "#0B57C4", mode: "sepia" }).success).toBe(false)
    })
})

describe("janelas e progresso das metas", () => {
    it("mês recorrente: janela corrente e histórico desde a criação (mais recente primeiro)", () => {
        const plan = goalWindows({ targetCents: 100, period: "month", mode: "recurring" }, "2026-10-20", "2026-08-05")
        expect(plan.status).toBe("active")
        expect(plan.current).toEqual({ key: "2026-10", label: "outubro/2026", from: "2026-10-01", to: "2026-10-31" })
        expect(plan.history.map((window) => window.key)).toEqual(["2026-09", "2026-08"])
        expect(goalWindows({ targetCents: 100, period: "month", mode: "recurring" }, "2027-03-01", "2027-01-31").history.map((window) => window.to)).toEqual(["2027-02-28", "2027-01-31"])
        expect(goalWindows({ targetCents: 100, period: "month", mode: "recurring" }, "2026-10-20", "2020-01-01").history).toHaveLength(12)
    })

    it("específicas e intervalo: situação futura, ativa ou encerrada, sem histórico", () => {
        expect(goalWindows({ targetCents: 1, period: "month", mode: "specific", month: "2027-03" }, "2026-10-20")).toMatchObject({ status: "upcoming", current: { from: "2027-03-01", to: "2027-03-31" }, history: [] })
        expect(goalWindows({ targetCents: 1, period: "year", mode: "specific", year: 2025 }, "2026-10-20")).toMatchObject({ status: "ended", current: { key: "2025" } })
        expect(goalWindows({ targetCents: 1, period: "year", mode: "recurring" }, "2026-10-20", "2024-02-01").history.map((window) => window.key)).toEqual(["2025", "2024"])
        expect(goalWindows({ targetCents: 1, period: "hour", measure: "range", from: "2026-10-01", to: "2026-12-31" }, "2026-10-20")).toMatchObject({ status: "active", current: { label: "01/10/2026 a 31/12/2026" } })
        expect(goalWindows({ targetCents: 1, period: "hour", measure: "month", mode: "recurring" }, "2026-10-20").current.key).toBe("2026-10")
    })

    it("faturamento × alvo; meta por hora sem horas apontadas fica indisponível (sem dividir por zero)", () => {
        const window = goalWindows({ targetCents: 800000, period: "month", mode: "recurring" }, "2026-10-20").current
        expect(windowProgress({ period: "month", targetCents: 800000 }, window, { revenueCents: 200000, minutes: 0 })).toMatchObject({ achievedCents: 200000, percent: 25, available: true })
        expect(windowProgress({ period: "month", targetCents: 800000 }, window, { revenueCents: 0, minutes: 0 })).toMatchObject({ achievedCents: 0, percent: 0, available: true })
        expect(windowProgress({ period: "hour", targetCents: 15000 }, window, { revenueCents: 300000, minutes: 0 })).toMatchObject({ achievedCents: null, percent: null, available: false })
        expect(windowProgress({ period: "hour", targetCents: 15000 }, window, { revenueCents: 300000, minutes: 1200 })).toMatchObject({ achievedCents: 15000, percent: 100, available: true })
    })

    it("fuso do navegador; inválido ou ausente vale São Paulo", () => {
        expect(normalizeTimeZone("Europe/Lisbon")).toBe("Europe/Lisbon")
        expect(normalizeTimeZone("Marte/Base")).toBe(DEFAULT_TIME_ZONE)
        expect(normalizeTimeZone(null)).toBe("America/Sao_Paulo")
        const instant = new Date("2026-11-01T01:30:00Z")
        expect(todayKeyIn("America/Sao_Paulo", instant)).toBe("2026-10-31")
        expect(todayKeyIn("Europe/Lisbon", instant)).toBe("2026-11-01")
    })
})

describe("entradas do espaço", () => {
    it("atividade: nome obrigatório e valor/hora inteiro ≥ 0 em centavos", () => {
        expect(activityCreateSchema.parse({ name: " Consultoria ", hourlyRateCents: 15000 })).toMatchObject({ name: "Consultoria", active: true })
        expect(activityCreateSchema.safeParse({ name: "", hourlyRateCents: 1 }).success).toBe(false)
        expect(activityCreateSchema.safeParse({ name: "X", hourlyRateCents: -1 }).error?.issues[0]?.message).toMatch(/negativo/)
        expect(activityCreateSchema.safeParse({ name: "X", hourlyRateCents: 10.5 }).success).toBe(false)
        expect(activityCreateSchema.parse({ name: "Grátis", hourlyRateCents: 0 }).hourlyRateCents).toBe(0)
    })

    it("documento exige arquivo; sucesso aceita até 20 anexos sem repetir", () => {
        expect(documentCreateSchema.safeParse({ name: "Contrato" }).success).toBe(false)
        expect(documentCreateSchema.parse({ name: "Contrato", fileId: "a".repeat(24) }).portfolio).toBe(false)
        expect(successCreateSchema.safeParse({ title: "Case", attachmentIds: ["a".repeat(24), "a".repeat(24)] }).success).toBe(false)
        expect(successCreateSchema.safeParse({ title: "Case", date: "20/10/2026" }).success).toBe(false)
    })

    it("ficha: contato, prazos e tema", () => {
        expect(businessUpdateSchema.parse({ contactEmail: "Vendas@Exemplo.com ", deadlineAlertDays: 0, quoteValidityDays: 30, version: 1 })).toMatchObject({ contactEmail: "vendas@exemplo.com", deadlineAlertDays: 0 })
        expect(businessUpdateSchema.safeParse({ quoteValidityDays: 0, version: 1 }).success).toBe(false)
        expect(businessUpdateSchema.safeParse({ contactPhone: "(11) 9 9999-0000", version: 1 }).success).toBe(true)
        expect(businessUpdateSchema.safeParse({ contactPhone: "liga pra mim", version: 1 }).success).toBe(false)
        expect(businessUpdateSchema.safeParse({ contactEmail: "nao-e-email", version: 1 }).success).toBe(false)
    })

    it("tipo do arquivo pelo navegador ou pela extensão", () => {
        expect(mediaTypeOf("proposta.pdf", "")).toBe("application/pdf")
        expect(mediaTypeOf("planilha.xlsx", "application/octet-stream")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        expect(mediaTypeOf("foto.png", "image/png")).toBe("image/png")
    })
})

describe("rotas, navegação e ferramentas do espaço", () => {
    it("leitura confere dono/suporte no serviço; alterações exigem businesses.use; rota desconhecida falha fechado", () => {
        const id = "a".repeat(24)
        const item = "b".repeat(24)
        expect(routePermissions(`/api/businesses/${id}/activities`, "GET")).toEqual([])
        expect(routePermissions(`/api/businesses/${id}/activities`, "POST")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/goals/${item}/archive`, "POST")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/documents/${item}`, "DELETE")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/files/${item}/complete`, "POST")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/files/${item}`, "GET")).toEqual([])
        expect(routePermissions(`/api/businesses/${id}/logo`, "PUT")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/dashboard`, "GET")).toEqual([])
        expect(() => routePermissions(`/api/businesses/${id}/clientes`, "GET")).toThrow()
        expect(() => routePermissions(`/api/businesses/${id}/activities/${item}/purge`, "POST")).toThrow()
    })

    it("barra lateral: as seis páginas do espaço (sem Entrevista), sem o Next rolar até o segmento", () => {
        const section = businessSpaceNavSection("c".repeat(24))
        expect(section.items.map((entry) => entry.href)).toEqual(["", "/ficha", "/atividades", "/metas", "/documentos", "/sucessos"].map((slug) => `/negocios/${"c".repeat(24)}${slug}`))
        expect(section.items.every((entry) => entry.scroll === false)).toBe(true)
    })

    it("ferramentas do espaço: prestador sem o painel usa; suporte só as de leitura", () => {
        const provider = new Set(["businesses.use", "opex.use"])
        const support = new Set(["businesses.view_all", "opex.use"])
        for (const name of ["create_activity", "create_goal", "create_document", "update_success", "set_business_logo"]) expect(canUseOpexTool(opexToolMeta(name)!, provider)).toBe(true)
        for (const name of ["list_activities", "get_activity", "list_goals", "get_goal_progress", "list_documents", "get_document", "list_successes", "get_success"]) expect(canUseOpexTool(opexToolMeta(name)!, support)).toBe(true)
        for (const name of ["create_activity", "update_goal", "archive_document", "delete_success", "set_business_logo"]) expect(canUseOpexTool(opexToolMeta(name)!, support)).toBe(false)
        expect(["archive_activity", "delete_goal", "archive_document", "delete_success"].map((name) => opexToolMeta(name)!.risk)).toEqual(["destructive", "destructive", "destructive", "destructive"])
        expect(["restore_activity", "create_goal", "update_document", "set_business_logo"].map((name) => opexToolMeta(name)!.risk)).toEqual(["write", "write", "write", "write"])
    })
})

describe("dashboard do negócio", () => {
    it("período: mês atual por dia até hoje; 3/6/12 meses por mês, com o mês atual e a virada de ano", () => {
        const month = dashboardBuckets("month", "2026-10-03")
        expect(month).toMatchObject({ granularity: "day", from: "2026-10-01", to: "2026-10-03", months: [{ key: "2026-10" }] })
        expect(month.buckets.map((bucket) => bucket.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"])
        const quarter = dashboardBuckets("3m", "2027-01-15")
        expect(quarter).toMatchObject({ granularity: "month", from: "2026-11-01", to: "2027-01-31" })
        expect(quarter.buckets.map((bucket) => bucket.key)).toEqual(["2026-11", "2026-12", "2027-01"])
        expect(dashboardBuckets("12m", "2026-10-20").buckets).toHaveLength(12)
        expect(dashboardBuckets("6m", "2026-10-20").from).toBe("2026-05-01")
        expect(businessDashboardPeriodSchema.safeParse("30d").success).toBe(false)
        expect([bucketLabel("2026-10-20"), bucketLabel("2026-10")]).toEqual(["20/10", "out/26"])
    })

    it("categorias agrupadas (sem categoria incluída) e valor/hora pelo último preço até cada ponto", () => {
        expect(categorySlices(["Eventos", null, "Eventos", " ", "Aulas"])).toEqual([
            { name: "Eventos", count: 2 },
            { name: "Sem categoria", count: 2 },
            { name: "Aulas", count: 1 },
        ])
        const buckets = dashboardBuckets("3m", "2026-10-20").buckets
        const rows = rateTrendRows(buckets, [{ id: "x" }], [
            { activityId: "x", toCents: 100, day: "2026-09-10" },
            { activityId: "x", toCents: 150, day: "2026-10-05" },
        ])
        expect(rows.map((row) => row.a0)).toEqual([null, 100, 150])
    })
})

