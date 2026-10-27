import { z } from "zod"
import { APP_DOC_READ_MAX, APP_DOC_SEARCH_LIMIT_DEFAULT, APP_DOC_SEARCH_LIMIT_MAX, appDocSection, parseAppDoc, searchAppDocs } from "../../app-docs"
import { readAllowedAppDocs, readAppDoc } from "../app-docs"
import { defineTool, OpexToolError } from "./define"

async function readOrFail(docPath: string, permissions: ReadonlySet<string>) {
    try {
        return await readAppDoc(docPath, permissions)
    } catch (error) {
        throw new OpexToolError(error instanceof Error ? error.message : String(error))
    }
}

export const docTools = [
    defineTool("list_app_docs", {
        input: z.object({}),
        execute: async (_input, { access }) => {
            const docs = await readAllowedAppDocs(access.effective)
            return {
                docs: docs.map((doc) => {
                    const { title, sections } = parseAppDoc(doc.text)
                    return { path: doc.path, title, updatedAt: doc.updatedAt, sections: sections.filter((section) => section.level <= 3).map((section) => section.title) }
                }),
            }
        },
    }),
    defineTool("read_app_doc", {
        input: z.object({
            path: z.string().trim().min(1).describe('Caminho do documento, como em list_app_docs (ex.: "modules/orders.md")'),
            section: z.string().trim().min(1).optional().describe("Título da seção (## ou ###) para ler só ela"),
            offset: z.number().int().min(0).optional().describe("Caractere inicial (padrão 0)"),
            limit: z.number().int().min(1).max(APP_DOC_READ_MAX).optional(),
        }),
        execute: async ({ path, section, offset, limit }, { access }) => {
            const doc = await readOrFail(path, access.effective)
            const { title, sections } = parseAppDoc(doc.text)
            let text = doc.text
            let sectionTitle: string | null = null
            if (section) {
                const found = appDocSection(doc.text, section)
                if (!found) throw new OpexToolError(`Seção "${section}" não encontrada em ${doc.path}. Seções: ${sections.map((item) => item.title).join("; ") || "(nenhuma)"}.`)
                text = found.text
                sectionTitle = found.section.title
            }
            const start = offset ?? 0
            const end = start + (limit ?? APP_DOC_READ_MAX)
            return { path: doc.path, title, section: sectionTitle, updatedAt: doc.updatedAt, offset: start, total: text.length, truncated: end < text.length, text: text.slice(start, end) }
        },
    }),
    defineTool("search_app_docs", {
        input: z.object({
            query: z.string().trim().min(2).max(200).describe("Palavras-chave em português (ex.: \"link do orçamento expirado\")"),
            limit: z.number().int().min(1).max(APP_DOC_SEARCH_LIMIT_MAX).optional(),
        }),
        execute: async ({ query, limit }, { access }) => {
            const docs = await readAllowedAppDocs(access.effective)
            const hits = searchAppDocs(docs, query, limit ?? APP_DOC_SEARCH_LIMIT_DEFAULT)
            return { query, total: hits.length, hits, hint: hits.length ? "Leia a seção com read_app_doc (path + section) para responder com o texto completo." : "Nada encontrado: tente sinônimos ou list_app_docs." }
        },
    }),
]
