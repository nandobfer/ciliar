import { NextResponse } from "next/server"
import { protectRoute } from "@/features/access/server/protect-route"
import { smtpConfigured } from "@/features/access/server/invite"

/** GET /api/users/invite — o convite por e-mail está disponível (SMTP configurado)? */
export const GET = protectRoute(async () => NextResponse.json({ success: true, data: { smtpConfigured: await smtpConfigured() } }))
