"use client"

import { useAppSession } from "@/features/access/components/AccessProvider"
import { useWorksRealtime } from "../hooks/useWorks"

/** Montado na casca: invalida trabalhos/quadros quando algo muda (inclusive o aceite pelo link). */
export function WorksRealtime() {
    const { session } = useAppSession()
    useWorksRealtime(session?.user.id ?? null, !session?.access.simulation)
    return null
}
