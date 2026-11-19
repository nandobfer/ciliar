"use client"

import { useState } from "react"
import { format } from "date-fns"
import { AlertTriangle, CalendarCheck2, Link2, Loader2, LogOut, RefreshCw, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { GOOGLE_CONNECTION_STATUS_LABELS } from "../constants"
import type { GoogleConnectionDto } from "../types"
import { useGoogleCalendars, useGoogleConnect, useGoogleDisconnect, useGoogleRepublish, useGoogleSettings, useGoogleSync } from "../hooks/useCalendar"

/**
 * Google Agenda (opcional): conectar (o mesmo cliente OAuth do login, com a permissão da agenda pedida
 * só aqui; pode ser outra conta Google), escolher a agenda de publicação e as agendas lidas,
 * sincronizar, republicar os excluídos e desconectar (revoga o acesso e apaga os tokens).
 */
export function GoogleCalendarDialog({ open, onOpenChange, connection, returnTo }: { open: boolean; onOpenChange: (open: boolean) => void; connection: GoogleConnectionDto | null; returnTo: string }) {
    const connect = useGoogleConnect()
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Google Agenda</DialogTitle>
                    <DialogDescription>Opcional. O Ciliar publica prazos e períodos dos trabalhos e prazos dos pedidos abertos na agenda escolhida, lê as agendas marcadas e aplica as datas movidas no Google.</DialogDescription>
                </DialogHeader>
                {!connection ? (
                    <Skeleton className="h-24 w-full" />
                ) : !connection.configured && !connection.connected ? (
                    <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">O login com Google não está configurado no servidor (AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET).</p>
                ) : !connection.connected ? (
                    <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground">Você será levado ao Google para permitir o acesso aos eventos das suas agendas. Pode ser outra conta Google, diferente da do login. O calendário funciona sem a conexão.</p>
                        <Button className="gap-1.5" disabled={connect.isPending} onClick={() => connect.mutate(returnTo)}>
                            {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />} Conectar Google Agenda
                        </Button>
                    </div>
                ) : (
                    <ConnectedPanel connection={connection} returnTo={returnTo} />
                )}
            </DialogContent>
        </Dialog>
    )
}

function ConnectedPanel({ connection, returnTo }: { connection: GoogleConnectionDto; returnTo: string }) {
    const connect = useGoogleConnect()
    const disconnect = useGoogleDisconnect()
    const sync = useGoogleSync()
    const republish = useGoogleRepublish()
    const reauth = connection.status === "reauth"
    const [confirming, setConfirming] = useState(false)
    return (
        <div className="space-y-4 text-sm">
            <div className="space-y-1 rounded-md border bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 font-medium">
                    <CalendarCheck2 className={cn("h-4 w-4", connection.status === "active" ? "text-success" : "text-warning")} aria-hidden />
                    {connection.googleEmail ?? "Conta Google"}
                </p>
                <p className={cn("text-xs", connection.status === "active" ? "text-muted-foreground" : "text-warning")} data-testid="google-status">
                    {connection.status ? GOOGLE_CONNECTION_STATUS_LABELS[connection.status] : ""}
                </p>
                {connection.lastSyncAt && <p className="text-xs text-muted-foreground">Última sincronização: {format(new Date(connection.lastSyncAt), "dd/MM/yyyy HH:mm")}</p>}
                {connection.pendingLinks > 0 && <p className="text-xs text-muted-foreground">{connection.pendingLinks} evento(s) aguardando publicação.</p>}
                {connection.backoffUntil && <p className="text-xs text-warning">Cota do Google excedida: nova tentativa às {format(new Date(connection.backoffUntil), "HH:mm")}.</p>}
                {connection.lastError && !reauth && (
                    <p className="flex items-start gap-1 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {connection.lastError}
                    </p>
                )}
            </div>
            {reauth ? (
                <Button className="gap-1.5" disabled={connect.isPending} onClick={() => connect.mutate(returnTo)}>
                    <Link2 className="h-4 w-4" aria-hidden /> Reconectar
                </Button>
            ) : (
                <CalendarsForm connection={connection} />
            )}
            <div className="flex flex-wrap gap-2 border-t pt-3">
                {!reauth && connection.publishCalendarId && (
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={sync.isPending} onClick={() => sync.mutate()}>
                        {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Sincronizar agora
                    </Button>
                )}
                {!reauth && connection.unlinked > 0 && (
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={republish.isPending} onClick={() => republish.mutate({ all: true })}>
                        <RotateCcw className="h-4 w-4" aria-hidden /> Republicar excluídos ({connection.unlinked})
                    </Button>
                )}
                <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-destructive" onClick={() => setConfirming(true)}>
                    <LogOut className="h-4 w-4" aria-hidden /> Desconectar
                </Button>
            </div>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Desconectar o Google Agenda?"
                description="O acesso é revogado e os tokens são apagados. Os eventos já publicados ficam na sua agenda como histórico e deixam de ser atualizados."
                confirmLabel="Desconectar"
                variant="destructive"
                pending={disconnect.isPending}
                onConfirm={() => disconnect.mutate(undefined, { onSettled: () => setConfirming(false) })}
            />
        </div>
    )
}

function CalendarsForm({ connection }: { connection: GoogleConnectionDto }) {
    const calendars = useGoogleCalendars(true)
    const save = useGoogleSettings()
    const [publishId, setPublishId] = useState<string | null>(connection.publishCalendarId)
    const [readIds, setReadIds] = useState<string[]>(connection.readCalendars.map((calendar) => calendar.id))
    if (calendars.isPending) return <Skeleton className="h-32 w-full" />
    if (calendars.isError) return <p className="text-sm text-destructive">{apiErrorMessage(calendars.error, "Não foi possível ler as agendas do Google.")}</p>
    const items = calendars.data ?? []
    const dirty = publishId !== connection.publishCalendarId || JSON.stringify([...readIds].sort()) !== JSON.stringify(connection.readCalendars.map((calendar) => calendar.id).sort())
    return (
        <div className="space-y-3">
            <Field id="google-publish" label="Agenda de publicação">
                <Select value={publishId ?? undefined} onValueChange={setPublishId}>
                    <SelectTrigger id="google-publish" aria-label="Agenda de publicação">
                        <SelectValue placeholder="Escolha a agenda" />
                    </SelectTrigger>
                    <SelectContent>
                        {items
                            .filter((calendar) => calendar.writable)
                            .map((calendar) => (
                                <SelectItem key={calendar.id} value={calendar.id}>
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: calendar.color ?? "#6b7280" }} aria-hidden />
                                        {calendar.name}
                                        {calendar.primary ? " (principal)" : ""}
                                    </span>
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Onde o Ciliar cria os eventos. Trocar recria os eventos na nova agenda; os antigos ficam como histórico.</p>
            </Field>
            <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Agendas que o Ciliar lê</legend>
                <p className="text-xs text-muted-foreground">Aparecem no calendário só para consulta; eventos &quot;ocupado&quot; contam na capacidade (dentro do expediente).</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                    {items.map((calendar) => (
                        <li key={calendar.id}>
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={readIds.includes(calendar.id)} onCheckedChange={(value) => setReadIds((current) => (value === true ? [...current, calendar.id] : current.filter((id) => id !== calendar.id)))} />
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: calendar.color ?? "#6b7280" }} aria-hidden />
                                <span className="truncate">{calendar.name}</span>
                            </label>
                        </li>
                    ))}
                </ul>
            </fieldset>
            <Button size="sm" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => save.mutate({ publishCalendarId: publishId, readCalendarIds: readIds })}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Salvar agendas
            </Button>
        </div>
    )
}
