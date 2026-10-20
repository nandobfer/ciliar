import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { accessModels } from "@/features/access/server/models"
import { protectRoute } from "@/features/access/server/protect-route"
import { onboardingState } from "@/features/businesses/server/onboarding"

export const GET = protectRoute(async () => {
    const context = currentAccess()
    const user = await accessModels().users.findById(context.userId).orFail()
    // Sem o aceite dos termos o onboarding ainda não vale (o aceite vem antes).
    const onboarding = context.legalAcceptanceRequired ? { required: false, interviewId: null, archived: 0 } : await onboardingState(context)
    return NextResponse.json({ success: true, data: { user: { id: user.id, name: user.name, email: user.email, legalAcceptanceRequired: context.legalAcceptanceRequired, legalVersion: context.legalVersion }, access: context.dto, onboarding } })
})
