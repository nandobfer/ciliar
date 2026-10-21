"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertCircle, ImagePlus, Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

/**
 * Área de soltar ou escolher a imagem do negócio (logo/foto), compartilhada pela etapa da entrevista
 * e pela Ficha. Realce ao arrastar contado por profundidade (não pisca sobre os elementos internos),
 * prévia com transição, progresso do envio e erro na própria área. Movimento reduzido respeitado.
 */
export function LogoDropzone({
    previewUrl,
    name,
    hint,
    accept,
    uploading = false,
    progress = 0,
    error = null,
    disabled = false,
    onFiles,
    className,
}: {
    /** Prévia local (blob) ou a imagem atual; sem ela, o ícone. */
    previewUrl?: string | null
    /** Nome do arquivo escolhido (no lugar do texto de instrução). */
    name?: string | null
    hint: string
    accept: readonly string[]
    uploading?: boolean
    progress?: number
    error?: string | null
    disabled?: boolean
    onFiles: (files: File[]) => void
    className?: string
}) {
    const reduceMotion = useReducedMotion()
    const input = useRef<HTMLInputElement>(null)
    const depth = useRef(0)
    const [dragging, setDragging] = useState(false)
    const blocked = disabled || uploading
    const reset = () => {
        depth.current = 0
        setDragging(false)
    }

    return (
        <div className={cn("space-y-2", className)}>
            <motion.button
                type="button"
                disabled={blocked}
                aria-busy={uploading || undefined}
                data-dragging={dragging ? "true" : undefined}
                onClick={() => input.current?.click()}
                onDragEnter={(event) => {
                    if (blocked) return
                    event.preventDefault()
                    depth.current += 1
                    setDragging(true)
                }}
                onDragOver={(event) => {
                    if (blocked) return
                    event.preventDefault()
                    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
                }}
                onDragLeave={(event) => {
                    if (blocked) return
                    event.preventDefault()
                    depth.current -= 1
                    if (depth.current <= 0) setDragging(false)
                }}
                onDrop={(event) => {
                    event.preventDefault()
                    reset()
                    if (!blocked) onFiles(Array.from(event.dataTransfer?.files ?? []))
                }}
                animate={dragging && !reduceMotion ? { scale: 1.015 } : { scale: 1 }}
                whileTap={blocked || reduceMotion ? undefined : { scale: 0.99 }}
                transition={{ duration: 0.15 }}
                className={cn(
                    "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    dragging ? "border-primary bg-primary/10" : error ? "border-destructive/60" : "hover:border-primary/50 hover:bg-muted/30",
                    disabled && "cursor-not-allowed opacity-60",
                    uploading && "cursor-progress",
                )}
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                        key={previewUrl ?? "empty"}
                        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.92 }}
                        animate={{ opacity: 1, scale: 1, y: dragging && !reduceMotion ? -3 : 0 }}
                        exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.92 }}
                        transition={{ duration: 0.18 }}
                        className="relative flex"
                    >
                        {previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob) ou a logo atual
                            <img src={previewUrl} alt="Prévia da imagem" className={cn("h-28 w-28 rounded-xl object-cover transition-opacity", uploading && "opacity-60")} />
                        ) : (
                            <span className={cn("flex h-14 w-14 items-center justify-center rounded-full transition-colors", dragging ? "bg-primary/20 text-primary" : "bg-muted text-primary")}>
                                <ImagePlus className="h-7 w-7" aria-hidden />
                            </span>
                        )}
                        {uploading && previewUrl && (
                            <span className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
                            </span>
                        )}
                    </motion.span>
                </AnimatePresence>
                <span className="text-sm font-medium">{dragging ? "Solte a imagem aqui" : (name ?? "Solte a imagem aqui ou clique para escolher")}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
                {uploading && (
                    <span className="flex w-full max-w-56 flex-col gap-1.5" role="status">
                        <span className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Enviando… {Math.round(progress)}%
                        </span>
                        <Progress value={progress} aria-label={`Enviando a imagem: ${Math.round(progress)}%`} />
                    </span>
                )}
            </motion.button>
            <input
                ref={input}
                type="file"
                hidden
                accept={accept.join(",")}
                aria-label="Escolher a imagem do negócio"
                onChange={(event) => {
                    onFiles(Array.from(event.target.files ?? []))
                    event.target.value = ""
                }}
            />
            <AnimatePresence initial={false}>
                {error && (
                    <motion.p
                        role="alert"
                        initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-center gap-1.5 text-xs text-destructive"
                    >
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {error}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    )
}
