import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  Plus, X, Clock, CheckCircle2, XCircle, Loader2,
  Search, Copy, Layers, Trash2,
  ExternalLink, ListTodo, Folder, Globe,
} from "lucide-react"
import { useSessionStore, type SessionTab } from "@/stores/session-store"
import { useWorkspaceStore } from "@/stores/workspace-store"

interface SessionSidebarProps {
  open: boolean
  onClose: () => void
  onSessionChange?: (sessionId: string) => void
  onCreateParallel?: () => void
}

function getStatusIcon(status: string, className?: string) {
  const c = className ?? "h-3 w-3"
  switch (status) {
    case "running":
      return <Loader2 className={cn(c, "text-blue-400 animate-spin")} />
    case "completed":
      return <CheckCircle2 className={cn(c, "text-emerald-400")} />
    case "failed":
    case "error":
      return <XCircle className={cn(c, "text-red-400")} />
    default:
      return <Clock className={cn(c, "text-white/30")} />
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "running": return "Running"
    case "completed": return "Completed"
    case "failed": return "Failed"
    case "halted": return "Halted"
    case "orphaned": return "Orphaned"
    default: return "Idle"
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "running": return "border-blue-500/20 bg-blue-500/[0.04]"
    case "completed": return "border-emerald-500/15 bg-emerald-500/[0.03]"
    case "failed":
    case "error": return "border-red-500/15 bg-red-500/[0.03]"
    default: return "border-white/5 bg-white/0"
  }
}

