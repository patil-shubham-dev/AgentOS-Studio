import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface CardProps {
  children: ReactNode
  className?: string
  padding?: "none" | "sm" | "md" | "lg"
  variant?: "default" | "inset" | "hover"
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
}

export function Card({
  children,
  className,
  padding = "md",
  variant = "default",
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden",
        variant === "inset" && "border-transparent bg-[var(--surface-elevated)]",
        variant === "hover" && "transition-all duration-150 hover:border-[var(--color-accent-brand-border)] hover:shadow-[0_0_12px_var(--color-accent-brand-border)]",
        paddingStyles[padding],
        className,
      )}
      style={{
        backgroundColor: variant === "default" ? "var(--surface-panel)" : undefined,
        borderColor: variant === "default" ? "var(--border-default)" : undefined,
      }}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-3", className)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        {description && (
          <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

interface CardContentProps {
  children: ReactNode
  className?: string
}

export function CardContent({ children, className }: CardContentProps) {
  return (
    <div className={cn("text-[12px] leading-relaxed", className)} style={{ color: "var(--text-secondary)" }}>
      {children}
    </div>
  )
}

interface CardFooterProps {
  children: ReactNode
  className?: string
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn("flex items-center gap-2 pt-3 mt-3", className)}
      style={{ borderTop: "1px solid var(--border-default)" }}
    >
      {children}
    </div>
  )
}
