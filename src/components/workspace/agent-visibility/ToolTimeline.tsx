import { useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTimelineStore, type AgentSession } from "@/components/workspace/timeline/timeline-store"
import { getActivityForToolCall, getAgentStateIcon } from "./AgentActivityMapper"
import type { Activity } from "./AgentActivityMapper"

interface TimelineEntry {
  id: string
  order: number
  activity: Activity
  agentRole?: string
  status: "running" | "complete" | "error"
}

function buildTimeline(sessions: Map<string, AgentSession>): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  let order = 0

  for (const [, session] of sessions) {
    const role = session.roleId ?? "assistant"
    const baseTime = session.startedAt ?? Date.now()

    for (const tc of session.toolCalls) {
      const activity = getActivityForToolCall(tc.name)
      entries.push({
        id: `tool-${tc.id}-${order}`,
        order: order++,
        activity,
        agentRole: role,
        status: tc.status === "running" ? "running" : tc.status === "error" ? "error" : "complete",
      })
    }

    for (const fe of session.fileEdits) {
      entries.push({
        id: `edit-${fe.path}-${order}`,
        order: order++,
        activity: { type: "editing", label: "Editing file", detail: fe.path },
        agentRole: role,
        status: "complete",
      })
    }
  }

  entries.sort((a, b) => a.order - b.order)
  return entries.slice(-30)
}

function EntryIcon({ activity, status }: { activity: Activity; status: string }) {
  const icons: Record<string, string> = {
    initializing: "○",
    planning: "◎",
    researching: "◇",
    browsing: "◇",
    searching: "◇",
    reading: "□",
    editing: "●",
    writing: "●",
    running: "▶",
    validating: "◆",
    analyzing: "◎",
    finalizing: "○",
    idle: "○",
    complete: "✓",
    failed: "✗",
  }

  const icon = icons[activity.type] ?? "·"
  const color =
    status === "running"
      ? "text-amber-400"
      : status === "error"
        ? "text-red-400"
        : "text-emerald-400/70"

  return (
    <span className={`w-3.5 text-center shrink-0 text-[10px] ${status === "running" ? "animate-pulse" : ""} ${color}`}>
      {icon}
    </span>
  )
}

interface ToolTimelineProps {
  sessionId?: string
  maxHeight?: number
}

export function ToolTimeline({ sessionId, maxHeight = 200 }: ToolTimelineProps) {
  const allSessions = useTimelineStore((s) => s.agentSessions)
  const scrollRef = useRef<HTMLDivElement>(null)

  const entries = useMemo(() => {
    if (sessionId) {
      const session = allSessions.get(sessionId)
      return session ? buildTimeline(new Map([[sessionId, session]])) : []
    }
    return buildTimeline(allSessions)
  }, [allSessions, sessionId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries.length])

  const hasRunning = entries.some((e) => e.status === "running")

  if (entries.length === 0) return null

  return (
    <div>
      <div className="px-3 py-1.5 text-[10px] font-medium text-white/20 uppercase tracking-wider flex items-center gap-2">
        <span>Activity</span>
        {hasRunning && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
      </div>
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight }}>
        <AnimatePresence mode="popLayout">
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-start gap-2 px-3 py-1 text-[11px]"
            >
              <EntryIcon activity={entry.activity} status={entry.status} />
              <span className="text-white/50 truncate flex-1">
                {entry.activity.label}
                {entry.activity.detail && (
                  <span className="text-white/20 ml-1 truncate">{entry.activity.detail}</span>
                )}
              </span>
              {entry.status === "running" && (
                <span className="text-[10px] text-amber-400/60 shrink-0">...</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
