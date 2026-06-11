import { memo } from "react"
import { motion } from "framer-motion"

interface UserPillProps {
  content: string
  timestamp: number
}

export const UserPill = memo(function UserPill({ content, timestamp }: UserPillProps) {
  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  return (
    <motion.div
      initial={{ opacity: 0, x: 12, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 350, damping: 26, mass: 0.8 }}
      className="flex justify-end px-1 mb-1"
    >
      <div className="max-w-[65%]">
        <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-blue-500/[0.1] to-blue-500/[0.06] border border-blue-500/10 px-3.5 py-2">
          <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </p>
        </div>
        <div className="text-[8px] text-white/15 text-right mt-0.5 mr-0.5">
          {timeStr}
        </div>
      </div>
    </motion.div>
  )
})
