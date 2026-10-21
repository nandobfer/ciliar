import type { ReactNode } from "react"
import { BusinessSpaceLayout } from "@/features/businesses/components/space/BusinessSpaceLayout"

export default async function NegocioLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
    const { id } = await params
    return <BusinessSpaceLayout id={id}>{children}</BusinessSpaceLayout>
}
