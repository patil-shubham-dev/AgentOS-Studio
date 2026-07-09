import { AutonomousEngineeringLoop, type EngineeringResult } from "@/runtime/execution/AutonomousEngineeringLoop"
import { WorkspaceSnapshotManager } from "@/runtime/execution/WorkspaceSnapshotManager"
import { EditExecutionController } from "@/runtime/execution/EditExecutionController"
import { UnifiedExecutor, type ExecutionMode } from "@/runtime/execution/UnifiedExecutor"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { matchErrorToCode, getStructuredError, formatErrorForUser } from "@/lib/error-schema"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { RuntimeRole } from "@/types"

export interface GatewayOptions {
  input: string
  activeRole: RuntimeRole
  editedFiles: string[]
  goalId?: string
  mode?: ExecutionMode
  signal?: AbortSignal
  correlationId?: string
}

const MAX_BUFFERED_EVENTS = 1000

export class UnifiedExecutionGateway {
  private static instance: UnifiedExecutionGateway
  private engineeringLoop = new AutonomousEngineeringLoop()
  private snapshotMgr = WorkspaceSnapshotManager.getInstance()
  private editController = EditExecutionController.getInstance()

  static getInstance(): UnifiedExecutionGateway {
    if (!UnifiedExecutionGateway.instance) {
      UnifiedExecutionGateway.instance = new UnifiedExecutionGateway()
    }
    return UnifiedExecutionGateway.instance
  }

  cancel(): void {
    this.snapshotMgr.cancel?.()
    this.editController.cancel?.()
    StreamManager.getInstance().clearAll()
  }

  async execute(
    options: GatewayOptions,
    onEvent?: (event: ExecutionEvent) => void,
  ): Promise<{ engineeringResult: EngineeringResult; events: ExecutionEvent[] }> {
    const { input, activeRole, editedFiles, mode, signal, correlationId } = options

    if (signal?.aborted) {
      return {
        engineeringResult: {
          passed: false,
          stages: [{ stage: "cancelled", message: "Execution cancelled before start", timestamp: Date.now() }],
          preview: null, dependencyPlan: null, verificationResult: null, recoveryResult: null,
          regressionReport: null, patchReport: null, confidence: null,
          durationMs: 0, summary: "Execution cancelled before start",
        },
        events: [],
      }
    }

    const validation = this.editController.validate(editedFiles)
    if (!validation.allowed) {
      return {
        engineeringResult: {
          passed: false,
          stages: [{ stage: "failed", message: `Edit rejected: ${validation.reason}`, timestamp: Date.now() }],
          preview: null, dependencyPlan: null, verificationResult: null, recoveryResult: null,
          regressionReport: null, patchReport: null, confidence: null,
          durationMs: 0, summary: `Edit blocked — ${validation.reason}`,
        },
        events: [],
      }
    }

    const executor = UnifiedExecutor.getInstance()
    const events: ExecutionEvent[] = []
    for await (const event of executor.execute({
      input, activeRole, correlationId, goalId: options.goalId,
      mode: mode ?? "full", signal,
    })) {
      if (events.length < MAX_BUFFERED_EVENTS) {
        events.push(event)
      }
      onEvent?.(event)
    }

    const executionId = (events.find(e => e.type === "EXECUTION_CREATED") as { executionId?: string } | undefined)?.executionId ?? "unknown"

    // ── Fast mode: skip engineering loop entirely (no verification, no impact analysis) ──
    if (mode === "fast") {
      return {
        engineeringResult: {
          passed: true,
          stages: [{ stage: "fast", message: "Fast mode — engineering loop skipped", timestamp: Date.now() }],
          preview: null, dependencyPlan: null, verificationResult: null, recoveryResult: null,
          regressionReport: null, patchReport: null, confidence: null,
          durationMs: 0, summary: "Fast mode response",
        },
        events,
      }
    }

    const snapshotId = await this.snapshotMgr.create(input)

    try {
      const engineeringResult = await this.engineeringLoop.execute(input, editedFiles, signal)

      if (!engineeringResult.passed) {
        const verifyStages = engineeringResult.stages.filter(
          s => s.stage === "failure-analysis" || s.stage === "verification"
        )
        events.push({
          type: "VERIFY_FAILED",
          executionId,
          stepId: "verification",
          lintErrors: 0,
          typeErrors: 0,
          buildErrors: 0,
          testFailures: 0,
          details: verifyStages.length > 0
            ? verifyStages.map(s => s.message)
            : [engineeringResult.summary],
          autoFixApplied: engineeringResult.recoveryResult?.recovered ?? false,
          timestamp: Date.now(),
        } as ExecutionEvent)

        await this.snapshotMgr.restore(snapshotId)
        return {
          engineeringResult: {
            ...engineeringResult,
            stages: [...engineeringResult.stages, {
              stage: "failed",
              message: `Engineering loop failed — snapshot ${snapshotId} restored`,
              timestamp: Date.now(),
            }],
          },
          events,
        }
      }

      events.push({
        type: "VERIFY_PASSED",
        executionId,
        stepId: "verification",
        details: ["Engineering loop verification passed"],
        timestamp: Date.now(),
      } as ExecutionEvent)

      await this.snapshotMgr.commit(snapshotId)
      return { engineeringResult, events }
    } catch (err) {
      await this.snapshotMgr.restore(snapshotId)
      const errMsg = err instanceof Error ? err.message : String(err)
      const structured = getStructuredError(matchErrorToCode(errMsg), "UnifiedExecutionGateway")
      console.warn(`[Gateway] ${structured.code}: ${structured.problem} — ${structured.fix}`)
      return {
        engineeringResult: {
          passed: false,
          stages: [{
            stage: "failed",
            message: `Execution failed — snapshot restored: ${errMsg}`,
            timestamp: Date.now(),
          }],
          structuredError: structured,
          preview: null, dependencyPlan: null, verificationResult: null, recoveryResult: null,
          regressionReport: null, patchReport: null, confidence: null,
          durationMs: 0, summary: formatErrorForUser(structured),
        },
        events: [],
      }
    }
  }
}
