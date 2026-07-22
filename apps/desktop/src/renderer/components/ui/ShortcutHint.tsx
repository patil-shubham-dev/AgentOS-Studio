import { cn } from "@/lib/utils"

const SYMBOL_MAP: Record<string, string> = {
  "⌘": "⌘",
  "⇧": "⇧",
  "⌥": "⌥",
  "⌃": "⌃",
  "↵": "↵",
  "⌫": "⌫",
  "⎋": "⎋",
  "␣": "␣",
  "⇥": "⇥",
  "↩": "↩",
}

interface ShortcutHintProps {
  keys: string
  size?: "sm" | "md"
  className?: string
}

export function ShortcutHint({ keys, size = "sm", className }: ShortcutHintProps) {
  const parts = keys.split("+")
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {parts.map((part, i) => {
        const symbol = SYMBOL_MAP[part] ?? part
        return (
          <kbd
            key={i}
            className={cn(
              "inline-flex items-center justify-center font-mono leading-none",
              "rounded border border-white/[0.06] bg-white/[0.04] text-white/30",
              size === "sm" ? "h-3.5 min-w-[14px] px-[3px] text-[8px]" : "h-4 min-w-[16px] px-1 text-[9px]",
            )}
          >
            {symbol}
          </kbd>
        )
      })}
    </span>
  )
}
