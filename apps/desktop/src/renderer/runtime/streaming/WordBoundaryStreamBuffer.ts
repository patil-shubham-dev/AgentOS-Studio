const MAX_BUFFERED_STREAMS = 100

export class WordBoundaryStreamBuffer {
  private buffer = new Map<string, string>()

  append(stepId: string, token: string): string | null {
    const existing = this.buffer.get(stepId) ?? ""
    this.buffer.set(stepId, existing + token)
    // Bound buffer size: evict oldest entries when over limit
    if (this.buffer.size > MAX_BUFFERED_STREAMS) {
      const oldest = this.buffer.keys().next().value
      if (oldest !== undefined && oldest !== stepId) this.buffer.delete(oldest)
    }
    return null
  }

  flush(stepId: string): string | null {
    const text = this.buffer.get(stepId)
    if (!text || text.length === 0) return null
    this.buffer.delete(stepId)
    return text
  }

  flushAll(): Array<{ stepId: string; text: string }> {
    const result: Array<{ stepId: string; text: string }> = []
    for (const [stepId, text] of this.buffer) {
      if (text.length > 0) {
        result.push({ stepId, text })
      }
    }
    this.buffer.clear()
    return result
  }

  hasPending(stepId: string): boolean {
    const text = this.buffer.get(stepId)
    return text !== undefined && text.length > 0
  }

  clear(stepId: string): void {
    this.buffer.delete(stepId)
  }

  getActiveStepIds(): string[] {
    return Array.from(this.buffer.keys())
  }

  clearAll(): void {
    this.buffer.clear()
  }
}
