import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { SkeletonBlock } from "../skeleton-base"

interface EditorSkeletonProps {
  className?: string
  lineCount?: number
}

export function EditorSkeleton({ className, lineCount = 18 }: EditorSkeletonProps) {
  const lineWidths = [70, 85, 60, 90, 45, 75, 55, 95, 40, 80, 65, 50, 88, 72, 58, 82, 48, 78]

  return (
    <div className={cn("flex flex-col h-full bg-white/[0.01]", className)}>
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/[0.04] bg-white/[0.01]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
        </div>
        <SkeletonBlock width={140} height={8} rounded="sm" />
        <SkeletonBlock width={60} height={8} rounded="sm" className="ml-auto" />
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          <div className="w-10 shrink-0 border-r border-white/[0.04] bg-white/[0.01]">
            <div className="pt-2 space-y-[3px]">
              {Array.from({ length: lineCount }, (_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: i * 0.015 }}
                  className="flex items-center justify-end pr-2 h-[18px]"
                >
                  <span
                    className={cn(
                      "text-[10px] font-mono tabular-nums",
                      i === 5 ? "text-white/0.4" : "text-white/[0.15]",
                    )}
                  >
                    {i + 1}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <div className="pt-2 space-y-[3px]">
              {Array.from({ length: lineCount }, (_, i) => {
                const indent = Math.min(Math.floor(i / 3), 4) * 12
                const width = lineWidths[i % lineWidths.length]
                const isCursorLine = i === 5
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15, delay: i * 0.015 }}
                    className={cn(
                      "flex items-center h-[18px]",
                      isCursorLine && "bg-blue-500/[0.04] border-l-2 border-blue-500/30",
                    )}
                    style={{ paddingLeft: `${12 + indent}px` }}
                  >
                    <SkeletonBlock
                      height={7}
                      width={`${width}%`}
                      rounded="sm"
                    />
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-1 border-t border-white/[0.04] bg-white/[0.01]">
        <SkeletonBlock width={100} height={7} rounded="sm" />
        <SkeletonBlock width={120} height={7} rounded="sm" />
        <div className="ml-auto flex items-center gap-1.5">
          <SkeletonBlock width={14} height={14} rounded="sm" />
          <motion.div
            className="w-24 h-[6px] rounded-full bg-white/[0.04] overflow-hidden"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <motion.div
              className="h-full rounded-full bg-white/[0.08]"
              animate={{ width: ["30%", "60%", "30%"] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
