import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { MultiFileDiffCard } from "@/components/workspace/timeline/conversation/diff/MultiFileDiffCard"
import { Code2, Eye, EyeOff } from "lucide-react"

export function DiffViewerPane() {
  const agentSessions = useTimelineStore((s) => s.agentSessions)
  const [showAll, setShowAll] = useState(false)

  const allFileEdits = useMemo(() => {
    const edits: { edit: import("@/components/workspace/timeline/step-card").FileEditRecord }[] = []
    for (const session of agentSessions.values()) {
      for (const edit of session.fileEdits ?? []) {
        edits.push({ edit })
      }
    }
    return edits
  }, [agentSessions])

  const uniqueEdits = useMemo(() => {
    const seen = new Set<string>()
    return allFileEdits.filter((e) => {
      const key = `${e.edit.path}:${e.edit.additions}:${e.edit.deletions}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [allFileEdits])

  if (uniqueEdits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-8">
        <Code2 className="h-8 w-8 text-white/10" />
        <p className="text-[11px] text-white/20">No file changes yet</p>
        <p className="text-[9px] text-white/15 max-w-[200px]">
          File edits made by agents will appear here for review
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-white/30 uppercase tracking-widest">
            Changes
          </span>
          <span className="text-[9px] text-white/20 bg-white/[0.04] rounded px-1 py-0.5">
            {uniqueEdits.length} file{uniqueEdits.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
        >
          {showAll ? (
            <><EyeOff className="h-2.5 w-2.5" /> Collapse</>
          ) : (
            <><Eye className="h-2.5 w-2.5" /> Show all</>
          )}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-1">
        <MultiFileDiffCard
          files={uniqueEdits}
          onAcceptAll={() => {}}
          onRevertAll={() => {}}
        />
      </div>
    </div>
  )
}
