import type { ZodType } from "zod"
import { DomainError } from "@/lib/api/route"
import type { AccessContext } from "@/features/access/server/context"
import { opexToolMeta, type OpexToolMeta, type OpexToolRisk } from "../../tool-catalog"
import type { OpexServerScope } from "../scope"

/**
 * Ferramenta do Agente Opex: descreve para o modelo o que faz, valida a entrada com Zod e chama a
 * função de serviço real do app (nunca HTTP) — herdando validação, autorização, auditoria e tempo real.
 *
 * Os metadados (grupo, rótulo, descrição, risco e permissões) vêm do catálogo puro
 * `tool-catalog.ts`; aqui ficam só a entrada e a execução.
 */

export type { OpexToolRisk }

export interface OpexToolContext {
    sessionId: string
    /** Usuário real (dono da sessão e ator da auditoria). */
    actorId: string
    signal?: AbortSignal
    scope: OpexServerScope
    /**
     * Acesso **revalidado imediatamente antes** desta execução (sessão, conta ativa, perfis e
     * simulação). Os serviços recebem este contexto, nunca um montado no início do turno.
     */
    access: AccessContext
}

export interface OpexToolImpl<I = unknown> {
    input: ZodType<I>
    /** Frase do card de confirmação ("Excluir o usuário Fulano"). */
    // Sintaxe de método: permite guardar ferramentas de entradas diferentes numa lista `OpexTool`.
    summarize?(input: NoInfer<I>): string
    /** Entrada sem segredos para exibir e guardar no histórico (padrão: a própria entrada). */
    redact?(input: NoInfer<I>): unknown
    /**
     * Permissões que dependem da entrada (ex.: `integrations.{id}.edit`), conferidas antes de pedir
     * confirmação e de novo antes de executar.
     */
    authorize?(input: NoInfer<I>, access: AccessContext): void
    execute(input: NoInfer<I>, context: OpexToolContext): Promise<unknown>
}

export type OpexToolDef<I = unknown> = OpexToolMeta & OpexToolImpl<I>

export type OpexTool = OpexToolDef<unknown>

/** Junta a implementação aos metadados do catálogo (nome desconhecido é erro de programação). */
export function defineTool<I>(name: string, impl: OpexToolImpl<I>): OpexToolDef<I> {
    const meta = opexToolMeta(name)
    if (!meta) throw new Error(`Ferramenta ${name} não está no catálogo (tool-catalog.ts)`)
    return { ...meta, ...impl }
}

/** Erro devolvido ao modelo (mensagem acionável, sem stack). */
export class OpexToolError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "OpexToolError"
    }
}

export function toolErrorMessage(error: unknown): string {
    if (error instanceof DomainError) {
        const details = error.details !== undefined ? ` (${JSON.stringify(error.details).slice(0, 500)})` : ""
        return `${error.message}${error.code ? ` [${error.code}]` : ""}${details}`
    }
    if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown }).issues)) {
        const issues = (error as { issues: { path?: unknown[]; message?: string }[] }).issues
        return `Entrada inválida: ${issues.map((issue) => `${(issue.path ?? []).join(".") || "(raiz)"}: ${issue.message}`).join("; ")}`
    }
    if (error instanceof Error) return error.message || "Falha desconhecida"
    return String(error)
}
