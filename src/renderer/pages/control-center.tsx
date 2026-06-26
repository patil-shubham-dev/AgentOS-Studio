import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ErrorBoundary, Button } from "@agentic-os/ui"
import type { RuntimeRole } from "@/types"
import { useAppStore } from "@/stores/app-store"
import { useAgentStore } from "@/stores/agent-store"
import { cn } from "@/lib/utils"
import { safeCapitalize } from "@/lib/safeCapitalize"
import { useLeakTracker } from "@/performance/leak-detector"
import {
  Play, Square, RotateCcw, Cpu, MessageSquare, Search,
  Activity, Layers, Brain, AlertTriangle, CheckCircle2, Settings2,
  Wifi, WifiOff, Loader2, Server, Rocket, ArrowRight, Plus,
  CircleCheckBig, CircleEllipsis, CircleOff,
} from "lucide-react"

const stateColors: Record<string, string> = {
  idle: "bg-white/20",
  running: "bg-blue-500",
  error: "bg-red-500",
  completed: "bg-green-500",
}

const roleIcons: Record<string, string> = {
  coding: "bg-blue-500/10 text-blue-500",
  design: "bg-purple-500/10 text-purple-500",
  vision: "bg-pink-500/10 text-pink-500",
  manager: "bg-amber-500/10 text-amber-500",
  qa: "bg-green-500/10 text-green-500",
  runtime: "bg-cyan-500/10 text-cyan-500",
}

const RUNTIME_STATE_DOTS: Record<string, string> = {
  idle: "bg-white/20",
  thinking: "bg-blue-400 animate-pulse",
  planning: "bg-amber-400 animate-pulse",
  executing: "bg-green-400 animate-pulse",
  waiting: "bg-yellow-400",
  reviewing: "bg-purple-400 animate-pulse",
  failed: "bg-red-500",
  recovering: "bg-orange-500 animate-pulse",
}

const CAPABILITY_BADGES: Record<string, { label: string; color: string }> = {
  coding: { label: "Code", color: "bg-blue-500/10 text-blue-400" },
  vision: { label: "Vision", color: "bg-pink-500/10 text-pink-400" },
  reasoning: { label: "Reason", color: "bg-indigo-500/10 text-indigo-400" },
  orchestration: { label: "Orch", color: "bg-amber-500/10 text-amber-400" },
  browsing: { label: "Web", color: "bg-sky-500/10 text-sky-400" },
  toolExecution: { label: "Tools", color: "bg-zinc-500/10 text-zinc-400" },
}

type Readiness = "unconfigured" | "partial" | "ready"

const READINESS_CONFIG: Record<Readiness, { label: string; detail: string; dot: string; icon: typeof CircleOff }> = {
  unconfigured: { label: "Not Configured", detail: "No provider connected", dot: "bg-red-500", icon: CircleOff },
  partial: { label: "Setup Required", detail: "Provider configured, roles missing", dot: "bg-amber-500", icon: CircleEllipsis },
  ready: { label: "Ready", detail: "All systems operational", dot: "bg-green-500", icon: CircleCheckBig },
}

