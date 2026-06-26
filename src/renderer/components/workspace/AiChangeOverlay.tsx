import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Sparkles, FileCode, Check, X } from "lucide-react"

export interface AIChange {
  filePath: string
  originalContent: string
  newContent: string
  applied: boolean
  rejected: boolean
}

export function AiChangeOverlay({ change, onAccept, onReject, onTimeout }: {
  change: AIChange
  onAccept: () => void
  onReject: () => void
  onTimeout: () => void
}) {
  const [timeLeft, setTimeLeft] = useState(30)

  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeout()
      return
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearInterval(timer)
  }, [timeLeft, onTimeout])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="absolute top-3 right-3 z-50"
    >
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 backdrop-blur-xl p-3 shadow-2xl shadow-blue-500/10 min-w-[220px]">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-[11px] font-medium text-blue-400">AI Suggestion</span>
          <motion.span
            key={timeLeft}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="ml-auto text-[8px] text-white/30 font-mono"
          >
            {timeLeft}s
          </motion.span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/50 mb-2.5">
          <FileCode className="h-3 w-3" />
          <span className="truncate">{change.filePath}</span>
        </div>
        <div className="h-0.5 bg-white/5 rounded-full mb-2.5 overflow-hidden">
          <motion.div
            className="h-full bg-blue-500/40 rounded-full"
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 30, ease: "linear" }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onAccept}
            className="flex items-center gap-1 rounded-lg bg-green-500/20 border border-green-500/30 px-3 py-1.5 text-[10px] font-medium text-green-400 hover:bg-green-500/30 transition-all"
          >
            <Check className="h-3 w-3" />
            Accept
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onReject}
            className="flex items-center gap-1 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-[10px] font-medium text-red-400 hover:bg-red-500/20 transition-all"
          >
            <X className="h-3 w-3" />
            Reject
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
