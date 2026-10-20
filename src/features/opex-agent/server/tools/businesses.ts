import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import { BUSINESS_TYPES, CURRENCIES } from "@/features/businesses/constants"
import { describeAvailability, describeGoal } from "@/features/businesses/format"
import { archiveBusiness, deleteBusiness, getBusinessDetail, listBusinesses, restoreBusiness, searchAllBusinesses, updateBusiness } from "@/features/businesses/server/businesses"
import { businessInterviewTranscript } from "@/features/businesses/server/interview/sessions"
import type { BusinessDetailDto, BusinessDto } from "@/features/businesses/types"
import { defineTool, OpexToolError } from "./define"

/**
 * Negócios (M1). Não há `create_business`: o negócio só nasce pela entrevista (`/negocios/novo`).
 * Os serviços conferem o dono efetivo (o alvo na simulação de usuário) e o suporte somente leitura.
 */

const businessId = objectId.describe("Id do negócio (de list_businesses)")

function slim(business: BusinessDto) {
    return {
        id: business.id,
        name: business.name,
        number: business.number,
        status: business.status,
        type: business.type,
        subtype: business.subtype,
        segment: business.segment,
        currency: business.currency,
        ownerId: business.ownerId,
        ownerName: business.ownerName,
        archivedAt: business.archivedAt,
        purgeAt: business.purgeAt,
    }
}

function full(business: BusinessDetailDto) {
    return {
        ...slim(business),
        description: business.description,
        links: business.links,
        availability: business.availability,
        availabilityText: describeAvailability(business.availability),
        logo: business.logo ? { name: business.logo.name, mediaType: business.logo.mediaType, size: business.logo.size } : null,
        goals: business.goals.map((goal) => ({ ...goal, text: describeGoal(goal, business.currency) })),
        version: business.version,
        editable: business.editable,
        url: `/negocios/${business.id}`,
    }
}

const availabilityDay = z.object({
    weekday: z.number().int().describe("0 = domingo … 6 = sábado"),
    start: z.string().nullable().optional().describe("HH:mm"),
    end: z.string().nullable().optional().describe("HH:mm"),
})

export const businessTools = [
    defineTool("list_businesses", {
        input: z.object({
            status: z.enum(["active", "archived", "all"]).default("all"),
            ownerId: objectId.optional().describe("Suporte (businesses.view_all): negócios deste usuário"),
            query: z.string().trim().max(120).optional().describe("Suporte (businesses.view_all): busca por nome em todos os usuários"),
        }),
        execute: async (input, { access }) => {
            if (input.query !== undefined) return { items: (await searchAllBusinesses(access, { q: input.query, status: input.status })).map(slim) }
            const list = await listBusinesses(access, { status: input.status, ownerId: input.ownerId ?? null })
            return { items: list.items.map(slim), capacity: list.capacity, createHint: "Novos negócios só pela entrevista em /negocios/novo." }
        },
    }),
    defineTool("get_business", {
        input: z.object({ businessId }),
        execute: async ({ businessId: id }, { access }) => full(await getBusinessDetail(access, id)),
    }),
    defineTool("get_business_interview", {
        input: z.object({ businessId }),
        execute: async ({ businessId: id }, { access }) => {
            const transcript = await businessInterviewTranscript(access, id)
            return {
                scriptVersion: transcript.interview.scriptVersion,
                answers: transcript.interview.questions.map((question) => ({ field: question.field, required: question.required, status: question.status, value: question.display })),
                subtype: transcript.interview.subtype,
                startedAt: transcript.interview.startedAt,
                completedAt: transcript.interview.completedAt,
                transcript: transcript.messages.map((message) => ({ role: message.role, text: message.text, files: message.files.map((file) => file.name), at: message.createdAt })),
            }
        },
    }),
    defineTool("update_business", {
        input: z.object({
            businessId,
            name: z.string().trim().max(120).optional().describe("Vazio volta ao nome automático \"Negócio N\""),
            type: z.enum(BUSINESS_TYPES).nullable().optional(),
            subtype: z.string().trim().max(60).nullable().optional(),
            segment: z.string().trim().max(120).nullable().optional(),
            description: z.string().trim().max(4000).nullable().optional(),
            links: z.array(z.string().trim().max(500)).max(20).optional().describe("Lista COMPLETA de links (substitui a atual)"),
            availability: z.array(availabilityDay).max(7).optional().describe("Lista COMPLETA de dias (substitui a atual)"),
            currency: z.enum(CURRENCIES).optional(),
        }),
        summarize: (input) => `Editar o negócio ${input.businessId}: ${Object.keys(input).filter((key) => key !== "businessId").join(", ") || "nada"}`,
        execute: async ({ businessId: id, ...patch }, { access }) => {
            if (!Object.keys(patch).length) throw new OpexToolError("Nada para alterar.")
            const current = await getBusinessDetail(access, id)
            return full(await updateBusiness(access, id, { ...patch, version: current.version }))
        },
    }),
    defineTool("archive_business", {
        input: z.object({ businessId }),
        summarize: (input) => `Arquivar o negócio ${input.businessId} (exclusão definitiva automática após o prazo da Plataforma)`,
        execute: async ({ businessId: id }, { access }) => slim(await archiveBusiness(access, id)),
    }),
    defineTool("restore_business", {
        input: z.object({ businessId }),
        summarize: (input) => `Restaurar o negócio ${input.businessId}`,
        execute: async ({ businessId: id }, { access }) => slim(await restoreBusiness(access, id)),
    }),
    defineTool("delete_business", {
        input: z.object({ businessId }),
        summarize: (input) => `Excluir definitivamente o negócio arquivado ${input.businessId}, com metas, entrevista e anexos (irreversível)`,
        execute: async ({ businessId: id }, { access }) => ({ ok: true, ...(await deleteBusiness(access, id)) }),
    }),
]
