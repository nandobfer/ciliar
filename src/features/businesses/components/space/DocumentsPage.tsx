"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Download, FileText, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroTableSkeleton } from "@/components/list/CadastroTableSkeleton"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { formatAttachmentSize } from "@/lib/attachments"
import { withBasePath } from "@/lib/base-path"
import { ITEM_DESCRIPTION_MAX } from "../../constants"
import { documentCreateSchema } from "../../space-schemas"
import type { DocumentDto } from "../../types"
import { useBusinessUploads, useCategories, useItemList, useSaveItem } from "../../hooks/useBusinessSpace"
import { useBusinessSpace } from "./BusinessSpaceLayout"
import { ArchivedNote, CategoryInput, CELL_CLASS, ItemStatusSelect, ItemTable, matchesSearch, ROW_CLASS, useItemFilters, useItemRowActions } from "./item-ui"
import { UploadField } from "./UploadField"

/** Documentos do negócio (arquivo no Storage S3, categoria sugerida, "usar no portfólio"). */
export function DocumentsPage() {
    const { business, editable } = useBusinessSpace()
    const reduceMotion = useReducedMotion()
    const query = useItemList(business.id, "documents")
    const filters = useItemFilters()
    const [editor, setEditor] = useState<DocumentDto | "new" | null>(null)
    const rows = useItemRowActions(business.id, "documents", "Documento", "O documento some das listas e do portfólio. Ele é excluído definitivamente (com o arquivo) depois do prazo configurado; até lá, pode ser restaurado.")
    const canEdit = editable && (query.data?.editable ?? false)
    const items = (query.data?.items ?? []).filter((item) => filters.matchesStatus(item) && matchesSearch(filters.search, item.name, item.category, item.description, item.file.name))

    return (
        <>
            <CadastroHeader title="Documentos" description="Arquivos do negócio (contratos, apresentações, certificados…)" actionLabel={canEdit ? "Novo documento" : undefined} actionIcon={<Plus className="h-4 w-4" />} onAction={() => setEditor("new")} />
            <ListFilters total={items.length} search={{ value: filters.search, onChange: filters.setSearch, placeholder: "Buscar por nome, categoria ou arquivo", label: "Buscar documentos" }} onClear={filters.clear}>
                <FilterGroup label="Situação" className="min-w-[180px] flex-1">
                    <ItemStatusSelect selected={filters.status} onSelect={filters.setStatus} />
                </FilterGroup>
            </ListFilters>
            {query.isPending ? (
                <CadastroTableSkeleton columns={5} rows={5} />
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar os documentos" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !items.length ? (
                <EmptyState icon={FileText} title={query.data.items.length ? "Nenhum documento encontrado." : "Nenhum documento enviado."} actionLabel={canEdit && !query.data.items.length ? "Novo documento" : undefined} onAction={() => setEditor("new")} />
            ) : (
                <ItemTable label="Documentos" head={[{ label: "Nome", className: "min-w-[160px]" }, { label: "Categoria", className: "hidden md:table-cell" }, { label: "Arquivo", className: "hidden lg:table-cell" }, { label: "Portfólio", className: "w-28" }, { label: "Ações", className: "w-44 text-right" }]}>
                    {items.map((item) => (
                        <motion.tr key={item.id} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className={ROW_CLASS}>
                            <td className={`${CELL_CLASS} max-md:w-full`}>
                                <span className="block truncate font-medium" title={item.name}>{item.name}</span>
                                {item.description && <span className="block truncate text-xs text-muted-foreground" title={item.description}>{item.description}</span>}
                                <ArchivedNote item={item} />
                            </td>
                            <td className={`${CELL_CLASS} hidden truncate text-xs text-muted-foreground md:table-cell`}>{item.category ?? "—"}</td>
                            <td className={`${CELL_CLASS} hidden lg:table-cell`}>
                                <a href={withBasePath(`${item.file.url}?download=1`)} className="inline-flex max-w-full items-center gap-1.5 text-xs text-primary hover:underline" title={`Baixar ${item.file.name}`}>
                                    <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="truncate">{item.file.name}</span>
                                    <span className="shrink-0 text-muted-foreground">({formatAttachmentSize(item.file.size)})</span>
                                </a>
                            </td>
                            <td className={`${CELL_CLASS} text-xs`}>{item.portfolio ? <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">Sim</span> : <span className="text-muted-foreground">Não</span>}</td>
                            <td className={`${CELL_CLASS} max-md:ml-auto`}>{rows.actions(item, { editable: canEdit, onView: () => window.open(withBasePath(item.file.url), "_blank", "noopener"), onEdit: () => setEditor(item) })}</td>
                        </motion.tr>
                    ))}
                </ItemTable>
            )}
            {editor && <DocumentDialog key={editor === "new" ? "new" : editor.id} document={editor === "new" ? null : editor} onClose={() => setEditor(null)} />}
            {rows.dialog}
        </>
    )
}

function DocumentDialog({ document, onClose }: { document: DocumentDto | null; onClose: () => void }) {
    const { business } = useBusinessSpace()
    const save = useSaveItem(business.id, "documents")
    const uploads = useBusinessUploads(business.id, "document")
    const categories = useCategories(business.id, "documents")
    const [name, setName] = useState(document?.name ?? "")
    const [category, setCategory] = useState(document?.category ?? "")
    const [description, setDescription] = useState(document?.description ?? "")
    const [portfolio, setPortfolio] = useState(document?.portfolio ?? false)
    const [error, setError] = useState<string | null>(null)
    const uploaded = uploads.items.find((item) => item.status === "done")?.file ?? null

    const close = () => {
        if (save.isPending) return
        uploads.discard()
        onClose()
    }

    const onFiles = async (files: File[]) => {
        const file = files[0]
        if (!file) return
        for (const item of uploads.items) uploads.remove(item.localId)
        const result = await uploads.upload(file)
        if (result.file && !name.trim()) setName(file.name.replace(/\.[^.]+$/, ""))
    }

    const submit = async () => {
        const data = { name, category: category.trim() || null, description: description.trim() || null, portfolio }
        if (!document) {
            const parsed = documentCreateSchema.safeParse({ ...data, fileId: uploaded?.id })
            if (!parsed.success) return setError(uploaded ? parsed.error.issues[0]!.message : "Envie o arquivo do documento")
            setError(null)
            return save.mutateAsync({ data: parsed.data }).then(() => { uploads.reset(); onClose() }, () => undefined)
        }
        const parsed = documentCreateSchema.omit({ fileId: true }).safeParse(data)
        if (!parsed.success) return setError(parsed.error.issues[0]!.message)
        setError(null)
        await save.mutateAsync({ id: document.id, data: { ...parsed.data, ...(uploaded ? { fileId: uploaded.id } : {}), version: document.version } }).then(() => { uploads.reset(); onClose() }, () => undefined)
    }

    return (
        <Dialog open onOpenChange={(open) => !open && close()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{document ? "Editar documento" : "Novo documento"}</DialogTitle>
                    <DialogDescription>Tamanho máximo e tipos aceitos definidos em Integrações › Plataforma.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
                    <Field id="document-file" label={document ? "Arquivo (envie outro para substituir)" : "Arquivo"}>
                        <UploadField id="document-file" disabled={save.isPending || uploads.busy} uploads={uploads.items} onFiles={(files) => void onFiles(files)} onRemoveUpload={uploads.remove} existing={document && !uploaded ? [document.file] : []} />
                    </Field>
                    <div className={FORM_GRID}>
                        <Field id="document-name" label="Nome">
                            <Input id="document-name" value={name} maxLength={160} disabled={save.isPending} onChange={(event) => setName(event.target.value)} />
                        </Field>
                        <Field id="document-category" label="Categoria/tipo">
                            <CategoryInput id="document-category" value={category} onChange={setCategory} suggestions={categories.data ?? []} disabled={save.isPending} />
                        </Field>
                    </div>
                    <Field id="document-description" label="Descrição">
                        <Textarea id="document-description" rows={3} value={description} maxLength={ITEM_DESCRIPTION_MAX} disabled={save.isPending} onChange={(event) => setDescription(event.target.value)} />
                    </Field>
                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={portfolio} disabled={save.isPending} onCheckedChange={(value) => setPortfolio(value === true)} />
                        Usar no portfólio (pode ser publicado no portfólio do negócio)
                    </label>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={save.isPending} onClick={close}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending || uploads.busy}>
                            {save.isPending ? "Salvando..." : document ? "Salvar" : "Criar documento"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
