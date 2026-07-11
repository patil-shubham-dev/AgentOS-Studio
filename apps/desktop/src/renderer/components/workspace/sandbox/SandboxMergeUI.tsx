import { useCallback, useEffect, useState } from "react"
import { useSandboxStore } from "@/stores/sandbox-store"
import { WorktreeSandboxManager } from "@/lib/git/WorktreeSandbox"
import { cn } from "@/lib/utils"
import {
  GitBranch, CheckCircle2, XCircle, Loader2, FileText, Plus, Minus,
  AlertTriangle, ArrowRight, Shield,
} from "lucide-react"

const sandboxManager = WorktreeSandboxManager.getInstance()

export function SandboxMergeUI() {
  const { activeSandbox, diff, uiMode, error, setDiff, setUIMode, setError, reset } = useSandboxStore()
  const [isLoadingDiff, setIsLoadingDiff] = useState(false)

  // Load diff when sandbox becomes active
  useEffect(() => {
    if (activeSandbox && !diff && uiMode === "reviewing") {
      setIsLoadingDiff(true)
      sandboxManager.getDiff(activeSandbox).then((d) => {
        setDiff(d)
        setIsLoadingDiff(false)
      }).catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setIsLoadingDiff(false)
      })
    }
  }, [activeSandbox, diff, uiMode, setDiff, setError])

  const handleMerge = useCallback(async () => {
    if (!activeSandbox) return
    setUIMode("merging")
    const success = await sandboxManager.merge(activeSandbox)
    if (success) {
      setUIMode("completed")
    } else {
      setError("Merge failed — manual resolution may be needed")
    }
  }, [activeSandbox, setUIMode, setError])

  const handleDiscard = useCallback(async () => {
    if (!activeSandbox) return
    setUIMode("discarding")
    const success = await sandboxManager.discard(activeSandbox)
    if (success) {
      reset()
    } else {
      setError("Discard failed")
    }
  }, [activeSandbox, setUIMode, setError, reset])

  if (!activeSandbox && uiMode === "idle") return null

  return (
    <div className="border-t border-white/[0.06] bg-black/20">
      <div className="px-3 py-2 space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-5 w-5 rounded-lg bg-amber-500/10">
            <Shield className="h-3 w-3 text-amber-400" />
          </div>
          <span className="text-[10px] font-semibold text-white/60">Sandbox</span>
          {uiMode === "merging" && (
            <span className="ml-auto text-[9px] text-blue-400 font-medium flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Merging...
            </span>
          )}
          {uiMode === "discarding" && (
            <span className="ml-auto text-[9px] text-red-400 font-medium flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Discarding...
            </span>
          )}
          {uiMode === "completed" && (
            <span className="ml-auto text-[9px] text-green-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Merged
            </span>
          )}
          {uiMode === "error" && (
            <span className="ml-auto text-[9px] text-red-400 font-medium flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> Error
            </span>
          )}
        </div>

        {/* Sandbox info */}
        {activeSandbox && (
          <div className="flex items-center gap-2 text-[9px] text-white/30">
            <GitBranch className="h-2.5 w-2.5" />
            <code className="text-white/40">{activeSandbox.branchName}</code>
          </div>
        )}

        {/* Diff summary */}
        {isLoadingDiff && (
          <div className="flex items-center gap-2 py-2 text-[10px] text-white/30">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading diff...
          </div>
        )}

        {diff && !isLoadingDiff && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-white/40">{diff.files.length} file(s) changed</span>
              <span className="text-green-400 flex items-center gap-0.5">
                <Plus className="h-2.5 w-2.5" /> {diff.totalAdditions}
              </span>
              <span className="text-red-400 flex items-center gap-0.5">
                <Minus className="h-2.5 w-2.5" /> {diff.totalDeletions}
              </span>
            </div>

            {/* File list */}
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {diff.files.slice(0, 20).map((file) => (
                <div key={file.path} className="flex items-center gap-1.5 text-[9px]">
                  <FileText className="h-2.5 w-2.5 text-white/20 shrink-0" />
                  <code className="text-white/40 truncate flex-1">{file.path}</code>
                  <span className={cn(
                    "px-1 rounded text-[8px] font-medium",
                    file.status === "added" ? "text-green-400 bg-green-500/10" :
                    file.status === "deleted" ? "text-red-400 bg-red-500/10" :
                    "text-white/30 bg-white/[0.04]"
                  )}>
                    {file.status === "added" ? "A" : file.status === "deleted" ? "D" : "M"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
            <AlertTriangle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-red-300">{error}</p>
          </div>
        )}

        {/* Actions */}
        {uiMode === "reviewing" && !isLoadingDiff && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleMerge}
              className="flex items-center gap-1 flex-1 justify-center px-2 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/15 border border-green-500/20 text-green-400 text-[10px] font-medium transition-all"
            >
              <CheckCircle2 className="h-3 w-3" />
              Merge Changes
            </button>
            <button
              onClick={handleDiscard}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 text-red-400/70 hover:text-red-400 text-[10px] font-medium transition-all"
            >
              <XCircle className="h-3 w-3" />
              Discard
            </button>
          </div>
        )}

        {/* Completed state — dismiss */}
        {uiMode === "completed" && (
          <button
            onClick={reset}
            className="flex items-center gap-1 justify-center w-full px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.06] text-white/40 hover:text-white/60 text-[10px] font-medium transition-all"
          >
            <ArrowRight className="h-3 w-3" />
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
