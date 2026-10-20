"use client"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePermissions } from "@nandobfer/perfix/react"
import { canManageRole } from "@nandobfer/perfix"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, ChevronRight } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { CadastroTableSkeleton } from "@/components/list/CadastroTableSkeleton"
import { ListFilters } from "@/components/list/ListFilters"
import { FilterGroup } from "@/components/list/FilterGroup"
import { StatusFilterMultiSelect } from "@/components/list/StatusFilterMultiSelect"
import { StatusPill } from "@/components/list/StatusPill"
import { TableAction } from "@/components/list/TableAction"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Button } from "@/components/ui/button"
import { useAccessMutation, useRoles } from "../hooks/useAccessAdmin"
import type { RoleDto } from "../types"
import { RoleChip } from "./permissions/RoleChip"

// @dnd-kit v6 devolve propriedades de render junto de setNodeRef; não lemos ref.current aqui.
/* eslint-disable react-hooks/refs */
function SortableRole({ role, disabled, onDelete }: { role: RoleDto & { usuariosCount: number }; disabled: boolean; onDelete: () => void }) {
    const sortable = useSortable({ id: role.id, disabled })
    return <li ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50">
        <Button type="button" variant="ghost" size="icon" aria-label={`Reordenar ${role.nome}`} disabled={disabled} {...sortable.attributes} {...sortable.listeners}><GripVertical className="h-4 w-4" /></Button>
        <Link className="group flex min-w-0 flex-1 items-center gap-3" href={`/perfis/${role.id}`}><span className="min-w-0 flex-1"><RoleChip cargo={role} /><span className="block truncate text-xs text-muted-foreground" title={role.descricao}>{role.descricao || "Sem descrição"}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden /></Link>
        <span className="hidden text-xs text-muted-foreground sm:block">{role.usuariosCount} {role.usuariosCount === 1 ? "membro" : "membros"}</span><StatusPill active={role.ativo} />
        {!disabled && <TableAction type="delete" disabled={role.usuariosCount > 0} disabledReason={role.usuariosCount ? "Remova os membros antes de excluir" : undefined} onClick={onDelete} />}
    </li>
}
/* eslint-enable react-hooks/refs */
export function RolesPage() {
    const query = useRoles()
    const mutation = useAccessMutation()
    const router = useRouter()
    const permissions = usePermissions()
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState<string[]>([])
    const reducedMotion = useReducedMotion()
    const roles = query.data?.roles ?? []
    const rows = roles.filter(role => `${role.nome} ${role.descricao}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")) && (!status.length || status.includes(role.ativo ? "ativo" : "inativo")))
    const editable = permissions.can("roles.edit") && permissions.isAdmin
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
    const onDragEnd = (event: DragEndEvent) => {
        if (!event.over || event.active.id === event.over.id || !editable) return
        const movable = roles.filter(role => role.slug !== "admin")
        const from = movable.findIndex(role => role.id === event.active.id)
        const to = movable.findIndex(role => role.id === event.over?.id)
        if (from < 0 || to < 0) return
        mutation.mutate({ path: "/roles/reorder", method: "post", data: { ordem: arrayMove(movable, from, to).map(role => role.id), version: query.data!.hierarchyVersion } })
    }
    return <div className="flex flex-col gap-6">
        <CadastroHeader title="Perfis" description="Permissões, hierarquia e membros dos perfis de acesso" actionLabel={editable ? "Novo Perfil" : undefined} actionIcon={<Plus className="h-4 w-4" />} onAction={() => router.push("/perfis/novo")} />
        <ListFilters total={rows.length} search={{ value: search, onChange: setSearch, placeholder: "Buscar por nome ou descrição", label: "Buscar perfil" }} onClear={() => { setSearch(""); setStatus([]) }}>
            <FilterGroup label="Status" className="min-w-[180px] flex-1"><StatusFilterMultiSelect selected={status} onSelect={setStatus} /></FilterGroup>
        </ListFilters>
        <CadastroTableCard>{query.isPending ? <CadastroTableSkeleton columns={4} rows={6} /> : query.isError ? <ErrorState title="Não foi possível carregar os perfis" onRetry={() => void query.refetch()} /> : !rows.length ? <EmptyState title="Nenhum perfil encontrado." /> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={rows.map(role => role.id)} strategy={verticalListSortingStrategy}><motion.ul initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="divide-y">
            {rows.map(role => <SortableRole key={role.id} role={role} disabled={!editable || role.slug === "admin" || !canManageRole(permissions.roles, role) || !!search || !!status.length || mutation.isPending} onDelete={() => { if (window.confirm(`Excluir o perfil ${role.nome}?`)) mutation.mutate({ path: `/roles/${role.id}`, method: "delete", data: { version: role.version } }) }} />)}
        </motion.ul></SortableContext></DndContext>}</CadastroTableCard>
        <p className="text-xs text-muted-foreground">O topo da lista tem maior hierarquia. Administrador é reservado. Arraste ou use o teclado no controle de ordenação.</p>
    </div>
}
