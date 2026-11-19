"use client"

import { useBusinessSpace } from "@/features/businesses/components/space/BusinessSpaceLayout"
import { CalendarPage } from "./CalendarPage"

/** Calendário dentro do espaço do negócio (filtrado por ele; a capacidade considera todos os negócios). */
export function BusinessCalendarPage() {
    const { business, editable } = useBusinessSpace()
    return <CalendarPage businessId={business.id} editable={editable} />
}
