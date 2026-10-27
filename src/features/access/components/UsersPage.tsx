"use client"
import { useState } from "react"
import { Can, usePermissions } from "@nandobfer/perfix/react"
import { Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroTableSkeleton } from "@/components/list/CadastroTableSkeleton"
import { ListFilters } from "@/components/list/ListFilters"
import { FilterGroup } from "@/components/list/FilterGroup"
import { StatusFilterMultiSelect } from "@/components/list/StatusFilterMultiSelect"
import { StatusPill } from "@/components/list/StatusPill"
import { TableAction } from "@/components/list/TableAction"
import { ErrorState } from "@/components/feedback/ErrorState"
import { EmptyState } from "@/components/feedback/EmptyState"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { PermissionTree } from "./permissions/PermissionTree"
import { RoleChip } from "./permissions/RoleChip"
import { expandPermissions } from "@nandobfer/perfix"
import { useUsers, useAccessMutation } from "../hooks/useAccessAdmin"
import { useAppSession } from "./AccessProvider"
import { UserEditor } from "./UserEditor"
import type { UserDto } from "../types"

export function UsersPage() {
    const query = useUsers()
    const { can } = usePermissions()
    const { session } = useAppSession()
    const mutation = useAccessMutation()
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState<string[]>([])
    const reducedMotion = useReducedMotion()
    const [editor, setEditor] = useState<UserDto | "new" | null>(null)
    const [summary, setSummary] = useState<UserDto | null>(null)
    const [page, setPage] = useState(0)
    const rows = (query.data ?? []).filter(user => `${user.nome} ${user.email}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")) && (!status.length || status.includes(user.ativo ? "ativo" : "inativo")))
    const pages = Math.max(1, Math.ceil(rows.length / 20))
    const currentPage = Math.min(page, pages - 1)
    const visible = rows.slice(currentPage * 20, currentPage * 20 + 20)
    const remove = async (user: UserDto) => {
        if (!window.confirm(`Excluir o usuário ${user.nome}? Esta ação não pode ser desfeita.`)) return
        await mutation.mutateAsync({ path: `/users/${user.id}`, method: "delete", data: { version: user.version } }).catch(() => undefined)
    }
    return <div className="flex flex-col gap-6">
        <CadastroHeader title="Usuários" description="Cadastro, status e perfis de acesso" actionLabel={can("users.create") ? "Novo Usuário" : undefined} actionIcon={<Plus className="h-4 w-4" />} onAction={() => setEditor("new")} />
        <ListFilters total={rows.length} search={{ value: search, onChange: value => { setSearch(value); setPage(0) }, placeholder: "Buscar por nome ou e-mail", label: "Buscar usuários" }} onClear={() => { setSearch(""); setStatus([]); setPage(0) }}>
            <FilterGroup label="Status" className="min-w-[180px] flex-1"><StatusFilterMultiSelect selected={status} onSelect={values => { setStatus(values); setPage(0) }} /></FilterGroup>
        </ListFilters>
        {query.isPending ? <CadastroTableSkeleton columns={5} rows={6} /> : query.isError ? <ErrorState title="Não foi possível carregar os usuários" onRetry={() => void query.refetch()} /> : !rows.length ? <EmptyState title="Nenhum usuário encontrado." /> : <>
            {/* Estrutura, cabeçalho e células de TaskTable.tsx do Opex; somente colunas/dados mudam. */}
            <div className="overflow-x-auto rounded-md border bg-card max-md:border-0">
                <table className="w-full table-fixed caption-bottom text-sm max-md:block" aria-label="Usuários">
                    <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--color-border)] transition-shadow max-md:hidden"><tr>
                        <th className="h-10 min-w-[160px] px-3 text-left align-middle text-xs font-semibold text-muted-foreground">Nome</th>
                        <th className="hidden h-10 px-3 text-left align-middle text-xs font-semibold text-muted-foreground md:table-cell">E-mail</th>
                        <th className="h-10 px-3 text-left align-middle text-xs font-semibold text-muted-foreground">Perfis</th>
                        <th className="h-10 w-32 px-3 text-left align-middle text-xs font-semibold text-muted-foreground">Status</th>
                        <th className="h-10 w-32 px-3 text-right align-middle text-xs font-semibold text-muted-foreground">Ações</th>
                    </tr></thead>
                    <tbody className="max-md:block">{visible.map(user => <motion.tr key={user.id} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="border-b transition-colors last:border-0 hover:bg-muted/50 focus:bg-muted/50 max-md:mb-3 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-2 max-md:gap-y-1 max-md:rounded-lg max-md:border max-md:p-3 max-md:last:mb-0">
                        <td className="px-3 py-2 max-md:order-last max-md:w-full max-md:px-0 max-md:pt-1 max-md:pb-0"><span className="block truncate text-sm font-medium" title={user.nome}>{user.nome}</span><span className="block truncate text-xs text-muted-foreground md:hidden" title={user.email}>{user.email}</span></td>
                        <td className="hidden truncate px-3 py-2 text-xs text-muted-foreground md:table-cell" title={user.email}>{user.email}</td>
                        <td className="px-3 py-2 max-md:px-0 max-md:py-0"><div className="flex flex-wrap gap-1">{user.cargos.map(role => <span key={role.id} className="inline-flex items-center gap-1"><RoleChip cargo={role} />{!role.ativo && <span className="text-xs text-muted-foreground">(inativo)</span>}</span>)}</div></td>
                        <td className="px-3 py-2 max-md:ml-auto max-md:px-0 max-md:py-0"><StatusPill active={user.ativo} />{user.convitePendente && <span className="mt-0.5 block text-xs text-muted-foreground" title="Ainda não entrou com o Google e não tem senha">Convite pendente</span>}</td>
                        <td className="px-3 py-2 max-md:px-0 max-md:py-0"><div className="flex justify-end gap-1" role="group" aria-label={`Ações de ${user.nome}`}>
                            <TableAction type="visualize" onClick={() => setSummary(user)} />
                            <Can permission="users.edit"><TableAction type="edit" disabled={!user.gerenciavel} onClick={() => setEditor(user)} /></Can>
                            <Can permission="users.delete"><TableAction type="delete" disabled={!user.gerenciavel || session?.user.id === user.id || mutation.isPending} onClick={() => void remove(user)} /></Can>
                        </div></td>
                    </motion.tr>)}</tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{rows.length} usuário(s) · Página {currentPage + 1} de {pages}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button></div></div>
        </>}
        {editor && <UserEditor key={editor === "new" ? "new" : editor.id} user={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} />}
        <Dialog open={!!summary} onOpenChange={open => { if (!open) setSummary(null) }}><DialogContent className="max-h-[85vh] max-w-2xl overflow-auto"><DialogHeader><DialogTitle>Permissões de {summary?.nome}</DialogTitle><DialogDescription>União dos perfis ativos do usuário. Usuários inativos não podem autenticar.</DialogDescription></DialogHeader>{summary && <PermissionTree selected={expandPermissions(summary.cargos)} onChange={() => {}} readOnly />}</DialogContent></Dialog>
    </div>
}
