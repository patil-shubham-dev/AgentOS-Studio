import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { cn } from "@/lib/utils"
import {
  CheckCircle2, AlertTriangle, XCircle, Loader2,
  Activity, RefreshCw, Users, Wifi, WifiOff,
} from "lucide-react"

const HEALTH_META = {
  healthy: { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/15", label: "Ready" },
  degraded: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/15", label: "Degraded" },
  unhealthy: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/15", label: "Unhealthy" },
}

/**
 * Compact live wiring status indicator for embedding in Settings pages.
 * Shows runtime health at a glance — role wiring, manager status, provider count,
 * and a refresh button when the config is stale.
 *
 * Props control which sections are shown for flexible embedding:
 * - `variant="bar"` (default): full horizontal bar with all info
 * - `variant="compact"`: just the health dot + wired count, for tight spaces
 * - `variant="card"`: small card block for stat areas
 */
export function WiringIndicator({
  variant = "bar",
  className,
}: {
  variant?: "bar" | "compact" | "card"
  className?: string
}) {
  const status = useWorkspaceRuntime((s) => s.status)
  const health = useWorkspaceRuntime((s) => s.health)
  const isReady = useWorkspaceRuntime((s) => s.isReady)
  const totalProviders = useWorkspaceRuntime((s) => s.totalProviders)
  const totalRoles = useWorkspaceRuntime((s) => s.totalRoles)
  const wiredRoles = useWorkspaceRuntime((s) => s.wiredRoles)
  const managerWired = useWorkspaceRuntime((s) => s.managerWired)
  const hasStaleConfig = useWorkspaceRuntime((s) => s.hasStaleConfig)
  const refreshRuntime = useWorkspaceRuntime((s) => s.refresh)
  const initializeRuntime = useWorkspaceRuntime((s) => s.initialize)

  const meta = health ? HEALTH_META[health] : HEALTH_META.unhealthy
  const Icon = meta.icon
  const isInitializing = status === "initializing"
  const isUninitialized = status === "uninitialized"

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {isInitializing ? (
          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
        ) : (
          <Icon className={cn("h-3 w-3", meta.color)} />
        )}
        <span className={cn(
          "text-[10px] font-medium",
          isReady ? "text-green-400" : "text-white/40",
        )}>
          {wiredRoles}/{totalRoles}
        </span>
      </div>
    )
  }

  if (variant === "card") {
    return (
      <div className={cn(
        "rounded-2xl border bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 backdrop-blur-xl transition-all hover:border-white/10",
        meta.border,
        className,
      )}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg bg-white/[0.03] border", meta.border)}>
              {isInitializing ? (
                <Loader2 className={cn("h-5 w-5 animate-spin", meta.color)} />
              ) : (
                <Icon className={cn("h-5 w-5", meta.color)} />
              )}
            </div>
            <div>
              <span className={cn("text-2xl font-bold text-white", meta.color)}>
                {isUninitialized ? "—" : isInitializing ? "..." : wiredRoles}
              </span>
              <p className="text-[10px] text-white/20">
                of {totalRoles} roles wired
              </p>
            </div>
          </div>
          {hasStaleConfig && (
            <button
              onClick={() => refreshRuntime()}
              className="rounded-lg p-1.5 text-yellow-400 hover:bg-yellow-500/10 transition-all"
              title="Refresh wiring"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full",
            managerWired
              ? "bg-green-500/10 text-green-400"
              : "bg-white/[0.04] text-white/30",
          )}>
            {managerWired ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
            Manager {managerWired ? "wired" : "not wired"}
          </span>
          <span className="text-white/30">{totalProviders} provider{totalProviders !== 1 ? "s" : ""}</span>
          {isReady && (
            <span className="text-green-400/60 flex items-center gap-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Active
            </span>
          )}
          {hasStaleConfig && (
            <span className="text-yellow-400/60 flex items-center gap-0.5">
              <RefreshCw className="h-2.5 w-2.5" />
              Stale
            </span>
          )}
        </div>
        <p className="text-xs text-white/40 mt-2">Runtime Wiring</p>
      </div>
    )
  }

  // bar variant (default)
  if (isUninitialized) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <button
          onClick={() => initializeRuntime()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-2.5 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/[0.1] transition-all"
        >
          <Activity className="h-3 w-3" />
          Initialize Runtime
        </button>
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Health badge */}
      <span className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-medium",
        meta.bg, meta.border, meta.color,
      )}>
        {isInitializing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Icon className="h-3 w-3" />
        )}
        {isInitializing ? "Initializing..." : meta.label}
      </span>

      {/* Wired count */}
      <span className="inline-flex items-center gap-1 text-[10px] text-white/50">
        <Users className="h-3 w-3 text-white/30" />
        <span className="font-medium text-white/70">{wiredRoles}</span>
        <span className="text-white/30">/ {totalRoles} wired</span>
      </span>

      {/* Manager status */}
      <span className={cn(
        "inline-flex items-center gap-1 text-[10px]",
        managerWired ? "text-green-400/70" : "text-white/30",
      )}>
        {managerWired ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
        {managerWired ? "Manager wired" : "Manager not wired"}
      </span>

      {/* Provider count */}
      <span className="text-[10px] text-white/30">
        {totalProviders} provider{totalProviders !== 1 ? "s" : ""}
      </span>

      {/* Stale config refresh */}
      {hasStaleConfig && (
        <button
          onClick={() => refreshRuntime()}
          className="inline-flex items-center gap-1 rounded-md border border-yellow-500/20 bg-yellow-500/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-yellow-400 hover:bg-yellow-500/[0.1] transition-all"
        >
          <RefreshCw className="h-2.5 w-2.5" />
          Refresh
        </button>
      )}
    </div>
  )
}
