import mongoose, { Schema, type Connection } from "mongoose"

export type SignupSource = "invite" | "public" | "cli"
export interface LegalAcceptance { version: number; acceptedAt: Date }
export interface UserRecord {
    name: string; email: string; active: boolean; roles: string[];
    sessionVersion: number; accessVersion: number;
    /** `sub` da conta Google vinculada; ausente enquanto o convite estiver pendente. Nunca sai do servidor. */
    googleSub?: string | null; signupSource?: SignupSource; lastLoginAt?: Date | null;
    legalAcceptance?: LegalAcceptance | null; createdAt: Date; updatedAt: Date;
}
const userSchema = new Schema<UserRecord>({
    name: { type: String, required: true }, email: { type: String, required: true },
    active: { type: Boolean, default: true },
    roles: { type: [String], default: [], index: true }, sessionVersion: { type: Number, default: 0 },
    accessVersion: { type: Number, default: 0 },
    googleSub: { type: String, select: false }, signupSource: { type: String, enum: ["invite", "public", "cli"], default: "invite" },
    lastLoginAt: { type: Date, default: null },
    legalAcceptance: { type: new Schema<LegalAcceptance>({ version: { type: Number, required: true }, acceptedAt: { type: Date, required: true } }, { _id: false }), default: null },
}, { collection: "users", timestamps: true })
userSchema.index({ email: 1 }, { unique: true })
userSchema.index({ googleSub: 1 }, { unique: true, partialFilterExpression: { googleSub: { $type: "string" } } })
export interface RoleRecord {
    slug: string; nome: string; descricao: string; cor: string; permissoes: string[]; ativo: boolean;
    version: number; createdBy?: string; updatedBy?: string; createdAt: Date; updatedAt: Date;
}
const roleSchema = new Schema<RoleRecord>({
    slug: { type: String, required: true, immutable: true }, nome: { type: String, required: true },
    descricao: { type: String, default: "" }, cor: { type: String, default: "roxo" },
    permissoes: { type: [String], default: [] }, ativo: { type: Boolean, default: true },
    version: { type: Number, default: 0 }, createdBy: String, updatedBy: String,
}, { collection: "roles", timestamps: true })
roleSchema.index({ slug: 1 }, { unique: true })
interface StateRecord { _id: string; ordem: string[]; version: number; fence: number }
const stateSchema = new Schema<StateRecord>({ _id: String, ordem: [String], version: { type: Number, default: 0 }, fence: { type: Number, default: 0 } }, { collection: "role_hierarchy" })
interface AuditRecord { actorId: string; action: string; targetId: string; before?: unknown; after?: unknown; simulation?: unknown; createdAt: Date }
const auditSchema = new Schema<AuditRecord>({ actorId: String, action: String, targetId: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed, simulation: Schema.Types.Mixed }, { collection: "access_audit", timestamps: { createdAt: true, updatedAt: false } })
auditSchema.index({ targetId: 1, createdAt: -1 })

export function accessModels(connection: Connection = mongoose.connection) {
    return {
        users: connection.models.CiliarUser as mongoose.Model<UserRecord> || connection.model<UserRecord>("CiliarUser", userSchema),
        roles: connection.models.AccessRole as mongoose.Model<RoleRecord> || connection.model<RoleRecord>("AccessRole", roleSchema),
        states: connection.models.AccessState as mongoose.Model<StateRecord> || connection.model<StateRecord>("AccessState", stateSchema),
        audits: connection.models.AccessAudit as mongoose.Model<AuditRecord> || connection.model<AuditRecord>("AccessAudit", auditSchema),
    }
}
