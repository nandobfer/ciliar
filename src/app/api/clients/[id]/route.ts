import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { deleteClient, getClient, updateClient } from "@/features/orders/server/clients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/clients/[id] — cliente com os pedidos de todos os negócios e os totais por moeda (dono; suporte auditado). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getClient(currentAccess(), params.id)))

/** PATCH /api/clients/[id] — edita (cliente ativo; `version` otimista). */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => ok(await updateClient(currentAccess(), params.id, await req.json().catch(() => null))))

/** DELETE /api/clients/[id] — exclusão definitiva de um arquivado SEM pedidos (irreversível). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => ok(await deleteClient(currentAccess(), params.id)))
