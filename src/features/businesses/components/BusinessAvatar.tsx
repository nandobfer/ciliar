"use client"

import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"
import type { BusinessDto } from "../types"

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join("") || "N"

/** Logo do negócio (rota autenticada) ou as iniciais do nome. */
export function BusinessAvatar({ business, className }: { business: Pick<BusinessDto, "name" | "logo">; className?: string }) {
    if (business.logo) {
        // eslint-disable-next-line @next/next/no-img-element -- imagem privada servida pela API autenticada
        return <img src={withBasePath(business.logo.url)} alt="" className={cn("h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-border", className)} />
    }
    return (
        <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/20 text-xs font-semibold text-primary ring-1 ring-primary/40", className)}>
            {initials(business.name)}
        </span>
    )
}
