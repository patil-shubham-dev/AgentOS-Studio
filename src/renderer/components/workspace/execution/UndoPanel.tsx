import { useState, useEffect } from "react"
import { WorkspaceSnapshotManager, type WorkspaceSnapshot } from "@/runtime/execution/WorkspaceSnapshotManager"

export function UndoPanel() {
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([])
  const [restoring, setRestoring] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)

  const refresh = () => {
    const mgr = WorkspaceSnapshotManager.getInstance()
    setSnapshots(mgr.listActive())
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleRestore = async (snapshot: WorkspaceSnapshot) => {
    setRestoring(snapshot.id)
    setMessage(null)
    try {
      const mgr = WorkspaceSnapshotManager.getInstance()
      const ok = await mgr.restore(snapshot.id)
      if (ok) {
        setMessage({ text: `Restored snapshot: ${snapshot.label}`, type: "success" })
        refresh()
      } else {
        setMessage({ text: "Failed to restore snapshot — it may already be committed", type: "error" })
      }
    } catch (err) {
      setMessage({ text: `Restore failed: ${err}`, type: "error" })
    }
    setRestoring(null)
  }

  const handleUndoLast = async () => {
    setMessage(null)
    try {
      const mgr = WorkspaceSnapshotManager.getInstance()
      const ok = await mgr.restoreLatest()
      if (ok) {
        setMessage({ text: "Restored latest snapshot", type: "success" })
        refresh()
      } else {
        setMessage({ text: "No active snapshot to restore", type: "error" })
      }
    } catch (err) {
      setMessage({ text: `Restore failed: ${err}`, type: "error" })
    }
  }

  if (snapshots.length === 0 && !message) return null

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-white/60">Undo</span>
        <button
          onClick={handleUndoLast}
          className="rounded px-2 py-0.5 text-[10px] text-amber-400/80 hover:text-amber-400 hover:bg-white/[0.04] transition-all"
        >
          Undo Last
        </button>
      </div>

      {message && (
        <div className={`mb-2 rounded px-2 py-1 text-[10px] ${
          message.type === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        }`}>
          {message.text}
        </div>
      )}

      {snapshots.length > 0 && (
        <div className="space-y-1">
          {snapshots.map((snap) => (
            <div
              key={snap.id}
              className="flex items-center justify-between rounded bg-white/[0.03] px-2 py-1.5"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-white/60 truncate">{snap.label}</div>
                <div className="text-[10px] text-white/30">
                  {new Date(snap.timestamp).toLocaleTimeString()} — {snap.files.size} files
                </div>
              </div>
              <button
                onClick={() => handleRestore(snap)}
                disabled={restoring === snap.id}
                className="shrink-0 rounded px-2 py-0.5 text-[10px] text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all disabled:opacity-30"
              >
                {restoring === snap.id ? "..." : "Restore"}
              </button>
            </div>
          ))}
        </div>
      )}

      {snapshots.length > 1 && (
        <button
          onClick={() => {
            const mgr = WorkspaceSnapshotManager.getInstance()
            mgr.clear()
            setMessage({ text: "All snapshots cleared", type: "success" })
            refresh()
          }}
          className="mt-2 w-full rounded px-2 py-1 text-[10px] text-white/30 hover:text-white/50 hover:bg-white/[0.03] transition-all"
        >
          Clear All Snapshots
        </button>
      )}
    </div>
  )
}
