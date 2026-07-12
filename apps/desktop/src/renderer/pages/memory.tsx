import { useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useMemoryUIStore } from "@/stores/memory-ui-store"
import type { MemoryEntry, MemoryCategory, MemoryScope, MemoryType, MemoryStatus } from "@/runtime/memory/unified/types"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"
import {
  Brain, Search, X, Clock, TrendingUp, Target, BookmarkCheck, Activity,
  ChevronDown, ChevronUp, AlertCircle, Archive, Trash2, Star, FileText,
  Globe, FolderOpen, Layers, Zap, RefreshCw, Bug, Hash, Tag,
} from "lucide-react"

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: "Preference", convention: "Convention", decision: "Decision",
  pattern: "Pattern", workflow: "Workflow", error: "Error",
  learning: "Learning", architecture: "Architecture", command: "Command",
  browser_action: "Browser", tool_usage: "Tool Usage", general: "General",
}

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  preference: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  convention: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  decision: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  pattern: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  workflow: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  error: "text-red-400 bg-red-500/10 border-red-500/20",
  learning: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  architecture: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  command: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  browser_action: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  tool_usage: "text-teal-400 bg-teal-500/10 border-teal-500/20",
  general: "text-neutral-400 bg-neutral-500/10 border-neutral-500/20",
}

const SCOPE_LABELS: Record<MemoryScope, string> = {
  ephemeral: "Ephemeral", session: "Session", project: "Project",
  workspace: "Workspace", user: "User", global: "Global",
}

const TYPE_LABELS: Record<MemoryType, string> = {
  session: "Session", project: "Project", long_term: "Long-Term",
  execution: "Execution", browser: "Browser", user: "User",
  workspace: "Workspace", learning: "Learning",
}

const STATUS_LABELS: Record<MemoryStatus, string> = {
  active: "Active", decaying: "Decaying", archived: "Archived", deleted: "Deleted",
}

function getCategoryIcon(cat: MemoryCategory) {
  switch (cat) {
    case "preference": return <Star className="h-3.5 w-3.5" />
    case "convention": return <BookmarkCheck className="h-3.5 w-3.5" />
    case "decision": return <Target className="h-3.5 w-3.5" />
    case "pattern": return <Layers className="h-3.5 w-3.5" />
    case "workflow": return <Activity className="h-3.5 w-3.5" />
    case "error": return <AlertCircle className="h-3.5 w-3.5" />
    case "learning": return <Brain className="h-3.5 w-3.5" />
    case "architecture": return <FileText className="h-3.5 w-3.5" />
    case "command": return <TerminalIcon className="h-3.5 w-3.5" />
    case "browser_action": return <Globe className="h-3.5 w-3.5" />
    case "tool_usage": return <Zap className="h-3.5 w-3.5" />
    case "general": return <Hash className="h-3.5 w-3.5" />
  }
}

function TerminalIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return "Just now"
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function MemoryPage() {
  const store = useMemoryUIStore()
  const arch = MemoryArchitecture.getInstance()

  useEffect(() => {
    if (arch.isInitialized()) {
      store.refresh()
    }
  }, [])

  return (
    <div className="h-full overflow-hidden bg-[var(--surface-app)] flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.06] bg-[#0c0c0d]">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 border border-white/10">
                <Brain className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Memory</h1>
                <p className="text-xs text-white/40">Search, browse, and manage learned information</p>
              </div>
            </div>
            <button
              onClick={() => store.refresh()}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors rounded-lg hover:bg-white/[0.04]"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", store.loading && "animate-spin")} />
              Refresh
            </button>
          </div>

          {/* Search bar */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
            <input
              type="text"
              value={store.searchQuery}
              onChange={(e) => store.setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="w-full h-9 pl-9 pr-8 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/70 placeholder:text-white/20 outline-none focus:border-white/20 focus:text-white transition-colors"
            />
            {store.searchQuery && (
              <button
                onClick={() => store.setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <FilterSelect value={store.filterCategory} onChange={store.setFilterCategory} label="Category" allLabel="All Categories">
              {(["preference", "convention", "decision", "pattern", "workflow", "error", "learning", "architecture", "command", "browser_action", "tool_usage", "general"] as MemoryCategory[]).map((c) => (
                <FilterOption key={c} value={c} label={CATEGORY_LABELS[c]} />
              ))}
            </FilterSelect>

            <FilterSelect value={store.filterScope} onChange={store.setFilterScope} label="Scope" allLabel="All Scopes">
              {(["ephemeral", "session", "project", "workspace", "user", "global"] as MemoryScope[]).map((s) => (
                <FilterOption key={s} value={s} label={SCOPE_LABELS[s]} />
              ))}
            </FilterSelect>

            <FilterSelect value={store.filterStatus} onChange={store.setFilterStatus} label="Status" allLabel="All Statuses">
              {(["active", "decaying", "archived", "deleted"] as MemoryStatus[]).map((s) => (
                <FilterOption key={s} value={s} label={STATUS_LABELS[s]} />
              ))}
            </FilterSelect>

            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => store.setSort("timestamp", store.sortBy === "timestamp" && store.sortDir === "desc" ? "asc" : "desc")}
                className={cn("flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors",
                  store.sortBy === "timestamp" ? "text-white bg-white/[0.06]" : "text-white/30 hover:text-white/60"
                )}
              >
                <Clock className="h-3 w-3" />
                Date
                {store.sortBy === "timestamp" && (store.sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
              </button>
              <button
                onClick={() => store.setSort("importance", store.sortBy === "importance" && store.sortDir === "desc" ? "asc" : "desc")}
                className={cn("flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors",
                  store.sortBy === "importance" ? "text-white bg-white/[0.06]" : "text-white/30 hover:text-white/60"
                )}
              >
                <TrendingUp className="h-3 w-3" />
                Importance
                {store.sortBy === "importance" && (store.sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
              </button>
              <button
                onClick={() => store.setSort("confidence", store.sortBy === "confidence" && store.sortDir === "desc" ? "asc" : "desc")}
                className={cn("flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors",
                  store.sortBy === "confidence" ? "text-white bg-white/[0.06]" : "text-white/30 hover:text-white/60"
                )}
              >
                <Target className="h-3 w-3" />
                Confidence
                {store.sortBy === "confidence" && (store.sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Entry list */}
        <div className={cn("flex-1 overflow-y-auto", store.detailOpen && "border-r border-white/[0.06]")}>
          {/* Stats cards */}
          {store.stats && !store.searchQuery && (
            <div className="grid grid-cols-4 gap-3 p-4 border-b border-white/[0.04]">
              <StatCard label="Total Entries" value={store.stats.totalEntries.toString()} icon={<Brain className="h-4 w-4" />} color="text-violet-400" />
              <StatCard label="Avg Importance" value={(store.stats.averageImportance * 100).toFixed(0) + "%"} icon={<TrendingUp className="h-4 w-4" />} color="text-emerald-400" />
              <StatCard label="Avg Confidence" value={(store.stats.averageConfidence * 100).toFixed(0) + "%"} icon={<Target className="h-4 w-4" />} color="text-blue-400" />
              <StatCard label="Categories" value={Object.keys(store.stats.byCategory).length.toString()} icon={<Layers className="h-4 w-4" />} color="text-amber-400" />
            </div>
          )}

          <div className="p-4 space-y-2">
            {store.loading && store.entries.length === 0 && (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-6 w-6 text-white/20 animate-spin" />
              </div>
            )}

            {!store.loading && store.entries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Brain className="h-10 w-10 text-white/10 mb-3" />
                <p className="text-sm text-white/30">No memories found</p>
                <p className="text-xs text-white/20 mt-1">
                  {store.searchQuery ? "Try a different search term" : "Memories are created automatically during execution"}
                </p>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {store.entries.map((entry) => (
                <MemoryEntryCard
                  key={entry.id}
                  entry={entry}
                  selected={store.selectedEntry?.id === entry.id}
                  onClick={() => store.selectEntry(entry)}
                />
              ))}
            </AnimatePresence>

            {/* Pagination */}
            {store.totalCount > store.limit && (
              <div className="flex items-center justify-center gap-3 py-4">
                <button
                  onClick={store.prevPage}
                  disabled={store.offset === 0}
                  className="px-3 py-1.5 text-xs text-white/40 hover:text-white/70 disabled:text-white/10 disabled:cursor-not-allowed rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-white/30">
                  {store.offset + 1}–{Math.min(store.offset + store.limit, store.totalCount)} of {store.totalCount}
                </span>
                <button
                  onClick={store.nextPage}
                  disabled={store.offset + store.limit >= store.totalCount}
                  className="px-3 py-1.5 text-xs text-white/40 hover:text-white/70 disabled:text-white/10 disabled:cursor-not-allowed rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Detail pane */}
        <AnimatePresence>
          {store.detailOpen && store.selectedEntry && (
            <MemoryDetailPane entry={store.selectedEntry} store={store} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function MemoryEntryCard({ entry, selected, onClick }: { entry: MemoryEntry; selected: boolean; onClick: () => void }) {
  const colorClass = CATEGORY_COLORS[entry.category] ?? CATEGORY_COLORS.general

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-all duration-150",
        selected
          ? "bg-white/[0.06] border-white/15"
          : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/10"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div className={cn("shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border", colorClass)}>
          {getCategoryIcon(entry.category)}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header line */}
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", colorClass)}>
              {CATEGORY_LABELS[entry.category]}
            </span>
            <span className="text-[10px] text-white/20">{SCOPE_LABELS[entry.scope]}</span>
            {entry.status !== "active" && (
              <span className="text-[10px] text-amber-400/60">{STATUS_LABELS[entry.status]}</span>
            )}
            <span className="text-[10px] text-white/20 ml-auto">{formatDate(entry.timestamp)}</span>
          </div>

          {/* Content preview */}
          <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">{entry.content}</p>

          {/* Footer: importance/confidence bars + tags */}
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-white/20">Importance</span>
              <div className="h-1 w-12 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${entry.importance * 100}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-white/20">Confidence</span>
              <div className="h-1 w-12 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${entry.confidence * 100}%` }} />
              </div>
            </div>
            <span className="text-[9px] text-white/20">v{entry.version}</span>
          </div>

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {entry.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="text-[9px] text-white/20 bg-white/[0.03] px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
              {entry.tags.length > 4 && (
                <span className="text-[9px] text-white/10">+{entry.tags.length - 4}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  )
}

function MemoryDetailPane({ entry, store }: { entry: MemoryEntry; store: ReturnType<typeof useMemoryUIStore> }) {
  const colorClass = CATEGORY_COLORS[entry.category] ?? CATEGORY_COLORS.general

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 360, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="shrink-0 overflow-hidden bg-[#0c0c0d]"
    >
      <div className="w-[360px] h-full overflow-y-auto">
        {/* Detail header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg border", colorClass)}>
              {getCategoryIcon(entry.category)}
            </div>
            <span className="text-sm font-medium text-white">{CATEGORY_LABELS[entry.category]}</span>
          </div>
          <button onClick={store.closeDetail} className="text-white/20 hover:text-white/50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-2">
            <DetailField label="Scope" value={SCOPE_LABELS[entry.scope]} />
            <DetailField label="Type" value={TYPE_LABELS[entry.type] ?? entry.type} />
            <DetailField label="Version" value={entry.version.toString()} />
            <DetailField label="Access Count" value={entry.accessCount.toString()} />
            <DetailField label="Created" value={new Date(entry.timestamp).toLocaleString()} />
            <DetailField label="Last Accessed" value={new Date(entry.lastAccessed).toLocaleString()} />
            <DetailField label="Status" value={STATUS_LABELS[entry.status]} />
            <DetailField label="Source" value={entry.source} />
          </div>

          {/* Importance + Confidence bars */}
          <div className="space-y-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">Importance</span>
                <span className="text-[10px] text-white/50">{(entry.importance * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${entry.importance * 100}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500/80 to-emerald-400/80"
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">Confidence</span>
                <span className="text-[10px] text-white/50">{(entry.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${entry.confidence * 100}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-500/80 to-blue-400/80"
                />
              </div>
            </div>
          </div>

          {/* Full content */}
          <div className="space-y-1">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">Content</span>
            <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{entry.content}</p>
            </div>
          </div>

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Tags</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {entry.tags.map((tag) => (
                  <span key={tag} className="text-[10px] text-white/40 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* File paths */}
          {entry.filePaths.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Files</span>
              {entry.filePaths.map((fp) => (
                <div key={fp} className="flex items-center gap-1.5 text-[11px] text-white/30">
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate">{fp}</span>
                </div>
              ))}
            </div>
          )}

          {/* Metadata JSON */}
          {Object.keys(entry.metadata).length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Metadata</span>
              <pre className="text-[10px] text-white/30 bg-white/[0.03] p-2 rounded-lg border border-white/[0.06] overflow-x-auto">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
            <button
              onClick={() => store.deleteEntry(entry.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className={cn("shrink-0", color)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-white">{value}</p>
        <p className="text-[10px] text-white/30">{label}</p>
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded bg-white/[0.03] border border-white/[0.04]">
      <p className="text-[9px] text-white/20 uppercase tracking-wider">{label}</p>
      <p className="text-[11px] text-white/50 mt-0.5 truncate">{value}</p>
    </div>
  )
}

function FilterSelect({ value, onChange, label, children }: {
  value: string; onChange: (v: any) => void; label: string; allLabel: string; children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 text-[11px] px-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 outline-none cursor-pointer hover:text-white/70 transition-colors appearance-none"
    >
      <option value="all">All {label}s</option>
      {children}
    </select>
  )
}

function FilterOption({ value, label }: { value: string; label: string }) {
  return <option value={value}>{label}</option>
}
