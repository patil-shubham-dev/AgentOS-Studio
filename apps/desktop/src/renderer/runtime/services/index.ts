/**
 * Runtime Services — supporting infrastructure (MCP, permissions, sessions,
 * streaming, providers, sandbox, reliability, and more).
 *
 * Re-exports from legacy runtime/ subdirectories so consumers can import
 * from @/runtime/services without deep path traversal.
 *
 * This is a transitional barrel. Over time, source files will migrate here.
 */

// Core services (migrated from runtime root)
export { BackgroundTaskManager } from "./BackgroundTaskManager"
export { useWorkspaceRuntime } from "./workspace-runtime"
export { requestRefresh, flushDeferredRefresh, cancelPendingRefresh } from "./runtime-coordinator"
export { recordExecutionStage } from "./RuntimeTelemetry"
export { ensureInstructionFilesInitialized, getRolePromptFromCache, extractPromptFromMarkdown } from "./load-instructions"

// MCP
export { MCPRegistry } from "@/runtime/mcp/MCPRegistry"
export { MCPServerManager } from "@/runtime/mcp/MCPServerManager"
export { MCPClient, type MCPClientConfig } from "@/runtime/mcp/MCPClient"
export { MCPTransport } from "@/runtime/mcp/MCPTransport"
export { MCPToolAdapter } from "@/runtime/mcp/MCPToolAdapter"

// Permissions
export { PermissionEngine } from "@/runtime/permissions/PermissionEngine"
export { ApprovalManager } from "@/runtime/permissions/ApprovalManager"
export { PolicyResolver } from "@/runtime/permissions/PolicyResolver"
export { PathVisibilityFilter } from "@/runtime/permissions/PathVisibilityFilter"
export { PermissionContext } from "@/runtime/permissions/PermissionContext"
export { speculativeClassifier } from "@/runtime/permissions/speculativeClassifier"
export { alwaysAllowRules } from "@/runtime/permissions/always-allow-rules"
export { roleToolAllowlist } from "@/runtime/permissions/role-tool-allowlist"

// Sessions
export { ExecutionSessionManager } from "@/runtime/sessions/ExecutionSessionManager"

// Streaming
export { StreamManager } from "@/runtime/streaming/StreamManager"
export { EventChannel } from "@/runtime/streaming/EventChannel"
export { WordBoundaryStreamBuffer } from "@/runtime/streaming/WordBoundaryStreamBuffer"

// Providers
export { ProviderGateway, providerGateway } from "@/runtime/providers/ProviderGateway"
export { ProviderRuntime } from "@/runtime/providers/ProviderRuntime"
export { ProviderError } from "@/runtime/providers/ProviderError"
export { MockProviderRuntime } from "@/runtime/providers/MockProviderRuntime"

// Sandbox
export { SandboxAbstraction } from "@/runtime/sandbox/SandboxAbstraction"
export { PolicyGenerator } from "@/runtime/sandbox/PolicyGenerator"
export { LinuxSandbox } from "@/runtime/sandbox/LinuxSandbox"
export { MacSandbox } from "@/runtime/sandbox/MacSandbox"
export { WindowsSandbox } from "@/runtime/sandbox/WindowsSandbox"

// Security
export { SecurityPolicy } from "@/runtime/security/SecurityPolicy"

// Reliability
export { ReliabilityManager } from "@/runtime/reliability/ReliabilityManager"
export { CircuitBreaker } from "@/runtime/reliability/CircuitBreaker"
export { RetryPolicy } from "@/runtime/reliability/RetryPolicy"
export { Watchdog, WatchdogTargetType } from "@/runtime/reliability/Watchdog"

// Replay
export { ReplayStorage, type PersistedReplayMeta } from "@/runtime/replay/ReplayStorage"
export { RetentionPolicy, DEFAULT_RETENTION } from "@/runtime/replay/RetentionPolicy"

// Observability
export { ObservabilityManager } from "@/runtime/observability/ObservabilityManager"
export { ObservabilityPersistence } from "@/runtime/observability/ObservabilityPersistence"
export { ObservabilitySDK } from "@/runtime/observability/ObservabilitySDK"
export { ExecutionReplay } from "@/runtime/observability/ExecutionReplay"

// Persistence
export { PersistenceManager } from "@/runtime/persistence/persistence-manager"
export { MigrationRunner } from "@/runtime/persistence/migration-runner"
export { sessionPersistence } from "@/runtime/persistence/session-store"

// Browser
export { CodexBrowserManager } from "@/runtime/browser/CodexBrowserManager"
export { BrowserExecutionBridge } from "@/runtime/browser/BrowserExecutionBridge"

// Terminal
export { TerminalRuntime } from "@/runtime/terminal/TerminalRuntime"
export { InteractiveTerminalRuntime } from "@/runtime/terminal/InteractiveTerminalRuntime"
export { PTYRuntime } from "@/runtime/terminal/pty-runtime"
export { TerminalRetryManager } from "@/runtime/terminal/TerminalRetryManager"
export { TerminalSessionRegistry } from "@/runtime/terminal/TerminalSessionRegistry"

// Skills
export { SkillRegistry } from "@/runtime/skills/SkillRegistry"
export { SkillExecutor } from "@/runtime/skills/SkillExecutor"
export { SkillLoader } from "@/runtime/skills/SkillLoader"
export { SkillMatcher } from "@/runtime/skills/SkillMatcher"

// Sub-agents
export { SubAgentDelegator } from "@/runtime/sub-agents/sub-agent-delegator"
export { AgentTask } from "@/runtime/sub-agents/tasks/AgentTask"
export { TaskRegistry } from "@/runtime/sub-agents/tasks/TaskRegistry"
export { TaskOutputManager } from "@/runtime/sub-agents/tasks/TaskOutputManager"

// Feature flags
export { FeatureFlagManager, type FeatureFlag } from "@/runtime/feature-flags/FeatureFlagManager"
export { FutureIslandRegistry } from "@/runtime/feature-flags/FutureIslandRegistry"

// Lifecycle
export { LifecycleHookRegistry } from "@/runtime/lifecycle/LifecycleHookRegistry"
export type { LifecycleHook, LifecyclePhase } from "@/runtime/lifecycle/LifecycleTypes"

// Plugins
export { pluginRegistry } from "@/runtime/plugins/PluginRegistry"
export { PluginLoader } from "@/runtime/plugins/PluginLoader"
export type { Plugin, PluginStoreState } from "@/runtime/plugins/PluginTypes"

// Project config
export { configLoader } from "@/runtime/project-config/ConfigLoader"
export { ConfigWatcher } from "@/runtime/project-config/ConfigWatcher"
export { ConfigGenerator } from "@/runtime/project-config/ConfigGenerator"
export { ProviderDetector } from "@/runtime/project-config/ProviderDetector"
export type { StructuredProjectConfig } from "@/runtime/project-config/ProjectConfigTypes"

// GitHub
export { PRWebhookListener } from "@/runtime/github/PRWebhookListener"

// Multi-agent
export { Orchestrator } from "@/runtime/multi-agent/orchestrator"

// Cost
export { CostTracker } from "@/runtime/cost/CostTracker"

// Caching
export { PromptCacheManager } from "@/runtime/caching/PromptCacheManager"

// Completion
export { FIMFormatter, type FIMRequest } from "@/runtime/completion/FIMFormatter"

// Verification
export { VerificationClient } from "@/runtime/verification/verification-client"
export type { VerificationResult } from "@/runtime/verification/types"
