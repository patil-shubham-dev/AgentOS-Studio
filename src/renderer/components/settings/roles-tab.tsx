import { useState, useMemo } from "react"
import { useAgentStore } from "@/stores/agent-store"
import { motion, AnimatePresence, Reorder } from "framer-motion"
import Editor, { type OnMount } from "@monaco-editor/react"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app-store"
import { Switch, Badge, Separator, Button, Label, TooltipSimple as Tooltip } from "@agentic-os/ui"
import type { AgentRoleConfig, RoleRuntimeState } from "@/types"
import { useIntegrity } from "@/lib/use-integrity"
import {
  Plus, Search, Copy, Settings2, Wand2,
  Trash2, GripVertical, Code2, Globe, Brain,
  Wifi, FileCode, Unlock, GitBranch,
  Thermometer, Maximize2, Terminal, ChevronDown,
  Eye, CheckCircle2, Sparkles, AlertTriangle,
  Cpu, Layers, RefreshCw, Users, Network,
} from "lucide-react"
import { AgentConfigurator } from "./agents/AgentConfigurator"
import { WiringIndicator } from "./wiring-indicator"

const MEMORY_SCOPES = [
  { value: "none", label: "No Memory" },
  { value: "session", label: "Session Only" },
  { value: "project", label: "Project Scope" },
  { value: "global", label: "Global Access" },
] as const

const RUNTIME_STATES: { value: RoleRuntimeState; label: string; color: string }[] = [
  { value: "idle", label: "Idle", color: "text-white/40" },
  { value: "thinking", label: "Thinking", color: "text-blue-400" },
  { value: "planning", label: "Planning", color: "text-amber-400" },
  { value: "executing", label: "Executing", color: "text-green-400" },
  { value: "waiting", label: "Waiting", color: "text-yellow-400" },
  { value: "reviewing", label: "Reviewing", color: "text-purple-400" },
  { value: "failed", label: "Failed", color: "text-red-400" },
  { value: "recovering", label: "Recovering", color: "text-orange-400" },
]

const CAPABILITY_META: Record<string, { label: string; icon: typeof Code2; color: string; category: string }> = {
  coding: { label: "Coding", icon: Code2, color: "text-blue-400", category: "development" },
  browsing: { label: "Browsing", icon: Globe, color: "text-sky-400", category: "access" },
  planning: { label: "Planning", icon: GitBranch, color: "text-amber-400", category: "cognition" },
  memory: { label: "Memory", icon: Brain, color: "text-purple-400", category: "cognition" },
  fileAccess: { label: "File Access", icon: FileCode, color: "text-green-400", category: "access" },
  internetAccess: { label: "Internet", icon: Wifi, color: "text-cyan-400", category: "access" },
  toolExecution: { label: "Tools", icon: Terminal, color: "text-zinc-400", category: "execution" },
  sandboxEscape: { label: "Sandbox", icon: Unlock, color: "text-red-400", category: "security" },
  vision: { label: "Vision", icon: Eye, color: "text-pink-400", category: "perception" },
  reasoning: { label: "Reasoning", icon: Brain, color: "text-indigo-400", category: "cognition" },
  orchestration: { label: "Orchestrate", icon: Layers, color: "text-amber-400", category: "execution" },
}

const CAPABILITY_CATEGORIES = [
  { key: "cognition", label: "Cognition", color: "text-indigo-400" },
  { key: "development", label: "Development", color: "text-blue-400" },
  { key: "access", label: "Access", color: "text-green-400" },
  { key: "execution", label: "Execution", color: "text-amber-400" },
  { key: "perception", label: "Perception", color: "text-pink-400" },
  { key: "security", label: "Security", color: "text-red-400" },
]

function RuntimeStateBadge({ state }: { state: RoleRuntimeState }) {
  const meta = RUNTIME_STATES.find((s) => s.value === state) || RUNTIME_STATES[0]
  return (
    <span className={cn("text-[10px] font-medium", meta.color)}>
      {meta.label}
    </span>
  )
}

function CapabilityToggle({ label, enabled, onChange, icon: Icon, category }: {
  label: string
  enabled: boolean
  onChange: (v: boolean) => void
  icon: typeof Globe
  category: string
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5", enabled ? "text-blue-400" : "text-white/20")} />
        <span className="text-xs text-white/60">{label}</span>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} size="sm" />
    </div>
  )
}

// ── Monaco System Prompt Editor ──

