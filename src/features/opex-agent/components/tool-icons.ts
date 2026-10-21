import { Brain, Briefcase, CalendarClock, Clock, Compass, Contact, FileText, KeyRound, Paperclip, Plug, ReceiptText, ShieldCheck, SlidersHorizontal, Target, Trophy, Users, Wrench, type LucideIcon } from "lucide-react"
import type { OpexToolGroup } from "../constants"

export const OPEX_TOOL_GROUP_ICONS: Record<OpexToolGroup, LucideIcon> = {
    context: Compass,
    files: Paperclip,
    businesses: Briefcase,
    "business-activities": Clock,
    "business-goals": Target,
    "business-documents": FileText,
    "business-successes": Trophy,
    clients: Contact,
    orders: ReceiptText,
    memories: Brain,
    users: Users,
    roles: ShieldCheck,
    integrations: Plug,
    "api-tokens": KeyRound,
    routines: CalendarClock,
    platform: SlidersHorizontal,
}

export const toolIcon = (group: OpexToolGroup | null): LucideIcon => {
    if (!group) return Wrench
    return OPEX_TOOL_GROUP_ICONS[group] ?? Wrench
}
