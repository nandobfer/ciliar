import { ClientDetailPage } from "@/features/orders/components/ClientDetailPage"

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <ClientDetailPage id={id} />
}
