import { BusinessSpacePlaceholder } from "@/features/businesses/components/BusinessSpacePlaceholder"

export default async function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <BusinessSpacePlaceholder id={id} />
}
