import { currentAccess } from "@/features/access/server/context"

export interface LocalUser {
    id: string
    name: string
}

export function getLocalUser(): LocalUser {
    const context = currentAccess()
    return { id: context.userId, name: context.name }
}
