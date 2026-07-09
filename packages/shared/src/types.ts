import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type AgentRole = "coding" | "design" | "vision" | "manager" | "qa" | "runtime"

export type AgentState = "idle" | "running" | "error" | "completed"

export interface Agent {
  id: string
  name: string
  role: AgentRole
  state: AgentState
  currentTask: string | null
  tokenUsage: number
  model: string
}

export type AppState = "idle" | "coding" | "designing" | "testing"

export type RoleRuntimeState = "idle" | "thinking" | "planning" | "executing" | "waiting" | "reviewing" | "failed" | "recovering"

export interface ProviderModel {
  id: string
  name: string
  contextWindow?: number
  supportsTools: boolean
  supportsVision: boolean
  supportsStreaming: boolean
}

export interface RuntimeInfo {
  runtime: string | null
  isOpenAiCompatible: boolean
  isLocal: boolean
}

/**
 * Opaque string wrapper that redacts its content on JSON serialization
 * and toString(). Prevents API keys and secrets from leaking into logs,
 * error traces, IPC messages, or disk serialization.
 */
export class SecureString {
  private value: string

  constructor(value: string) {
    this.value = value
  }

  /** Access the raw value — explicit opt-in, never automatic */
  unwrap(): string {
    return this.value
  }

  toString(): string {
    return '[REDACTED]'
  }

  toJSON(): string {
    return '[REDACTED]'
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[REDACTED]'
  }
}

export interface GatewayProvider {
  id: string
  name: string
  baseUrl: string
  /** Use SecureString to prevent accidental credential leakage via serialization */
  apiKey: string | null
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

export interface RoleMapping {
  role: AgentRole
  providerId: string
  model: string
}

export interface LedgerEntry {
  timestamp: string
  agentId: string
  action: string
  file: string | null
  status: "success" | "error"
  summary: string
}

export type Page = "control-center" | "code-canvas" | "settings" | "mobile-gateway"
export type AgentMode = "coding" | "design"

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

export interface AgentRoleConfig {
  id: string
  name: string
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

export interface RuntimeConfig {
  sandboxEnabled: boolean
  workspacePath: string
  executionTimeout: number
  maxConcurrency: number
  autoApprovePatterns: string[]
  blockPatterns: string[]
}

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

export interface AppVersion {
  current: string
  latest: string | null
  releaseDate: string | null
  releaseNotes: string[]
  updateAvailable: boolean
}

export interface InstallInfo {
  version: string
  installPath: string
  dataPath: string
  storageBytes: number
  runtimeStatus: "running" | "idle" | "error"
  firstLaunch: boolean
  buildDate: string
}
