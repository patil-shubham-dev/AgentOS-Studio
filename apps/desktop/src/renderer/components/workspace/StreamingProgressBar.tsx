import { motion } from "framer-motion"

interface StreamingProgressBarProps {
  active: boolean
  progress: number
}

export function StreamingProgressBar({ active, progress }: StreamingProgressBarProps) {
  return (
    <div className="relative shrink-0">
      <div className="h-[2px] bg-[var(--border-subtle)]">
        {active && (
          <motion.div
            className="relative h-full rounded-full overflow-hidden"
            initial={{ width: "0%" }}
            animate={{ width: `${Math.round(progress * 100)}%` }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-accent-green)]/80 via-[var(--color-accent-green)]/60 to-[var(--color-accent-green)]/80" />
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        )}
      </div>
    </div>
  )
}
