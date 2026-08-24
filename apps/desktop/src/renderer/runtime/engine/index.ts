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
export { executionMode, type ExecutionModeConfig } from "./execution-mode"

// Execution
export { ExecutionQueue } from "@/runtime/execution/ExecutionQueue"
export { ExecutionProfiler } from "@/runtime/execution/ExecutionProfiler"
export { EditExecutionController } from "@/runtime/execution/EditExecutionController"
export { WorkspaceSnapshotManager } from "@/runtime/execution/WorkspaceSnapshotManager"
export { PlanManager } from "@/runtime/execution/PlanManager"
export { StreamManager } from "@/runtime/streaming/StreamManager"

// Context system
export { compressConversationHistory } from "@/runtime/context/HistoryCompressor"
export { TokenEstimator } from "@/runtime/context/TokenEstimator"

// Planning
export { PlanGenerator } from "@/runtime/planning/PlanGenerator"
export { PlanComparisonEngine } from "@/runtime/planning/PlanComparisonEngine"
export type { ImplementationPlan, PlanStep } from "@/runtime/planning/PlanTypes"

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

// Types (migrated)
export type { ExecutionEvent } from "./ExecutionEvent"
export type { RuntimeRole } from "./RuntimeTypes"
