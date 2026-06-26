const WORD_BOUNDARY = /[\s\n\r.!?;:)]$/

export class WordBoundaryStreamBuffer {
  private buffer = new Map<string, string[]>()
  private pendingBoundary = false
  private wordCount = 0

  append(stepId: string, token: string): string | null {
    let tokens = this.buffer.get(stepId)
    if (!tokens) {
      tokens = []
      this.buffer.set(stepId, tokens)
    }
    tokens.push(token)
    const combined = tokens.join("")
    if (WORD_BOUNDARY.test(combined)) {
      this.pendingBoundary = true
      this.wordCount++
    }
    if (this.pendingBoundary && this.wordCount >= 1) {
      return this.flush(stepId)
    }
    return null
  }

  flush(stepId: string): string | null {
    const tokens = this.buffer.get(stepId)
    if (!tokens || tokens.length === 0) return null
    this.buffer.delete(stepId)
    this.pendingBoundary = false
    this.wordCount = 0
    return tokens.join("")
  }

  flushAll(): Array<{ stepId: string; text: string }> {
    const result: Array<{ stepId: string; text: string }> = []
    for (const [stepId, tokens] of this.buffer) {
      if (tokens.length > 0) {
        result.push({ stepId, text: tokens.join("") })
      }
    }
    this.buffer.clear()
    this.pendingBoundary = false
    this.wordCount = 0
    return result
  }

  hasPending(stepId: string): boolean {
    const tokens = this.buffer.get(stepId)
    return tokens !== undefined && tokens.length > 0
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
