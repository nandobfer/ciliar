"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, Copy, KeyRound, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

/** Saída de `create_api_token` com o valor (só existe depois da execução confirmada). */
export interface OpexApiTokenOutput {
    token: string
    item?: { id?: string; nome?: string; prefixo?: string }
}

/** Lê a saída exibida da ferramenta; `null` quando não há token (pendente, cancelada, falhou). */
export function parseApiTokenOutput(output: string | null): OpexApiTokenOutput | null {
    if (!output) return null
    try {
        const value = JSON.parse(output) as { token?: unknown; item?: OpexApiTokenOutput["item"] }
        return typeof value.token === "string" && value.token ? { token: value.token, item: value.item } : null
    } catch {
        return null
    }
}

/** Troca o valor do token por um marcador nos detalhes recolhíveis (o card já o mostra). */
export function maskApiTokenOutput(output: string, token: string): string {
    return output.split(token).join(`${token.slice(0, 12)}…`)
}

/** Copia mesmo fora de contexto seguro (HTTP na rede interna), onde `navigator.clipboard` não existe. */
async function copyText(text: string): Promise<void> {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return
    }
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand("copy")
    area.remove()
    if (!ok) throw new Error("copy failed")
}

/** Card do token gerado pelo agente: nome, valor e botão de copiar (mesmo aviso do diálogo da API interna). */
export function OpexApiTokenCard({ output }: { output: OpexApiTokenOutput }) {
    const [copied, setCopied] = useState(false)
    const reduceMotion = useReducedMotion() ?? false
    const copy = async () => {
        try {
            await copyText(output.token)
            setCopied(true)
            toast.success("Token copiado.")
            setTimeout(() => setCopied(false), 1500)
        } catch {
            toast.error("Não foi possível copiar o token")
        }
    }
    return (
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
            className="space-y-2 border-t bg-primary/5 px-2.5 py-2.5"
        >
            <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30" aria-hidden>
                    <KeyRound className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">{output.item?.nome ? `Token "${output.item.nome}"` : "Token de sistema gerado"}</p>
                    <p className="text-[11px] text-muted-foreground">Copie agora e guarde num lugar seguro.</p>
                </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                <code className="min-w-0 flex-1 break-all font-mono text-[11px]">{output.token}</code>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => void copy()} aria-label="Copiar token">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                            key={copied ? "ok" : "copy"}
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="inline-flex items-center gap-1.5"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                            {copied ? "Copiado" : "Copiar"}
                        </motion.span>
                    </AnimatePresence>
                </Button>
            </div>
            <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                    Use no cabeçalho <code className="font-mono">Authorization: Bearer …</code>. Entregue só a quem vai usá-lo.
                </span>
            </p>
        </motion.div>
    )
}
