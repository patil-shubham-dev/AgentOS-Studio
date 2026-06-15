import { useRef, useCallback, useState, useEffect } from "react"
import { Search, X } from "lucide-react"

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onFocus?: () => void
  placeholder?: string
}

export function SearchBar({
  value,
  onChange,
  onClear,
  onFocus,
  placeholder = "Search files...",
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length !== 1) return
      if (document.activeElement === inputRef.current) return
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement
      )
        return
      inputRef.current?.focus()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value)
    },
    [onChange]
  )

  const handleClear = useCallback(() => {
    onClear()
    inputRef.current?.focus()
  }, [onClear])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        onClear()
        inputRef.current?.blur()
      }
    },
    [onClear]
  )

  return (
    <div className="px-2 py-1.5 border-b border-white/[0.04]">
      <div
        className={cn(
          "flex items-center gap-1 rounded px-2 py-1 transition-colors",
          focused
            ? "bg-white/[0.08] border border-blue-500/40"
            : "bg-white/[0.04] border border-white/[0.06]"
        )}
      >
        <Search className="h-3 w-3 shrink-0 text-white/20" />
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setFocused(true)
            onFocus?.()
          }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[11px] text-white/70 outline-none placeholder-white/20 min-w-0"
        />
        {value && (
          <button
            onClick={handleClear}
            className="text-white/20 hover:text-white/60 transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ")
}
