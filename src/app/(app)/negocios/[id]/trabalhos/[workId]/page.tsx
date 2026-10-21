import { WorkDetailPage } from "@/features/works/components/WorkDetailPage"

export default async function TrabalhoPage({ params }: { params: Promise<{ workId: string }> }) {
    const { workId } = await params
    return <WorkDetailPage workId={workId} />
}
