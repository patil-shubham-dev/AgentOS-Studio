import { memo, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { CopyButton } from "@/components/ui/CopyButton"
import { parseDiff, detectLanguage, applyHighlighting } from "./diff-utils"
import type { DiffHunk } from "./diff-utils"
import type { FileEditRecord } from "../../step-card"
import { useDiffStore } from "@/stores/diff-store"
import { acceptDiffReviewHunk, rejectDiffReviewHunk } from "@/lib/diff-review"
import DOMPurify from "dompurify"

interface DiffCardProps {
  filePath: string
  hunks?: DiffHunk[]
  additions?: number
  deletions?: number
  language?: string
  edit?: FileEditRecord
  /** If provided, looks up live review state from the diff store */
  diffPath?: string
  onOpenInEditor?: (path: string) => void
  onRevert?: (path: string) => void
  onAccept?: (path: string) => void
  expanded?: boolean
}

const HunkHeader = memo(function HunkHeader({
  header,
}: {
  header: string
}) {
  return (
    <div className="sticky left-0 px-4 py-1 text-[10px] font-mono text-white/20 bg-white/[0.02] border-y border-white/[0.04]">
      {header}
    </div>
  )
})

const DiffLineRow = memo(function DiffLineRow({
  line,
  lang,
}: {
  line: { type: "add" | "del" | "context"; content: string; html?: string }
  lang: string
}) {
  const isAdd = line.type === "add"
  const isDel = line.type === "del"
  const isContext = line.type === "context"

  const highlighted = useMemo(
    () => line.html,
    [line.html],
  )

  return (
    <div
      className={cn(
        "flex font-mono text-[11px] leading-[18px] min-h-[18px]",
        isAdd && "bg-emerald-500/[0.04]",
        isDel && "bg-red-500/[0.04]",
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 text-center text-[10px] leading-[18px] select-none border-r",
          isAdd &&
            "text-emerald-400/60 bg-emerald-500/[0.08] border-emerald-500/15",
          isDel &&
            "text-red-400/60 bg-red-500/[0.08] border-red-500/15",
          isContext &&
            "text-white/12 bg-transparent border-white/[0.03]",
        )}
      >
        {isAdd ? "+" : isDel ? "-" : " "}
      </div>
      <div
        className=        "flex-1 px-2.5 overflow-hidden"
        dangerouslySetInnerHTML={
          highlighted
            ? { __html: DOMPurify.sanitize(highlighted || " ") }
            : undefined
        }
      >
        {!highlighted && (
          <span
            className={cn(
              isAdd && "text-emerald-300/80",
              isDel && "text-red-300/80",
              isContext && "text-white/40",
            )}
          >
            {line.content || " "}
          </span>
        )}
      </div>
    </div>
  )
})

export const DiffCard = memo(function DiffCard({
  filePath,
  hunks: propHunks,
  additions: propAdditions,
  deletions: propDeletions,
  language: propLanguage,
  edit,
  diffPath,
  onOpenInEditor,
  onRevert,
  onAccept,
  expanded = true,
}: DiffCardProps) {
  const diffEntry = useDiffStore((s) => (diffPath ? s.files.get(diffPath) : undefined))
  const hunkStatuses = diffEntry?.hunks ?? null

  const computed = useMemo(() => {
    if (edit) {
      const lang = detectLanguage(edit.path)
      const rawHunks = parseDiff(edit.diffContent || "")
      const hunks = rawHunks.map((h) => ({
        ...h,
        lines: applyHighlighting(h.lines, lang),
      }))
      return {
        path: edit.path,
        hunks,
        additions: edit.additions,
        deletions: edit.deletions,
        language: lang,
      }
    }
    if (propHunks) {
      const lang = propLanguage || detectLanguage(filePath)
      const hunks = propHunks.map((h) => ({
        ...h,
        lines: applyHighlighting(h.lines, lang),
      }))
      return {
        path: filePath,
        hunks,
        additions: propAdditions || 0,
        deletions: propDeletions || 0,
        language: lang,
      }
    }
    return null
  }, [edit, propHunks, filePath, propLanguage, propAdditions, propDeletions])

  const handleAcceptHunk = useCallback((path: string, hunkIndex: number) => {
    void acceptDiffReviewHunk(path, hunkIndex)
  }, [])

  const handleRejectHunk = useCallback((path: string, hunkIndex: number) => {
    void rejectDiffReviewHunk(path, hunkIndex)
  }, [])

  if (!computed) return null

  const { path, hunks, additions, deletions, language } = computed
  const fileName = path.split("/").pop() || path
  const fileStatus = diffEntry?.status ?? "pending"

  if (!expanded) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        className="group flex items-center gap-2 py-1"
      >
        <div className="flex items-center gap-1.5 text-xs font-medium text-white/50">
          {diffPath && (
            <span className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
              fileStatus === "accepted" ? "bg-green-400" :
              fileStatus === "rejected" ? "bg-red-400" : "bg-amber-400",
            )} />
          )}
          <span className="font-mono text-[11px]">{fileName}</span>
          {additions > 0 && (
            <span className="text-[10px] text-emerald-400/60">
              +{additions}
            </span>
          )}
          {deletions > 0 && (
            <span className="text-[10px] text-red-400/60">
              -{deletions}
            </span>
          )}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      className="group py-1"
    >
      <div className={cn(
        "rounded-lg border overflow-hidden",
        diffPath && fileStatus === "accepted" ? "border-green-500/15 bg-green-500/[0.02]" :
        diffPath && fileStatus === "rejected" ? "border-red-500/15 bg-red-500/[0.02]" :
        "border-white/[0.04] bg-white/[0.01]",
      )}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2 min-w-0">
            {diffPath && (
              <span className={cn(
                "h-1.5 w-1.5 rounded-full shrink-0",
                fileStatus === "accepted" ? "bg-green-400" :
                fileStatus === "rejected" ? "bg-red-400" : "bg-amber-400",
              )} />
            )}
            <span className="text-xs font-medium text-white/70 truncate">
              {fileName}
            </span>
            <span className="text-[10px] text-white/30 font-mono hidden sm:inline truncate max-w-[200px]">
              {path}
            </span>
            {additions > 0 && (
              <span className="text-[10px] text-emerald-400/60 font-mono flex-shrink-0">
                +{additions}
              </span>
            )}
            {deletions > 0 && (
              <span className="text-[10px] text-red-400/60 font-mono flex-shrink-0">
                -{deletions}
              </span>
            )}
            <span className="text-[9px] text-white/20 font-mono hidden sm:inline flex-shrink-0">
              {language}
            </span>
            {diffPath && fileStatus !== "pending" && (
              <span className={cn(
                "text-[9px] font-medium px-1 py-0.5 rounded",
                fileStatus === "accepted" ? "text-green-400/60 bg-green-500/8" : "text-red-400/60 bg-red-500/8",
              )}>
                {fileStatus === "accepted" ? "Accepted" : "Rejected"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <CopyButton
              text={hunks.map(h => `${h.header}\n${h.lines.map(l => `${l.type === "add" ? "+" : l.type === "del" ? "-" : " "}${l.content}`).join("\n")}`).join("\n")}
              className="px-1 py-0.5 rounded hover:bg-white/[0.06]"
            />
            {onOpenInEditor && (
              <button
                onClick={() => onOpenInEditor(path)}
                className="text-[9px] text-white/30 hover:text-white/60 px-1.5 py-0.5 rounded hover:bg-white/[0.06] transition-all"
              >
                Open
              </button>
            )}
            {diffPath && fileStatus === "pending" && onAccept && (
              <button
                onClick={() => onAccept(path)}
                className="text-[9px] text-green-400/40 hover:text-green-400/70 px-1.5 py-0.5 rounded hover:bg-green-500/10 transition-all"
              >
                Accept
              </button>
            )}
            {onRevert && (
              <button
                onClick={() => onRevert(path)}
                className="text-[9px] text-red-400/40 hover:text-red-400/70 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-all"
              >
                Revert
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {hunks.map((hunk, hi) => {
            const hunkState = hunkStatuses?.[hi]
            const bgClass = hunkState?.status === "accepted" ? "bg-green-500/[0.03]" :
              hunkState?.status === "rejected" ? "bg-red-500/[0.03]" : ""
            return (
              <div key={hi} className={bgClass}>
                {hi > 0 && <div className="h-px bg-white/[0.04]" />}
                {hunks.length > 1 && <HunkHeader header={hunk.header} />}
                {hunk.lines.length === 0 ? (
                  <div className="px-4 py-2 text-[10px] text-white/20 italic">
                    No changes in this section
                  </div>
                ) : (
                  <>
                    {hunk.lines.map((line, li) => (
                      <DiffLineRow
                        key={`${hi}-${li}`}
                        line={line}
                        lang={language}
                      />
                    ))}
                    {diffPath && hunkState?.status === "pending" && (
                      <div className="flex items-center gap-1 px-3 py-1 border-t border-white/[0.03]">
                        <button
                          onClick={() => handleRejectHunk(path, hi)}
                          className="text-[9px] text-red-400/40 hover:text-red-400/70 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-all"
                        >
                          Reject hunk
                        </button>
                        <button
                          onClick={() => handleAcceptHunk(path, hi)}
                          className="text-[9px] text-green-400/40 hover:text-green-400/70 px-1.5 py-0.5 rounded hover:bg-green-500/10 transition-all"
                        >
                          Accept hunk
                        </button>
                      </div>
                    )}
                    {diffPath && hunkState && hunkState.status !== "pending" && (
                      <div className="px-3 py-0.5 text-[8px] font-medium text-white/20 border-t border-white/[0.03]">
                        {hunkState.status === "accepted" ? "Accepted" : "Rejected"}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
})