function FallbackCard({ title, description, action, actionLabel, icon: Icon }: {
  title: string
  description: string
  action?: () => void
  actionLabel?: string
  icon?: typeof AlertTriangle
}) {
  const IconComp = Icon || AlertTriangle
  return (
    <div className="rounded-2xl border border-amber-500/15 bg-gradient-to-br from-amber-500/[0.04] to-transparent p-5 backdrop-blur-xl">
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-amber-500/10 p-2 shrink-0">
          <IconComp className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-300">{title}</p>
          <p className="text-xs text-white/50 mt-1">{description}</p>
          {action && actionLabel && (
            <button
              onClick={action}
              className="flex items-center gap-1 text-xs text-amber-400 hover:underline mt-2 transition-colors"
            >
              <Settings2 className="h-3 w-3" /> {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DiagnosticsOverlay() {
  return null
}

function OrchestrationPanel({
  managerConfigured,
  roleConfigStats,
  navigate,
}: {
  managerConfigured: boolean
  roleConfigStats: { total: number; enabled: number; configured: number; executing: number }
  navigate: ReturnType<typeof useNavigate>
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-amber-500/10">
          <Brain className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <span className="text-xs font-semibold text-white/70">Orchestration</span>
      </div>
      <div className="space-y-2">
        {managerConfigured ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-green-400">Ready</span>
            <span className="text-xs text-white/40">– Manager is active</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-sm font-medium text-amber-400">Setup Required</span>
            <button onClick={() => navigate("/settings")} className="text-xs text-amber-500 hover:underline ml-1">Configure</button>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span>{roleConfigStats.configured} role(s) configured</span>
          <span className="text-white/[0.06]">·</span>
          <span>{roleConfigStats.executing} executing</span>
        </div>
        {!managerConfigured && (
          <p className="text-[10px] text-amber-400/70 mt-1">
            Autonomous orchestration is unavailable until a Manager role is configured with a provider and model.
          </p>
        )}
      </div>
    </div>
  )
}

function ProviderStatusCard({ providers, navigate }: {
  providers: ReturnType<typeof useAppStore.getState>["providers"]
  navigate: ReturnType<typeof useNavigate>
}) {
  const configured = providers.filter((p) => p.apiKey.length > 0).length

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-blue-500/10">
          <Server className="h-3.5 w-3.5 text-blue-400" />
        </div>
        <span className="text-xs font-semibold text-white/70">Providers</span>
      </div>
      {providers.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-white/30" />
            <span className="text-sm text-white/50">No Providers</span>
          </div>
          <p className="text-[10px] text-white/30">Add an AI provider to enable agent orchestration.</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/settings")}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/20 px-3 py-2 text-[11px] font-medium text-blue-400 transition-all"
            >
              <Plus className="h-3.5 w-3.5" /> Add Provider
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Wifi className={cn("h-4 w-4", configured > 0 ? "text-green-400" : "text-white/30")} />
              <span className="text-sm font-medium text-white/70">{configured}/{providers.length} configured</span>
            </div>
            <span className="text-xs text-white/40">{providers.reduce((s, p) => s + p.models.length, 0)} models</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {providers.slice(0, 4).map((p) => (
              <span
                key={p.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono border",
                  p.apiKey
                    ? "border-green-500/20 text-green-400 bg-green-500/5"
                    : "border-white/10 text-white/40 bg-white/[0.02]"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", p.apiKey ? "bg-green-500" : "bg-white/20")} />
                {p.name}
              </span>
            ))}
            {providers.length > 4 && (
              <span className="text-[9px] text-white/30">+{providers.length - 4}</span>
            )}
          </div>
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center justify-center gap-1 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] px-2 py-1 text-[10px] text-white/40 hover:text-white/60 transition-all w-full"
          >
            <Settings2 className="h-3 w-3" /> Manage Providers
          </button>
        </div>
      )}
    </div>
  )
}

function RuntimeHealthCard({
  roleConfigs,
  isProcessing,
}: {
  roleConfigs: ReturnType<typeof useAppStore.getState>["roleConfigs"]
  isProcessing: boolean
}) {
  const runningRoles = roleConfigs.filter((r) => r.runtimeState === "executing" || r.runtimeState === "thinking")
  const failedRoles = roleConfigs.filter((r) => r.runtimeState === "failed")

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-500/10">
          <Activity className="h-3.5 w-3.5 text-purple-400" />
        </div>
        <span className="text-xs font-semibold text-white/70">Runtime Health</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={cn("inline-block h-2 w-2 rounded-full", isProcessing ? "bg-green-500 animate-pulse" : "bg-green-500")} />
            <span className="text-sm font-medium text-white/70">{isProcessing ? "Active" : "Idle"}</span>
          </div>
          <span className="text-xs text-white/40">{runningRoles.length} running · {failedRoles.length} failed</span>
        </div>
        {failedRoles.length > 0 && (
          <div className="rounded-xl bg-red-500/5 border border-red-500/20 px-3 py-2">
            <p className="text-[10px] text-red-400 font-medium">{failedRoles.length} agent(s) in failed state</p>
            <p className="text-[9px] text-red-300/60 mt-0.5">{failedRoles.map((r) => r.name).join(", ")}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function OnboardingTaskList({ onNavigate }: { onNavigate: (path: string) => void }) {
  const providers = useAppStore((s) => s.providers)
  const roleConfigs = useAppStore((s) => s.roleConfigs)
  const rootPath = useAppStore((s) => (s as any).rootPath) as string | undefined

  const tasks = [
    { label: "Add a Provider", done: providers.length > 0, action: () => onNavigate("/settings"), icon: Plus },
    { label: "Set API Key", done: providers.some((p) => p.apiKey.length > 0), action: () => onNavigate("/settings"), icon: Settings2 },
    { label: "Configure Manager Role", done: roleConfigs.some((r) => r.name.toLowerCase() === "manager" && r.providerId && r.model), action: () => onNavigate("/agents"), icon: Cpu },
    { label: "Open a Workspace", done: !!rootPath, action: () => onNavigate("/code-canvas"), icon: Rocket },
  ]

  const done = tasks.filter((t) => t.done).length

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white/80">Getting Started</h3>
          <p className="text-[10px] text-white/40 mt-0.5">Complete these steps to start building</p>
        </div>
        <span className="text-xs font-medium text-white/40 bg-white/[0.04] px-2.5 py-1 rounded-full">
          {done} / {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <button
            key={task.label}
            onClick={task.action}
            disabled={task.done}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
              task.done
                ? "border-green-500/15 bg-green-500/[0.03] cursor-default"
                : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] cursor-pointer",
            )}
          >
            <div className={cn(
              "flex items-center justify-center h-7 w-7 rounded-lg shrink-0",
              task.done ? "bg-green-500/10" : "bg-white/[0.04]",
            )}>
              {task.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <task.icon className="h-3.5 w-3.5 text-white/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-xs font-medium", task.done ? "text-green-400" : "text-white/70")}>
                {task.label}
              </p>
            </div>
            {!task.done && <ArrowRight className="h-3.5 w-3.5 text-white/20 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ControlCenterPage() {
  useLeakTracker("ControlCenterPage")
  const navigate = useNavigate()

  const agents = useAppStore((s) => s.agents)
  const roleConfigs = useAppStore((s) => s.roleConfigs)
  const providers = useAppStore((s) => s.providers)
  const isProcessing = useAgentStore((s) => s.isProcessing)
  const activeRole = useAgentStore((s) => s.activeRole)
  const conversations = useAgentStore((s) => s.conversations)
  const orchestrationSteps = useAgentStore((s) => s.orchestrationSteps)
  const rootPath = useAppStore((s) => (s as any).rootPath) as string | undefined
  const [agentSearch, setAgentSearch] = useState("")
  const [showAllRoles, setShowAllRoles] = useState(false)

  const totalTokens = agents.reduce((sum, a) => sum + a.tokenUsage, 0)
  const totalMessages = Object.values(conversations).reduce((sum, c) => sum + (c?.messages?.length ?? 0), 0)
  const managerConfigured = useMemo(() => {
    const mgr = roleConfigs.find((r) => r.name.toLowerCase() === "manager")
    return !!(mgr && mgr.isEnabled && mgr.model && mgr.providerId)
  }, [roleConfigs])

  const enabledRoleConfigs = useMemo(() => roleConfigs.filter((r) => r.isEnabled), [roleConfigs])

  const roleConfigStats = useMemo(() => ({
    total: roleConfigs.length,
    enabled: enabledRoleConfigs.length,
    configured: enabledRoleConfigs.filter((r) => r.model && r.providerId).length,
    executing: enabledRoleConfigs.filter((r) => r.runtimeState === "executing").length,
  }), [roleConfigs, enabledRoleConfigs])

  const hasProvider = providers.length > 0
  const hasConfiguredRoles = roleConfigStats.configured > 0
  const hasApiKey = providers.some((p) => p.apiKey.length > 0)
  const hasManager = managerConfigured
  const hasWorkspace = !!rootPath

  const readiness: Readiness =
    hasProvider && hasApiKey && hasManager && hasConfiguredRoles
      ? "ready"
      : hasProvider || hasConfiguredRoles
        ? "partial"
        : "unconfigured"

  const cfg = READINESS_CONFIG[readiness]
  const ReadinessIcon = cfg.icon

  const activeSteps = orchestrationSteps.filter((s) => s.status === "running").length
  const completedSteps = orchestrationSteps.filter((s) => s.status === "done").length
  const totalSteps = orchestrationSteps.length

  function getAgentState(roleId: string): { state: string; task: string | null } {
    const agentStatuses = useAgentStore.getState().agentStatuses
    const role = roleConfigs.find((r) => r.id === roleId || r.runtimeRole === roleId)
    const key = (role?.runtimeRole ?? roleId) as RuntimeRole
    const status = agentStatuses[key] ?? agentStatuses[roleId]
    if (status && status.state && status.state !== "idle") {
      return { state: status.state, task: status.currentTask ?? null }
    }
    const conv = conversations[key]
    const lastMsg = conv?.messages?.filter((m: { role: string }) => m.role === "user").slice(-1)[0]
    return {
      state: status?.state ?? (conv?.messages && conv.messages.length > 0 ? "completed" : "idle"),
      task: lastMsg?.content?.slice(0, 100) ?? null,
    }
  }

  function getMessageCount(roleId: string): number {
    const role = roleConfigs.find((r) => r.id === roleId || r.runtimeRole === roleId)
    const key = (role?.runtimeRole ?? roleId) as RuntimeRole
    return conversations[key]?.messages?.length ?? 0
  }

  const filteredRoles = enabledRoleConfigs.filter((r) => {
    if (!agentSearch) return true
    const q = agentSearch.toLowerCase()
    return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
  })

  const showOnboardingTasks = readiness !== "ready"
  const showMetrics = readiness === "ready"

  return (
    <ErrorBoundary>
      <div className="h-full overflow-y-auto bg-[#0a0a0b] [background:radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(59,130,246,0.06),transparent),radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(168,85,247,0.04),transparent)]">
        <div className="p-6 max-w-[1300px] mx-auto space-y-6">
          <DiagnosticsOverlay />

          {/* Header with readiness indicator */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
              <p className="text-sm text-white/40">Mission control for the AI operating system</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">System:</span>
                <div className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium border",
                  readiness === "ready"
                    ? "border-green-500/20 bg-green-500/5 text-green-400"
                    : readiness === "partial"
                      ? "border-amber-500/20 bg-amber-500/5 text-amber-400"
                      : "border-red-500/20 bg-red-500/5 text-red-400",
                )}>
                  <ReadinessIcon className={cn("h-3 w-3", cfg.dot.replace("bg-", "text-"))} />
                  {cfg.label}
                </div>
              </div>
            </div>
          </div>

          {/* Show onboarding tasks when not ready */}
          {showOnboardingTasks && (
            <OnboardingTaskList onNavigate={navigate} />
          )}

          {/* Summary metrics — only when ready */}
          {showMetrics && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[
                { label: "Total Tokens", value: `${(totalTokens / 1000).toFixed(1)}K`, icon: Cpu, color: "text-blue-400", detail: "across all agents" },
                { label: "Total Messages", value: totalMessages.toLocaleString(), icon: MessageSquare, color: "text-purple-400", detail: "conversation history" },
                { label: "Active Roles", value: `${roleConfigStats.configured}/${roleConfigStats.enabled}`, icon: Layers, color: "text-amber-400", detail: `${roleConfigStats.executing} executing` },
                { label: "Orchestration Steps", value: totalSteps > 0 ? `${completedSteps}/${totalSteps}` : "—", icon: Brain, color: "text-green-400", detail: totalSteps > 0 ? `${activeSteps} active` : "idle" },
                { label: "Providers", value: `${providers.length}`, icon: Server, color: "text-cyan-400", detail: `${providers.filter((p) => p.apiKey).length} connected` },
              ].map((stat) => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 backdrop-blur-xl">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xl font-bold text-white">{stat.value}</span>
                      <Icon className={cn("h-4 w-4", stat.color)} />
                    </div>
                    <p className="text-[10px] text-white/40">{stat.label}</p>
                    <p className="text-[8px] text-white/20">{stat.detail}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Second row: orchestration, runtime, providers */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <OrchestrationPanel managerConfigured={managerConfigured} roleConfigStats={roleConfigStats} navigate={navigate} />
            <RuntimeHealthCard roleConfigs={roleConfigs} isProcessing={isProcessing} />
            <ProviderStatusCard providers={providers} navigate={navigate} />
          </div>

          {/* Agent filter — always show if any roles exist */}
          {enabledRoleConfigs.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/20" />
                <input
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="Search agents..."
                  className="h-9 w-full rounded-xl border border-white/5 bg-white/[0.03] pl-8 pr-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/10"
                />
              </div>
              {enabledRoleConfigs.length > 6 && (
                <button onClick={() => setShowAllRoles(!showAllRoles)} className="text-xs text-white/40 hover:text-white/70 transition-colors">
                  {showAllRoles ? "Show less" : `Show all ${enabledRoleConfigs.length}`}
                </button>
              )}
            </div>
          )}

          {/* Empty state — no roles at all */}
          {enabledRoleConfigs.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <Cpu className="h-5 w-5 text-white/30" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/50">No agents configured</p>
                <p className="text-xs text-white/30 mt-0.5">Add providers and assign roles in Settings to get started.</p>
              </div>
              <button
                onClick={() => navigate("/settings")}
                className="flex items-center gap-1.5 rounded-lg bg-blue-500/15 border border-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 transition-all"
              >
                <Settings2 className="h-3 w-3" /> Configure Agents
              </button>
            </div>
          )}

          {/* Search no results */}
          {enabledRoleConfigs.length > 0 && filteredRoles.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Search className="h-5 w-5 text-white/20" aria-hidden="true" />
              <p className="text-sm text-white/40">No agents match your search</p>
              <button onClick={() => setAgentSearch("")} className="text-xs text-blue-400 hover:underline">
                Clear search
              </button>
            </div>
          )}

          {/* Agent cards */}
          {filteredRoles.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredRoles.map((roleConfig) => {
                  const agentRole = roleConfig.runtimeRole ?? roleConfig.id as any
                  const agentState = getAgentState(roleConfig.id)
                  const msgCount = getMessageCount(roleConfig.id)
                  const isConfigured = !!(roleConfig.model && roleConfig.providerId)
                  const isManager = roleConfig.name.toLowerCase() === "manager"
                  const stateDot = RUNTIME_STATE_DOTS[roleConfig.runtimeState] || RUNTIME_STATE_DOTS.idle

                  return (
                    <motion.div
                      key={roleConfig.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className={cn(
                        "rounded-2xl border transition-all duration-200 backdrop-blur-xl",
                        isConfigured
                          ? "border-green-500/10 bg-gradient-to-br from-green-500/[0.02] to-white/[0.01]"
                          : "border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01]",
                      )}
                    >
                      <div className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "flex items-center justify-center h-8 w-8 rounded-xl",
                              roleIcons[agentRole] ?? "bg-white/[0.04] text-white/40"
                            )}>
                              <Activity className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-white/80 truncate">{roleConfig.name}</h3>
                              <p className="text-[10px] text-white/40 truncate">{roleConfig.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={cn("inline-block h-2 w-2 rounded-full", stateDot)} />
                            {isConfigured && (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            )}
                          </div>
                        </div>

                        {/* Stats grid — 3 columns */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2">
                            <p className="text-[8px] text-white/30 uppercase tracking-wider">Model</p>
                            <p className="text-[10px] font-medium text-white/60 truncate mt-0.5">
                              {roleConfig.model ? (
                                <>
                                  {roleConfig.model.split("/").pop()?.slice(0, 20)}
                                  {roleConfig.fallbackModel && <span className="text-white/20"> +1</span>}
                                </>
                              ) : "—"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2">
                            <p className="text-[8px] text-white/30 uppercase tracking-wider">Tokens</p>
                            <p className="text-[10px] font-medium text-white/60 mt-0.5">
                              {agents.find((a) => a.role === agentRole)?.tokenUsage?.toLocaleString() ?? 0}
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2">
                            <p className="text-[8px] text-white/30 uppercase tracking-wider">Messages</p>
                            <p className="text-[10px] font-medium text-white/60 mt-0.5">{msgCount}</p>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-white/40">Status:</span>
                          <span className={cn(
                            "text-[10px] font-medium capitalize",
                            roleConfig.runtimeState === "executing" ? "text-green-400" :
                            roleConfig.runtimeState === "failed" ? "text-red-400" :
                            roleConfig.runtimeState === "thinking" ? "text-blue-400" :
                            "text-white/40"
                          )}>
                            {roleConfig.runtimeState}
                          </span>
                          {isConfigured ? (
                            <span className="ml-auto text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-md">configured</span>
                          ) : (
                            <span className="ml-auto text-[8px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded-md">no config</span>
                          )}
                        </div>

                        {/* Capability tags */}
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(CAPABILITY_BADGES).map(([key, badge]) => {
                            if ((roleConfig.capabilities as any)[key]) {
                              return (
                                <span key={key} className={cn("text-[8px] px-1.5 py-0.5 rounded-md", badge.color)}>
                                  {badge.label}
                                </span>
                              )
                            }
                            return null
                          })}
                        </div>

                        {/* Status indicator */}
                        <div className="flex gap-1.5 pt-1">
                          <div className={cn(
                            "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-medium border",
                            agentState.state === "idle" ? "bg-white/[0.04] text-white/50 border-white/5" :
                            agentState.state === "planning" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                            agentState.state === "researching" ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" :
                            agentState.state === "editing" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                            agentState.state === "validating" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                            agentState.state === "complete" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                            agentState.state === "failed" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                            "bg-white/[0.04] text-white/50 border-white/5"
                          )}>
                            <Activity className="h-3 w-3" /> {agentState.state === "complete" ? "Completed" : safeCapitalize(agentState.state, "")}
                          </div>
                          {agentState.task && agentState.state !== "idle" && (
                            <span className="flex items-center text-[10px] text-white/40 truncate max-w-[200px]">· {agentState.task}</span>
                          )}
                        </div>

                        {agentState.task && (
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                            <p className="text-[8px] text-white/30 uppercase tracking-wider mb-0.5">Last Task</p>
                            <p className="text-[10px] text-white/60 truncate">{agentState.task}</p>
                          </div>
                        )}

                        {!isManager && !managerConfigured && (
                          <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-2.5 py-1.5">
                            <p className="text-[9px] text-amber-400">Configure Manager role first for orchestration</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Empty state when filtered list is empty but roles exist */}
          {filteredRoles.length === 0 && enabledRoleConfigs.length > 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <p className="text-sm text-white/40">No agents match your search</p>
              <button onClick={() => setAgentSearch("")} className="text-xs text-blue-400 hover:underline mt-1">Clear search</button>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}
