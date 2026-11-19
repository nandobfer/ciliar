import { BadgeCheck, Bot, Briefcase, CalendarClock, FileText, Globe, KanbanSquare, LayoutDashboard, Lock, MessageSquareText, Receipt, ShieldCheck, Sparkles, Target, Users, Wallet, type LucideIcon } from "lucide-react"
import { HOME_HREF } from "@/features/layout/navigation"

/** Conteúdo da landing pública (`/`): somente o que está implementado ou definido em `docs/`. */

export const LANDING_SECTIONS = {
    steps: "como-funciona",
    features: "recursos",
    security: "seguranca",
    plans: "planos",
} as const

export const LANDING_NAV: readonly { id: string; label: string }[] = [
    { id: LANDING_SECTIONS.steps, label: "Como funciona" },
    { id: LANDING_SECTIONS.features, label: "Recursos" },
    { id: LANDING_SECTIONS.security, label: "Segurança" },
    { id: LANDING_SECTIONS.plans, label: "Planos" },
]

export interface LandingCta {
    label: string
    href: string
}

/** CTA principal: visitante testa grátis (login/cadastro com Google); quem tem sessão vai ao painel. */
export function landingCta(authenticated: boolean): LandingCta {
    return authenticated ? { label: "Ir para o painel", href: HOME_HREF } : { label: "Testar grátis", href: "/login" }
}

export const LANDING_HERO = {
    eyebrow: "Para freelancers e pequenos negócios de serviço",
    title: "Seu negócio de serviços, do pedido ao pagamento, em um só lugar",
    subtitle:
        "O Ciliar organiza seus negócios, clientes, pedidos, trabalhos e horas. Comece com uma conversa: um agente de IA monta a ficha do seu negócio para você.",
    secondary: "Ver como funciona",
} as const

export interface LandingStep {
    title: string
    description: string
    icon: LucideIcon
}

export const LANDING_STEPS: readonly LandingStep[] = [
    { title: "Entre com Google", description: "Sem senha para lembrar: sua conta é criada no primeiro acesso.", icon: BadgeCheck },
    { title: "Converse com o Entrevistador", description: "Um agente de IA faz uma pergunta por vez e coleta os dados do seu negócio.", icon: MessageSquareText },
    { title: "Seu negócio é criado", description: "Ao fim da conversa a ficha está pronta. Tudo pode ser ajustado depois.", icon: Briefcase },
    { title: "Organize o espaço", description: "Atividades com valor por hora, metas, documentos e seus cases de sucesso.", icon: LayoutDashboard },
    { title: "Envie orçamentos", description: "Monte o pedido e mande um link para o cliente aceitar ou recusar.", icon: Receipt },
    { title: "Execute e receba", description: "Acompanhe no Kanban, aponte horas e veja o faturamento chegar às metas.", icon: KanbanSquare },
]

export interface LandingFeature {
    title: string
    description: string
    icon: LucideIcon
}

export const LANDING_FEATURES: readonly LandingFeature[] = [
    { title: "Vários negócios por conta", description: "Cada negócio com sua ficha, moeda, cores e espaço próprio. Troque de um para outro em um clique.", icon: Briefcase },
    { title: "Espaço do negócio", description: "Ficha completa, atividades com valor por hora e histórico de preço, documentos e sucessos.", icon: LayoutDashboard },
    { title: "Metas de faturamento", description: "Metas por mês, por ano ou de valor médio por hora, com o progresso calculado pelo que você recebeu.", icon: Target },
    { title: "Clientes e pedidos", description: "Clientes compartilhados entre seus negócios e pedidos com itens, horas estimadas, prazo e valor.", icon: Users },
    { title: "Orçamento por link", description: "O cliente abre o link sem login, vê os itens e o histórico de alterações e aceita ou recusa.", icon: Receipt },
    { title: "Kanban de trabalhos", description: "Abertura, Execução, Validação e Pago, com suas próprias etapas no meio do caminho.", icon: KanbanSquare },
    { title: "Horas e prazos", description: "Apontamento de horas por atividade e alertas de \"vence em X dias\" e \"atrasado\".", icon: CalendarClock },
    { title: "Portfólio público", description: "Uma página para mostrar serviços, sucessos e trabalhos, com o tema do seu negócio.", icon: Globe },
    { title: "Assistente com IA", description: "Peça em linguagem natural e o assistente executa por você, sempre com as suas permissões.", icon: Bot },
    { title: "Moeda por negócio", description: "Real, dólar, euro: cada negócio fatura e acompanha metas na sua moeda.", icon: Wallet },
]

export const LANDING_SECURITY: readonly LandingFeature[] = [
    { title: "Login só com Google", description: "Sem senhas guardadas no Ciliar; e-mail verificado pelo Google.", icon: ShieldCheck },
    { title: "Seus dados são seus", description: "Cada negócio pertence a um único dono e só ele acessa.", icon: Lock },
    { title: "Termos e LGPD", description: "Termos de uso e política de privacidade versionados, com aceite registrado.", icon: FileText },
]

/** Prévia ilustrativa da entrevista (M1): roteiro padrão e diálogo de exemplo. */
export const INTERVIEW_PREVIEW = {
    messages: [
        { from: "agent", text: "Olá! Vou montar a ficha do seu negócio. Tudo poderá ser alterado depois. Qual é o nome do seu negócio?" },
        { from: "user", text: "Estúdio Aurora" },
        { from: "agent", text: "Ótimo! Você atua como pessoa física (PF) ou jurídica (PJ)?" },
        { from: "user", text: "PJ, sou MEI." },
        { from: "agent", text: "Perfeito. Em qual área ou segmento você trabalha?" },
    ],
    questions: [
        { label: "Nome do negócio", value: "Estúdio Aurora", status: "answered" },
        { label: "Tipo", value: "PJ · MEI", status: "answered" },
        { label: "Área/segmento", value: null, status: "current" },
        { label: "Logo/foto", value: null, status: "pending" },
        { label: "Site e redes sociais", value: null, status: "pending" },
        { label: "Disponibilidade", value: null, status: "pending" },
        { label: "Metas iniciais", value: null, status: "pending" },
    ],
} as const satisfies {
    messages: readonly { from: "agent" | "user"; text: string }[]
    questions: readonly { label: string; value: string | null; status: "answered" | "current" | "pending" }[]
}

export const LANDING_PLANS = {
    title: "Planos",
    badge: "Em desenvolvimento",
    description: "Estamos preparando planos para cada momento do seu negócio. Por enquanto, entre e teste o Ciliar.",
    placeholders: ["Para começar", "Para crescer", "Para escalar"],
} as const

export const LANDING_FINAL_CTA = {
    title: "Pronto para organizar seu negócio?",
    description: "Entre com Google, converse com o Entrevistador e tenha seu negócio pronto ao fim da conversa.",
    icon: Sparkles,
} as const
