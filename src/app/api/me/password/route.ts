import { NextResponse } from "next/server"
import { DomainError } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import { currentAccess } from "@/features/access/server/context"
import { accessModels } from "@/features/access/server/models"
import { parseInput } from "@/features/access/server/commands"
import { changePasswordSchema } from "@/features/access/schemas"
import { protectRoute } from "@/features/access/server/protect-route"
import { hashPassword, verifyPassword } from "@/features/auth/server/password"
import { checkRateLimit } from "@/features/auth/server/rate-limit"

export const POST = protectRoute(async request => {
    const context = currentAccess()
    checkRateLimit(`password:${context.userId}`)
    const data = parseInput(changePasswordSchema, await request.json().catch(() => null))
    const { users } = accessModels()
    const user = await users.findById(context.userId).select("+passwordHash").orFail()
    if (!await verifyPassword(user.passwordHash, data.currentPassword)) throw new DomainError(400, "Senha atual incorreta")
    if (await verifyPassword(user.passwordHash, data.newPassword)) throw new DomainError(400, "A nova senha deve ser diferente da atual")
    const changed = await users.updateOne({ _id: user._id, active: true, sessionVersion: context.sessionVersion, passwordHash: user.passwordHash }, {
        $set: { passwordHash: await hashPassword(data.newPassword), mustChangePassword: false }, $inc: { sessionVersion: 1 },
    })
    if (!changed.modifiedCount) throw new DomainError(409, "Sua conta foi alterada. Entre novamente")
    logger.info({ action: "auth.password-changed", actorId: context.userId }, "Senha alterada e sessões revogadas")
    return NextResponse.json({ success: true, data: { changed: true } })
})
