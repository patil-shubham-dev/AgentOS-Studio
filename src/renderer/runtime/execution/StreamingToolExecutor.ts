import type { ToolResult } from '@/runtime/tools/core/ToolResult'
import type { ToolContext } from '@/runtime/tools/core/ToolContext'
import { ToolExecutionPipeline } from '@/runtime/tools/execution/ToolExecutionPipeline'
import type { ToolCallEntry } from '@/runtime/agents/AgentExecutor'

export type ExecutionEvent =
  | { type: 'tool:start'; toolId: string; toolName: string; timestamp: number }
  | { type: 'tool:complete'; toolId: string; toolName: string; result: ToolResult; durationMs: number; timestamp: number }
  | { type: 'tool:error'; toolId: string; toolName: string; error: string; timestamp: number }

type TrackedTool = {
  id: string
  name: string
  args: Record<string, unknown>
  index: number
  status: 'queued' | 'executing' | 'completed' | 'error'
  isSafe: boolean
  result?: ToolResult
  error?: string
  startedAt?: number
  durationMs?: number
  yielded: boolean
}

export class StreamingToolExecutor {
  private queue: TrackedTool[] = []
  private executing = new Map<string, TrackedTool>()
  private pipeline: ToolExecutionPipeline
  private toolContext: ToolContext
  private nextIndex = 0
  private completedCount = 0
  private resolveReady: (() => void) | null = null
  private ready = false

  constructor(pipeline: ToolExecutionPipeline, toolContext: ToolContext) {
    this.pipeline = pipeline
    this.toolContext = toolContext
  }

  addTool(toolCall: ToolCallEntry): void {
    const isSafe = this.isReadOnlyTool(toolCall.name)
    const entry: TrackedTool = {
      id: toolCall.id,
      name: toolCall.name,
      args: toolCall.args,
      index: this.nextIndex++,
      status: 'queued',
      isSafe,
      yielded: false,
    }
    this.queue.push(entry)
    this.tryProcess()
  }

  setReady(): void {
    this.ready = true
    this.resolveReady?.()
    this.resolveReady = null
    this.tryProcess()
  }

  private isReadOnlyTool(toolName: string): boolean {
    const readTools = new Set([
      'read_file', 'search_content', 'grep_files', 'list_files',
      'glob', 'git_status', 'git_diff', 'git_log', 'web_search',
      'web_fetch', 'think', 'ping',
    ])
    return readTools.has(toolName)
  }

  private tryProcess(): void {
    for (const entry of this.queue) {
      if (entry.status !== 'queued') continue
      if (!this.canExecute(entry)) continue
      this.execute(entry)
    }
  }

  private canExecute(entry: TrackedTool): boolean {
    if (!this.ready && !entry.isSafe) return false
    if (this.executing.size === 0) return true
    if (!entry.isSafe) return false
    for (const [, executing] of this.executing) {
      if (!executing.isSafe) return false
    }
    return true
  }

  private async execute(entry: TrackedTool): Promise<void> {
    entry.status = 'executing'
    entry.startedAt = performance.now()
    this.executing.set(entry.id, entry)

    try {
      const result = await this.pipeline.execute(entry.name, entry.args, this.toolContext, {
        skipPermission: false,
      })
      entry.status = 'completed'
      entry.result = result
      entry.durationMs = Math.round(performance.now() - entry.startedAt)
      this.executing.delete(entry.id)
    } catch (err) {
      entry.status = 'error'
      entry.error = err instanceof Error ? err.message : String(err)
      entry.durationMs = Math.round(performance.now() - entry.startedAt)
      this.executing.delete(entry.id)
    }

    this.completedCount++
    this.tryProcess()
  }

  hasUnfinished(): boolean {
    return this.queue.some((e) => e.status !== 'completed' && e.status !== 'error')
  }

  hasPendingWork(): boolean {
    return this.queue.some((e) => e.status === 'queued')
  }

  async *getResults(): AsyncGenerator<ExecutionEvent> {
    this.queue.sort((a, b) => a.index - b.index)
    while (this.hasUnfinished() || this.completedCount < this.queue.length) {
      for (const entry of this.queue) {
        if (entry.yielded) continue
        if (entry.status === 'executing') continue
        if (entry.status === 'queued') continue

        entry.yielded = true
        if (entry.status === 'error') {
          yield {
            type: 'tool:error',
            toolId: entry.id,
            toolName: entry.name,
            error: entry.error ?? 'Unknown error',
            timestamp: Date.now(),
          }
        } else if (entry.result) {
          yield {
            type: 'tool:complete',
            toolId: entry.id,
            toolName: entry.name,
            result: entry.result,
            durationMs: entry.durationMs ?? 0,
            timestamp: Date.now(),
          }
        }
        this.completedCount++
      }
      if (this.hasUnfinished()) {
        await this.sleep(10)
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  getAllResults(): TrackedTool[] {
    return [...this.queue].sort((a, b) => a.index - b.index)
  }
}
