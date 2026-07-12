import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { RolesTab } from "@/components/settings/roles-tab"
import { RoleHierarchyTree } from "@/components/settings/agents/role-hierarchy-tree"
import { RoleDependencyGraph } from "@/components/settings/agents/role-dependency-graph"
import { AgentTreeView } from "@/components/settings/agents/agent-tree-view"
import { useAppStore } from "@/stores/app-store"
import { useIntegrity } from "@/lib/use-integrity"
import { Button, Badge } from "@agentic-os/ui"
import { useLeakTracker } from "@/performance/leak-detector"
import {
  Users, LayoutGrid, GitFork, Share2, Plus, Search,
  Settings2, AlertTriangle, CheckCircle2, Cpu, Brain,
  Activity, RefreshCw, Wifi, WifiOff, Loader2,
} from "lucide-react"

type ViewMode = "grid" | "hierarchy" | "dependencies" | "runtime"

export function AgentsPage() {
  useLeakTracker("AgentsPage")
  const roleConfigs = useAppStore((s) => s.roleConfigs)
  const upsertRoleConfig = useAppStore((s) => s.upsertRoleConfig)
  const { hasIssues, hasErrors, issuesByType, runRepair, lastRepairResult } = useIntegrity()
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    if (roleConfigs.length > 0) {
      setPageLoading(false)
    } else {
      const timer = setTimeout(() => setPageLoading(false), 300)
      return () => clearTimeout(timer)
    }
  }, [roleConfigs])

  const stats = useMemo(() => {
    const enabled = roleConfigs.filter((r) => r.isEnabled)
    const configured = enabled.filter((r) => r.model && r.providerId)
    const running = enabled.filter(
      (r) => r.runtimeState === "executing" || r.runtimeState === "thinking",
    )
    const failed = enabled.filter((r) => r.runtimeState === "failed")
    const uptime = enabled.length > 0
      ? Math.round(((enabled.length - failed.length) / enabled.length) * 100)
      : 0
    return {
      total: roleConfigs.length,
      enabled: enabled.length,
      configured: configured.length,
      running: running.length,
      failed: failed.length,
      uptime,
    }
  }, [roleConfigs])

  const selectedRole = selectedRoleId
    ? roleConfigs.find((r) => r.id === selectedRoleId) ?? null
    : null

  function handleCreateRole() {
    const icon = "Star"
    const priorities = roleConfigs.map((r) => r.priority)
    const nextPriority = priorities.length > 0 ? Math.max(...priorities) + 1 : 1
    upsertRoleConfig({
      id: `role-${crypto.randomUUID().slice(0, 8)}`,
      name: "New Role",
      description: "Custom agent role",
      color: "from-gray-500/20 to-zinc-500/10",
      icon,
      temperature: 0.3,
      maxTokens: 4096,
      systemPrompt: "You are a helpful assistant inside AgenticOS.\n\nYour responsibility is to assist with tasks assigned by the Manager Agent.\n\nCollaborate with other agents as needed and report results clearly.",
      systemPromptVersion: 1,
      runtimeState: "idle",
      capabilities: {
        coding: false, browsing: false, planning: false, memory: true,
        fileAccess: false, internetAccess: false, toolExecution: false,
        sandboxEscape: false, vision: false, reasoning: false, orchestration: false,
      },
      toolPermissions: [],
      memoryScope: "session",
      priority: nextPriority,
      collaborationTags: [],
      isBuiltIn: false,
      isEnabled: true,
      executionCount: 0,
    })
  }

  const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: typeof LayoutGrid; desc: string }[] = [
    { mode: "grid", label: "Grid", icon: LayoutGrid, desc: "Card-based role management" },
    { mode: "hierarchy", label: "Hierarchy", icon: GitFork, desc: "Parent-child role tree" },
    { mode: "dependencies", label: "Dependencies", icon: Share2, desc: "Role relationship map" },
    { mode: "runtime", label: "Runtime Tree", icon: Activity, desc: "Live sub-agent hierarchy" },
  ]

  if (pageLoading) {
    return (
      <div className="h-full overflow-y-auto bg-[var(--surface-app)]">
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              <p className="text-sm text-white/40">Loading agent workforce...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-app)]">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/10 border border-white/10 shadow-lg shadow-blue-500/5">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Agents</h1>
              <p className="text-sm text-white/40 mt-0.5">
                Workforce hub — manage roles, hierarchy, and dependencies
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasIssues && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-amber-500/20 text-amber-400 hover:bg-amber-500/10 text-[10px]"
                onClick={() => runRepair()}
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Repair {hasErrors ? `(${issuesByType.errors.length})` : `(${issuesByType.warnings.length})`}
              </Button>
            )}
            <Button
              size="sm"
              className="h-9 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white border-0 shadow-lg shadow-blue-600/20"
              onClick={handleCreateRole}
            >
              <Plus className="h-4 w-4 mr-1.5" /> New Role
            </Button>
          </div>
        </div>

        {/* ── Stats Bar ── */}
        {roleConfigs.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center py-12 text-center"
          >
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/15 to-purple-500/10 border border-white/10 mb-4">
              <Users className="h-7 w-7 text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">Welcome to Agent Workforce</h2>
            <p className="text-sm text-white/40 max-w-md mb-6">
              Create agent roles to build your AI workforce. Each role can be configured with a model, capabilities, and collaboration rules.
            </p>
            <Button onClick={handleCreateRole} size="sm" className="h-8 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Create Your First Role
            </Button>
          </motion.div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Roles", value: stats.total, icon: Users, color: "text-blue-400" },
            { label: "Enabled", value: stats.enabled, icon: CheckCircle2, color: "text-green-400" },
            { label: "Configured", value: stats.configured, icon: Cpu, color: "text-purple-400" },
            { label: "Active", value: stats.running, icon: Activity, color: "text-cyan-400" },
            { label: "Failed", value: stats.failed, icon: AlertTriangle, color: "text-red-400" },
            { label: "Uptime", value: `${stats.uptime}%`, icon: Brain, color: stats.uptime > 80 ? "text-green-400" : stats.uptime > 50 ? "text-amber-400" : "text-red-400" },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-2xl font-bold text-white">{stat.value}</span>
                  <Icon className={cn("h-4 w-4", stat.color)} />
                </div>
                <p className="text-xs text-white/40">{stat.label}</p>
              </motion.div>
            )
          })}
        </div>

        {/* ── View Tabs ── */}
        <div className="flex items-center gap-2 border-b border-white/5 pb-px">
          {VIEW_OPTIONS.map((opt) => {
            const isActive = viewMode === opt.mode
            const Icon = opt.icon
            return (
              <button
                key={opt.mode}
                onClick={() => setViewMode(opt.mode)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all relative",
                  isActive
                    ? "text-white border-blue-400"
                    : "text-white/40 border-transparent hover:text-white/60",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
                {isActive && (
                  <motion.div
                    layoutId="agentViewUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500"
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  />
                )}
              </button>
            )
          })}

          <div className="flex-1" />

          {/* Search */}
          <div className="relative max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search roles..."
              className="w-full h-8 rounded-lg border border-white/5 bg-white/[0.03] pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-white/10 transition-all"
            />
          </div>

          {/* Manager status badge — subtle, non-blocking */}
          {(() => {
            const manager = roleConfigs.find((r) => r.name.toLowerCase() === "manager")
            const managerReady = !!(manager?.isEnabled && manager?.model && manager?.providerId)
            return (
              <span className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium border",
                managerReady
                  ? "border-green-500/20 bg-green-500/5 text-green-400"
                  : "border-white/[0.06] bg-white/[0.02] text-white/30",
              )}>
                {managerReady ? <Wifi className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}
                {managerReady ? "Manager Ready" : "Manager (optional)"}
              </span>
            )
          })()}
        </div>

        {/* ── Validation Issues Banner ── */}
        {hasIssues && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5",
              hasErrors ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5",
            )}
          >
            <AlertTriangle className={cn("h-4 w-4", hasErrors ? "text-red-400" : "text-amber-400")} />
            <span className={cn("text-xs", hasErrors ? "text-red-400" : "text-amber-400")}>
              {hasErrors
                ? `${issuesByType.errors.length} provider/role error(s) — run repair to auto-fix`
                : `${issuesByType.warnings.length} warning(s)`}
              {lastRepairResult && lastRepairResult.repairsSucceeded > 0 && (
                <> — {lastRepairResult.repairsSucceeded} issue(s) fixed</>
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] ml-auto"
              onClick={() => runRepair()}
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Repair
            </Button>
          </motion.div>
        )}

        {/* ── Content by View Mode ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {viewMode === "grid" && (
              <RolesTab embedded searchQuery={searchQuery} />
            )}
            {viewMode === "hierarchy" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white/80">Role Hierarchy</h3>
                  <p className="text-xs text-white/30">Visualize parent-child relationships between agent roles. Roles without a parent appear at the root level.</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.02] to-white/[0.01] p-4">
                  <RoleHierarchyTree
                    roles={roleConfigs.filter((r) => r.isEnabled)}
                    onSelect={(role) => setSelectedRoleId(role.id === selectedRoleId ? null : role.id)}
                    selectedId={selectedRoleId}
                  />
                </div>
                {selectedRole && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2">
                        <Users className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-white">{selectedRole.name}</h4>
                          <Badge variant={selectedRole.runtimeState === "executing" ? "success" : selectedRole.runtimeState === "failed" ? "error" : "info"} size="sm">
                            {selectedRole.runtimeState}
                          </Badge>
                        </div>
                        <p className="text-xs text-white/50 mb-2">{selectedRole.description}</p>
                        <div className="flex flex-wrap gap-2 text-[10px]">
                          {selectedRole.model && (
                            <span className="text-green-400">Model: {selectedRole.model}</span>
                          )}
                          {selectedRole.parentRole && (
                            <span className="text-blue-400">
                              Parent: {roleConfigs.find((r) => r.id === selectedRole.parentRole)?.name || selectedRole.parentRole}
                            </span>
                          )}
                          {selectedRole.collaborationTags.length > 0 && (
                            <span className="text-purple-400">
                              Tags: {selectedRole.collaborationTags.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 h-7 text-[10px] border-white/10"
                        onClick={() => { setViewMode("grid"); setSelectedRoleId(selectedRole.id) }}
                      >
                        <Settings2 className="h-3 w-3 mr-1" /> Configure
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
            {viewMode === "dependencies" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white/80">Role Dependencies</h3>
                  <p className="text-xs text-white/30">Interactive graph showing parent-child relationships (solid lines) and collaboration tag connections (dashed lines). Drag to pan, scroll to zoom, click nodes for details.</p>
                </div>
                <RoleDependencyGraph
                  roles={roleConfigs.filter((r) => r.isEnabled)}
                  onSelect={(role) => setSelectedRoleId(role.id === selectedRoleId ? null : role.id)}
                  selectedId={selectedRoleId}
                />
              </div>
            )}
            {viewMode === "runtime" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white/80">Sub-Agent Runtime Tree</h3>
                  <p className="text-xs text-white/30">Live hierarchy of running and completed sub-agents, showing delegation depth, current task, and execution state.</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.02] to-white/[0.01] p-4">
                  <AgentTreeView />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
