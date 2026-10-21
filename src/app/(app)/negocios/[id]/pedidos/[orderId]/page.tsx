import { OrderDetailPage } from "@/features/orders/components/OrderPage"

export default async function PedidoPage({ params }: { params: Promise<{ orderId: string }> }) {
    const { orderId } = await params
    return <OrderDetailPage orderId={orderId} />
}
