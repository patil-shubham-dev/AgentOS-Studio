import { type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Button } from "./Button"

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: "primary" | "secondary" | "ghost"
  }
  children?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex items-center justify-center h-12 w-12 rounded-xl" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <span className="text-[var(--text-quaternary)]">{icon}</span>
        </div>
      )}

      <h3
        className="text-[13px] font-medium mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h3>

      {description && (
        <p
          className="text-[12px] leading-relaxed max-w-[260px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          {description}
        </p>
      )}

      {action && (
        <Button
          variant={action.variant ?? "secondary"}
          size="small"
          onClick={action.onClick}
          className="mt-4"
        >
          {action.label}
        </Button>
      )}

      {children}
    </div>
  )
}
