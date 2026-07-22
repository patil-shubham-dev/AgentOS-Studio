import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Loader2, CheckCircle2, XCircle, Clock, Play, X, Trash2,
  RotateCcw, Bell, BellOff, ListTodo, ExternalLink, Terminal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useBackgroundSessionStore, type BackgroundSession, type BackgroundStatus } from "@/stores/background-session-store"
import { globalBackgroundTaskManager } from "@/runtime/BackgroundTaskManager"

function getStatusIcon(status: BackgroundStatus, className = "h-3.5 w-3.5") {
  switch (status) {
    case "queued":
      return <Clock className={cn(className, "text-amber-400/70")} />
    case "running":
      return (
        <span className="relative flex h-3.5 w-3.5 items-center justify-center">
          <span className="absolute inset-0 rounded-full animate-ping opacity-30 bg-blue-400" />
          <Loader2 className={cn(className, "text-blue-400 animate-spin")} />
        </span>
      )
    case "completed":
      return (
        <motion.svg
          viewBox="0 0 14 14" className={cn(className, "text-emerald-400")}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M3 7.5L5.5 10L11 4" />
        </motion.svg>
      )
    case "failed":
      return <XCircle className={cn(className, "text-red-400")} />
    case "cancelled":
      return <X className={cn(className, "text-white/30")} />
  }
}

