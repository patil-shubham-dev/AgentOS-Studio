import { type ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
type ButtonSize = "default" | "small" | "micro"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent-brand)] text-white border-none hover:opacity-85 active:opacity-100",
  secondary:
    "bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] active:border-[var(--border-default)]",
  ghost:
    "bg-transparent border-none text-[var(--text-quaternary)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-secondary)] active:bg-[var(--border-subtle)]",
  danger:
    "bg-transparent border border-red-500/20 text-red-400/80 hover:bg-red-500/8 hover:text-red-400 active:bg-red-500/5",
}

const sizeStyles: Record<ButtonSize, string> = {
  default: "h-8 px-3 text-[12px] font-medium gap-1.5",
  small: "h-6 px-2 text-[11px] font-medium gap-1",
  micro: "h-5 px-1.5 text-[10px] font-medium gap-0.5",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "ghost", size = "default", className, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-lg transition-all duration-100 select-none whitespace-nowrap",
          "active:scale-[0.97]",
          "disabled:opacity-40 disabled:pointer-events-none",
          "font-sans focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-brand)]",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)
Button.displayName = "Button"
