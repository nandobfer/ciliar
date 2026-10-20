import { describe, expect, it } from "vitest"
import { answerError, composeAnswer, correctionMessage, currentExchange, draftFrom, emptyGoal, goalOf, SKIP_MESSAGE } from "@/features/businesses/interview-answers"
import { goalsSchema } from "@/features/businesses/schemas"
import type { OpexMessageDto, OpexPart } from "@/features/opex-agent/types"

const message = (id: string, role: "user" | "assistant", text: string, parts: OpexPart[] = [], status: OpexMessageDto["status"] = "complete"): OpexMessageDto => ({
    id,
    role,
    kind: "message",
    text,
    files: [],
    parts,
    status,
    error: null,
    usage: null,
    durationMs: null,
    model: null,
    createdAt: new Date().toISOString(),
})

describe("respostas montadas pelos controles da entrevista", () => {
    it("monta o texto enviado ao entrevistador por campo", () => {
        expect(composeAnswer("name", "  Studio Aurora ")).toBe("Studio Aurora")
        expect(composeAnswer("type", { type: "PJ", subtype: "MEI" })).toBe("Pessoa jurídica (PJ), MEI")
        expect(composeAnswer("type", { type: "PF", subtype: "" })).toBe("Pessoa física (PF)")
        expect(composeAnswer("links", ["instagram.com/aurora", " ", "https://aurora.com"])).toBe("instagram.com/aurora; https://aurora.com")
        expect(composeAnswer("availability", [{ weekday: 2, start: "", end: "" }, { weekday: 1, start: "09:00", end: "18:00" }])).toBe("Segunda 09:00–18:00, Terça")
        expect(composeAnswer("currency", "USD")).toBe("USD")
        const monthly = { ...emptyGoal(), targetCents: 800000 }
        expect(composeAnswer("goals", [monthly], "BRL")).toMatch(/R\$\s?8\.000,00 todo mês/)
        const hourly = { ...emptyGoal(), targetCents: 12000, period: "hour" as const, measure: "range" as const, from: "2027-01-01", to: "2027-06-30" }
        expect(composeAnswer("goals", [hourly], "BRL")).toMatch(/120,00\/hora em média \(de 01\/01\/2027 a 30\/06\/2027\)/)
        expect(SKIP_MESSAGE).toBe("Quero pular esta pergunta.")
        expect(correctionMessage("segment", "Fotografia")).toBe("Quero corrigir Área/segmento: Fotografia")
    })

    it("valida com os mesmos schemas do servidor", () => {
        expect(answerError("name", "")).toBe("Informe o nome")
        expect(answerError("type", { type: null, subtype: "" })).toBeTruthy()
        expect(answerError("links", [""])).toBe("Informe ao menos um link")
        expect(answerError("links", ["nao e url"])).toBe("URL inválida")
        expect(answerError("availability", [])).toBe("Escolha ao menos um dia")
        expect(answerError("availability", [{ weekday: 1, start: "18:00", end: "09:00" }])).toMatch(/antes do fim/)
        expect(answerError("availability", [{ weekday: 1, start: "09:00", end: "" }])).toMatch(/início e o fim/)
        expect(answerError("goals", [emptyGoal()])).toBe("Informe o valor de cada meta")
        expect(answerError("goals", [{ ...emptyGoal(), targetCents: 100, period: "hour", measure: "range" }])).toBeTruthy()
        expect(answerError("goals", [{ ...emptyGoal(), targetCents: 100, mode: "specific", month: "2027-03" }])).toBeNull()
    })

    it("meta da tela vira o formato gravado e o rascunho volta do valor gravado (correção)", () => {
        const specific = goalOf({ ...emptyGoal(), targetCents: 500000, period: "year", mode: "specific", year: 2028 })
        expect(goalsSchema.parse([specific])[0]).toMatchObject({ period: "year", mode: "specific", year: 2028, month: null, measure: null })
        expect(draftFrom("type", "PJ", "MEI")).toEqual({ type: "PJ", subtype: "MEI" })
        expect(draftFrom("links", null)).toEqual([""])
        expect(draftFrom("availability", [{ weekday: 3, start: null, end: null }])).toEqual([{ weekday: 3, start: "", end: "" }])
        expect(draftFrom("goals", [{ targetCents: 900, period: "month", mode: "recurring" }])[0]).toMatchObject({ targetCents: 900, period: "month", mode: "recurring" })
        expect(draftFrom("currency", null)).toBe("BRL")
    })

    it("fala atual: só o texto do entrevistador; some quando o usuário já respondeu; o turno ao vivo substitui", () => {
        const agent = message("a1", "assistant", "Qual é o nome?", [{ type: "reasoning", text: "pensando" }, { type: "text", text: "Qual é o nome?" }, { type: "tool", id: "t", name: "set_name", group: null, label: "Resposta", state: "done", input: null, output: null, error: null, confirmation: null, durationMs: 1 }])
        expect(currentExchange([agent], null)).toMatchObject({ agentText: "Qual é o nome?", lastAgent: { id: "a1" }, lastUser: null })
        const user = message("u1", "user", "Studio Aurora")
        expect(currentExchange([agent, user], null).agentText).toBe("")
        const live = currentExchange([agent, user], { parts: [{ type: "text", text: "Ótimo! E o tipo?" }] })
        expect(live).toMatchObject({ agentText: "Ótimo! E o tipo?", lastAgent: null, lastUser: { id: "u1" } })
    })
})
