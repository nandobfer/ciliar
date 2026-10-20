import { RolePage } from "@/features/access/components/RoleEditor"
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <RolePage id={(await params).id} /> }
