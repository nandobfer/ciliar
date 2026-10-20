import type { Metadata } from "next"
import { dbConnect } from "@/lib/db"
import { PublicLegalPage } from "@/features/platform/components/PublicLegalPage"
import { getCurrentLegal } from "@/features/platform/server/legal"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Política de privacidade · Ciliar" }

export default async function PrivacidadePage() {
    await dbConnect()
    return <PublicLegalPage title="Política de privacidade" legal={await getCurrentLegal()} pick="privacyPolicy" />
}
