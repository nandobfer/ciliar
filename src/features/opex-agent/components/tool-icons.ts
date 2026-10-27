import { BookOpen, Brain, Briefcase, CalendarClock, Clock, Columns3, Compass, Contact, FileText, GalleryHorizontalEnd, Globe, Hammer, KeyRound, MessageSquare, Paperclip, Plug, ReceiptText, ShieldCheck, SlidersHorizontal, Target, Timer, Trophy, Users, Wrench, type LucideIcon } from "lucide-react"
import type { OpexToolGroup } from "../constants"

export const OPEX_TOOL_GROUP_ICONS: Record<OpexToolGroup, LucideIcon> = {
    context: Compass,
    files: Paperclip,
    docs: BookOpen,
    businesses: Briefcase,
    "business-activities": Clock,
    "business-goals": Target,
    "business-documents": FileText,
    "business-successes": Trophy,
    clients: Contact,
    orders: ReceiptText,
    "work-columns": Columns3,
    works: Hammer,
    "work-time": Timer,
    "work-notes": MessageSquare,
    portfolio: Globe,
    "portfolio-items": GalleryHorizontalEnd,
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
