import type { Metadata } from "next"
import { dbConnect } from "@/lib/db"
import { PublicLegalPage } from "@/features/platform/components/PublicLegalPage"
import { getCurrentLegal } from "@/features/platform/server/legal"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Termos de uso · Ciliar" }

export default async function TermosPage() {
    await dbConnect()
    return <PublicLegalPage title="Termos de uso" legal={await getCurrentLegal()} pick="termsOfUse" />
}
