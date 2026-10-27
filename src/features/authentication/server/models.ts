import mongoose, { Schema, type Connection } from "mongoose"
import { AUTH_SETTINGS_ID } from "../constants"
import type { AuthSettings } from "../schemas"

export interface AuthSettingsRecord extends AuthSettings {
    _id: string
    /** Versão otimista da configuração. */
    version: number
    updatedBy?: string
    createdAt: Date
    updatedAt: Date
}

const settingsSchema = new Schema<AuthSettingsRecord>(
    {
        _id: { type: String, default: AUTH_SETTINGS_ID },
        methods: { type: Schema.Types.Mixed, default: undefined },
        extraHosts: { type: [String], default: [] },
        version: { type: Number, default: 0 },
        updatedBy: String,
    },
    { collection: "auth_settings", timestamps: true, minimize: false },
)

export function authSettingsModels(connection: Connection = mongoose.connection) {
    return {
        settings: (connection.models.AuthSettings as mongoose.Model<AuthSettingsRecord>) || connection.model<AuthSettingsRecord>("AuthSettings", settingsSchema),
    }
}
