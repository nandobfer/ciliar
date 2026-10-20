import { Briefcase, CalendarClock, Compass, KeyRound, Paperclip, Plug, ShieldCheck, SlidersHorizontal, Users, Wrench, type LucideIcon } from "lucide-react"
import type { OpexToolGroup } from "../constants"

export const OPEX_TOOL_GROUP_ICONS: Record<OpexToolGroup, LucideIcon> = {
    context: Compass,
    files: Paperclip,
    businesses: Briefcase,
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
