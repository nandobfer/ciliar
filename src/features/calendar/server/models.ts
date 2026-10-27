import mongoose, { Schema, type Connection } from "mongoose"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import type { GoogleConnectionStatus, GoogleLinkKind } from "../constants"

/**
 * Coleções do Calendário (CIL-4). Os eventos do calendário NÃO são guardados: são derivados dos
 * trabalhos, pedidos e horas na leitura. Aqui ficam só a conexão Google de cada dono (tokens cifrados
 * AES-256-GCM, nunca devolvidos), os vínculos evento ↔ item publicados e os estados do OAuth.
 * Índices pela migração `ensure-calendar-indexes` (sem `dbConnect`).
 */

export interface GoogleCalendarRef {
    id: string
    name: string
    color: string | null
}

export interface GoogleChannelRecord {
    id: string
    resourceId: string
    /** SHA-256 do token do canal (o Google devolve o token em `X-Goog-Channel-Token`). */
    tokenHash: string
    calendarId: string
    expiresAt: Date
}

export interface GoogleConnectionRecord {
    /** Dono efetivo (`businessOwnerOf`): na simulação de usuário, o alvo. */
    ownerId: string
    googleEmail: string | null
    scopes: string[]
    refreshTokenBox: EncryptedSecret
    accessTokenBox: EncryptedSecret | null
    accessTokenExpiresAt: Date | null
    publishCalendar: GoogleCalendarRef | null
    readCalendars: GoogleCalendarRef[]
    syncToken: string | null
    channel: GoogleChannelRecord | null
    status: GoogleConnectionStatus
    /** Mensagem sem segredo (exibida na tela). */
    lastError: string | null
    backoffUntil: Date | null
    backoffStep: number
    /** Último fuso do navegador do dono (as rotinas sem requisição usam este). */
    timeZone: string
    lastSyncAt: Date | null
    /** Ator real que conectou (na simulação, o administrador). */
    connectedBy: string
    version: number
    createdAt: Date
    updatedAt: Date
}

const calendarRefSchema = new Schema<GoogleCalendarRef>({ id: String, name: String, color: { type: String, default: null } }, { _id: false })
const channelSchema = new Schema<GoogleChannelRecord>({ id: String, resourceId: String, tokenHash: String, calendarId: String, expiresAt: Date }, { _id: false })

const connectionSchema = new Schema<GoogleConnectionRecord>(
    {
        ownerId: { type: String, required: true },
        googleEmail: { type: String, default: null },
        scopes: { type: [String], default: [] },
        refreshTokenBox: { type: Schema.Types.Mixed, required: true },
        accessTokenBox: { type: Schema.Types.Mixed, default: null },
        accessTokenExpiresAt: { type: Date, default: null },
        publishCalendar: { type: calendarRefSchema, default: null },
        readCalendars: { type: [calendarRefSchema], default: [] },
        syncToken: { type: String, default: null },
        channel: { type: channelSchema, default: null },
        status: { type: String, enum: ["active", "reauth", "choose_calendar", "error"], default: "choose_calendar" },
        lastError: { type: String, default: null },
        backoffUntil: { type: Date, default: null },
        backoffStep: { type: Number, default: 0 },
        timeZone: { type: String, default: "America/Sao_Paulo" },
        lastSyncAt: { type: Date, default: null },
        connectedBy: { type: String, required: true },
        version: { type: Number, default: 0 },
    },
    { collection: "calendar_google_connections", timestamps: true, versionKey: false },
)
connectionSchema.index({ ownerId: 1 }, { unique: true })
connectionSchema.index({ "channel.id": 1 }, { sparse: true })

export interface GoogleLinkRecord {
    ownerId: string
    businessId: string
    kind: GoogleLinkKind
    /** Trabalho (`work-*`) ou pedido (`order-deadline`). */
    refId: string
    calendarId: string | null
    eventId: string | null
    etag: string | null
    /** Hash do título, descrição e datas publicados. */
    pushedHash: string | null
    /** `unlinked`: o evento foi excluído no Google (só volta com "Republicar") ou o item deixou de existir. */
    status: "linked" | "unlinked"
    unlinkedReason: "deleted_in_google" | "item_deleted" | "no_due_date" | null
    /** Fila de publicação: precisa enviar ao Google. */
    dirty: boolean
    attempts: number
    nextAttemptAt: Date | null
    lastError: string | null
    /** O que foi publicado por último (atualiza o título mesmo depois de o item ser excluído). */
    snapshot: GoogleLinkSnapshot | null
    /** Trava curta do processamento (duas execuções simultâneas não criam o evento duas vezes). */
    claimedUntil: Date | null
    createdAt: Date
    updatedAt: Date
}

export interface GoogleLinkSnapshot {
    code: string
    title: string
    businessName: string
    clientName: string | null
    startKey: string | null
    dueDate: string
    statusTag: string | null
    columnName: string | null
    estimatedMinutes: number
    url: string
}

const linkSchema = new Schema<GoogleLinkRecord>(
    {
        ownerId: { type: String, required: true },
        businessId: { type: String, required: true },
        kind: { type: String, enum: ["work-deadline", "work-period", "order-deadline"], required: true },
        refId: { type: String, required: true },
        calendarId: { type: String, default: null },
        eventId: { type: String, default: null },
        etag: { type: String, default: null },
        pushedHash: { type: String, default: null },
        status: { type: String, enum: ["linked", "unlinked"], default: "linked" },
        unlinkedReason: { type: String, default: null },
        dirty: { type: Boolean, default: true },
        attempts: { type: Number, default: 0 },
        nextAttemptAt: { type: Date, default: null },
        lastError: { type: String, default: null },
        snapshot: { type: Schema.Types.Mixed, default: null },
        claimedUntil: { type: Date, default: null },
    },
    { collection: "calendar_google_links", timestamps: true, versionKey: false },
)
linkSchema.index({ ownerId: 1, kind: 1, refId: 1 }, { unique: true })
linkSchema.index({ calendarId: 1, eventId: 1 })
linkSchema.index({ ownerId: 1, dirty: 1, nextAttemptAt: 1 })
linkSchema.index({ businessId: 1 })

export interface GoogleOAuthStateRecord {
    stateHash: string
    realActorId: string
    ownerId: string
    /** Cabeçalho do "Visualizar como" da aba que iniciou (o retorno do Google não traz o cabeçalho). */
    viewAsHeader: string
    codeVerifier: string
    returnTo: string
    timeZone: string
    createdAt: Date
}

const oauthStateSchema = new Schema<GoogleOAuthStateRecord>(
    {
        stateHash: { type: String, required: true },
        realActorId: { type: String, required: true },
        ownerId: { type: String, required: true },
        viewAsHeader: { type: String, default: "none" },
        codeVerifier: { type: String, required: true },
        returnTo: { type: String, default: "/calendario" },
        timeZone: { type: String, default: "America/Sao_Paulo" },
        createdAt: { type: Date, default: () => new Date() },
    },
    { collection: "calendar_oauth_states", versionKey: false },
)
oauthStateSchema.index({ stateHash: 1 }, { unique: true })
oauthStateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 })

function modelOf<T>(connection: Connection, name: string, schema: Schema<T>): mongoose.Model<T> {
    return (connection.models[name] as mongoose.Model<T>) || connection.model<T>(name, schema)
}

export function calendarModels(connection: Connection = mongoose.connection) {
    return {
        connections: modelOf(connection, "CalendarGoogleConnection", connectionSchema),
        links: modelOf(connection, "CalendarGoogleLink", linkSchema),
        oauthStates: modelOf(connection, "CalendarOAuthState", oauthStateSchema),
    }
}
