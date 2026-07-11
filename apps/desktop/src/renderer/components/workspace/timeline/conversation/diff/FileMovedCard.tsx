import { memo, useMemo } from "react"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"

interface FileMovedCardProps {
  oldPath: string
  newPath: string
  onOpenInEditor?: (path: string) => void
}

export const FileMovedCard = memo(function FileMovedCard({
  oldPath,
  newPath,
  onOpenInEditor,
}: FileMovedCardProps) {
  const oldName = oldPath.split("/").pop() || oldPath
  const newName = newPath.split("/").pop() || newPath

  return (
    <motion.div
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      className="group py-1"
    >
      <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.02] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-blue-500/[0.04] border-b border-blue-500/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-blue-300/80 flex-shrink-0">
              Moved
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-mono text-white/50 line-through truncate max-w-[150px]">
                {oldName}
              </span>
              <ArrowRight className="h-3 w-3 text-white/30 flex-shrink-0" />
              <span className="text-xs font-mono text-white/70 truncate max-w-[150px]">
                {newName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onOpenInEditor && (
              <button
                onClick={() => onOpenInEditor(newPath)}
                className="text-[9px] text-white/30 hover:text-white/60 px-1.5 py-0.5 rounded hover:bg-white/[0.06] transition-all"
              >
                Open
              </button>
            )}
          </div>
        </div>

        <div className="px-4 py-2 flex flex-col gap-0.5">
          <p className="text-[10px] font-mono text-white/30 truncate">
            {oldPath}
          </p>
          <p className="text-[10px] font-mono text-white/50 truncate">
            {newPath}
          </p>
        </div>
      </div>
    </motion.div>
  )
})
