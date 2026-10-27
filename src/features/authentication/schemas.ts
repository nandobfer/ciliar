import { z } from "zod"
import { normalizeAccessHost } from "@/features/auth/request-origin"
import { AUTH_METHODS, MAX_EXTRA_HOSTS, type AuthMethod } from "./constants"

const methodList = z
    .array(z.enum(AUTH_METHODS))
    .min(1, "Selecione ao menos um método de autenticação")
    .refine((values) => new Set(values).size === values.length, "Métodos repetidos")
    .transform((values) => AUTH_METHODS.filter((method) => values.includes(method)))

const accessHost = z.string().trim().max(253).transform((value, context) => {
    const host = normalizeAccessHost(value)
    if (!host) {
        context.addIssue({ code: "custom", message: `Endereço inválido: "${value}". Informe só o domínio ou o IP, sem http://, porta ou caminho` })
        return z.NEVER
    }
    return host
})

export const authSettingsSchema = z.strictObject({
    methods: z.strictObject({ http: methodList, https: methodList }),
    extraHosts: z
        .array(accessHost)
        .max(MAX_EXTRA_HOSTS, `No máximo ${MAX_EXTRA_HOSTS} endereços`)
        .refine((values) => new Set(values).size === values.length, "Endereços repetidos"),
})
export type AuthSettings = z.infer<typeof authSettingsSchema>

export const authSettingsUpdateSchema = authSettingsSchema.extend({ version: z.number().int().nonnegative() })
export type AuthSettingsUpdate = z.input<typeof authSettingsUpdateSchema>

/** Antes de salvar: HTTP e HTTPS só com Google (comportamento anterior à integração). */
export const DEFAULT_AUTH_SETTINGS: AuthSettings = { methods: { http: ["google"], https: ["google"] }, extraHosts: [] }

export const isAuthMethod = (value: unknown): value is AuthMethod => AUTH_METHODS.includes(value as AuthMethod)
