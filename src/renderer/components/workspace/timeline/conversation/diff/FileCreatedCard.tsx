import { memo, useMemo } from "react"
import { motion } from "framer-motion"
import { FileUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FileOpRecord } from "../../step-card"

interface FileCreatedCardProps {
  filePath?: string
  content?: string
  op?: FileOpRecord
  onOpenInEditor?: (path: string) => void
}

export const FileCreatedCard = memo(function FileCreatedCard({
  filePath,
  content,
  op,
  onOpenInEditor,
}: FileCreatedCardProps) {
  const resolved = useMemo(() => {
    if (op) {
      return {
        path: op.path,
        displayContent: op.content || "",
        additions: op.additions || 0,
      }
    }
    return {
      path: filePath || "",
      displayContent: content || "",
      additions: 0,
    }
  }, [op, filePath, content])

  const { path, additions, displayContent } = resolved
  if (!path) return null
  const fileName = path.split("/").pop() || path
  const lineCount = displayContent ? displayContent.split("\n").length : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      className="group py-1"
    >
      <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/[0.01] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-500/[0.02] border-b border-emerald-500/8">
          <div className="flex items-center gap-2 min-w-0">
            <FileUp className="h-3.5 w-3.5 text-emerald-400/60 flex-shrink-0" />
            <span className="text-xs font-medium text-emerald-300/80">
              Created
            </span>
            <span className="text-xs font-mono text-white/70 truncate">
              {fileName}
            </span>
            <span className="text-[10px] text-white/30 font-mono hidden sm:inline truncate max-w-[200px]">
              {path}
            </span>
            {additions > 0 && (
              <span className="text-[10px] text-emerald-400/60 font-mono">
                +{additions}
              </span>
            )}
            {lineCount > 0 && (
              <span className="text-[9px] text-white/20 font-mono hidden sm:inline">
                {lineCount} {lineCount === 1 ? "line" : "lines"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onOpenInEditor && (
              <button
                onClick={() => onOpenInEditor(path)}
                className="text-[9px] text-white/30 hover:text-white/60 px-1.5 py-0.5 rounded hover:bg-white/[0.06] transition-all"
              >
                Open
              </button>
            )}
          </div>
        </div>

        {displayContent && (
          <div className="overflow-x-auto">
            {displayContent.split("\n").map((line, i) => (
              <div
                key={i}
                className="flex font-mono text-[11px] leading-[18px] bg-emerald-500/[0.02]"
              >
                <div className="flex-shrink-0 w-8 text-center text-[10px] leading-[18px] text-emerald-400/40 select-none border-r border-emerald-500/10 bg-emerald-500/[0.04]">
                  +
                </div>
                <div className="flex-1 px-3 text-emerald-300/70 overflow-hidden whitespace-pre-wrap break-all">
                  {line || " "}
                </div>
              </div>
            ))}
          </div>
        )}

        {!displayContent && (
          <div className="px-4 py-3 text-[10px] text-white/30 italic">
            File created with {additions} {additions === 1 ? "line" : "lines"}
          </div>
        )}
      </div>
    </motion.div>
  )
})
