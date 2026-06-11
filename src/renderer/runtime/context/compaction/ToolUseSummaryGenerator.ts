interface ToolCallRecord {
  toolName: string
  status: 'success' | 'error' | 'running'
  durationMs?: number
  resultTruncated?: string
}

export class ToolUseSummaryGenerator {
  generate(messages: Array<{ role: string; content: unknown; tool_calls?: unknown }>): string {
    const toolCalls = this.extractToolCalls(messages)
    if (toolCalls.length === 0) return ''

    const byTool = new Map<string, { success: number; error: number; totalDuration: number }>()
    for (const tc of toolCalls) {
      const entry = byTool.get(tc.toolName) ?? { success: 0, error: 0, totalDuration: 0 }
      if (tc.status === 'success') entry.success++
      else if (tc.status === 'error') entry.error++
      if (tc.durationMs) entry.totalDuration += tc.durationMs
      byTool.set(tc.toolName, entry)
    }

    const lines: string[] = ['Tool use summary:']
    for (const [name, counts] of byTool) {
      const avg = counts.success > 0 ? Math.round(counts.totalDuration / counts.success) : 0
      lines.push(`- ${name}: ${counts.success} ok, ${counts.error} err, avg ${avg}ms`)
    }

    return lines.join('\n')
  }

  private extractToolCalls(messages: unknown[]): ToolCallRecord[] {
    const records: ToolCallRecord[] = []
    for (const msg of messages) {
      const m = msg as Record<string, unknown>
      if (m.role === 'assistant' && m.tool_calls) {
        const calls = m.tool_calls as Array<Record<string, unknown>>
        for (const tc of calls) {
          records.push({
            toolName: (tc.function as Record<string, unknown>)?.name as string ?? 'unknown',
            status: 'success',
          })
        }
      }
      if ((m.type === 'tool_result' || m.role === 'tool') && m.content) {
        const last = records[records.length - 1]
        if (last && last.status === 'running') {
          last.status = m.isError ? 'error' : 'success'
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          last.resultTruncated = content.slice(0, 100)
        }
      }
    }
    return records
  }
}
