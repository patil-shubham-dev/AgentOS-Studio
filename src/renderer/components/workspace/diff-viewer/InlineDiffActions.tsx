/**
 * InlineDiffActions — reusable per-hunk accept/reject button group
 * for the side-by-side diff viewer. Extractable from SideBySideDiff.
 */

import { memo } from "react"
import { Check, X, CheckCheck, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DiffHunkStatus } from "@/stores/diff-store"

interface InlineDiffActionsProps {
  /** Number of additions in this hunk */
  additions: number
  /** Number of deletions in this hunk */
  deletions: number
  /** Hunk header text (e.g. "@@ -1,5 +1,7 @@") */
  header: string
  /** Current hunk status */
  status: DiffHunkStatus["status"]
  /** Called when the user accepts this hunk */
  onAccept: () => void
  /** Called when the user rejects this hunk */
  onReject: () => void
}

/** Status color for the hunk row */
function getHunkStatusColor(status: DiffHunkStatus["status"]): string {
  switch (status) {
    case "accepted": return "bg-green-500/10 border-green-500/20"
    case "rejected": return "bg-red-500/10 border-red-500/20"
    default: return "bg-white/[0.02] border-white/[0.06]"
  }
}

/** Status icon for the hunk */
export function getHunkStatusIcon(status: DiffHunkStatus["status"]) {
  switch (status) {
    case "accepted": return <Check className="h-2.5 w-2.5 text-green-400" />
    case "rejected": return <X className="h-2.5 w-2.5 text-red-400" />
    default: return <div className="h-2 w-2 rounded-full bg-amber-400/60" />
  }
}

/** Per-hunk accept/reject button bar */
export const InlineDiffActions = memo(function InlineDiffActions({
  additions,
  deletions,
  header,
  status,
  onAccept,
  onReject,
}: InlineDiffActionsProps) {
  const isPending = status === "pending"

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 transition-colors border-b border-white/[0.03]",
        getHunkStatusColor(status),
      )}
    >
      {/* Status indicator */}
      <div className="shrink-0">
        {getHunkStatusIcon(status)}
      </div>

      {/* Hunk header */}
      <code className="text-[10px] font-mono text-white/40 flex-1 min-w-0 truncate">
        {header}
      </code>

      {/* Line counts */}
      <span className="text-[9px] text-green-400/50 font-mono shrink-0">
        +{additions}
      </span>
      <span className="text-[9px] text-red-400/50 font-mono shrink-0">
        -{deletions}
      </span>

      {/* Action buttons — only when pending */}
      {isPending && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onReject}
            className="rounded p-0.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Reject this hunk"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            onClick={onAccept}
            className="rounded p-0.5 text-white/20 hover:text-green-400 hover:bg-green-500/10 transition-all"
            title="Accept this hunk"
          >
            <Check className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Accepted/rejected indicator */}
      {!isPending && (
        <span className={cn(
          "text-[9px] shrink-0",
          status === "accepted" ? "text-green-400/40" : "text-red-400/40",
        )}>
          {status === "accepted" ? "Accepted" : "Rejected"}
        </span>
      )}
    </div>
  )
})

/** File-level Accept All / Reject All toolbar */
interface FileLevelDiffActionsProps {
  pendingHunks: number
  acceptedHunks: number
  rejectedHunks: number
  isPending: boolean
  isAllAccepted: boolean
  isAllRejected: boolean
  onAcceptAll?: () => void
  onRejectAll?: () => void
}

export const FileLevelDiffActions = memo(function FileLevelDiffActions({
  pendingHunks,
  acceptedHunks,
  rejectedHunks,
  isPending,
  isAllAccepted,
  isAllRejected,
  onAcceptAll,
  onRejectAll,
}: FileLevelDiffActionsProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.04]">
      <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">
        Changes ({pendingHunks + acceptedHunks + rejectedHunks})
      </span>
      <span className="text-[9px] text-green-400/50">✓ {acceptedHunks}</span>
      <span className="text-[9px] text-red-400/50">✗ {rejectedHunks}</span>
      <span className="text-[9px] text-amber-400/50">○ {pendingHunks}</span>

      {/* Accept All / Reject All actions */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        {isPending && onRejectAll && (
          <button
            onClick={onRejectAll}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
            title="Reject all changes in this file"
          >
            <XCircle className="h-2.5 w-2.5" />
            Reject
          </button>
        )}
        {isPending && onAcceptAll && (
          <button
            onClick={onAcceptAll}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-green-400/60 hover:text-green-400 hover:bg-green-500/10 transition-all border border-transparent hover:border-green-500/20"
            title="Accept all changes in this file"
          >
            <CheckCheck className="h-2.5 w-2.5" />
            Accept
          </button>
        )}
      </div>

      {/* Completed status */}
      {isAllAccepted && (
        <span className="text-[9px] text-green-400/50 ml-auto shrink-0">
          ✓ {acceptedHunks}/{pendingHunks + acceptedHunks + rejectedHunks} hunks
        </span>
      )}
      {isAllRejected && (
        <span className="text-[9px] text-red-400/50 ml-auto shrink-0">
          ✗ All rejected
        </span>
      )}
    </div>
  )
})
