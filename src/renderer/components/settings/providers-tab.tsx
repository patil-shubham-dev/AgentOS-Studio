import { useState, useMemo, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app-store"
import type { GatewayProvider } from "@/types"
import { Button } from "@agentic-os/ui"
import { ProviderCard } from "./providers/provider-card"
import { ProviderDrawer } from "./providers/provider-drawer"
import { DiagnosticsConsole } from "./providers/diagnostics-console"
import { useIntegrity } from "@/lib/use-integrity"
import { runFullValidation } from "@agentic-os/providers"
import { getSummary, getAllHealth, getHealthInfo, resetAllHealth } from "@agentic-os/providers"
import {
  Plus, Search, Wifi, Box, Cpu, AlertTriangle, RefreshCw,
  X, ListCollapse, Layers, Activity, Shield,
} from "lucide-react"
import { WiringIndicator } from "./wiring-indicator"
import { useProviderHealthPolling } from "@/hooks/use-provider-health-polling"

export function ProvidersTab() {
  const providers = useAppStore((s) => s.providers)
  const removeProvider = useAppStore((s) => s.removeProvider)
  const { hasIssues, hasErrors, issuesByType, runValidation, runRepair, lastRepairResult } = useIntegrity()

  useProviderHealthPolling(providers.length > 0)

  const [search, setSearch] = useState("")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<GatewayProvider | null>(null)
  const [diagnosticsProvider, setDiagnosticsProvider] = useState<GatewayProvider | null>(null)
  const [allExpanded, setAllExpanded] = useState(false)
  const [validatingAll, setValidatingAll] = useState(false)

  const runValidationAll = useCallback(async () => {
    setValidatingAll(true)
    for (const p of providers) {
      try {
        const models = p.models.map((m) => m.id)
        await runFullValidation(p.baseUrl, p.apiKey, p.runtime, models)
      } catch {
        // best effort
      }
    }
    setValidatingAll(false)
  }, [providers])

  useEffect(() => {
    if (providers.length > 0) {
      runValidationAll()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const healthSummary = useMemo(() => getSummary(), [providers])
  const allHealth = useMemo(() => getAllHealth(), [providers])

  const totalModels = providers.reduce((s, p) => s + p.models.length, 0)
  const runtimes = new Set(providers.map((p) => p.runtime).filter(Boolean)).size

  const filtered = useMemo(() => {
    if (!search) return providers
    const q = search.toLowerCase()
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.baseUrl.toLowerCase().includes(q) ||
        (p.runtime && p.runtime.toLowerCase().includes(q)) ||
        p.models.some((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
    )
  }, [providers, search])

  function toggleAllExpanded() {
    setAllExpanded((prev) => !prev)
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-white tracking-tight">AI Providers</h2>
        <p className="text-sm text-white/40">Manage AI providers — connection health, model discovery, and runtime orchestration</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Connected",
            value: String(healthSummary.connected),
            icon: Wifi,
            color: "text-green-400",
            detail: `${healthSummary.total} total providers`,
            bgGradient: "from-green-500/10 to-emerald-500/5",
            borderColor: "border-green-500/10",
          },
          {
            label: "Degraded",
            value: String(healthSummary.degraded),
            icon: Activity,
            color: "text-amber-400",
            detail: "partial or degraded connections",
            bgGradient: "from-amber-500/10 to-yellow-500/5",
            borderColor: "border-amber-500/10",
          },
          {
            label: "Offline",
            value: String(healthSummary.offline + healthSummary.error),
            icon: AlertTriangle,
            color: "text-red-400",
            detail: `${healthSummary.offline} offline, ${healthSummary.error} errors`,
            bgGradient: "from-red-500/10 to-rose-500/5",
            borderColor: "border-red-500/10",
          },
          {
            label: "Models & Runtimes",
            value: String(totalModels),
            icon: Box,
            color: "text-purple-400",
            detail: `${runtimes} runtime(s)`,
            bgGradient: "from-purple-500/10 to-pink-500/5",
            borderColor: "border-purple-500/10",
          },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className={cn(
                "rounded-2xl border backdrop-blur-xl p-4 transition-all hover:border-white/15",
                stat.borderColor, `bg-gradient-to-br ${stat.bgGradient}`,
              )}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-2xl font-bold text-white">{stat.value}</span>
                  <p className="text-[10px] text-white/20 mt-0.5 truncate">{stat.detail}</p>
                </div>
                <div className={cn("p-2 rounded-lg bg-white/[0.03] border border-white/5 shrink-0", stat.color)}>
                  <Icon className={cn("h-5 w-5", stat.color)} />
                </div>
              </div>
              <p className="text-xs text-white/40 mt-2">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Aggregate latency bar */}
      {healthSummary.avgLatencyMs > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
          <Activity className="h-4 w-4 text-white/30 shrink-0" />
          <span className="text-xs text-white/40">Aggregate latency: </span>
          <span className="text-xs font-mono text-white/70">{healthSummary.avgLatencyMs}ms avg</span>
          <span className="text-[10px] text-white/20 ml-auto shrink-0">{healthSummary.total} provider(s) tracked</span>
        </div>
      )}

      {/* Validation issues */}
      {hasIssues && (
        <div className={cn(
          "flex items-center gap-2 rounded-2xl border px-4 py-3 flex-wrap",
          hasErrors ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5",
        )}>
          <AlertTriangle className={cn("h-4 w-4 shrink-0", hasErrors ? "text-red-400" : "text-amber-400")} />
          <span className={cn("text-xs flex-1 min-w-0", hasErrors ? "text-red-400" : "text-amber-400")}>
            {hasErrors
              ? `${issuesByType.errors.length} provider/role error(s) — run repair to auto-fix`
              : `${issuesByType.warnings.length} warning(s)`}
            {lastRepairResult && lastRepairResult.repairsSucceeded > 0 && (
              <> — {lastRepairResult.repairsSucceeded} issue(s) fixed</>
            )}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => runRepair()}>
              <AlertTriangle className="h-3 w-3 mr-1" /> Repair
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => runValidation()}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] sm:min-w-[200px] max-w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers, models, runtimes..."
            className="w-full h-10 rounded-xl border border-white/5 bg-white/[0.03] pl-10 pr-9 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/10 focus:bg-white/[0.03] transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {filtered.length > 1 && (
          <button
            onClick={toggleAllExpanded}
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-white/5 bg-white/[0.03] text-xs text-white/40 hover:text-white hover:bg-white/5 transition-all"
          >
            {allExpanded ? <Layers className="h-3.5 w-3.5" /> : <ListCollapse className="h-3.5 w-3.5" />}
            {allExpanded ? "Collapse All" : "Expand All"}
          </button>
        )}

        <button
          onClick={runValidationAll}
          disabled={validatingAll}
          className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-white/5 bg-white/[0.03] text-xs text-white/40 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", validatingAll && "animate-spin")} />
          Validate All
        </button>

        <div className="flex-1 hidden sm:block" />
        <WiringIndicator variant="compact" className="mr-2 hidden sm:flex" />

        <Button
          size="sm"
          className="h-10 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white border-0 shadow-lg shadow-blue-600/20"
          onClick={() => { setEditingProvider(null); setDrawerOpen(true) }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add Provider
        </Button>
      </div>

      {/* Provider cards grid */}
      <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              expanded={allExpanded}
              onRetest={runValidationAll}
              onEdit={() => { setEditingProvider(p); setDrawerOpen(true) }}
              onDelete={() => removeProvider(p.id)}
              onOpenDiagnostics={() => setDiagnosticsProvider(p)}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-white/[0.02] border border-white/5 mb-4">
            <Box className="h-8 w-8 text-white/10" />
          </div>
          <p className="text-sm text-white/30 mb-1">
            {search ? `No providers match "${search}"` : "No providers configured yet"}
          </p>
          <p className="text-xs text-white/20 mb-6">
            {search ? 'Try a different search term' : 'Click "Add Provider" to connect your first AI provider'}
          </p>
          {!search && (
            <Button
              size="sm"
              className="h-10 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white border-0 shadow-lg shadow-blue-600/20"
              onClick={() => { setEditingProvider(null); setDrawerOpen(true) }}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Add Provider
            </Button>
          )}
        </motion.div>
      )}

      <ProviderDrawer
        open={drawerOpen}
        onClose={(saved?: boolean) => { setDrawerOpen(false); setEditingProvider(null); if (saved) runValidationAll() }}
        editProvider={editingProvider}
      />

      <DiagnosticsConsole
        open={!!diagnosticsProvider}
        onClose={() => setDiagnosticsProvider(null)}
        provider={diagnosticsProvider}
      />
    </div>
  )
}