function SystemPromptEditor({
  value,
  onChange,
  roleName,
  version,
}: {
  value: string
  onChange: (v: string) => void
  roleName: string
  version: number
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit")

  const handleEditorMount: OnMount = (editor, monaco) => {
    // Define a dark theme for the editor
    monaco.editor.defineTheme("agentic-os-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6b7280", fontStyle: "italic" },
        { token: "keyword", foreground: "818cf8" },
        { token: "string", foreground: "34d399" },
        { token: "number", foreground: "fbbf24" },
        { token: "type", foreground: "60a5fa" },
        { token: "function", foreground: "a78bfa" },
      ],
      colors: {
        "editor.background": "#0a0a0b00",
        "editor.foreground": "#e5e7eb",
        "editor.lineHighlightBackground": "#ffffff08",
        "editorCursor.foreground": "#60a5fa",
        "editor.selectionBackground": "#3b82f640",
        "editorLineNumber.foreground": "#ffffff20",
        "editorLineNumber.activeForeground": "#ffffff40",
        "editor.selectionHighlightBackground": "#ffffff0a",
        "editorIndentGuide.background": "#ffffff08",
        "editorIndentGuide.activeBackground": "#ffffff15",
        "editorBracketMatch.background": "#ffffff10",
        "editorBracketMatch.border": "#ffffff20",
      },
    })
    monaco.editor.setTheme("agentic-os-dark")
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/5">
        <div className="flex items-center gap-2">
          <Code2 className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-[10px] font-medium text-white/50">system prompt</span>
          <Badge variant="info" size="sm" className="font-mono">v{version}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode("edit")}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-medium transition-all",
              mode === "edit"
                ? "bg-white/10 text-white"
                : "text-white/30 hover:text-white hover:bg-white/5",
            )}
          >
            Edit
          </button>
          <button
            onClick={() => setMode("preview")}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-medium transition-all",
              mode === "preview"
                ? "bg-white/10 text-white"
                : "text-white/30 hover:text-white hover:bg-white/5",
            )}
          >
            Preview
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <span className="text-[9px] text-white/20 font-mono">
            {value.length.toLocaleString()} chars · {value.split("\n").length} lines
          </span>
        </div>
      </div>

      {/* Editor / Preview */}
      <AnimatePresence mode="wait">
        {mode === "edit" ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[280px]"
          >
            <Editor
              height="100%"
              defaultLanguage="markdown"
              theme="agentic-os-dark"
              value={value}
              onChange={(v) => onChange(v ?? "")}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                wrappingStrategy: "advanced",
                fontSize: 11,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineHeight: 18,
                padding: { top: 8 },
                renderWhitespace: "selection",
                tabSize: 2,
                automaticLayout: true,
                suggestOnTriggerCharacters: false,
                quickSuggestions: false,
                folding: true,
                foldingHighlight: true,
                bracketPairColorization: { enabled: true },
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[280px] overflow-y-auto p-3"
          >
            <pre className="text-xs text-white/50 font-mono leading-relaxed whitespace-pre-wrap">
              {value || "No system prompt defined."}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RoleCard({
  role,
  models,
  providers,
  isSelected,
  allRoles,
  onSelect,
  onClone,
  onDelete,
  onUpdate,
  managerConfigured,
}: {
  role: AgentRoleConfig
  models: { id: string; name: string; provider: string; capabilities?: string[]; contextWindow?: number }[]
  providers: { id: string; name: string }[]
  allRoles: AgentRoleConfig[]
  isSelected: boolean
  onSelect: () => void
  onClone: () => void
  onDelete: () => void
  onUpdate: (updates: Partial<AgentRoleConfig>) => void
  managerConfigured: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const modelOptions = models
  const selectedModel = modelOptions.find((m) => m.id === role.model)
  const displayModel = selectedModel ? selectedModel.name : role.model || "No model"
  const isManager = role.name.toLowerCase() === "manager"

  // Parent-child dependency
  const parentRole = role.parentRole ? allRoles.find((r) => r.id === role.parentRole) : null
  const childRoles = allRoles.filter((r) => r.parentRole === role.id)
  const siblingRoles = role.parentRole
    ? allRoles.filter((r) => r.parentRole === role.parentRole && r.id !== role.id)
    : []

  // Live runtime state from agent store
  const agentStatuses = useAgentStore((s) => s.agentStatuses)
  const agentAssignments = useAgentStore((s) => s.agentAssignments)
  const agentStatus = agentStatuses[role.id]
  const liveState: RoleRuntimeState = agentStatus
    ? agentStatus.state === "planning" ? "planning"
      : agentStatus.state === "researching" || agentStatus.state === "browsing" ? "executing"
      : agentStatus.state === "editing" ? "executing"
      : agentStatus.state === "validating" ? "reviewing"
      : agentStatus.state === "complete" ? "idle"
      : agentStatus.state === "failed" ? "failed"
      : "idle"
    : role.runtimeState
  const liveExecutionCount = role.executionCount + agentAssignments.filter((a) => a.role === role.id || a.role === role.runtimeRole).length
  const liveLastActiveAt = agentStatus?.lastUpdated ? new Date(agentStatus.lastUpdated).toISOString() : role.lastActiveAt

  // Capability category grouping
  const capabilitiesByCategory = useMemo(() => {
    const grouped: Record<string, [string, typeof CAPABILITY_META[string]][]> = {}
    Object.entries(CAPABILITY_META).forEach(([key, meta]) => {
      if (!grouped[meta.category]) grouped[meta.category] = []
      grouped[meta.category].push([key, meta])
    })
    return grouped
  }, [])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-2xl border transition-all duration-200 overflow-hidden",
        !role.isEnabled && "opacity-50",
        isSelected
          ? "border-blue-500/30 bg-gradient-to-br from-blue-500/8 to-purple-500/5 shadow-[0_0_30px_rgba(59,130,246,0.08)]"
          : "border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] hover:border-white/10"
      )}
    >
      {!managerConfigured && !isManager && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-amber-400" />
          <span className="text-[10px] text-amber-300">Configure the Manager role first for orchestration</span>
        </div>
      )}

      <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-60", role.color)} />

      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex items-center gap-1 cursor-grab active:cursor-grabbing text-white/20 hover:text-white/40 transition-colors">
            <GripVertical className="h-4 w-4" />
          </div>

          <div className={cn(
            "flex items-center justify-center h-10 w-10 rounded-xl border shrink-0",
            liveState === "executing" ? "border-green-500/30 bg-green-500/10" :
            liveState === "failed" ? "border-red-500/30 bg-red-500/10" :
            "bg-gradient-to-br from-blue-500/20 to-purple-500/10 border-white/10",
          )}>
            <span className={cn(
              "text-lg font-bold",
              liveState === "executing" ? "text-green-400" :
              liveState === "failed" ? "text-red-400" :
              "text-white/60",
            )}>{role.name[0]}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white">{role.name}</h3>
              {role.isBuiltIn && (
                <Badge variant="info" size="sm">Built-in</Badge>
              )}
              {!role.isEnabled && (
                <Badge variant="default" size="sm">Disabled</Badge>
              )}
              <Badge variant={role.priority <= 2 ? "error" : role.priority <= 4 ? "warning" : "info"} size="sm">
                P{role.priority}
              </Badge>
              <RuntimeStateBadge state={liveState} />
            </div>
            <p className="text-xs text-white/40 mt-0.5">{role.description}</p>

            {/* Dependency chain badges */}
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {parentRole && (
                <Badge variant="purple" size="sm" className="flex items-center gap-1">
                  <GitBranch className="h-2.5 w-2.5" />
                  Parent: {parentRole.name}
                </Badge>
              )}
              {childRoles.length > 0 && (
                <Badge variant="info" size="sm" className="flex items-center gap-1">
                  <Network className="h-2.5 w-2.5" />
                  {childRoles.length} child{childRoles.length !== 1 ? "ren" : ""}
                </Badge>
              )}
              {siblingRoles.length > 0 && (
                <Badge variant="default" size="sm" className="flex items-center gap-1">
                  <Users className="h-2.5 w-2.5" />
                  {siblingRoles.length} sib{siblingRoles.length !== 1 ? "lings" : ""}
                </Badge>
              )}
            </div>

            {/* Model and config badges */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <Badge variant={role.model ? "success" : "default"} size="sm">
                {displayModel}
              </Badge>
              {role.fallbackModel && (
                <Badge variant="warning" size="sm">Fallback: {role.fallbackModel}</Badge>
              )}
              <Badge variant={role.memoryScope === "global" ? "purple" : role.memoryScope === "project" ? "success" : "default"} size="sm">
                {role.memoryScope}
              </Badge>
              {role.collaborationTags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="default" size="sm">{tag}</Badge>
              ))}
            </div>

            {/* Capability tags */}
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(CAPABILITY_META).filter(([key]) => (role.capabilities as any)[key]).map(([key, meta]) => {
                const Icon = meta.icon
                return (
                  <span key={key} className={cn("inline-flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/5 px-2 py-0.5 text-[9px] font-medium", meta.color)}>
                    <Icon className="h-2.5 w-2.5" />
                    {meta.label}
                  </span>
                )
              })}
            </div>

            {/* Execution stats */}
            {(liveExecutionCount > 0 || agentStatus) && (
              <div className="flex items-center gap-2 mt-2 text-[10px] text-white/30">
                <Cpu className="h-3 w-3" />
                <span>{liveExecutionCount} executions</span>
                {liveLastActiveAt && (
                  <>
                    <span className="text-white/10">·</span>
                    <span>Last active: {new Date(liveLastActiveAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Tooltip content={role.isEnabled ? "Disable role" : "Enable role"}>
              <button
                onClick={() => onUpdate({ isEnabled: !role.isEnabled })}
                className={cn("rounded-lg p-1.5 transition-all", role.isEnabled ? "text-white/30 hover:text-white hover:bg-white/5" : "text-green-400 hover:bg-white/5")}
              >
                {role.isEnabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOffIcon className="h-3.5 w-3.5" />}
              </button>
            </Tooltip>
            <Tooltip content="Clone role">
              <button onClick={onClone} className="rounded-lg p-1.5 text-white/30 hover:text-white hover:bg-white/5 transition-all">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            {!role.isBuiltIn && (
              <Tooltip content="Delete role">
                <button onClick={onDelete} className="rounded-lg p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
            <Tooltip content={expanded ? "Collapse" : "Expand"}>
              <button onClick={() => { setExpanded(!expanded); onSelect() }} className="rounded-lg p-1.5 text-white/30 hover:text-white hover:bg-white/5 transition-all">
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
              </button>
            </Tooltip>
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <Separator className="my-4" />

              {/* Parent Role Selector */}
              <div className="mb-4">
                <Label className="text-xs text-white/60 mb-1.5 block">Parent Role (hierarchy)</Label>
                <select
                  value={role.parentRole || ""}
                  onChange={(e) => onUpdate({ parentRole: e.target.value || undefined })}
                  className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs text-white outline-none focus:border-white/20"
                >
                  <option value="" className="bg-black">None (root role)</option>
                  {allRoles.filter((r) => r.id !== role.id).map((r) => (
                    <option key={r.id} value={r.id} className="bg-black">{r.name} {r.isBuiltIn ? "(built-in)" : ""}</option>
                  ))}
                </select>
                <p className="text-[10px] text-white/20 mt-1">Assigning a parent creates a hierarchical dependency — child roles inherit context from parents.</p>
              </div>

              {/* Preset-based configurator */}
              <div className="mb-4">
                <Label className="text-xs text-white/60 mb-2 block">Configuration</Label>
                <AgentConfigurator
                  temperature={role.temperature}
                  maxTokens={role.maxTokens}
                  providerId={role.providerId}
                  model={role.model}
                  fallbackModel={role.fallbackModel}
                  providers={providers}
                  models={modelOptions}
                  onApply={(updates) => onUpdate(updates)}
                  onCancel={() => {}}
                />
              </div>

              {/* Collaboration Tags */}
              <div className="mb-4">
                <Label className="text-xs text-white/60 mb-2 block">Collaboration Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {role.collaborationTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-[10px] font-mono text-blue-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Capabilities by Category */}
              <div className="mb-4">
                <Label className="text-xs text-white/60 mb-2 block">Capabilities</Label>
                <div className="space-y-2">
                  {CAPABILITY_CATEGORIES.map((cat) => {
                    const caps = capabilitiesByCategory[cat.key]
                    if (!caps || caps.length === 0) return null
                    return (
                      <div key={cat.key}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={cn("text-[9px] font-medium uppercase tracking-wider", cat.color)}>
                            {cat.label}
                          </span>
                          <span className="text-[9px] text-white/15">
                            {caps.filter(([k]) => (role.capabilities as any)[k]).length}/{caps.length} enabled
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {caps.map(([key, meta]) => {
                            const Icon = meta.icon
                            return (
                              <CapabilityToggle
                                key={key}
                                label={meta.label}
                                icon={Icon}
                                category={cat.key}
                                enabled={(role.capabilities as any)[key]}
                                onChange={(v) => onUpdate({ capabilities: { ...role.capabilities, [key]: v } })}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Memory Scope */}
              <div className="mb-4">
                <Label className="text-xs text-white/60 mb-2 block">Memory Scope</Label>
                <div className="flex gap-2">
                  {MEMORY_SCOPES.map((scope) => (
                    <button
                      key={scope.value}
                      onClick={() => onUpdate({ memoryScope: scope.value as AgentRoleConfig["memoryScope"] })}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                        role.memoryScope === scope.value
                          ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                          : "border-white/5 text-white/40 hover:bg-white/5 hover:text-white/60"
                      )}
                    >
                      {scope.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* System Prompt — Monaco Editor */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-white/60">System Prompt</Label>
                </div>
                <SystemPromptEditor
                  value={role.systemPrompt}
                  onChange={(v) => onUpdate({ systemPrompt: v, systemPromptVersion: role.systemPromptVersion + (v !== role.systemPrompt ? 1 : 0) })}
                  roleName={role.name}
                  version={role.systemPromptVersion}
                />
              </div>

              {/* Tool Permissions */}
              <div>
                <Label className="text-xs text-white/60 mb-2 block">Tool Permissions</Label>
                <div className="flex flex-wrap gap-1.5">
                  {role.toolPermissions.map((perm) => (
                    <span key={perm} className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/5 px-2.5 py-1 text-[10px] font-mono text-white/50">
                      {perm}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/5 px-2.5 py-1 text-[10px] text-white/20">
                    <Plus className="h-2.5 w-2.5" /> Add
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function EyeOffIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

interface RolesTabProps {
  embedded?: boolean
  searchQuery?: string
}

export function RolesTab({ embedded, searchQuery: externalSearchQuery }: RolesTabProps) {
  const roleConfigs = useAppStore((s) => s.roleConfigs)
  const upsertRoleConfig = useAppStore((s) => s.upsertRoleConfig)
  const removeRoleConfig = useAppStore((s) => s.removeRoleConfig)
  const getAllModels = useAppStore((s) => s.getAllModels)
  const providers = useAppStore((s) => s.providers)
  const { hasIssues, hasErrors, issuesByType, runValidation, runRepair, lastRepairResult } = useIntegrity()

  const models = useMemo(() => {
    return getAllModels().flatMap((g) =>
      g.models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: g.providerName,
        contextWindow: m.contextWindow,
      }))
    )
  }, [getAllModels])

  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showDisabled, setShowDisabled] = useState(true)

  const effectiveSearch = externalSearchQuery ?? search

  const managerConfigured = useMemo(() => {
    const mgr = roleConfigs.find((r) => r.name.toLowerCase() === "manager")
    return !!(mgr && mgr.isEnabled && mgr.model && mgr.providerId)
  }, [roleConfigs])

  const managerRole = useMemo(() => roleConfigs.find((r) => r.name.toLowerCase() === "manager"), [roleConfigs])

  const filtered = roleConfigs.filter((r) => {
    if (!showDisabled && !r.isEnabled) return false
    if (!effectiveSearch) return true
    const q = effectiveSearch.toLowerCase()
    return r.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.collaborationTags.some((t) => t.toLowerCase().includes(q))
  })

  function handleReorder(reordered: AgentRoleConfig[]) {
    reordered.forEach((r, i) => upsertRoleConfig({ ...r, priority: i + 1 }))
  }

  function handleClone(role: AgentRoleConfig) {
    upsertRoleConfig({
      ...role,
      id: `role-${crypto.randomUUID().slice(0, 8)}`,
      name: `${role.name} (Copy)`,
      priority: roleConfigs.length + 1,
      isBuiltIn: false,
    })
  }

  function handleDelete(id: string) {
    // Also update children that reference this as parent
    const children = roleConfigs.filter((r) => r.parentRole === id)
    children.forEach((child) => {
      upsertRoleConfig({ ...child, parentRole: undefined })
    })
    removeRoleConfig(id)
  }

  function handleUpdate(id: string, updates: Partial<AgentRoleConfig>) {
    const existing = roleConfigs.find((r) => r.id === id)
    if (existing) upsertRoleConfig({ ...existing, ...updates })
  }

  const stats = useMemo(() => {
    const enabled = roleConfigs.filter((r) => r.isEnabled)
    const configured = enabled.filter((r) => r.model && r.providerId)
    return {
      total: roleConfigs.length,
      enabled: enabled.length,
      configured: configured.length,
      hasManager: !!managerConfigured,
    }
  }, [roleConfigs, managerConfigured])

  // If embedded, only render the roles list (used by AgentsPage in grid mode)
  if (embedded) {
    return (
      <div className="space-y-4">
        <Reorder.Group axis="y" values={filtered} onReorder={handleReorder} className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((role) => (
              <Reorder.Item key={role.id} value={role}>
                <RoleCard
                  role={role}
                  models={models}
                  providers={providers}
                  allRoles={roleConfigs}
                  isSelected={selectedId === role.id}
                  onSelect={() => setSelectedId(role.id === selectedId ? null : role.id)}
                  onClone={() => handleClone(role)}
                  onDelete={() => handleDelete(role.id)}
                  onUpdate={(updates) => handleUpdate(role.id, updates)}
                  managerConfigured={managerConfigured}
                />
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">
              {effectiveSearch ? "No roles match your search" : "No roles yet. Roles should appear automatically."}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-white tracking-tight">Agent Roles</h2>
        <p className="text-sm text-white/40">Intelligent workers — configured automatically for orchestration</p>
      </div>

      {/* Manager warning */}
      {!managerConfigured && roleConfigs.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-4 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-300">Manager Role Not Configured</h3>
              <p className="text-xs text-amber-200/60 mt-1">
                The Manager role is required for multi-agent orchestration. {managerRole ? `Configure \"${managerRole.name}\" with a provider and model to enable autonomous workflows.` : "No Manager role found. It should appear in the list below."}
              </p>
              {managerRole && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 border-amber-500/20 text-amber-400 hover:bg-amber-500/10 h-7 text-[10px]"
                  onClick={() => setSelectedId(managerRole.id)}
                >
                  <Settings2 className="h-3 w-3 mr-1" /> Configure Manager
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Validation issues */}
      {hasIssues && (
        <div className={cn(
          "flex items-center gap-2 rounded-2xl border px-4 py-3",
          hasErrors ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5",
        )}>
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
            <AlertTriangle className="h-3 w-3 mr-1" /> Repair
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => runValidation()}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {[
          { label: "Total Roles", value: stats.total.toString(), icon: UsersIcon, color: "text-blue-400" },
          { label: "Enabled", value: stats.enabled.toString(), icon: CheckCircle2, color: "text-green-400" },
          { label: "Configured", value: stats.configured.toString(), icon: Cpu, color: "text-purple-400" },
          { label: "Orchestration", value: stats.hasManager ? "Ready" : "Setup Required", icon: Brain, color: stats.hasManager ? "text-green-400" : "text-amber-400" },
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
        {/* Live wiring status card */}
        <WiringIndicator variant="card" />
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles by name, description, or tags..."
            className="w-full h-10 rounded-xl border border-white/5 bg-white/[0.03] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/10 focus:bg-white/[0.05] transition-all"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={showDisabled}
            onCheckedChange={setShowDisabled}
            size="sm"
          />
          <span className="text-xs text-white/40">Show disabled</span>
        </label>
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-9 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white border-0 shadow-lg shadow-blue-600/20"
          onClick={() => {
            upsertRoleConfig({
              id: `role-${crypto.randomUUID().slice(0, 8)}`,
              name: "New Role",
              description: "Custom role",
              color: "from-gray-500/20 to-zinc-500/10",
              icon: "Star",
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
              priority: roleConfigs.length + 1,
              collaborationTags: [],
              isBuiltIn: false,
              isEnabled: true,
              executionCount: 0,
            })
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Role
        </Button>
      </div>

      {/* Roles List */}
      <Reorder.Group axis="y" values={filtered} onReorder={handleReorder} className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((role) => (
            <Reorder.Item key={role.id} value={role}>
              <RoleCard
                role={role}
                models={models}
                providers={providers}
                allRoles={roleConfigs}
                isSelected={selectedId === role.id}
                onSelect={() => setSelectedId(role.id === selectedId ? null : role.id)}
                onClone={() => handleClone(role)}
                onDelete={() => handleDelete(role.id)}
                onUpdate={(updates) => handleUpdate(role.id, updates)}
                managerConfigured={managerConfigured}
              />
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <UsersIcon className="h-8 w-8 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">
            {effectiveSearch ? "No roles match your search" : "No roles yet. Roles should appear automatically."}
          </p>
        </div>
      )}
    </div>
  )
}

function UsersIcon(props: { className?: string }) {
  return <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
}
