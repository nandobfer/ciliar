import mongoose, { Schema, type Connection } from "mongoose"
import { PLATFORM_SETTINGS_ID } from "../constants"
import type { PlatformSettings } from "../schemas"

export interface PlatformSettingsRecord extends PlatformSettings {
    _id: string
    /** Versão vigente dos termos/política (0 = nenhuma publicada). */
    legalVersion: number
    /** Versão otimista da configuração. */
    version: number
    updatedBy?: string
    createdAt: Date
    updatedAt: Date
}

const settingsSchema = new Schema<PlatformSettingsRecord>(
    {
        _id: { type: String, default: PLATFORM_SETTINGS_ID },
        defaultRoleId: { type: String, default: null },
        retentionDays: { type: Schema.Types.Mixed, default: undefined },
        documents: { type: Schema.Types.Mixed, default: undefined },
        legalVersion: { type: Number, default: 0 },
        version: { type: Number, default: 0 },
        updatedBy: String,
    },
    { collection: "platform_settings", timestamps: true, minimize: false },
)

export interface LegalVersionRecord {
    version: number
    termsOfUse: string
    privacyPolicy: string
    notes: string
    publishedBy: string
    publishedAt: Date
}

const legalSchema = new Schema<LegalVersionRecord>(
    {
        version: { type: Number, required: true, immutable: true },
        termsOfUse: { type: String, required: true, immutable: true },
        privacyPolicy: { type: String, required: true, immutable: true },
        notes: { type: String, default: "", immutable: true },
        publishedBy: { type: String, required: true, immutable: true },
        publishedAt: { type: Date, required: true, immutable: true },
    },
    { collection: "legal_versions" },
)
legalSchema.index({ version: 1 }, { unique: true })

export function platformModels(connection: Connection = mongoose.connection) {
    return {
        settings: (connection.models.PlatformSettings as mongoose.Model<PlatformSettingsRecord>) || connection.model<PlatformSettingsRecord>("PlatformSettings", settingsSchema),
        legal: (connection.models.LegalVersion as mongoose.Model<LegalVersionRecord>) || connection.model<LegalVersionRecord>("LegalVersion", legalSchema),
    }
}
