import { z } from "zod"
import { identitySchema, passwordSchema } from "@/features/access/schemas"

export const loginSchema = z.object({ identifier: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido")), password: z.string().min(1, "Informe a senha").max(128) })
export type LoginInput = z.infer<typeof loginSchema>

/** Cadastro público por e-mail e senha (`/login` › Criar conta). */
export const passwordSignupSchema = identitySchema.extend({ password: passwordSchema }).strict()
export type PasswordSignupInput = z.infer<typeof passwordSignupSchema>
