import { memo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useTimelineStore } from "../timeline/timeline-store"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
  id: string
  label: string
  count?: number
  children: React.ReactNode
  defaultCollapsed?: boolean
}

export const CollapsibleSection = memo(function CollapsibleSection({
  id, label, count, children, defaultCollapsed,
}: CollapsibleSectionProps) {
  const collapsed = useTimelineStore((s) => s.collapsedSections.has(id))
  const toggleCollapse = useTimelineStore((s) => s.toggleCollapse)

  const handleToggle = useCallback(() => toggleCollapse(id), [id, toggleCollapse])

  const isCollapsed = collapsed ?? defaultCollapsed ?? false

  return (
    <div className="space-y-1">
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors hover:bg-white/[0.03]"
        style={{ color: "var(--text-tertiary)" }}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )}
        <span>{label}</span>
        {count != null && (
          <span className="ml-auto text-[8px] font-mono tabular-nums" style={{ color: "var(--text-quaternary)" }}>
            {count}
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
