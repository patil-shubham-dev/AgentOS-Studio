import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { SkeletonBlock, SkeletonCircle } from "../skeleton-base"

interface ComposerSkeletonProps {
  className?: string
}

export function ComposerSkeleton({ className }: ComposerSkeletonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("px-3 py-2 border-t border-white/[0.04]", className)}
    >
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] overflow-hidden">
        <div className="p-3 space-y-2">
          <div className="space-y-1.5">
            <SkeletonBlock height={9} width="92%" rounded="sm" />
            <SkeletonBlock height={9} width="75%" rounded="sm" />
          </div>

          <motion.div
            className="flex items-center gap-1.5 pt-1.5 border-t border-white/[0.04]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonBlock
                key={i}
                width={26}
                height={26}
                rounded="md"
                className="shrink-0"
              />
            ))}

            <div className="ml-auto flex items-center gap-1.5">
              <SkeletonBlock width={40} height={9} rounded="sm" />
              <SkeletonBlock width={28} height={28} rounded="md" className="shrink-0" />
            </div>
          </motion.div>
        </div>
      </div>

      <motion.div
        className="flex items-center gap-2 px-1 pt-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        <SkeletonBlock width={14} height={14} rounded="sm" />
        <SkeletonBlock height={8} width={180} rounded="sm" />
        <SkeletonCircle size={16} className="ml-auto" />
        <SkeletonBlock width={60} height={8} rounded="sm" />
      </motion.div>
    </motion.div>
  )
}
