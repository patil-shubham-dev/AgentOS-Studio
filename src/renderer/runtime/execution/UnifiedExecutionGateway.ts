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

  async execute(options: GatewayOptions): Promise<{ engineeringResult: EngineeringResult; events: ExecutionEvent[] }> {
    const { input, activeRole, editedFiles, mode, signal, correlationId } = options

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

    const snapshotId = await this.snapshotMgr.create(input)

    try {
      const executor = UnifiedExecutor.getInstance()
      const events: ExecutionEvent[] = []
      for await (const event of executor.execute({
        input, activeRole, correlationId, goalId: options.goalId,
        mode: mode ?? "full", signal,
      })) {
        events.push(event)
      }

      const engineeringResult = await this.engineeringLoop.execute(input, editedFiles, signal)

      if (!engineeringResult.passed) {
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
