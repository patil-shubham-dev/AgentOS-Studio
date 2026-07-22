import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { SkeletonBlock } from "../skeleton-base"

interface DiffSkeletonProps {
  className?: string
  lineCount?: number
}

export function DiffSkeleton({ className, lineCount = 12 }: DiffSkeletonProps) {
  return (
    <div className={cn("flex h-full", className)}>
      <div className="flex-1 border-r border-white/[0.04]">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04]">
          <SkeletonBlock width={60} height={10} rounded="sm" />
          <SkeletonBlock width={40} height={10} rounded="sm" className="ml-auto" />
        </div>
        <div className="p-2 space-y-[3px]">
          {Array.from({ length: lineCount }, (_, i) => {
            const isRemoved = i < lineCount * 0.4
            const indent = (i % 4) * 8
            const width = `${50 + ((i * 17) % 40)}%`
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-[2px]",
                  isRemoved && "bg-red-500/5",
                )}
                style={{ paddingLeft: `${8 + indent}px` }}
              >
                <span className="w-5 text-[10px] text-white/[0.15] shrink-0 font-mono">
                  {i + 1}
                </span>
                <SkeletonBlock
                  height={8}
                  width={width}
                  rounded="sm"
                  className={cn(isRemoved && "bg-red-500/10")}
                />
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04]">
          <SkeletonBlock width={60} height={10} rounded="sm" />
          <SkeletonBlock width={40} height={10} rounded="sm" className="ml-auto" />
        </div>
        <div className="p-2 space-y-[3px]">
          {Array.from({ length: lineCount }, (_, i) => {
            const isAdded = i >= lineCount * 0.3 && i < lineCount * 0.7
            const indent = ((i + 2) % 4) * 8
            const width = `${40 + ((i * 13) % 45)}%`
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-[2px]",
                  isAdded && "bg-green-500/5",
                )}
                style={{ paddingLeft: `${8 + indent}px` }}
              >
                <span className="w-5 text-[10px] text-white/[0.15] shrink-0 font-mono">
                  {i + 1}
                </span>
                <SkeletonBlock
                  height={8}
                  width={width}
                  rounded="sm"
                  className={cn(isAdded && "bg-green-500/10")}
                />
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
