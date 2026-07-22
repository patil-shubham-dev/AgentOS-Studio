import { motion } from "framer-motion"
import { useAchievementStore, type AchievementId } from "@/stores/ui/achievement-store"
import { MICRO } from "@/lib/micro-interactions"
import { DURATION, EASING } from "@/lib/motion"

export function AchievementBadge({ id }: { id: AchievementId }) {
  const achievement = useAchievementStore((s) => s.achievements[id])
  if (!achievement) return null

  const unlocked = !!achievement.unlockedAt

  return (
    <motion.div
      className={`group relative flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        unlocked
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-border/50 bg-muted/20 opacity-50"
      }`}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, ease: EASING.entrance }}
      {...MICRO.hoverLift}
    >
      <motion.span
        className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
        animate={
          unlocked
            ? {
                scale: [1, 1.15, 1],
                rotate: [0, -5, 5, 0],
              }
            : {}
        }
        transition={{ duration: 0.5, delay: 0.2 }}
        style={{
          backgroundColor: unlocked ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.1)",
        }}
      >
        {achievement.icon}
      </motion.span>

      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{achievement.title}</span>
        <span className="text-xs text-muted-foreground">{achievement.description}</span>
      </div>

      {unlocked && (
        <motion.div
          className="flex shrink-0 items-center gap-1.5"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.3 }}
        >
          <span className="text-[10px] font-medium text-emerald-400">Unlocked</span>
          <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </motion.div>
      )}

      {!unlocked && (
        <svg className="h-4 w-4 shrink-0 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      )}
    </motion.div>
  )
}
