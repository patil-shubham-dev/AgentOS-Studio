import type { AgentTool } from '../core/AgentTool'

export type ConcurrencySlot = {
  toolName: string
  startedAt: number
  input: unknown
}

export class ToolConcurrencyPolicy {
  private running: Map<string, ConcurrencySlot> = new Map()
  private maxConcurrentDefault = 5
  private toolLimits: Map<string, number> = new Map()

  setToolLimit(toolName: string, maxConcurrent: number): void {
    this.toolLimits.set(toolName, maxConcurrent)
  }

  setDefaultLimit(limit: number): void {
    this.maxConcurrentDefault = limit
  }

  canRun(tool: AgentTool): boolean {
    const limit = this.toolLimits.get(tool.name) ?? this.maxConcurrentDefault
    const current = this.countRunning(tool.name)
    return current < limit
  }

  acquire(tool: AgentTool, input: unknown): boolean {
    if (!this.canRun(tool)) return false
    if (!tool.isConcurrencySafe(input as any)) {
      if (this.running.size > 0) return false
    }
    this.running.set(tool.name, { toolName: tool.name, startedAt: Date.now(), input })
    return true
  }

  release(toolName: string): void {
    this.running.delete(toolName)
  }

  countRunning(toolName: string): number {
    let count = 0
    for (const [, slot] of this.running) {
      if (slot.toolName === toolName) count++
    }
    return count
  }

  totalRunning(): number {
    return this.running.size
  }

  getActiveSlots(): ConcurrencySlot[] {
    return [...this.running.values()]
  }

  clear(): void {
    this.running.clear()
  }
}
