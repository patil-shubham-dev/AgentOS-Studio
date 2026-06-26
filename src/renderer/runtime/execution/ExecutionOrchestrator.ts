import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { RuntimeRole } from "@/types"
import { UnifiedExecutionGateway } from "@/runtime/execution/UnifiedExecutionGateway"
import { UnifiedExecutor } from "@/runtime/execution/UnifiedExecutor"
import { ImpactPreviewEngine } from "@/runtime/execution/ImpactPreviewEngine"
import { getStructuredError, matchErrorToCode } from "@/lib/error-schema"

export type AgentModeOption = "fast" | "full"

export interface ExecuteOptions {
  input: string
  activeRole: RuntimeRole
  correlationId?: string
  goalId?: string
  mode?: AgentModeOption
  signal?: AbortSignal
  onPreview?: (files: string[]) => Promise<boolean>
}

export class ExecutionOrchestrator {
  private static instance: ExecutionOrchestrator
  private gateway = UnifiedExecutionGateway.getInstance()

  static getInstance(): ExecutionOrchestrator {
    if (!ExecutionOrchestrator.instance) {
      ExecutionOrchestrator.instance = new ExecutionOrchestrator()
    }
    return ExecutionOrchestrator.instance
  }

  get isExecuting(): boolean {
    return UnifiedExecutor.getInstance().isBusy()
  }

  cancel(): void {
    UnifiedExecutor.getInstance().cancel()
    this.gateway.cancel()
  }

  static cancelCurrent(): void {
    ExecutionOrchestrator.getInstance().cancel()
  }

  async *execute(options: ExecuteOptions): AsyncGenerator<ExecutionEvent> {
    if (options.signal?.aborted) {
      const err = getStructuredError("UNKNOWN", "ExecutionOrchestrator")
      err.problem = "The operation was cancelled before start"
      err.cause = "The abort signal was already triggered before execution began"
      err.recovery = "Retry the operation"
      throw Object.assign(new Error("The operation was cancelled before start"), { structuredError: err, name: "AbortError" })
    }

    const editedFiles = this.extractEditedFiles(options.input)

    if (options.onPreview && editedFiles.length > 0) {
      const approved = await options.onPreview(editedFiles)
      if (!approved) {
        const err = getStructuredError("UNKNOWN", "ExecutionOrchestrator")
        err.problem = "Edit preview rejected by user"
        err.cause = "The user cancelled the operation in the edit preview modal"
        err.recovery = "Modify the request and resubmit"
        throw Object.assign(new Error("Edit preview rejected by user"), { structuredError: err, name: "AbortError" })
      }
    }

    try {
      const result = await this.gateway.execute({
        input: options.input,
        activeRole: options.activeRole,
        correlationId: options.correlationId,
        goalId: options.goalId,
        mode: options.mode ?? "full",
        signal: options.signal,
        editedFiles,
      })

      for (const event of result.events) {
        yield event
      }

      if (!result.engineeringResult.passed) {
        yield {
          type: "EXECUTION_FAILED" as any,
          executionId: "",
          error: result.engineeringResult.summary,
          durationMs: result.engineeringResult.durationMs,
          timestamp: Date.now(),
        } as ExecutionEvent
      }
    } finally {
      // Queue slot released by UnifiedExecutor
    }
  }

  private extractEditedFiles(input: string): string[] {
    const files: string[] = []
    const pattern = /(?:file|path|edit|update|change|modify)\s+(?:`([^`]+)`|([^\s,.]+))/gi
    let match
    while ((match = pattern.exec(input)) !== null) {
      const path = (match[1] ?? match[2]).trim()
      if (path && path.match(/\.(ts|tsx|js|jsx|json|css|html|md)$/)) {
        files.push(path)
      }
    }
    return files
  }
}
