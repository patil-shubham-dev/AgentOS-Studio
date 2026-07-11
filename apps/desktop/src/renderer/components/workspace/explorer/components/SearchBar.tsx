import { useRef, useState, useEffect } from "react"
import { Search, X } from "lucide-react"

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ")
}

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onFocus?: () => void
  placeholder?: string
}

export function SearchBar({ value, onChange, onClear, onFocus, placeholder = "Search files..." }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && !e.shiftKey) {
        const active = document.activeElement?.tagName
        if (active !== "INPUT" && active !== "TEXTAREA") {
          e.preventDefault()
          inputRef.current?.focus()
        }
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length !== 1 || document.activeElement === inputRef.current) return
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement
      ) return
      inputRef.current?.focus()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)", padding: "6px 8px" }}>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 transition-all duration-100 border",
        )}
        style={{
          border: focused ? "1px solid var(--color-accent-brand)" : "1px solid var(--border-default)",
          background: focused ? "var(--border-default)" : "var(--border-subtle)",
        }}
      >
        <Search className="h-3 w-3 shrink-0" style={{ color: "var(--text-quaternary)" }} />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { onClear(); inputRef.current?.blur() } }}
          onFocus={() => { setFocused(true); onFocus?.() }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[11px] outline-none min-w-0"
          style={{ color: "var(--text-primary)", outline: "none" }}
        />
        {value && (
          <button
            onClick={onClear}
            className="rounded p-0.5 transition-all"
            style={{ color: "var(--text-quaternary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--border-default)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-quaternary)"; e.currentTarget.style.background = "transparent" }}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}
        <kbd className="text-[8px] font-mono px-1 rounded shrink-0"
          style={{ color: "var(--text-quaternary)", background: "var(--border-subtle)" }}>^P</kbd>
      </div>
    </div>
  )
}
