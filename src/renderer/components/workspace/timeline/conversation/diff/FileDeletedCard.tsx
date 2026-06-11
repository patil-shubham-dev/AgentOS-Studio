import { memo, useMemo } from "react"
import { motion } from "framer-motion"
import { FileX2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FileOpRecord } from "../../step-card"

interface FileDeletedCardProps {
  filePath?: string
  deletions?: number
  op?: FileOpRecord
}

export const FileDeletedCard = memo(function FileDeletedCard({
  filePath,
  deletions: propDeletions,
  op,
}: FileDeletedCardProps) {
  const resolved = useMemo(() => {
    if (op) {
      return {
        path: op.path,
        deletions: op.deletions || 0,
      }
    }
    return {
      path: filePath || "",
      deletions: propDeletions || 0,
    }
  }, [op, filePath, propDeletions])

  const { path, deletions } = resolved
  if (!path) return null
  const fileName = path.split("/").pop() || path

  return (
    <motion.div
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      className="group py-1"
    >
      <div className="rounded-lg border border-red-500/10 bg-red-500/[0.01] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-red-500/[0.02] border-b border-red-500/8">
          <div className="flex items-center gap-2 min-w-0">
            <FileX2 className="h-3.5 w-3.5 text-red-400/60 flex-shrink-0" />
            <span className="text-xs font-medium text-red-300/80">
              Deleted
            </span>
            <span className="text-xs font-mono text-white/50 line-through truncate">
              {fileName}
            </span>
            <span className="text-[10px] text-white/20 font-mono hidden sm:inline truncate max-w-[200px] line-through">
              {path}
            </span>
          </div>
        </div>

        <div className="px-4 py-2.5">
          {deletions > 0 ? (
            <p className="text-[11px] text-red-300/50">
              {deletions} {deletions === 1 ? "line was" : "lines were"} removed
            </p>
          ) : (
            <p className="text-[11px] text-white/30">File was removed</p>
          )}
        </div>
      </div>
    </motion.div>
  )
})
