export { EditDependencyGraph } from "./EditDependencyGraph"
export type { EditDependencyNode, EditDependencyPlan } from "./EditDependencyGraph"

export { ImpactPreviewEngine } from "./ImpactPreviewEngine"
export type { ImpactPreview, ImpactPreviewFile } from "./ImpactPreviewEngine"

export { FailureAnalysisEngine } from "./FailureAnalysisEngine"
export type { FailureAnalysis, FailureCategory } from "./FailureAnalysisEngine"

export { RepairPlanner } from "./RepairPlanner"
export type { RepairPlan, RepairAction } from "./RepairPlanner"

export { RegressionGuard } from "./RegressionGuard"
export type { RegressionCheck, RegressionReport } from "./RegressionGuard"

export { ExecutionConfidenceEngine } from "./ExecutionConfidenceEngine"
export type { ExecutionConfidence, SymbolConfidence, ConfidenceInput } from "./ExecutionConfidenceEngine"

export { VerificationRecoveryLoop } from "./VerificationRecoveryLoop"
export type { RecoveryAttempt, RecoveryLoopResult } from "./VerificationRecoveryLoop"

export { PatchQualityAnalyzer } from "./PatchQualityAnalyzer"
export type { PatchScore, PatchQualityReport } from "./PatchQualityAnalyzer"

export { AutonomousEngineeringLoop } from "./AutonomousEngineeringLoop"
export type { EngineeringEvent, EngineeringResult, EngineeringStage } from "./AutonomousEngineeringLoop"

export { UnifiedExecutionGateway } from "./UnifiedExecutionGateway"
export type { GatewayOptions } from "./UnifiedExecutionGateway"

export { EditExecutionController } from "./EditExecutionController"
export type { EditValidation } from "./EditExecutionController"

export { RepairExecutor } from "./RepairExecutor"
export type { RepairEdit, RepairResult } from "./RepairExecutor"

export { WorkspaceSnapshotManager } from "./WorkspaceSnapshotManager"
export type { WorkspaceSnapshot } from "./WorkspaceSnapshotManager"

export { RegressionRepairEngine } from "./RegressionRepairEngine"
export type { RegressionRepairResult } from "./RegressionRepairEngine"

export { BenchmarkHarness } from "./BenchmarkHarness"
export type { BenchmarkTask, BenchmarkMetric, BenchmarkRunResult, BenchmarkReport } from "./BenchmarkHarness"

export { FailurePatternMemory } from "./FailurePatternMemory"
export type { StoredPattern, PatternMatchResult } from "./FailurePatternMemory"

export { ExecutionProfiler } from "./ExecutionProfiler"
export type { ProfileStage, StageProfile, ExecutionProfile } from "./ExecutionProfiler"

export { ContextBudgetManager } from "./ContextBudgetManager"
export type { ContextBudgetConfig, ContextBudgetUsage } from "./ContextBudgetManager"

export { ExecutionReliabilitySuite } from "./ExecutionReliabilitySuite"
export type { HealthCheck, RetryConfig, CircuitBreakerState } from "./ExecutionReliabilitySuite"

export { Benchmark100 } from "./Benchmark100"

export function createBenchmarkRunner(): { runAll: () => Promise<any>; runCategory: (cat: string) => Promise<any>; formatCategoryBreakdown: () => string } {
  const b = new Benchmark100()
  return {
    runAll: () => b.runAll(),
    runCategory: (cat: string) => b.runCategory(cat),
    formatCategoryBreakdown: () => b.formatCategoryBreakdown(),
  }
}

export { FastPathExecutor } from "./FastPathExecutor"
export { AgentPipelineOrchestrator } from "./AgentPipelineOrchestrator"
export { AutonomousExecutionPath } from "./AutonomousExecutionPath"
export { ExecutionBudgetManager } from "./ExecutionBudgetManager"
export { ExecutionQueue } from "./ExecutionQueue"
export { ExecutionScratchpad } from "./ExecutionScratchpad"
export { SynthesisEngine } from "./SynthesisEngine"
export { UnifiedExecutor, resolveExecutionMode } from "./UnifiedExecutor"
export { assignAgentForTask, orderPipelineRoles, checkWorkspaceRequired, checkMultiAgentEligibility } from "./ExecutionRouter"
export { runPlanPhase, shouldGeneratePlan, waitForPlanApproval } from "./PlanManager"
export { mockExecutionPath } from "./MockExecutionEngine"
export { isFileCreationRequest, executeFileCreation } from "./MockFileCreation"
