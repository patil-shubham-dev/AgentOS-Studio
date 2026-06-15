import { useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useContextUIStore } from "@/stores/context-ui-store"
import {
  LayoutDashboard, Layers, PieChart, Activity,
  RefreshCw, Zap, Server, Shield, Cpu, Clock,
} from "lucide-react"

export function ContextDashboardPage() {
  const store = useContextUIStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    store.init()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (store.autoRefresh) {
      intervalRef.current = setInterval(() => store.poll(), store.pollingInterval)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [store.autoRefresh, store.pollingInterval])

  if (!store.budgetState) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0b]">
        <div className="text-center">
          <Layers className="h-8 w-8 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">Context Manager not initialized</p>
          <p className="text-xs text-white/20 mt-1">Send a message to initialize context tracking</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0b]">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/10 border border-white/10">
              <LayoutDashboard className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Context Dashboard</h1>
              <p className="text-xs text-white/40">Context budget and monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/30">Auto-refresh</span>
              <button
                onClick={() => store.setAutoRefresh(!store.autoRefresh)}
                className={cn(
                  "relative h-4 w-7 rounded-full transition-colors",
                  store.autoRefresh ? "bg-emerald-500/50" : "bg-white/[0.08]"
                )}
              >
                <motion.div
                  animate={{ x: store.autoRefresh ? 14 : 2 }}
                  className="absolute top-0.5 h-3 w-3 rounded-full bg-white"
                />
              </button>
            </div>
            <button
              onClick={() => store.poll()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/40 hover:text-white/70 rounded-lg hover:bg-white/[0.04] transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TokenBudgetPanel budgetState={store.budgetState} />
          <CompactionPanel compactUsed={store.compactUsed} compactAvailable={store.compactAvailable} />
        </div>
      </div>
    </div>
  )
}

function TokenBudgetPanel({ budgetState }: { budgetState: { used: number; remaining: number; percentageUsed: number } | null }) {
  if (!budgetState) {
    return <PanelShell icon={<PieChart className="h-4 w-4" />} title="Token Budget" subtitle="No budget data available" />
  }

  const total = budgetState.used + budgetState.remaining

  return (
    <PanelShell icon={<PieChart className="h-4 w-4" />} title="Token Budget" subtitle="Context window tracking">
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/50 font-medium">Used</span>
          <span className="text-[11px] text-white/30">
            {budgetState.used.toLocaleString()} / {total.toLocaleString()} tokens
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(budgetState.percentageUsed, 100)}%` }}
            className={cn(
              "h-full rounded-full transition-colors",
              budgetState.percentageUsed > 90 ? "bg-red-500" : budgetState.percentageUsed > 70 ? "bg-amber-500" : "bg-emerald-500"
            )}
          />
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-white/20">Remaining: {budgetState.remaining.toLocaleString()}</span>
          <span className="text-white/20">{budgetState.percentageUsed.toFixed(1)}% used</span>
        </div>
      </div>
    </PanelShell>
  )
}

function CompactionPanel({ compactUsed, compactAvailable }: { compactUsed: number; compactAvailable: number }) {
  return (
    <PanelShell icon={<Zap className="h-4 w-4" />} title="Compaction" subtitle="Auto-compaction tracking">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex flex-col items-center">
          <span className="text-2xl font-semibold text-white">{compactUsed}</span>
          <span className="text-[10px] text-white/30">Compactions</span>
        </div>
        <div className="flex flex-col items-center">
          <span className={cn("text-lg font-medium", compactAvailable > 0 ? "text-emerald-400" : "text-white/20")}>
            {compactAvailable > 0 ? "Enabled" : "Disabled"}
          </span>
          <span className="text-[10px] text-white/30">Auto-compact</span>
        </div>
      </div>
    </PanelShell>
  )
}

function PanelShell({ icon, title, subtitle, children, priority }: {
  icon: React.ReactNode; title: string; subtitle: string; children?: React.ReactNode; priority?: "high" | "normal"
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border bg-[#0c0c0d] overflow-hidden",
        priority === "high" ? "border-red-500/20" : "border-white/[0.06]"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
        <div className={cn(
          "flex items-center justify-center h-7 w-7 rounded-lg border",
          priority === "high"
            ? "bg-red-500/10 border-red-500/20 text-red-400"
            : "bg-white/[0.04] border-white/[0.08] text-white/40"
        )}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-medium text-white">{title}</h2>
          <p className="text-[10px] text-white/30">{subtitle}</p>
        </div>
      </div>
      <div className="p-4">
        {children}
      </div>
    </motion.div>
  )
}
