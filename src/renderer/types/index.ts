export type RuntimeRole =
  | "manager"
  | "coder"
  | "vision"
  | "research"
  | "runtime"
  | "design"
  | "qa"
  | "browser"
  | "memory"
  | "fast-inference"

export type AgentState = "idle" | "running" | "error" | "completed"

export interface Agent {
  id: string
  name: string
  role: RuntimeRole
  state: AgentState
  currentTask: string | null
  tokenUsage: number
  model: string
}

export type AppState = "idle" | "coding" | "designing" | "testing"

export type RoleRuntimeState = "idle" | "thinking" | "planning" | "executing" | "waiting" | "reviewing" | "failed" | "recovering"

// ── Provider Gateway Types ──

export interface ProviderModel {
  id: string
  name: string
  contextWindow?: number
  maxOutput?: number
  supportsTools: boolean
  supportsVision: boolean
  supportsStreaming: boolean
}

export interface RuntimeInfo {
  runtime: string | null
  isOpenAiCompatible: boolean
  isLocal: boolean
}

export interface GatewayProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  runtime: string | null
  isLocal: boolean
  isOpenAiCompatible: boolean
  models: ProviderModel[]
  createdAt: string
}

export interface ValidationResult {
  success: boolean
  runtime: string | null
  latencyMs: number
  error: string | null
}

export interface DiscoveryResult {
  success: boolean
  models: ProviderModel[]
  error: string | null
}

// ── Role Mapping ──

export interface RoleMapping {
  role: RuntimeRole
  providerId: string
  model: string
}

// ── Ledger ──

export interface LedgerEntry {
  timestamp: string
  agentId: string
  action: string
  file: string | null
  status: "success" | "error"
  summary: string
}

// ── Navigation ──

export type Page = "control-center" | "code-canvas" | "settings" | "mobile-gateway"
export type AgentMode = "coding" | "design"

// ── Design Tokens ──

export interface DesignTokens {
  primaryColor: string
  backgroundColor: string
  foregroundColor: string
  fontSize: string
  fontFamily: string
  borderRadius: string
  spacing: string
}

export interface ComponentDefinition {
  name: string
  description: string
  category: "layout" | "form" | "overlay" | "data-display" | "navigation"
  code: string
  dependencies: string[]
}

// ── File System ──

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size?: number
  lastModified?: number
  children: FileEntry[]
}

export type FileChangeKind = "created" | "modified" | "removed"

export interface FileChangeEvent {
  path: string
  kind: FileChangeKind
}

export interface OpenFile {
  path: string
  name: string
  content: string
  isDirty: boolean
}

export interface FileHistoryEntry {
  path: string
  content: string
  timestamp: string
  description: string
}

export interface DevicePreset {
  name: string
  width: number
  height: number
}

// ── Design Artifacts ──

export interface DesignArtifactVersion {
  version: number
  label: string
  code: string
  htmlPreview?: string
  timestamp: number
  changes: string
  tokenUsage?: number
}

export interface DesignArtifact {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  thumbnail?: string
  tags: string[]
  versions: DesignArtifactVersion[]
  currentVersion: number
}

// ── Role Config ──

export interface AgentRoleConfig {
  id: string
  name: string
  runtimeRole?: RuntimeRole
  description: string
  color: string
  icon: string
  providerId?: string
  model?: string
  fallbackModel?: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  systemPromptVersion: number
  runtimeState: RoleRuntimeState
  capabilities: {
    coding: boolean
    browsing: boolean
    planning: boolean
    memory: boolean
    fileAccess: boolean
    internetAccess: boolean
    toolExecution: boolean
    sandboxEscape: boolean
    vision: boolean
    reasoning: boolean
    orchestration: boolean
  }
  toolPermissions: string[]
  memoryScope: "none" | "session" | "project" | "global"
  parentRole?: string
  priority: number
  collaborationTags: string[]
  isBuiltIn: boolean
  isEnabled: boolean
  lastActiveAt?: string
  executionCount: number
}

// ── Memory ──

export interface MemoryConfig {
  scope: "none" | "session" | "project" | "global"
  maxTokens: number
  contextCompression: boolean
  vectorStoreEnabled: boolean
  knowledgeBases: KnowledgeBase[]
  retentionDays: number
}

export interface KnowledgeBase {
  id: string
  name: string
  type: "document" | "folder" | "web" | "api"
  path: string
  enabled: boolean
}

// ── Tools / MCP ──

export interface ToolConfig {
  id: string
  name: string
  description: string
  type: "mcp" | "builtin" | "custom"
  enabled: boolean
  endpoint?: string
  permissions: string[]
}

export interface MCPConfig {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  status: "connected" | "disconnected" | "error"
}

// ── Runtime ──

export interface RuntimeConfig {
  sandboxEnabled: boolean
  workspacePath: string
  executionTimeout: number
  maxConcurrency: number
  autoApprovePatterns: string[]
  blockPatterns: string[]
}

export interface WorkspaceConfig {
  providers: GatewayProvider[]
  roleConfigs: AgentRoleConfig[]
  runtimeConfig: RuntimeConfig
}

// ── Logs ──

export interface LogEntry {
  id: string
  timestamp: string
  type: "info" | "warning" | "error" | "success"
  category: string
  message: string
  agent?: string
  tokens?: number
  duration?: number
}

export interface UsageStats {
  totalTokens: number
  totalRequests: number
  avgLatency: number
  activeModels: number
  topProvider: string
  dailyUsage: { date: string; tokens: number }[]
}
