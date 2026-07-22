/**
 * Runtime Engine — core execution, context, planning, and tool orchestration.
 */

// Core engine singletons & types
export { RuntimeOS } from "./RuntimeOS"
export { EventBus } from "./EventBus"
export { RuntimeCleanupManager } from "./RuntimeCleanupManager"
export { runtimeDebugLog, runtimeDebugTrace } from "./runtime-debug"
export { getMutationTrace, printRuntimeDiagnostics } from "./runtime-diagnostics"
export { validateRegistryIntegrity, ALL_ROLES, normalizeRole, isRuntimeRole, getAllRuntimeRoles } from "./runtime-role-registry"
export { RUNTIME_TOKEN_LIMITS } from "./runtime-token-config"
export { execTrace } from "./execution-tracer"
export { traceStage, assertSingleExecution } from "./RequestTracer"
export { isTauri } from "./environment"
export { withTimeoutFallback } from "./with-timeout"
export { runtimeEngine, type RuntimeEngine } from "./runtime-engine"
export { executionMode, type ExecutionModeConfig } from "./execution-mode"

// Execution
export { UnifiedExecutor, type ExecutionMode } from "@/runtime/execution/UnifiedExecutor"
export { UnifiedExecutionGateway } from "@/runtime/execution/UnifiedExecutionGateway"
export { AutonomousEngineeringLoop, type EngineeringResult } from "@/runtime/execution/AutonomousEngineeringLoop"
export { AutonomousExecutionPath } from "@/runtime/execution/AutonomousExecutionPath"
export { ExecutionQueue } from "@/runtime/execution/ExecutionQueue"
export { ExecutionRouter } from "@/runtime/execution/ExecutionRouter"
export { ExecutionProfiler } from "@/runtime/execution/ExecutionProfiler"
export { EditExecutionController } from "@/runtime/execution/EditExecutionController"
export { WorkspaceSnapshotManager } from "@/runtime/execution/WorkspaceSnapshotManager"
export { PlanManager } from "@/runtime/execution/PlanManager"
export { SynthesisEngine } from "@/runtime/execution/SynthesisEngine"
export { StreamManager } from "@/runtime/streaming/StreamManager"

// Context system
export { ContextManager } from "@/runtime/context/ContextManager"
export { compressConversationHistory } from "@/runtime/context/HistoryCompressor"
export { autoCompact, shouldAutoCompact } from "@/runtime/context/autoCompact"
export { TokenEstimator } from "@/runtime/context/TokenEstimator"
export { ContextPackBuilder, type ContextPack } from "@/runtime/context/ContextPackBuilder"

// Planning
export { PlanGenerator } from "@/runtime/planning/PlanGenerator"
export { PlanComparisonEngine } from "@/runtime/planning/PlanComparisonEngine"
export type { ImplementationPlan, PlanStep } from "@/runtime/planning/PlanTypes"

// Agents
export { AgentExecutor, type AgentMode } from "@/runtime/agents/AgentExecutor"

// Tools
export { ToolExecutionSandbox } from "@/runtime/tools/ToolExecutionSandbox"

// Changeset
export { ChangeSetManager } from "@/runtime/changeset/ChangeSetManager"
export { useChangeSetStore } from "@/runtime/changeset/ChangeSetStore"

export { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"
export { MemoryObserver } from "@/runtime/memory/MemoryObserver"
export { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"

// Memory (migrated)
export { summarizeMessages, getMemoryPressure } from "./memory-manager"
export { managerRoutingEngine, type RoutingDecision } from "./manager-routing-engine"

// Types (migrated)
export type { ExecutionEvent } from "./ExecutionEvent"
export type { RuntimeRole } from "./RuntimeTypes"
