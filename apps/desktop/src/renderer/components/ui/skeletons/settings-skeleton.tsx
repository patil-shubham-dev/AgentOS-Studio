import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { SkeletonBlock, SkeletonCircle } from "../skeleton-base"

interface SettingsSkeletonProps {
  className?: string
  navItemCount?: number
}

export function SettingsSkeleton({ className, navItemCount = 5 }: SettingsSkeletonProps) {
  return (
    <div className={cn("flex h-full", className)}>
      <div className="w-48 shrink-0 border-r border-white/[0.04] p-3 space-y-1">
        {Array.from({ length: navItemCount }, (_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg"
          >
            <SkeletonBlock width={16} height={16} rounded="sm" />
            <SkeletonBlock height={10} width={`${60 + (i % 3) * 15}%`} rounded="sm" />
            {i === 0 && (
              <motion.div
                className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500/50"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </motion.div>
        ))}

        <div className="border-t border-white/[0.04] my-2" />

        {Array.from({ length: 2 }, (_, i) => (
          <motion.div
            key={`bottom-${i}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: 0.3 + i * 0.04 }}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg"
          >
            <SkeletonBlock width={16} height={16} rounded="sm" />
            <SkeletonBlock height={10} width={`${50 + i * 20}%`} rounded="sm" />
          </motion.div>
        ))}
      </div>

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="space-y-1"
        >
          <SkeletonBlock height={18} width="35%" rounded="md" />
          <SkeletonBlock height={10} width="55%" rounded="sm" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between p-3 rounded-lg border border-white/[0.04]">
            <div className="space-y-1.5">
              <SkeletonBlock height={11} width={140} rounded="sm" />
              <SkeletonBlock height={9} width={200} rounded="sm" />
            </div>
            <SkeletonBlock width={36} height={20} rounded="full" />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-white/[0.04]">
            <div className="space-y-1.5">
              <SkeletonBlock height={11} width={120} rounded="sm" />
              <SkeletonBlock height={9} width={180} rounded="sm" />
            </div>
            <SkeletonBlock width={36} height={20} rounded="full" />
          </div>

          <div className="space-y-2 p-3 rounded-lg border border-white/[0.04]">
            <SkeletonBlock height={11} width={100} rounded="sm" />
            <div className="flex gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <SkeletonBlock
                  key={i}
                  height={28}
                  width={`${25 + i * 8}%`}
                  rounded="md"
                />
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.35 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
            <SkeletonCircle size={48} />
            <div className="space-y-1.5">
              <SkeletonBlock height={12} width={160} rounded="sm" />
              <SkeletonBlock height={9} width={220} rounded="sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-white/[0.04] space-y-2"
              >
                <SkeletonBlock height={10} width={`${50 + (i % 3) * 20}%`} rounded="sm" />
                <SkeletonBlock height={8} width="90%" rounded="sm" />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.5 }}
          className="flex justify-end gap-2 pt-2"
        >
          <SkeletonBlock width={80} height={30} rounded="md" />
          <SkeletonBlock width={100} height={30} rounded="md" />
        </motion.div>
      </div>
    </div>
  )
}
