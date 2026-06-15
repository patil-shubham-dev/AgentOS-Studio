import { useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useSessionSidebarStore, type SessionFilter } from "@/stores/session-sidebar-store"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useSessionStore } from "@/stores/session-store"
import {
  Plus,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  MoreHorizontal,
  Trash2,
  Copy,
  PenLine,
} from "lucide-react"

const FILTER_OPTIONS: { id: SessionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Done" },
  { id: "failed", label: "Failed" },
]

function SessionIcon({ status }: { status: string }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3 w-3 text-blue-400 animate-spin shrink-0" />
    case "completed":
      return <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
    case "failed":
    case "cancelled":
      return <XCircle className="h-3 w-3 text-red-400 shrink-0" />
    default:
      return <MessageSquare className="h-3 w-3 text-white/30 shrink-0" />
  }
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export function SessionSidebar() {
  const {
    sessions,
    activeSessionId,
    filter,
    searchQuery,
    createSession,
    destroySession,
    selectSession,
    setFilter,
    setSearchQuery,
    getFilteredSessions,
    renameSession,
  } = useSessionSidebarStore()

  const [showFilter, setShowFilter] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [contextMenuId, setContextMenuId] = useState<string | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filteredSessions = getFilteredSessions()

  const handleNewSession = useCallback(() => {
    useTimelineStore.getState().clear()
    const session = createSession()
    useSessionStore.getState().createTab(session.label)
  }, [createSession])

  const handleSelectSession = useCallback(
    (id: string) => {
      const currentSession = sessions.find((s) => s.id === activeSessionId)
      if (currentSession) {
        const timeline = useTimelineStore.getState()
        const stateKey = `aos-timeline-${currentSession.id}`
        try {
          localStorage.setItem(stateKey, JSON.stringify({
            events: timeline.events,
            agentSessions: Array.from(timeline.agentSessions.entries()),
            streamingTexts: Array.from(timeline.streamingTexts.entries()),
            sessionOrder: timeline.sessionOrder,
            sessionCreatedAtEventCount: timeline.sessionCreatedAtEventCount,
            collapsedSections: Array.from(timeline.collapsedSections),
          }))
        } catch { /* ignore */ }
      }
      selectSession(id)
      useSessionStore.getState().selectTab(id)
      const newSession = useSessionSidebarStore.getState().sessions.find((s) => s.id === id)
      if (newSession) {
        const stateKey = `aos-timeline-${newSession.id}`
        try {
          const raw = localStorage.getItem(stateKey)
          if (raw) {
            const saved = JSON.parse(raw)
            useTimelineStore.getState().restoreState({
              events: saved.events ?? [],
              agentSessions: new Map(saved.agentSessions ?? []),
              streamingTexts: new Map(saved.streamingTexts ?? []),
              sessionOrder: saved.sessionOrder ?? [],
              sessionCreatedAtEventCount: saved.sessionCreatedAtEventCount ?? [],
              collapsedSections: new Set(saved.collapsedSections ?? []),
            })
          } else {
            useTimelineStore.getState().clear()
          }
        } catch {
          useTimelineStore.getState().clear()
        }
      }
    },
    [sessions, activeSessionId, selectSession]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenuId(contextMenuId === id ? null : id)
    },
    [contextMenuId]
  )

  const handleRename = useCallback(
    (id: string) => {
      const session = sessions.find((s) => s.id === id)
      if (session) {
        setEditingId(id)
        setEditLabel(session.label)
      }
      setContextMenuId(null)
    },
    [sessions]
  )

  const handleRenameSubmit = useCallback(
    (id: string) => {
      if (editLabel.trim()) {
        renameSession(id, editLabel.trim())
      }
      setEditingId(null)
    },
    [editLabel, renameSession]
  )

  const handleDuplicate = useCallback(
    (id: string) => {
      const { duplicateSession } = useSessionSidebarStore.getState()
      const dup = duplicateSession(id)
      if (dup) useSessionStore.getState().createTab(dup.label)
      setContextMenuId(null)
    },
    []
  )

  const handleDelete = useCallback(
    (id: string) => {
      destroySession(id)
      useSessionStore.getState().destroyTab(id)
      setContextMenuId(null)
      const stateKey = `aos-timeline-${id}`
      try {
        localStorage.removeItem(stateKey)
      } catch { /* ignore */ }
    },
    [destroySession]
  )

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] border-r border-white/[0.06] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.04]">
        <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
          Sessions
        </span>
        <button
          onClick={handleNewSession}
          className="rounded p-1 text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          title="New session"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pt-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 border border-white/[0.04] focus-within:border-blue-500/30 transition-colors">
          <Search className="h-3 w-3 text-white/20 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="flex-1 bg-transparent text-[11px] text-white/60 placeholder:text-white/20 outline-none min-w-0"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-white/20 hover:text-white/50"
            >
              <span className="text-[10px]">x</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="relative px-2 pb-1.5">
        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-medium transition-all",
                filter === opt.id
                  ? "bg-blue-500/15 text-blue-400"
                  : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-1 pb-2">
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <MessageSquare className="h-6 w-6 text-white/10" />
            <p className="text-[10px] text-white/20 max-w-[140px]">
              {searchQuery ? "No matching sessions" : "No sessions yet"}
            </p>
            <button
              onClick={handleNewSession}
              className="rounded px-2 py-1 text-[9px] font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-all"
            >
              New Session
            </button>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div key={session.id} className="relative">
              <button
                onClick={() => handleSelectSession(session.id)}
                onContextMenu={(e) => handleContextMenu(e, session.id)}
                className={cn(
                  "w-full flex items-start gap-2 rounded-lg px-2 py-2 text-left transition-all group relative",
                  activeSessionId === session.id
                    ? "bg-blue-500/10 border border-blue-500/20"
                    : "hover:bg-white/[0.04] border border-transparent"
                )}
              >
                <SessionIcon status={session.status} />
                <div className="flex-1 min-w-0">
                  {editingId === session.id ? (
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onBlur={() => handleRenameSubmit(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit(session.id)
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      className="w-full bg-white/[0.08] rounded px-1 py-0.5 text-[11px] text-white outline-none border border-blue-500/30"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="text-[11px] font-medium text-white/70 truncate leading-tight">
                      {session.label}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] text-white/20">
                      {formatTime(session.lastActiveAt)}
                    </span>
                    {session.projectName && (
                      <>
                        <span className="text-[9px] text-white/10">·</span>
                        <span className="text-[9px] text-white/20 truncate max-w-[60px]">
                          {session.projectName}
                        </span>
                      </>
                    )}
                    {session.messageCount > 0 && (
                      <>
                        <span className="text-[9px] text-white/10">·</span>
                        <span className="text-[9px] text-white/20">
                          {session.messageCount} msg
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => handleContextMenu(e, session.id)}
                  className="rounded p-0.5 text-white/10 hover:text-white/40 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </button>
              </button>

              {/* Context menu */}
              {contextMenuId === session.id && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setContextMenuId(null)}
                  />
                  <div
                    ref={contextMenuRef}
                    className="absolute right-0 top-full mt-0.5 z-50 w-36 rounded-lg border border-white/[0.08] bg-[#121214] shadow-xl py-0.5"
                  >
                    <button
                      onClick={() => handleRename(session.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-white/60 hover:text-white hover:bg-white/[0.06] transition-all"
                    >
                      <PenLine className="h-3 w-3" />
                      Rename
                    </button>
                    <button
                      onClick={() => handleDuplicate(session.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-white/60 hover:text-white hover:bg-white/[0.06] transition-all"
                    >
                      <Copy className="h-3 w-3" />
                      Duplicate
                    </button>
                    <div className="h-px bg-white/[0.06] mx-2 my-0.5" />
                    <button
                      onClick={() => handleDelete(session.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Bottom status */}
      <div className="border-t border-white/[0.04] px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/20">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[9px] text-white/15">
            {sessions.filter((s) => s.status === "running").length} active
          </span>
        </div>
      </div>
    </div>
  )
}
