import { memo, useState } from "react"
import { motion } from "framer-motion"

const COLLAPSE_THRESHOLD = 280

interface UserPillProps {
  content: string
  timestamp: number
}

export const UserPill = memo(function UserPill({ content, timestamp }: UserPillProps) {
  const [collapsed, setCollapsed] = useState(true)
  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const isLong = content.length > COLLAPSE_THRESHOLD
  const displayText = collapsed && isLong ? content.slice(0, COLLAPSE_THRESHOLD) + "…" : content

  return (
    <motion.div
      initial={{ opacity: 0, x: 8, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.7 }}
      className="flex justify-end px-1 mb-2"
    >
      <div className="max-w-[70%]">
        <div className="rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm"
          style={{ backgroundColor: "var(--color-accent-brand-muted)", border: "1px solid var(--color-accent-brand-border)" }}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{ color: "var(--text-primary)" }}
          >
            {displayText}
          </p>
          {isLong && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-[9px] font-medium mt-1 transition-colors"
              style={{ color: "var(--text-tertiary)" }}
            >
              {collapsed ? "Show more" : "Show less"}
            </button>
          )}
        </div>
        <div className="text-[8px] text-right mt-0.5 mr-1"
          style={{ color: "var(--text-quaternary)" }}
        >
          {timeStr}
        </div>
      </div>
    </motion.div>
  )
})
