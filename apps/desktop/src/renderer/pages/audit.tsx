/**
 * AuditPage — viewer for the persisted security audit trail.
 *
 * Shows all audit events (access denied, permission denied, command blocked, IPC validation, etc.)
 * with filtering by type, severity, source, and time range.
 */

import { useState, useMemo, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { auditLog, SEVERITY_COLORS, EVENT_TYPE_COLORS, type AuditEvent, type AuditEventType, type AuditSeverity } from "@/lib/audit/AuditLog"
import { cn } from "@/lib/utils"
import {
  Shield, Filter, X, Trash2, Search, RefreshCw,
  Clock, AlertTriangle, Ban, Terminal, FileX,
  ExternalLink, ChevronDown, ChevronRight,
} from "lucide-react"

type FilterState = {
  types: AuditEventType[]
  severities: AuditSeverity[]
  search: string
}

export function AuditPage() {
  const events = auditLog.getEvents()
  const stats = auditLog.getStats()
  const [filters, setFilters] = useState<FilterState>({ types: [], severities: [], search: "" })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [, setRefreshKey] = useState(0)

  // Force re-render when audit log updates
  useEffect(() => {
    const unsub = auditLog.subscribe(() => setRefreshKey((k) => k + 1))
    return unsub
  }, [])

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filters.types.length > 0 && !filters.types.includes(event.type)) return false
      if (filters.severities.length > 0 && !filters.severities.includes(event.severity)) return false
      if (filters.search) {
        const q = filters.search.toLowerCase()
        return (
          event.message.toLowerCase().includes(q) ||
          event.source.toLowerCase().includes(q) ||
          event.action?.toLowerCase().includes(q) ||
          event.filePath?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [events, filters])

  const toggleFilterType = useCallback((type: AuditEventType) => {
    setFilters((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }))
  }, [])

  const toggleFilterSeverity = useCallback((severity: AuditSeverity) => {
    setFilters((prev) => ({
      ...prev,
      severities: prev.severities.includes(severity)
        ? prev.severities.filter((s) => s !== severity)
        : [...prev.severities, severity],
    }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({ types: [], severities: [], search: "" })
  }, [])

  const hasActiveFilters = filters.types.length > 0 || filters.severities.length > 0 || filters.search.length > 0

  return (
    <div className="flex flex-col h-full bg-[var(--surface-app)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10">
            <Shield className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white/85">Audit Trail</h1>
            <p className="text-[10px] text-white/25 mt-0.5">
              {stats.total} total events · {stats.last24h} in last 24h · {stats.lastHour} in last hour
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border",
              showFilters || hasActiveFilters
                ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                : "bg-white/[0.03] text-white/30 border-white/[0.06] hover:bg-white/[0.06]",
            )}
          >
            <Filter className="h-3 w-3" />
            {hasActiveFilters ? `${filters.types.length + filters.severities.length} filters` : "Filter"}
          </button>
          <button
            onClick={() => auditLog.clear()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.03] text-white/30 border border-white/[0.06] hover:bg-red-500/10 hover:text-red-300 transition-all"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/[0.06]"
          >
            <div className="px-6 py-3 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/15" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                  placeholder="Search events..."
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-7 pr-2.5 py-1.5 text-[11px] text-white/60 placeholder:text-white/12 outline-none focus:border-blue-500/30 focus:bg-blue-500/5 transition-all"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {/* Type filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[8px] text-white/20 uppercase tracking-wider font-medium mr-1">Type</span>
                  {(Object.entries(EVENT_TYPE_COLORS) as [AuditEventType, { label: string; icon: string }][]).map(([type, config]) => (
                    <button
                      key={type}
                      onClick={() => toggleFilterType(type)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-all border",
                        filters.types.includes(type)
                          ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                          : "bg-white/[0.02] text-white/20 border-white/[0.04] hover:bg-white/[0.04]",
                      )}
                    >
                      <span>{config.icon}</span>
                      {config.label}
                    </button>
                  ))}
                </div>

                {/* Severity filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[8px] text-white/20 uppercase tracking-wider font-medium mr-1">Severity</span>
                  {(["critical", "error", "warning", "info"] as AuditSeverity[]).map((severity) => {
                    const colors = SEVERITY_COLORS[severity]
                    return (
                      <button
                        key={severity}
                        onClick={() => toggleFilterSeverity(severity)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-all border capitalize",
                          filters.severities.includes(severity)
                            ? `${colors.badge} border-current`
                            : "bg-white/[0.02] text-white/20 border-white/[0.04] hover:bg-white/[0.04]",
                        )}
                      >
                        {severity}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Active filters summary */}
              {hasActiveFilters && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-[9px] text-white/20 hover:text-white/50 transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                    Clear all filters
                  </button>
                  <span className="text-[8px] text-white/10">
                    {filteredEvents.length} of {events.length} events shown
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-white/[0.03] mb-3">
              <Shield className="h-6 w-6 text-white/10" />
            </div>
            <p className="text-[12px] text-white/25 font-medium">
              {hasActiveFilters ? "No events match the current filters" : "No audit events yet"}
            </p>
            <p className="text-[9px] text-white/15 mt-1 max-w-[300px]">
              {hasActiveFilters
                ? "Try clearing filters or changing your search."
                : "Audit events appear here when security actions are blocked or denied."}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredEvents.map((event, index) => (
              <AuditEventRow
                key={event.id}
                event={event}
                isExpanded={expandedId === event.id}
                onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
                index={filteredEvents.length - index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Event Row Component ──

function AuditEventRow({
  event,
  isExpanded,
  onToggle,
  index,
}: {
  event: AuditEvent
  isExpanded: boolean
  onToggle: () => void
  index: number
}) {
  const severityColor = SEVERITY_COLORS[event.severity]
  const typeConfig = EVENT_TYPE_COLORS[event.type]
  const formattedTime = new Date(event.timestamp).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 rounded-lg text-left transition-all",
          "hover:bg-white/[0.03]",
          isExpanded && "bg-white/[0.03]",
        )}
      >
        {/* Index */}
        <span className="text-[9px] text-white/10 font-mono w-6 shrink-0 text-right">#{index}</span>

        {/* Severity indicator */}
        <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", severityColor.badge.split(" ")[0])} />

        {/* Type icon */}
        <span className="text-[10px] shrink-0">{typeConfig.icon}</span>

        {/* Source */}
        <span className="text-[10px] font-mono text-white/30 w-20 shrink-0 truncate">{event.source}</span>

        {/* Message */}
        <span className="flex-1 text-[11px] text-white/60 truncate min-w-0">{event.message}</span>

        {/* Time */}
        <span className="text-[9px] text-white/15 font-mono shrink-0 w-16 text-right truncate">
          {formatRelativeTime(event.timestamp)}
        </span>

        {/* Expand indicator */}
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-white/15 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-white/10 shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="ml-12 mr-3 mb-2 p-3 rounded-lg bg-black/30 border border-white/[0.04] space-y-2">
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-white/20">Type</span>
                  <p className="text-white/60 font-mono mt-0.5">{typeConfig.label}</p>
                </div>
                <div>
                  <span className="text-white/20">Severity</span>
                  <p className={cn("font-mono mt-0.5 capitalize", severityColor.text)}>{event.severity}</p>
                </div>
                <div>
                  <span className="text-white/20">Source</span>
                  <p className="text-white/60 font-mono mt-0.5">{event.source}</p>
                </div>
                <div>
                  <span className="text-white/20">Time</span>
                  <p className="text-white/60 font-mono mt-0.5">{formattedTime}</p>
                </div>
                {event.action && (
                  <div>
                    <span className="text-white/20">Action</span>
                    <p className="text-white/60 font-mono mt-0.5">{event.action}</p>
                  </div>
                )}
                {event.filePath && (
                  <div className="col-span-2">
                    <span className="text-white/20">File Path</span>
                    <p className="text-white/60 font-mono mt-0.5 text-[9px] break-all">{event.filePath}</p>
                  </div>
                )}
              </div>

              {event.args && Object.keys(event.args).length > 0 && (
                <div>
                  <span className="text-[10px] text-white/20">Arguments</span>
                  <pre className="mt-1 text-[8px] font-mono text-white/30 bg-white/[0.03] rounded p-2 overflow-x-auto">
                    {JSON.stringify(event.args, null, 2)}
                  </pre>
                </div>
              )}

              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <div>
                  <span className="text-[10px] text-white/20">Metadata</span>
                  <pre className="mt-1 text-[8px] font-mono text-white/30 bg-white/[0.03] rounded p-2 overflow-x-auto">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return "now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}