function formatTime(ts: number | null): string {
  if (!ts) return ""
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m ago`
}

function BackgroundSessionCard({ session, onCancel, onRemove, onRetry }: {
  session: BackgroundSession
  onCancel: () => void
  onRemove: () => void
  onRetry: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: "hidden" }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={cn(
        "rounded-lg border overflow-hidden",
        session.status === "completed" && "border-emerald-500/15",
        session.status === "failed" && "border-red-500/15",
        session.status === "running" && "border-blue-500/20",
        session.status === "queued" && "border-amber-500/15",
        session.status === "cancelled" && "border-white/[0.04]",
      )}
      style={{
        background: session.status === "completed"
          ? "color-mix(in srgb, var(--color-accent-green) 4%, transparent)"
          : session.status === "failed"
            ? "color-mix(in srgb, var(--color-accent-red) 4%, transparent)"
            : "var(--surface-elevated)",
      }}
    >
      <div className="flex items-start gap-2.5 px-3 py-2">
        <span className="mt-0.5 shrink-0">{getStatusIcon(session.status)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
              {session.label}
            </span>
            <span className={cn(
              "text-[9px] font-medium px-1 py-0.5 rounded",
              session.status === "running" && "bg-blue-500/10 text-blue-400",
              session.status === "completed" && "bg-emerald-500/10 text-emerald-400",
              session.status === "failed" && "bg-red-500/10 text-red-400",
              session.status === "queued" && "bg-amber-500/10 text-amber-400",
              session.status === "cancelled" && "bg-white/[0.04] text-white/30",
            )}>
              {session.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[9px]" style={{ color: "var(--text-quaternary)" }}>
            <span>{session.environment}</span>
            <span>{formatTime(session.createdAt)}</span>
            {session.startedAt && <span>Started {formatTime(session.startedAt)}</span>}
          </div>

          {/* Progress bar for running/queued */}
          {(session.status === "running" || session.status === "queued") && (
            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: "var(--color-accent-brand)",
                }}
                initial={{ width: "0%" }}
                animate={{
                  width: session.status === "queued" ? "5%" : `${Math.max(10, session.progress)}%`,
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
          )}

          {session.error && (
            <p className="text-[10px] text-red-400/70 mt-1 font-mono line-clamp-2">{session.error}</p>
          )}

          {session.result && expanded && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="text-[10px] font-mono mt-1 p-2 rounded overflow-x-auto whitespace-pre-wrap"
              style={{ background: "var(--surface-app)", color: "var(--text-tertiary)" }}
            >
              {session.result}
            </motion.pre>
          )}

          {/* Prompt preview */}
          {!expanded && session.prompt && (
            <p className="text-[10px] mt-1 line-clamp-1" style={{ color: "var(--text-quaternary)" }}>
              {session.prompt}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {(session.status === "running" || session.status === "queued") && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCancel}
              className="rounded p-1 text-white/20 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
              title="Cancel"
            >
              <X className="h-3 w-3" />
            </motion.button>
          )}
          {session.status === "failed" && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRetry}
              className="rounded p-1 text-white/20 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
              title="Retry"
            >
              <RotateCcw className="h-3 w-3" />
            </motion.button>
          )}
          {(session.status === "completed" || session.status === "failed" || session.status === "cancelled") && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRemove}
              className="rounded p-1 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Remove"
            >
              <Trash2 className="h-3 w-3" />
            </motion.button>
          )}
          {session.result && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setExpanded(!expanded)}
              className="rounded p-1 text-white/20 hover:text-white/50 transition-all"
              title={expanded ? "Collapse" : "Expand"}
            >
              <ExternalLink className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export function BackgroundSessionPanel({
  onClose,
}: {
  onClose?: () => void
}) {
  const sessions = useBackgroundSessionStore((s) => s.sessions)
  const cancel = useBackgroundSessionStore((s) => s.cancel)
  const remove = useBackgroundSessionStore((s) => s.remove)
  const retry = useBackgroundSessionStore((s) => s.retry)
  const clearCompleted = useBackgroundSessionStore((s) => s.clearCompleted)
  const notificationPermission = useBackgroundSessionStore((s) => s.notificationPermission)
  const setNotificationPermission = useBackgroundSessionStore((s) => s.setNotificationPermission)

  const activeCount = useMemo(() =>
    sessions.filter((s) => s.status === "running" || s.status === "queued").length,
    [sessions]
  )

  const completedCount = useMemo(() =>
    sessions.filter((s) => s.status === "completed").length,
    [sessions]
  )

  const handleSendToBackground = useCallback(() => {
    const label = prompt("Session prompt label:", "Background task")
    if (!label) return
    const store = useBackgroundSessionStore.getState()
    const id = store.enqueue(label, label)
    const taskManager = globalBackgroundTaskManager
    taskManager.spawn(
      label,
      label,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return "Task completed successfully"
      }
    )
  }, [])

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="flex-shrink-0 flex flex-col border-l overflow-hidden"
      style={{ borderColor: "var(--border-default)", background: "var(--surface-panel)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5" style={{ color: "var(--color-accent-brand)" }} />
          <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>Background</span>
          {activeCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
              style={{ background: "color-mix(in srgb, var(--color-accent-brand) 15%, transparent)", color: "var(--color-accent-brand)" }}
            >
              {activeCount} active
            </motion.span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setNotificationPermission(!notificationPermission)}
            className={cn(
              "rounded p-1 transition-all",
              notificationPermission
                ? "text-blue-400 hover:bg-blue-500/10"
                : "text-white/20 hover:text-white/50 hover:bg-white/[0.06]",
            )}
            title={notificationPermission ? "Notifications on" : "Notifications off"}
          >
            {notificationPermission ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
          </motion.button>
          {completedCount > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={clearCompleted}
              className="rounded p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
              title="Clear completed"
            >
              <Trash2 className="h-3 w-3" />
            </motion.button>
          )}
          {onClose && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="rounded p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
              title="Close"
            >
              <X className="h-3 w-3" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-3 py-2 shrink-0">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSendToBackground}
          className="flex items-center gap-1.5 w-full rounded-lg px-3 py-1.5 text-[10px] font-medium transition-all"
          style={{
            color: "var(--color-accent-brand)",
            background: "color-mix(in srgb, var(--color-accent-brand) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-accent-brand) 15%, transparent)",
          }}
        >
          <Play className="h-3 w-3" />
          <span>Run in Background</span>
          <ExternalLink className="h-2.5 w-2.5 ml-auto opacity-50" />
        </motion.button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5 scrollbar-thin">
        <AnimatePresence mode="popLayout">
          {sessions.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <ListTodo className="h-6 w-6 mb-2" style={{ color: "var(--text-quaternary)" }} />
              <p className="text-[10px]" style={{ color: "var(--text-quaternary)" }}>
                No background sessions
              </p>
              <p className="text-[9px] mt-1" style={{ color: "var(--text-quinary)" }}>
                Run tasks in the background while you continue working
              </p>
            </motion.div>
          ) : (
            sessions.map((session) => (
              <BackgroundSessionCard
                key={session.id}
                session={session}
                onCancel={() => cancel(session.id)}
                onRemove={() => remove(session.id)}
                onRetry={() => retry(session.id)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
