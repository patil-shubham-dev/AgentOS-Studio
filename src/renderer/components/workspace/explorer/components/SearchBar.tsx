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
    <div className="px-2 py-1.5 border-b border-white/[0.04]">
      <div className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 transition-all duration-100 border",
        focused ? "border-blue-500/40 bg-white/[0.04]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]",
      )}>
        <Search className="h-3 w-3 shrink-0 text-white/25" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { onClear(); inputRef.current?.blur() } }}
          onFocus={() => { setFocused(true); onFocus?.() }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[11px] text-white/70 outline-none placeholder:text-white/20 min-w-0"
        />
        {value && (
          <button onClick={onClear} className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all">
            <X className="h-2.5 w-2.5" />
          </button>
        )}
        <kbd className="text-[8px] font-mono text-white/15 bg-white/[0.04] px-1 rounded shrink-0">^P</kbd>
      </div>
    </div>
  )
}
