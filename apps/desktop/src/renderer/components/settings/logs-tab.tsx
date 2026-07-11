import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Badge } from "@agentic-os/ui"
import { useLedgerStore } from "@/stores/ledger-store"
import {
  Activity, Search, BarChart3,
  AlertTriangle, Info, CheckCircle2,
  XCircle, Clock,
} from "lucide-react"
import type { LedgerEntry } from "@/types"

function logToRow(entry: LedgerEntry) {
  const isError = entry.status === "error"
  const isSuccess = entry.status === "success"
  return {
    id: `${entry.timestamp}-${entry.action}`,
    type: isError ? "error" : "info",
    category: entry.agentId || "runtime",
    message: entry.summary,
    agent: entry.agentId || null,
    duration: 0,
    timestamp: entry.timestamp,
  }
}

export function LogsTab() {
  const ledgerEntries = useLedgerStore((s) => s.entries)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  const logs = useMemo(() => {
    return ledgerEntries.map(logToRow)
  }, [ledgerEntries])

  const categories = useMemo(() => [...new Set(logs.map((l) => l.category))], [logs])

  const filtered = logs.filter((l) => {
    if (typeFilter !== "all" && l.type !== typeFilter) return false
    if (categoryFilter !== "all" && l.category !== categoryFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return l.message.toLowerCase().includes(q) || (l.agent || "").toLowerCase().includes(q)
  })

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-white tracking-tight">Logs & Usage</h2>
        <p className="text-sm text-white/40">Monitor audit logs from agent execution activity</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Actions", value: ledgerEntries.length.toString(), icon: Activity, color: "text-blue-400" },
          { label: "Errors", value: ledgerEntries.filter((e) => e.status === "error").length.toString(), icon: XCircle, color: "text-red-400" },
          { label: "Success", value: ledgerEntries.filter((e) => e.status === "success").length.toString(), icon: CheckCircle2, color: "text-green-400" },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">{stat.value}</span>
                <Icon className={cn("h-5 w-5 opacity-60", stat.color)} />
              </div>
              <p className="text-xs text-white/40 mt-1">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs..." className="w-full h-10 rounded-xl border border-white/5 bg-white/[0.03] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/10" />
        </div>
        <div className="flex gap-1">
          {["all", "success", "info", "warning", "error"].map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-all capitalize", typeFilter === t ? "bg-white/10 text-white border border-white/10" : "text-white/30 hover:text-white/50 border border-transparent")}>{t}</button>
          ))}
        </div>
      </div>

      {/* Category Filters */}
      {categories.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setCategoryFilter("all")} className={cn("rounded-lg px-3 py-1 text-xs font-medium transition-all", categoryFilter === "all" ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50")}>All</button>
          {categories.map((cat) => (
            <button key={cat} onClick={() => setCategoryFilter(cat)} className={cn("rounded-lg px-3 py-1 text-xs font-medium transition-all capitalize", categoryFilter === cat ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50")}>{cat}</button>
          ))}
        </div>
      )}

      {/* Logs Table */}
      <div className="rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-[10px] font-medium text-white/30 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-[10px] font-medium text-white/30 uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-3 text-[10px] font-medium text-white/30 uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-[10px] font-medium text-white/30 uppercase tracking-wider">Message</th>
                <th className="text-left px-4 py-3 text-[10px] font-medium text-white/30 uppercase tracking-wider">Agent</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.slice().reverse().map((log) => (
                  <motion.tr
                    key={log.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      {log.type === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> :
                       log.type === "error" ? <XCircle className="h-3.5 w-3.5 text-red-400" /> :
                       log.type === "warning" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> :
                       <Info className="h-3.5 w-3.5 text-blue-400" />}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-white/40 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={
                        log.category === "provider" ? "info" :
                        log.category === "agent" ? "success" :
                        log.category === "memory" ? "purple" :
                        log.category === "tool" ? "warning" :
                        "default"
                      } size="sm">{log.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/70 max-w-xs truncate">{log.message}</td>
                    <td className="px-4 py-3 text-xs text-white/40 font-mono">{log.agent || "—"}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <BarChart3 className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">{ledgerEntries.length === 0 ? "No execution activity yet — start a conversation to see logs here" : "No logs match your filters"}</p>
          </div>
        )}
      </div>
    </div>
  )
}

