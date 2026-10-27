import { z } from "zod"
import { catalog } from "./catalog"

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "ID inválido")
const ids = z.array(objectId).max(500).refine(values => new Set(values).size === values.length, "IDs repetidos")
export const identitySchema = z.object({
    nome: z.string().trim().min(2, "Informe o nome").max(100),
    email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")),
})
export const passwordSchema = z.string().min(12, "Use pelo menos 12 caracteres").max(128, "Use no máximo 128 caracteres")
/** Pré-cadastro (convite): a pessoa entra com o Google usando o e-mail ou com a senha inicial opcional. */
export const createUserSchema = identitySchema.extend({ ativo: z.boolean(), cargos: ids.min(1, "Selecione ao menos um perfil"), enviarConvite: z.boolean().optional(), password: passwordSchema.optional() }).strict()
/** Admin define/redefine a senha de outro usuário (`PUT /api/users/[id]/password`). */
export const setUserPasswordSchema = z.strictObject({ password: passwordSchema })
/** Próprio usuário (`POST /api/me/password`): a atual é exigida quando a conta já tem senha. */
export const changePasswordSchema = z.strictObject({ currentPassword: z.string().min(1).max(128).optional(), newPassword: passwordSchema })
export const updateUserSchema = z.strictObject({ nome: identitySchema.shape.nome, ativo: z.boolean(), cargos: ids, version: z.number().int().nonnegative() })
export const COLORS = ["vermelho", "laranja", "ambar", "amarelo", "lima", "verde", "esmeralda", "turquesa", "ciano", "celeste", "azul", "indigo", "violeta", "roxo", "magenta", "rosa", "rubi", "cinza"] as const
export const roleSchema = z.strictObject({
    nome: z.string().trim().min(1, "Informe o nome").max(60), descricao: z.string().trim().max(500),
    cor: z.enum(COLORS), ativo: z.boolean(),
    /** Negócios ativos permitidos (`null` = ilimitado). */
    limiteNegocios: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1, "Mínimo 1 (deixe vazio para ilimitado)").max(10_000, "Máximo 10.000").nullable().optional(),
    permissoes: z.array(z.string().refine(key => key !== "*" && catalog.isKnownKey(key), "Permissão desconhecida ou reservada")).max(200),
})
export const roleUpdateSchema = roleSchema.partial().extend({ version: z.number().int().nonnegative(), membros: ids.optional() }).strict()
export const reorderSchema = z.strictObject({ ordem: ids.min(1), version: z.number().int().nonnegative() })
export const versionSchema = z.strictObject({ version: z.number().int().nonnegative() })
export const viewAsSchema = z.discriminatedUnion("tipo", [
    z.strictObject({ tipo: z.literal("cargo"), roleId: objectId }),
    z.strictObject({ tipo: z.literal("usuario"), userId: objectId }),
])
