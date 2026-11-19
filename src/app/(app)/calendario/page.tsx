import { Suspense } from "react"
import { CalendarPage } from "@/features/calendar/components/CalendarPage"

export default function CalendarioPage() {
    return (
        <Suspense>
            <CalendarPage />
        </Suspense>
    )
}
