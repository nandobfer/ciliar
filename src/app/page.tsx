import type { Metadata } from "next"
import { auth } from "@/auth"
import { LandingPage } from "@/features/landing/components/LandingPage"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Ciliar · Gestão para prestadores de serviço",
    description: "Organize negócios, clientes, pedidos, trabalhos e horas. Um agente de IA cria a ficha do seu negócio em uma conversa.",
}

/** Landing pública. Só consulta se há sessão para escolher o CTA; o painel continua protegido pelo shell. */
export default async function HomePage() {
    const session = await auth()
    return <LandingPage authenticated={!!session?.user?.id} />
}
