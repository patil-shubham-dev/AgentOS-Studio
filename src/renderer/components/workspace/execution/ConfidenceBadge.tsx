import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface ConfidenceBadgeProps {
  score: number
  category: "high" | "medium" | "low"
  explanations?: string[]
  size?: "sm" | "md" | "lg"
}

const COLORS = {
  high: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", dot: "bg-amber-400" },
  low: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-400" },
}

const LABELS = { high: "High", medium: "Medium", low: "Low" } as const

export function ConfidenceBadge({ score, category, explanations = [], size = "md" }: ConfidenceBadgeProps) {
  const [open, setOpen] = useState(false)
  const c = COLORS[category]
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : size === "lg" ? "w-2.5 h-2.5" : "w-2 h-2"

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} ${c.text} ${c.border} border text-xs font-medium transition-all hover:brightness-110 ${size === "sm" ? "px-1.5 py-0.5" : size === "lg" ? "px-3 py-1.5" : "px-2 py-1"}`}
      >
        <span className={`rounded-full ${c.dot} ${dotSize}`} />
        <span>{score}% {LABELS[category]}</span>
      </button>
      <AnimatePresence>
        {open && explanations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-1.5 left-0 z-50 w-64 rounded-lg border border-white/10 bg-[#1a1a2e] p-3 shadow-xl"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1.5">Why this confidence</div>
            <ul className="space-y-1">
              {explanations.map((e, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-white/70">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
