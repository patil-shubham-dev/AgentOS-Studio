import { memo, useCallback } from "react"
import { motion } from "framer-motion"
import { useTimelineStore, type ViewMode } from "../timeline/timeline-store"
import { cn } from "@/lib/utils"

const modes: { value: ViewMode; label: string; shortcut: string }[] = [
  { value: "summary", label: "Summary", shortcut: "⌘1" },
  { value: "normal", label: "Normal", shortcut: "⌘2" },
  { value: "verbose", label: "Verbose", shortcut: "⌘3" },
]

export const ViewModeToggle = memo(function ViewModeToggle() {
  const viewMode = useTimelineStore((s) => s.viewMode)
  const setViewMode = useTimelineStore((s) => s.setViewMode)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const idx = [49, 50, 51].indexOf(e.keyCode)
    if (idx >= 0 && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      setViewMode(modes[idx].value)
    }
  }, [setViewMode])

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg p-0.5 select-none"
      style={{ backgroundColor: "var(--border-subtle)" }}
      onKeyDown={handleKeyDown}
      role="radiogroup"
      aria-label="Chat view mode"
    >
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => setViewMode(mode.value)}
          className={cn(
            "relative px-2.5 py-1 text-[10px] font-medium rounded-md transition-all",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
          )}
          style={{
            color: viewMode === mode.value ? "var(--text-primary)" : "var(--text-quaternary)",
          }}
          role="radio"
          aria-checked={viewMode === mode.value}
          title={`${mode.label} (${mode.shortcut})`}
        >
          {viewMode === mode.value && (
            <motion.div
              layoutId="viewModePill"
              className="absolute inset-0 rounded-md"
              style={{ backgroundColor: "var(--surface-elevated)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">{mode.label}</span>
        </button>
      ))}
    </div>
  )
})
