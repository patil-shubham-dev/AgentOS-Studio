/**
 * Runtime â€” root barrel for the AgenticOS runtime subsystem.
 *
 * Everything exported here is publicly available to the renderer and
 * core layers. Sub-modules (engine, services) provide finer-grained
 * grouping; this root barrel provides the most commonly used exports
 * in a single import.
 *
 * Usage:
 *   import { RuntimeOS, EventBus, UnifiedExecutor } from "@/runtime"
 *
 * Over time, deep-path imports (e.g. @/runtime/execution/UnifiedExecutor)
 * should be replaced with imports from @/runtime, @/runtime/engine, or
 * @/runtime/services.
 */

// â”€â”€ Engine (core execution, context, planning, tools) â”€â”€
export {
  RuntimeOS,
  EventBus,
  RuntimeCleanupManager,
  BackgroundTaskManager,
  runtimeDebugLog,
  runtimeDebugTrace,
  getMutationTrace,
  printRuntimeDiagnostics,
  validateRegistryIntegrity,
  ALL_ROLES,
  RUNTIME_TOKEN_LIMITS,
  useWorkspaceRuntime,
  requestRefresh,
  flushDeferredRefresh,
  cancelPendingRefresh,
  execTrace,
  traceStage,
  assertSingleExecution,
  recordExecutionStage,
  isTauri,
  withTimeoutFallback,
  executionMode,
  ExecutionQueue,
  ExecutionProfiler,
  EditExecutionController,
  WorkspaceSnapshotManager,
  PlanManager,
  StreamManager,
  compressConversationHistory,
  TokenEstimator,
  PlanGenerator,
  PlanComparisonEngine,
  ChangeSetManager,
  useChangeSetStore,
  summarizeMessages,
  getMemoryPressure,
  MemoryArchitecture,
  MemoryObserver,
  VerificationPipeline,
} from "./engine"

// â”€â”€ Services (MCP, permissions, sessions, providers, sandbox, etc.) â”€â”€
export {
  MCPRegistry,
  MCPServerManager,
  PermissionEngine,
  ApprovalManager,
  PolicyResolver,
  ProviderGateway,
  providerGateway,
  ProviderRuntime,
  ReliabilityManager,
  CircuitBreaker,
  RetryPolicy,
  WatchdogTargetType,
  ObservabilityManager,
  ObservabilityPersistence,
  ObservabilitySDK,
  ExecutionReplay,
  ReplayStorage,
  RetentionPolicy,
  DEFAULT_RETENTION,
  PersistenceManager,
  MigrationRunner,
  sessionPersistence,
  CodexBrowserManager,
  TerminalRuntime,
  InteractiveTerminalRuntime,
  SkillRegistry,
  SkillExecutor,
  SkillLoader,
  FeatureFlagManager,
  LifecycleHookRegistry,
  pluginRegistry,
  PluginLoader,
  configLoader,
  PRWebhookListener,
  CostTracker,
  PromptCacheManager,
  SandboxAbstraction,
  SecurityPolicy,
  VerificationClient,
  FIMFormatter,
} from "./services"

// â”€â”€ Runtime types â”€â”€
export type {
  ExecutionEvent,
  RuntimeRole,
  RoutingDecision,
  ExecutionMode as UnifiedExecutionMode,
  FIMRequest,
  Plugin,
  PluginStoreState,
  FeatureFlag,
  LifecycleHook,
  LifecyclePhase,
  PersistedReplayMeta,
  VerificationResult,
  StructuredProjectConfig,
  MCPClientConfig,
  ContextPack,
  ImplementationPlan,
  PlanStep,
  AgentMode,
  EngineeringResult,
  ExecutionModeConfig,
} from "./engine"

export type {
  WatchdogType,
  ProviderType,
  MCPTransportType,
  SandboxType,
} from "./services"
