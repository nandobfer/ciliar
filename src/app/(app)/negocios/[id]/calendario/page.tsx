import { Suspense } from "react"
import { BusinessCalendarPage } from "@/features/calendar/components/BusinessCalendarPage"

export default function NegocioCalendarioPage() {
    return (
        <Suspense>
            <BusinessCalendarPage />
        </Suspense>
    )
}
