import { memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronRight, Brain } from "lucide-react"
import { useTimelineStore } from "../timeline-store"
import { getSpringConfig } from "@/lib/motion"

interface ReasoningBlockProps {
  content: string
  stepId: string
}

export const ReasoningBlock = memo(function ReasoningBlock({ content, stepId }: ReasoningBlockProps) {
  const isCollapsed = useTimelineStore((s) => s.collapsedSections.has(`reasoning-${stepId}`))
  const toggleCollapse = useTimelineStore((s) => s.toggleCollapse)
  const expanded = !isCollapsed

  if (!content) return null

  return (
    <div className="py-1">
      <button
        onClick={() => toggleCollapse(`reasoning-${stepId}`)}
        className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
        <Brain className="h-2.5 w-2.5" />
        <span>{expanded ? "Hide reasoning" : "Show reasoning"}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={getSpringConfig("fast")}
            className="mt-1 ml-4 overflow-hidden"
          >
            <div className="text-[11px] text-white/40 leading-relaxed whitespace-pre-wrap border-l border-white/10 pl-3 py-1">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
