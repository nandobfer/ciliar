import { z } from "zod"
export const loginSchema = z.object({ identifier: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido")), password: z.string().min(1, "Informe a senha").max(128) })
export type LoginInput = z.infer<typeof loginSchema>
