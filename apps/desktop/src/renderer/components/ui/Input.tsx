import { type InputHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={id}
            className="text-[11px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "h-8 rounded-lg border px-2.5 text-[12px] outline-none transition-all duration-200",
            "placeholder:text-[var(--text-quaternary)]",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "font-['Inter']",
            className,
          )}
          style={{
            backgroundColor: "var(--surface-panel)",
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
          }}
          {...props}
        />
      </div>
    )
  },
)
Input.displayName = "Input"

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={id}
            className="text-[11px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={cn(
            "rounded-lg border px-2.5 py-2 text-[12px] outline-none transition-all duration-200 resize-y min-h-[60px]",
            "placeholder:text-[var(--text-quaternary)]",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "font-['Inter']",
            className,
          )}
          style={{
            backgroundColor: "var(--surface-panel)",
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
          }}
          {...props}
        />
      </div>
    )
  },
)
Textarea.displayName = "Textarea"
