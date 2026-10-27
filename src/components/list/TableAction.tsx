"use client"

import { Bug, Eye, Link2, Pencil, Plus, PlugZap, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type TableActionType = "edit" | "create" | "delete" | "visualize" | "test" | "debug" | "link"

interface TableActionProps {
  type: TableActionType
  onClick: () => void
  disabled?: boolean
  disabledReason?: string
}

const ACTION_CONFIG: Record<
  TableActionType,
  {
    icon: typeof Pencil
    title: string
    className: string
  }
> = {
  edit: {
    icon: Pencil,
    title: "Editar",
    className: "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-600/10",
  },
  create: {
    icon: Plus,
    title: "Criar",
    className: "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-600/10",
  },
  delete: {
    icon: Trash2,
    title: "Excluir",
    className: "text-destructive hover:text-destructive hover:bg-destructive/10",
  },
  visualize: {
    icon: Eye,
    title: "Visualizar",
    className: "text-blue-600 hover:text-blue-700 hover:bg-blue-600/10",
  },
  test: {
    icon: PlugZap,
    title: "Testar conexão",
    className: "text-sky-600 hover:text-sky-700 hover:bg-sky-600/10",
  },
  debug: {
    icon: Bug,
    title: "Debug",
    className: "text-amber-600 hover:text-amber-700 hover:bg-amber-600/10",
  },
  link: {
    icon: Link2,
    title: "Vincular",
    className: "text-violet-600 hover:text-violet-700 hover:bg-violet-600/10",
  },
}

export function TableAction({ type, onClick, disabled = false, disabledReason }: TableActionProps) {
  const { icon: Icon, title, className } = ACTION_CONFIG[type]

  const action = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={disabledReason ?? title}
      aria-label={title}
      className={cn(
        "h-9 w-9 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )

  if (!disabled || !disabledReason) return action

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" tabIndex={0} aria-label={disabledReason}>
            {action}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{disabledReason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
