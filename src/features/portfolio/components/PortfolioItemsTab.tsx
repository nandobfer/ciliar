"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ExternalLink, GalleryHorizontalEnd, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChipInput } from "@/components/ui/chip-input"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import { ITEM_DESCRIPTION_MAX } from "@/features/businesses/constants"
import { useBusinessUploads, useItemList, useSaveItem } from "@/features/businesses/hooks/useBusinessSpace"
import { useBusinessSpace } from "@/features/businesses/components/space/BusinessSpaceLayout"
import { ArchivedNote, ItemStatusSelect, matchesSearch, useItemFilters, useItemRowActions } from "@/features/businesses/components/space/item-ui"
import { UploadField } from "@/features/businesses/components/space/UploadField"
import { PORTFOLIO_ITEM_IMAGES_MAX, PORTFOLIO_ITEM_TAGS_MAX, PORTFOLIO_ITEM_TITLE_MAX, PORTFOLIO_ITEM_URL_MAX } from "../constants"
import { portfolioItemCreateSchema } from "../schemas"
import type { PortfolioItemDto } from "../types"
import { usePortfolioTags } from "../hooks/usePortfolio"

const dateLabel = (key: string) => key.split("-").reverse().join("/")

/** Itens avulsos do portfólio (projetos só para o portfólio), com galeria, link, data e categorias/tags. */
export function PortfolioItemsTab() {
    const { business, editable } = useBusinessSpace()
    const reduceMotion = useReducedMotion()
    const query = useItemList(business.id, "portfolioItems")
    const filters = useItemFilters()
    const [editor, setEditor] = useState<PortfolioItemDto | "new" | null>(null)
    const rows = useItemRowActions(business.id, "portfolioItems", "Item avulso", "O item some do portfólio. Ele é excluído definitivamente (com as imagens) depois do prazo configurado; até lá, pode ser restaurado.")
    const canEdit = editable && (query.data?.editable ?? false)
    const items = (query.data?.items ?? []).filter((item) => filters.matchesStatus(item) && matchesSearch(filters.search, item.title, item.description, ...item.tags))

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Projetos só para o portfólio. A ordem na página fica na aba Conteúdo.</p>
                {canEdit && (
                    <Button type="button" className="gap-1.5" onClick={() => setEditor("new")}>
                        <Plus className="h-4 w-4" aria-hidden /> Novo item
                    </Button>
                )}
            </div>
            <ListFilters total={items.length} search={{ value: filters.search, onChange: filters.setSearch, placeholder: "Buscar por título, descrição ou tag", label: "Buscar itens avulsos" }} onClear={filters.clear}>
                <FilterGroup label="Situação" className="min-w-[180px] flex-1">
                    <ItemStatusSelect selected={filters.status} onSelect={filters.setStatus} />
                </FilterGroup>
            </ListFilters>
            {query.isPending ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-48" />)}</div>
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar os itens avulsos" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !items.length ? (
                <EmptyState icon={GalleryHorizontalEnd} title={query.data.items.length ? "Nenhum item encontrado." : "Nenhum item avulso cadastrado."} description={query.data.items.length ? undefined : "Mostre projetos que não vieram de pedidos: imagens, link, data e categorias."} actionLabel={canEdit && !query.data.items.length ? "Novo item" : undefined} onAction={() => setEditor("new")} />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((item, index) => (
                        <motion.div key={item.id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * 0.03 }}>
                            <Card className="flex h-full flex-col gap-2 overflow-hidden">
                                {item.images[0] ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- imagem servida pela rota do espaço
                                    <img src={withBasePath(item.images[0].url)} alt={item.images[0].name} className="aspect-video w-full object-cover" loading="lazy" />
                                ) : (
                                    <div className="flex aspect-video w-full items-center justify-center bg-muted/40 text-muted-foreground">
                                        <GalleryHorizontalEnd className="h-8 w-8" aria-hidden />
                                    </div>
                                )}
                                <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
                                    <div className="min-w-0">
                                        <p className="font-semibold">{item.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {[item.date ? dateLabel(item.date) : null, item.images.length ? `${item.images.length} imagem(ns)` : null].filter(Boolean).join(" · ")}
                                        </p>
                                    </div>
                                    {item.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {item.tags.map((tag) => (
                                                <span key={tag} className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {item.description && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>}
                                    {item.url && (
                                        <a href={item.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1.5 text-xs text-primary hover:underline">
                                            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                            <span className="truncate">{item.url.replace(/^https?:\/\//, "")}</span>
                                        </a>
                                    )}
                                    <ArchivedNote item={item} />
                                    <div className="mt-auto">{rows.actions({ ...item, name: item.title }, { editable: canEdit, onEdit: () => setEditor(item) })}</div>
                                </div>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}
            {editor && <PortfolioItemDialog key={editor === "new" ? "new" : editor.id} item={editor === "new" ? null : editor} onClose={() => setEditor(null)} />}
            {rows.dialog}
        </div>
    )
}

export function PortfolioItemDialog({ item, onClose }: { item: PortfolioItemDto | null; onClose: () => void }) {
    const { business } = useBusinessSpace()
    const save = useSaveItem(business.id, "portfolioItems")
    const uploads = useBusinessUploads(business.id, "portfolio")
    const suggestions = usePortfolioTags(business.id)
    const [title, setTitle] = useState(item?.title ?? "")
    const [date, setDate] = useState(item?.date ?? "")
    const [url, setUrl] = useState(item?.url ?? "")
    const [description, setDescription] = useState(item?.description ?? "")
    const [tags, setTags] = useState<string[]>(item?.tags ?? [])
    const [tagQuery, setTagQuery] = useState("")
    const [kept, setKept] = useState(item?.images ?? [])
    const [error, setError] = useState<string | null>(null)
    const added = uploads.items.flatMap((upload) => (upload.status === "done" && upload.file ? [upload.file.id] : []))
    const total = kept.length + uploads.items.length

    const close = () => {
        if (save.isPending) return
        uploads.discard()
        onClose()
    }

    const submit = async () => {
        const parsed = portfolioItemCreateSchema.safeParse({ title, date: date || null, url: url.trim() || null, description: description.trim() || null, tags, imageIds: [...kept.map((file) => file.id), ...added] })
        if (!parsed.success) return setError(parsed.error.issues[0]!.message)
        setError(null)
        await save.mutateAsync({ id: item?.id, data: item ? { ...parsed.data, version: item.version } : parsed.data }).then(
            () => {
                uploads.reset()
                onClose()
            },
            () => undefined,
        )
    }

    return (
        <Dialog open onOpenChange={(open) => !open && close()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{item ? "Editar item avulso" : "Novo item avulso"}</DialogTitle>
                    <DialogDescription>Imagens PNG, JPEG, WebP ou GIF, com o tamanho máximo dos documentos da Plataforma.</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault()
                        void submit()
                    }}
                >
                    <div className={FORM_GRID}>
                        <Field id="portfolio-item-title" label="Título">
                            <Input id="portfolio-item-title" autoFocus value={title} maxLength={PORTFOLIO_ITEM_TITLE_MAX} disabled={save.isPending} onChange={(event) => setTitle(event.target.value)} />
                        </Field>
                        <Field id="portfolio-item-date" label="Data (opcional)">
                            <DatePicker id="portfolio-item-date" value={date} onChange={setDate} inputDisabled={save.isPending} />
                        </Field>
                    </div>
                    <Field id="portfolio-item-url" label="Link externo (opcional)">
                        <Input id="portfolio-item-url" type="url" inputMode="url" placeholder="https://" value={url} maxLength={PORTFOLIO_ITEM_URL_MAX} disabled={save.isPending} onChange={(event) => setUrl(event.target.value)} />
                    </Field>
                    <Field id="portfolio-item-tags" label={`Categorias/tags (até ${PORTFOLIO_ITEM_TAGS_MAX})`}>
                        <ChipInput id="portfolio-item-tags" value={tags} onChange={setTags} max={PORTFOLIO_ITEM_TAGS_MAX} disabled={save.isPending} placeholder="Ex.: Identidade visual" onQueryChange={setTagQuery} suggestions={(suggestions.data ?? []).filter((tag) => matchesSearch(tagQuery, tag)).map((tag) => ({ value: tag, label: tag }))} />
                    </Field>
                    <Field id="portfolio-item-description" label="Descrição (opcional)">
                        <Textarea id="portfolio-item-description" rows={4} value={description} maxLength={ITEM_DESCRIPTION_MAX} disabled={save.isPending} onChange={(event) => setDescription(event.target.value)} />
                    </Field>
                    <Field id="portfolio-item-images" label={`Imagens (até ${PORTFOLIO_ITEM_IMAGES_MAX})`}>
                        <UploadField
                            id="portfolio-item-images"
                            multiple
                            disabled={save.isPending || total >= PORTFOLIO_ITEM_IMAGES_MAX}
                            uploads={uploads.items}
                            onFiles={(files) => {
                                for (const file of files.slice(0, PORTFOLIO_ITEM_IMAGES_MAX - total)) void uploads.upload(file)
                            }}
                            onRemoveUpload={uploads.remove}
                            existing={kept}
                            onRemoveExisting={(fileId) => setKept((current) => current.filter((file) => file.id !== fileId))}
                        />
                    </Field>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={save.isPending} onClick={close}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending || uploads.busy}>
                            {save.isPending ? "Salvando..." : item ? "Salvar" : "Criar item"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
