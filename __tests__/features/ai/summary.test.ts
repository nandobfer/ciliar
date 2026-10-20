import { describe, expect, it } from "vitest"
import { buildSummaryInstructions, fallbackSummary, normalizeText, parseFormattedMemory, truncateAtWord } from "@/features/ai/summary"
import { memoriesSection } from "@/features/ai/server/agent-memory-service"
import { AI_AGENT_IDS, isAiAgentId } from "@/features/ai/agents"
import { memoryInputSchema, summaryFeatureSchema, DEFAULT_SUMMARY_FEATURE } from "@/features/ai/schemas"

describe("uso Resumo (puro)", () => {
    it("interpreta o JSON do modelo, tolerando cercas e texto em volta", () => {
        expect(parseFormattedMemory('Claro!\n```json\n{"texto": "Atenda   em pt-BR.", "resumo": "## Idioma do atendimento\\nlinha 2"}\n```', 80)).toEqual({ texto: "Atenda em pt-BR.", resumo: "Idioma do atendimento" })
        expect(parseFormattedMemory("sem json", 80)).toBeNull()
        expect(parseFormattedMemory('{"texto": "", "resumo": "x"}', 80)).toBeNull()
    })
    it("resumo de reserva: primeira frase cortada na palavra", () => {
        expect(fallbackSummary("Nunca prometa prazo. Confirme sempre.", 80)).toBe("Nunca prometa prazo")
        expect(truncateAtWord("uma frase bem comprida para cortar", 16)).toBe("uma frase bem…")
        expect(normalizeText("a  b\r\n\n\n\nc")).toBe("a b\n\nc")
        expect(buildSummaryInstructions("Revise.", 60)).toContain("no máximo 60 caracteres")
    })
    it("schemas da memória e do Resumo", () => {
        expect(memoryInputSchema.safeParse({ texto: "ok" }).success).toBe(false)
        expect(memoryInputSchema.safeParse({ texto: "x".repeat(2001) }).success).toBe(false)
        expect(summaryFeatureSchema.safeParse({ ...DEFAULT_SUMMARY_FEATURE, enabled: true }).success).toBe(false)
        expect(summaryFeatureSchema.safeParse({ ...DEFAULT_SUMMARY_FEATURE, maxLength: 20 }).success).toBe(false)
    })
    it("agentes do catálogo e a seção das memórias no prompt", () => {
        expect(AI_AGENT_IDS).toEqual(["opex-agent", "business-interviewer"])
        expect(isAiAgentId("sales-agent")).toBe(false)
        expect(memoriesSection([])).toBe("")
        expect(memoriesSection(["Fale em pt-BR.", "Linha\ncom quebra"])).toContain("- Linha com quebra")
    })
})