function formatDuration(createdAt: number, lastActive?: number): string {
  const end = lastActive ?? Date.now()
  const diff = end - createdAt
  const mins = Math.floor(diff / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  if (mins > 60) {
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
  }
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function SessionRow({ session, isActive, onSelect, onDestroy, onDuplicate }: {
  session: SessionTab
  isActive: boolean
  onSelect: () => void
  onDestroy: (e: React.MouseEvent) => void
  onDuplicate: (e: React.MouseEvent) => void
}) {
  const [showActions, setShowActions] = useState(false)

  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }}
      onClick={onSelect}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={cn(
        "relative w-full flex items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-all group border",
        isActive
          ? "bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-sm shadow-blue-500/10"
          : "text-white/40 hover:text-white/70 hover:bg-white/[0.03] border-transparent hover:border-white/[0.04]",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {getStatusIcon(session.status, "h-3.5 w-3.5")}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[11px] font-medium truncate",
            isActive ? "text-blue-300" : "text-white/70",
          )}>
            {session.label || `Session ${session.id.slice(0, 6)}`}
          </span>
          {session.status === "running" && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn(
            "text-[9px] font-medium px-1 py-0.5 rounded",
            isActive ? "text-blue-400/60 bg-blue-500/10" : "text-white/20 bg-white/[0.04]",
          )}>
            {getStatusLabel(session.status)}
          </span>
          <span className="text-[9px] text-white/20">
            {formatDuration(session.createdAt, session.lastActive)}
          </span>
        </div>

        {session.summary && (
          <p className="text-[10px] text-white/30 mt-1 leading-relaxed line-clamp-2">
            {session.summary}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1 text-[9px] text-white/20">
          <span>{session.toolCount} tools</span>
          {session.errorCount > 0 && (
            <span className="text-red-400/60">{session.errorCount} errors</span>
          )}
          {session.project && (
            <span className="flex items-center gap-0.5 text-white/20" title={session.project}>
              <Folder className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[80px]">{session.project.split(/[\\/]/).pop()}</span>
            </span>
          )}
          {session.environment && (
            <span className="flex items-center gap-0.5 text-white/15">
              <Globe className="h-2 w-2" />
              {session.environment}
            </span>
          )}
          {session.parallelGroup && (
            <span className="flex items-center gap-0.5 text-blue-400/40">
              <Layers className="h-2.5 w-2.5" />
              parallel
            </span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {showActions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-0.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onDuplicate}
              className="rounded p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
              title="Duplicate session"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={onDestroy}
              className="rounded p-1 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Close session"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function ParallelGroupSection({ group, sessions, activeId, onSelect, onDestroy, onDuplicate }: {
  group: string
  sessions: SessionTab[]
  activeId: string | null
  onSelect: (id: string) => void
  onDestroy: (id: string, e: React.MouseEvent) => void
  onDuplicate: (id: string, e: React.MouseEvent) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 px-3 py-1.5 w-full text-left text-[9px] font-medium text-blue-400/50 hover:text-blue-400/70 hover:bg-white/[0.02] rounded-lg transition-all"
      >
        <Layers className="h-3 w-3" />
        <span>Group: {group}</span>
        <motion.span
          animate={{ rotate: collapsed ? 0 : 90 }}
          transition={{ duration: 0.15 }}
          className="text-white/20"
        >
          ▸
        </motion.span>
        <span className="text-white/20 ml-auto">{sessions.length}</span>
      </button>
      <AnimatePresence>
        {!collapsed && sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            isActive={s.id === activeId}
            onSelect={() => onSelect(s.id)}
            onDestroy={(e) => onDestroy(s.id, e)}
            onDuplicate={(e) => onDuplicate(s.id, e)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

export function SessionSidebar({ open, onClose, onSessionChange, onCreateParallel }: SessionSidebarProps) {
  const tabs = useSessionStore((s) => s.tabs)
  const activeId = useSessionStore((s) => s.activeId)
  const selectTab = useSessionStore((s) => s.selectTab)
  const destroyTab = useSessionStore((s) => s.destroyTab)
  const createTab = useSessionStore((s) => s.createTab)
  const duplicateSession = useSessionStore((s) => s.duplicateSession)
  const parallelGroups = useSessionStore((s) => s.parallelGroups)
  const sessionsByGroup = useSessionStore((s) => s.sessionsByGroup)
  const sessionsByProject = useSessionStore((s) => s.sessionsByProject)
  const projects = useSessionStore((s) => s.projects)
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterEnvironment, setFilterEnvironment] = useState<string | null>(null)
  const [groupByProject, setGroupByProject] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcuts when sidebar is open
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === "n") {
        e.preventDefault()
        const tab = createTab("Session " + (tabs.length + 1), rootPath || undefined)
        onSessionChange?.(tab.id)
      }
      if (meta && e.key === "w") {
        e.preventDefault()
        const active = useSessionStore.getState().getActive()
        if (active) destroyTab(active.id)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, tabs.length, rootPath, createTab, onSessionChange, destroyTab])

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 100)
    } else {
      setSearch("")
      setFilterStatus(null)
      setFilterEnvironment(null)
    }
  }, [open])

  const groupedSessions = useMemo(() => {
    const groups = parallelGroups()
    const ungrouped = tabs.filter((t) => !t.parallelGroup)

    let filtered = [...ungrouped]
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter((t) =>
        t.label.toLowerCase().includes(q) ||
        (t.summary && t.summary.toLowerCase().includes(q)) ||
        (t.project && t.project.toLowerCase().includes(q))
      )
    }
    if (filterStatus) {
      filtered = filtered.filter((t) => t.status === filterStatus)
    }
    if (filterEnvironment) {
      filtered = filtered.filter((t) => t.environment === filterEnvironment)
    }

    // Group by project
    const projectGroups = groupByProject
      ? projects()
          .map((p) => ({ project: p, sessions: filtered.filter((s) => s.project === p) }))
          .filter((g) => g.sessions.length > 0)
      : []

    const remaining = groupByProject
      ? filtered.filter((t) => !t.project)
      : filtered

    return { groups: groups.map((g) => ({ group: g, sessions: sessionsByGroup(g) })), projectGroups, ungrouped: remaining }
  }, [tabs, search, filterStatus, filterEnvironment, groupByProject, parallelGroups, sessionsByGroup, projects])

  const handleCreateSession = useCallback(() => {
    const tab = createTab()
    onSessionChange?.(tab.id)
  }, [createTab, onSessionChange])

  const handleCreateParallel = useCallback(() => {
    const active = useSessionStore.getState().getActive()
    const parallelGroup = active?.parallelGroup ?? `parallel-${Date.now().toString(36)}`
    const tab = createTab()
    useSessionStore.getState().updateTab(tab.id, { parallelGroup })
    onSessionChange?.(tab.id)
    onCreateParallel?.()
  }, [createTab, onSessionChange, onCreateParallel])

  const handleSelect = useCallback((id: string) => {
    selectTab(id)
    onSessionChange?.(id)
  }, [selectTab, onSessionChange])

  const handleDestroy = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    destroyTab(id)
  }, [destroyTab])

  const handleDuplicate = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const tab = duplicateSession(id)
    if (tab) onSessionChange?.(tab.id)
  }, [duplicateSession, onSessionChange])

  const statusFilters = ["running", "completed", "failed", "idle"] as const

  if (!open) return null

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 300, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-[#0c0c0d] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-2">
          <ListTodo className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-[11px] font-medium text-white/60">Sessions</span>
          <span className="text-[9px] text-white/20 font-mono">{tabs.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setGroupByProject(!groupByProject)}
            className={cn(
              "rounded p-1 text-[9px] transition-all",
              groupByProject ? "text-blue-400 bg-blue-500/10" : "text-white/20 hover:text-white/50 hover:bg-white/[0.06]",
            )}
            title="Group by project"
          >
            <Folder className="h-3 w-3" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCreateSession}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
            title="New session (⌘N)"
          >
            <Plus className="h-3 w-3" />
            <span>New</span>
          </motion.button>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
            title="Close sidebar (⌘⇧S)"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-1.5 focus-within:border-blue-500/30 transition-colors">
          <Search className="h-3 w-3 text-white/20 shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter sessions..."
            className="flex-1 bg-transparent text-[10px] text-white/50 placeholder:text-white/15 outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="rounded p-0.5 text-white/20 hover:text-white/50 transition-all"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status filter chips */}
      {!search && (
        <div className="flex items-center gap-1 px-3 pb-2 shrink-0 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setFilterStatus(null)}
            className={cn(
              "rounded-lg px-2 py-0.5 text-[9px] font-medium transition-all shrink-0",
              !filterStatus
                ? "bg-blue-500/10 text-blue-400"
                : "text-white/20 hover:text-white/40 hover:bg-white/[0.04]",
            )}
          >
            All
          </button>
          {statusFilters.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? null : s)}
              className={cn(
                "rounded-lg px-2 py-0.5 text-[9px] font-medium transition-all shrink-0 flex items-center gap-1",
                filterStatus === s
                  ? "bg-blue-500/10 text-blue-400"
                  : "text-white/20 hover:text-white/40 hover:bg-white/[0.04]",
              )}
            >
              {getStatusIcon(s, "h-2.5 w-2.5")}
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {/* Parallel groups */}
        {groupedSessions.groups.map(({ group, sessions: groupSessions }) => (
          <ParallelGroupSection
            key={group}
            group={group}
            sessions={groupSessions}
            activeId={activeId}
            onSelect={handleSelect}
            onDestroy={handleDestroy}
            onDuplicate={handleDuplicate}
          />
        ))}

        {/* Project groups */}
        {groupedSessions.projectGroups.map(({ project, sessions: projectSessions }) => (
          <div key={project} className="mb-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <Folder className="h-3 w-3 text-white/20" />
              <span className="text-[9px] font-medium text-white/25 truncate">{project.split(/[\\/]/).pop()}</span>
              <span className="text-[8px] text-white/15 ml-auto font-mono">{projectSessions.length}</span>
            </div>
            <AnimatePresence mode="popLayout">
              {projectSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  isActive={s.id === activeId}
                  onSelect={() => handleSelect(s.id)}
                  onDestroy={(e) => handleDestroy(s.id, e)}
                  onDuplicate={(e) => handleDuplicate(s.id, e)}
                />
              ))}
            </AnimatePresence>
          </div>
        ))}

        {/* Ungrouped sessions */}
        <AnimatePresence mode="popLayout">
          {groupedSessions.ungrouped.length === 0 && groupedSessions.groups.length === 0 && groupedSessions.projectGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ListTodo className="h-6 w-6 text-white/10 mb-2" />
              <p className="text-[10px] text-white/20 max-w-[160px]">
                {search ? "No sessions match your search" : filterEnvironment ? "No sessions in this environment" : "No sessions yet. Create one to get started."}
              </p>
              <p className="text-[8px] text-white/10 mt-1">
                <kbd className="px-1 rounded bg-white/[0.04] border border-white/[0.06]">⌘N</kbd> new · <kbd className="px-1 rounded bg-white/[0.04] border border-white/[0.06]">⌘W</kbd> close
              </p>
            </div>
          ) : (
            groupedSessions.ungrouped.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                isActive={s.id === activeId}
                onSelect={() => handleSelect(s.id)}
                onDestroy={(e) => handleDestroy(s.id, e)}
                onDuplicate={(e) => handleDuplicate(s.id, e)}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/[0.04] px-3 py-2">
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCreateParallel}
            disabled={tabs.length === 0}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-medium text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed w-full"
          >
            <Layers className="h-3 w-3" />
            <span>New Parallel Session</span>
            <ExternalLink className="h-2.5 w-2.5 ml-auto" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
