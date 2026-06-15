export type ToolAction =
  | "read_file" | "write_file" | "edit_file" | "delete_file"
  | "run_command" | "bash"
  | "web_search" | "web_fetch"
  | "browser_navigate" | "browser_click" | "browser_type" | "browser_screenshot" | "browser_execute_js"
  | "grep_files" | "glob_files"
  | "delegate_task"
  | "unknown"

export interface DeterministicToolRecord {
  id: string
  executionId: string
  action: string
  toolName: string
  inputHash: string
  inputArgs: Record<string, unknown>
  outputHash: string
  outputResult: unknown
  capturedAt: number
  durationMs: number
  exitCode?: number
  error?: string
  sandboxMode: "read-only" | "workspace-write" | "full-access"
  fileChanges?: Array<{ path: string; action: "create" | "modify" | "delete"; beforeHash?: string; afterHash?: string }>
}

export class DeterministicToolRecorder {
  private records: DeterministicToolRecord[] = []
  private maxRecords = 10_000

  record(entry: Omit<DeterministicToolRecord, "id" | "capturedAt">): DeterministicToolRecord {
    const record: DeterministicToolRecord = {
      ...entry,
      id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      capturedAt: Date.now(),
    }
    this.records.push(record)
    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords)
    }
    return record
  }

  getRecords(executionId?: string): DeterministicToolRecord[] {
    if (executionId) {
      return this.records.filter((r) => r.executionId === executionId)
    }
    return [...this.records]
  }

  getRecord(id: string): DeterministicToolRecord | undefined {
    return this.records.find((r) => r.id === id)
  }

  replayRecord(record: DeterministicToolRecord): void {
    console.log(`[ToolReplay] ${record.toolName} (${record.id})`)
    console.log(`  Input: ${JSON.stringify(record.inputArgs).slice(0, 200)}`)
    console.log(`  Output: ${JSON.stringify(record.outputResult).slice(0, 200)}`)
    console.log(`  Duration: ${record.durationMs}ms`)
    if (record.error) console.log(`  Error: ${record.error}`)
  }

  getExecutionSummary(): Array<{
    executionId: string
    toolCount: number
    totalDurationMs: number
    errors: number
    tools: string[]
  }> {
    const byExec = new Map<string, DeterministicToolRecord[]>()
    for (const record of this.records) {
      const arr = byExec.get(record.executionId) ?? []
      arr.push(record)
      byExec.set(record.executionId, arr)
    }

    return Array.from(byExec.entries()).map(([executionId, records]) => ({
      executionId,
      toolCount: records.length,
      totalDurationMs: records.reduce((a, r) => a + r.durationMs, 0),
      errors: records.filter((r) => r.error).length,
      tools: [...new Set(records.map((r) => r.toolName))],
    }))
  }

  exportRecords(): string {
    return JSON.stringify(this.records, null, 2)
  }

  importRecords(json: string): void {
    try {
      const parsed = JSON.parse(json) as DeterministicToolRecord[]
      this.records.push(...parsed)
    } catch {
      console.error("[DeterministicToolRecorder] Failed to import records")
    }
  }

  clear(): void {
    this.records = []
  }

  get size(): number {
    return this.records.length
  }
}
