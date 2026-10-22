"use client"

import { useRef } from "react"
import { useDraggable } from "@dnd-kit/core"
import { Check, Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useBusinessUploads } from "@/features/businesses/hooks/useBusinessSpace"
import { usePortfolioMedia } from "../../hooks/usePortfolio"
import type { PortfolioMediaDto } from "../../types"
import { usePortfolioEditor } from "./context"
import type { DragData } from "./dnd"

/**
 * Mídia do portfólio: envio de imagens e a grade das enviadas. Na barra lateral cada imagem pode ser
 * arrastada para a página (vira um bloco Imagem) ou clicada para inserir; no painel de propriedades
 * a grade escolhe as imagens do bloco (`selected`/`onToggle`).
 */
export function MediaLibrary({ selected, onToggle, draggable = false, onInsert }: { selected?: readonly string[]; onToggle?: (id: string) => void; draggable?: boolean; onInsert?: (media: PortfolioMediaDto) => void }) {
    const { portfolio, readOnly } = usePortfolioEditor()
    const input = useRef<HTMLInputElement>(null)
    const uploads = useBusinessUploads(portfolio.businessId, "media")
    const { add, remove } = usePortfolioMedia(portfolio.businessId)

    const send = async (files: File[]) => {
        const done: string[] = []
        for (const file of files) {
            const result = await uploads.upload(file)
            if (result.file) done.push(result.file.id)
            else if (result.error) toast.error(result.error)
        }
        if (done.length) await add.mutateAsync(done).catch(() => undefined)
        uploads.reset()
    }
    const busy = uploads.busy || add.isPending

    return (
        <div className="space-y-2">
            {!readOnly && (
                <>
                    <input
                        ref={input}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden
                        onChange={(event) => {
                            const files = Array.from(event.target.files ?? [])
                            event.target.value = ""
                            if (files.length) void send(files)
                        }}
                    />
                    <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" disabled={busy} onClick={() => input.current?.click()}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                        {busy ? "Enviando..." : "Enviar imagens"}
                    </Button>
                </>
            )}
            {portfolio.media.length ? (
                <ul className="grid grid-cols-3 gap-1.5">
                    {portfolio.media.map((media) => (
                        <MediaTile
                            key={media.id}
                            media={media}
                            draggable={draggable && !readOnly}
                            selected={selected?.includes(media.id) ?? false}
                            onClick={onToggle ? () => onToggle(media.id) : onInsert && !readOnly ? () => onInsert(media) : undefined}
                            onDelete={readOnly || onToggle ? undefined : () => remove.mutate(media.id)}
                        />
                    ))}
                </ul>
            ) : (
                <p className="text-xs text-muted-foreground">Nenhuma imagem na mídia. PNG, JPEG, WebP ou GIF.</p>
            )}
        </div>
    )
}

// @dnd-kit v6 devolve propriedades de render junto de setNodeRef; não lemos ref.current aqui.
/* eslint-disable react-hooks/refs */
function MediaTile({ media, draggable, selected, onClick, onDelete }: { media: PortfolioMediaDto; draggable: boolean; selected: boolean; onClick?: () => void; onDelete?: () => void }) {
    const { fileUrl } = usePortfolioEditor()
    const drag = useDraggable({ id: `media:${media.id}`, data: { kind: "media", id: media.id, label: media.name } satisfies DragData, disabled: !draggable })
    return (
        <li className="group/media relative">
            <button
                ref={drag.setNodeRef}
                type="button"
                {...(draggable ? { ...drag.attributes, ...drag.listeners } : {})}
                onClick={onClick}
                aria-pressed={onClick && selected !== undefined ? selected : undefined}
                aria-label={onClick ? `${selected ? "Tirar" : "Usar"} ${media.name}` : media.name}
                className={cn("block aspect-square w-full overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected && "ring-2 ring-primary", drag.isDragging && "opacity-40", draggable && "cursor-grab")}
            >
                {/* eslint-disable-next-line @next/next/no-img-element -- rota autenticada do arquivo */}
                <img src={fileUrl(media.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
                {selected && (
                    <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                        <Check className="h-3 w-3" aria-hidden />
                    </span>
                )}
            </button>
            {onDelete && (
                <Button type="button" variant="secondary" size="icon" className="absolute bottom-1 right-1 h-6 w-6 opacity-0 focus-visible:opacity-100 group-hover/media:opacity-100" aria-label={`Excluir ${media.name} da mídia`} onClick={onDelete}>
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            )}
        </li>
    )
}
/* eslint-enable react-hooks/refs */
