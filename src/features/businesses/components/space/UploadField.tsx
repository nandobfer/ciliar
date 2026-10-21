"use client"

import { useRef, useState } from "react"
import { AlertCircle, FileUp, Loader2, Paperclip, X } from "lucide-react"
import { IconAction } from "@/components/ui/icon-action"
import { Progress } from "@/components/ui/progress"
import { formatAttachmentSize } from "@/lib/attachments"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"
import type { BusinessFileDto } from "../../types"
import type { UploadState } from "../../hooks/useBusinessSpace"

/** Área de envio (soltar ou escolher), com o progresso de cada arquivo e os já anexados. */
export function UploadField({
    id,
    multiple = false,
    disabled = false,
    uploads,
    onFiles,
    onRemoveUpload,
    existing = [],
    onRemoveExisting,
    hint,
}: {
    id: string
    multiple?: boolean
    disabled?: boolean
    uploads: UploadState[]
    onFiles: (files: File[]) => void
    onRemoveUpload: (localId: string) => void
    existing?: BusinessFileDto[]
    onRemoveExisting?: (fileId: string) => void
    hint?: string
}) {
    const input = useRef<HTMLInputElement>(null)
    const [over, setOver] = useState(false)
    const pick = (list: FileList | null) => {
        const files = Array.from(list ?? [])
        if (files.length) onFiles(multiple ? files : files.slice(0, 1))
    }
    return (
        <div className="space-y-2">
            <button
                id={id}
                type="button"
                disabled={disabled}
                onClick={() => input.current?.click()}
                onDragOver={(event) => {
                    event.preventDefault()
                    setOver(true)
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(event) => {
                    event.preventDefault()
                    setOver(false)
                    if (!disabled) pick(event.dataTransfer.files)
                }}
                className={cn(
                    "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                    over ? "border-primary bg-primary/10" : "hover:border-primary/50 hover:bg-muted/40",
                )}
            >
                <FileUp className="h-5 w-5 text-primary" aria-hidden />
                <span className="font-medium">{multiple ? "Soltar arquivos ou escolher" : "Soltar o arquivo ou escolher"}</span>
                {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
            </button>
            <input ref={input} type="file" multiple={multiple} className="hidden" onChange={(event) => { pick(event.target.files); event.target.value = "" }} />
            {(existing.length > 0 || uploads.length > 0) && (
                <ul className="space-y-1.5">
                    {existing.map((file) => (
                        <li key={file.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <a href={withBasePath(file.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                                {file.name}
                            </a>
                            <span className="text-xs text-muted-foreground">{formatAttachmentSize(file.size)}</span>
                            {onRemoveExisting && !disabled && <IconAction icon={X} label={`Remover ${file.name}`} tone="danger" onClick={() => onRemoveExisting(file.id)} />}
                        </li>
                    ))}
                    {uploads.map((upload) => (
                        <li key={upload.localId} className="space-y-1 rounded-md border px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                                {upload.status === "uploading" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden /> : upload.status === "error" ? <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden /> : <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                                <span className="min-w-0 flex-1 truncate">{upload.name}</span>
                                <span className="text-xs text-muted-foreground">{formatAttachmentSize(upload.size)}</span>
                                {upload.status !== "uploading" && <IconAction icon={X} label={`Remover ${upload.name}`} tone="danger" onClick={() => onRemoveUpload(upload.localId)} />}
                            </div>
                            {upload.status === "uploading" && <Progress value={upload.progress} aria-label={`Enviando ${upload.name}: ${upload.progress}%`} />}
                            {upload.error && <p role="alert" className="text-xs text-destructive">{upload.error}</p>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
