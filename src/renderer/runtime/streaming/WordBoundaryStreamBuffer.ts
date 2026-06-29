const WORD_BOUNDARY = /[\s\n\r.!?;:)]$/

export class WordBoundaryStreamBuffer {
  private buffer = new Map<string, string>()
  private pendingBoundary = false
  private wordCount = 0

  append(stepId: string, token: string): string | null {
    const existing = this.buffer.get(stepId) ?? ""
    const combined = existing + token
    this.buffer.set(stepId, combined)
    if (!this.pendingBoundary && WORD_BOUNDARY.test(combined)) {
      this.pendingBoundary = true
      this.wordCount++
    }
    if (this.pendingBoundary && this.wordCount >= 1) {
      return this.flush(stepId)
    }
    return null
  }

  flush(stepId: string): string | null {
    const text = this.buffer.get(stepId)
    if (!text || text.length === 0) return null
    this.buffer.delete(stepId)
    this.pendingBoundary = false
    this.wordCount = 0
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
    this.pendingBoundary = false
    this.wordCount = 0
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
    this.pendingBoundary = false
    this.wordCount = 0
  }
}
