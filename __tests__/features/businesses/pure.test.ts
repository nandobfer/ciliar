import { describe, expect, it } from "vitest"
import { catalog } from "@/features/access/catalog"
import { requiresPanel, routePermissions } from "@/features/access/server/policy"
import { isChannelAuthorized } from "@/lib/pusher/channel-auth"
import { businessesChannel } from "@/lib/pusher/channel-names"
import { businessLimitOf, businessOwnerOf } from "@/features/businesses/server/access"
import { isOnboardingRoute, mayRequireOnboarding } from "@/features/businesses/server/onboarding"
import { isInterviewDone, nextQuestion, progressContext, progressOf } from "@/features/businesses/server/interview/state"
import { availabilitySchema, businessLinksSchema, goalSchema, interviewQuestionsSchema } from "@/features/businesses/schemas"
import { describeGoal, formatFieldValue } from "@/features/businesses/format"
import { DEFAULT_INTERVIEW_QUESTIONS } from "@/features/businesses/constants"
import { homeHrefOf } from "@/features/access/components/AccessProvider"
import { accessFixture } from "../../helpers/access-context"
import { Types } from "mongoose"

const can = (keys: string[]) => (key: string) => keys.includes("*") || keys.includes(key)

describe("permissões e rotas do prestador", () => {
    it("o ramo Negócios existe no Perfix sem dependência entre suporte e uso", () => {
        expect(catalog.isKnownKey("businesses.use")).toBe(true)
        expect(catalog.isKnownKey("businesses.view_all")).toBe(true)
        expect(catalog.normalizePermissionDependencies(["businesses.view_all"])).toEqual(["businesses.view_all"])
    })

    it("negócios, entrevista e Agente Opex não exigem o painel; o resto, sim", () => {
        for (const path of ["/api/businesses", "/api/interview/sessions", "/api/opex/sessions", "/api/me", "/api/pusher/auth"]) expect(requiresPanel(path)).toBe(false)
        for (const path of ["/api/users", "/api/roles", "/api/integrations", "/api/ai/features/business-interviewer"]) expect(requiresPanel(path)).toBe(true)
        const id = "a".repeat(24)
        expect(routePermissions("/api/businesses", "GET")).toEqual([])
        expect(routePermissions(`/api/businesses/${id}`, "GET")).toEqual([])
        expect(routePermissions(`/api/businesses/${id}`, "PATCH")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}`, "DELETE")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/restore`, "POST")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/interview`, "GET")).toEqual([])
        expect(routePermissions("/api/businesses/search", "GET")).toEqual(["businesses.view_all"])
        expect(routePermissions(`/api/interview/sessions/${id}/messages`, "POST")).toEqual(["businesses.use"])
        expect(routePermissions("/api/ai/features/business-interviewer/script", "PUT")).toEqual(["integrations.ai.edit"])
        expect(() => routePermissions(`/api/businesses/${id}/desconhecida`, "GET")).toThrow()
    })

    it("onboarding: só businesses.use sem wildcard; rotas liberadas até concluir", () => {
        expect(mayRequireOnboarding(accessFixture(["businesses.use"]))).toBe(true)
        expect(mayRequireOnboarding(accessFixture(["*"]))).toBe(false)
        expect(mayRequireOnboarding(accessFixture(["businesses.view_all"]))).toBe(false)
        const id = "b".repeat(24)
        for (const [path, method] of [["/api/me", "GET"], ["/api/me/legal/accept", "POST"], ["/api/interview/sessions", "POST"], ["/api/businesses", "GET"], [`/api/businesses/${id}/restore`, "POST"], ["/api/access/view-as", "POST"]]) expect(isOnboardingRoute(path!, method!)).toBe(true)
        for (const [path, method] of [[`/api/businesses/${id}`, "PATCH"], [`/api/businesses/${id}/archive`, "POST"], ["/api/opex/sessions", "GET"], ["/api/users", "GET"]]) expect(isOnboardingRoute(path!, method!)).toBe(false)
    })

    it("início: prestador sem o painel vai para Negócios", () => {
        expect(homeHrefOf(can(["businesses.use"]))).toBe("/negocios")
        expect(homeHrefOf(can(["admin.access", "businesses.use"]))).toBe("/integracoes")
        expect(homeHrefOf(can([]))).toBe("/integracoes")
    })

    it("canal dos negócios: só o próprio usuário real com businesses.use, sem exigir o painel", () => {
        const userId = "c".repeat(24)
        expect(isChannelAuthorized(businessesChannel(userId), new Set(["businesses.use"]), userId)).toBe(true)
        expect(isChannelAuthorized(businessesChannel("d".repeat(24)), new Set(["businesses.use"]), userId)).toBe(false)
        expect(isChannelAuthorized(businessesChannel(userId), new Set(["businesses.view_all"]), userId)).toBe(false)
        expect(isChannelAuthorized("private-integration-smtp", new Set(["integrations.smtp.view"]), userId)).toBe(false)
    })
})

describe("limite e dono efetivo", () => {
    const role = (limiteNegocios: number | null, ativo = true) => ({ ativo, limiteNegocios })
    it("vale o maior limite dos perfis ativos; ilimitado vence", () => {
        expect(businessLimitOf([role(1), role(3)])).toBe(3)
        expect(businessLimitOf([role(1), role(null)])).toBeNull()
        expect(businessLimitOf([role(1), role(null, false)])).toBe(1)
        expect(businessLimitOf([])).toBeNull()
    })
    it("na simulação de usuário o dono é o alvo; na de perfil e sem simulação, o usuário real", () => {
        const base = accessFixture(["*"])
        expect(businessOwnerOf(base)).toBe(base.userId)
        expect(businessOwnerOf({ ...base, dto: { ...base.dto, simulation: { tipo: "usuario", alvoId: "e".repeat(24), alvoNome: "Alvo" } } })).toBe("e".repeat(24))
        expect(businessOwnerOf({ ...base, dto: { ...base.dto, simulation: { tipo: "cargo", alvoId: "f".repeat(24), alvoNome: "Perfil" } } })).toBe(base.userId)
    })
})

describe("validação dos campos e roteiro", () => {
    it("links, disponibilidade e metas", () => {
        expect(businessLinksSchema.parse(["exemplo.com", "https://exemplo.com", "https://instagram.com/x"])).toEqual(["https://exemplo.com", "https://instagram.com/x"])
        expect(businessLinksSchema.safeParse(["ftp://exemplo.com"]).success).toBe(false)
        expect(availabilitySchema.safeParse([{ weekday: 2, start: "10:00" }]).success).toBe(false)
        expect(availabilitySchema.safeParse([{ weekday: 2 }, { weekday: 2 }]).success).toBe(false)
        expect(availabilitySchema.parse([{ weekday: 5, start: "08:00", end: "12:00" }, { weekday: 0 }])).toEqual([{ weekday: 0, start: null, end: null }, { weekday: 5, start: "08:00", end: "12:00" }])
        expect(goalSchema.parse({ targetCents: 100, period: "year", mode: "specific", year: 2027, month: "2027-03" })).toMatchObject({ year: 2027, month: null, measure: null })
        expect(goalSchema.parse({ targetCents: 9000, period: "hour", measure: "month", mode: "specific", month: "2027-03" })).toMatchObject({ measure: "month", month: "2027-03" })
        expect(goalSchema.safeParse({ targetCents: 0, period: "month", mode: "recurring" }).success).toBe(false)
        expect(goalSchema.safeParse({ targetCents: 10, period: "hour", measure: "range", from: "2027-05-01", to: "2027-01-01" }).success).toBe(false)
        expect(describeGoal({ targetCents: 500000, period: "month", mode: "recurring" })).toMatch(/5\.000,00 todo mês/)
        expect(formatFieldValue("type", "PJ")).toBe("PJ — Pessoa jurídica")
    })
    it("o roteiro padrão segue o documento; campos únicos e ao menos uma ativa", () => {
        expect(DEFAULT_INTERVIEW_QUESTIONS.filter((question) => question.active).map((question) => [question.field, question.required])).toEqual([
            ["name", true], ["type", true], ["segment", true], ["logo", false], ["links", false], ["availability", false], ["goals", false],
        ])
        expect(interviewQuestionsSchema.safeParse(DEFAULT_INTERVIEW_QUESTIONS).success).toBe(true)
        expect(interviewQuestionsSchema.safeParse([{ field: "name", prompt: "a", required: true, active: false }]).success).toBe(false)
    })
    it("progresso: próxima pergunta na ordem, pulada só opcional conta como concluída", () => {
        const doc = {
            _id: new Types.ObjectId(), status: "in_progress" as const, scriptVersion: 2, subtype: "MEI", businessId: null, completedAt: null, createdAt: new Date(),
            questions: [{ field: "name" as const, prompt: "Nome?", required: true, active: true }, { field: "logo" as const, prompt: "Logo?", required: false, active: true }, { field: "currency" as const, prompt: "Moeda?", required: false, active: false }],
            answers: { name: { status: "answered" as const, value: "Ana Design", updatedAt: new Date() } },
        }
        expect(nextQuestion(doc)?.field).toBe("logo")
        expect(isInterviewDone(doc)).toBe(false)
        const progress = progressOf(doc as never, false)
        expect(progress.questions.map((question) => [question.field, question.status, question.current])).toEqual([["name", "answered", false], ["logo", "pending", true]])
        expect(progress.acceptsImage).toBe(true)
        expect(progressContext(doc as never)).toContain("PRÓXIMA PERGUNTA: Logo/foto")
        expect(isInterviewDone({ ...doc, answers: { ...doc.answers, logo: { status: "skipped", value: null, updatedAt: new Date() } } })).toBe(true)
    })
})
