export interface ScratchpadFileRecord {
  summary: string
  timestamp: number
}

export interface ScratchpadEditRecord {
  summary: string
  originalContent: string
  newContent: string
  timestamp: number
}

export interface ScratchpadVerificationRecord {
  file: string
  passed: boolean
  summary: string
  timestamp: number
}

export interface ExecutionScratchpadData {
  goal: string
  filesExamined: Map<string, ScratchpadFileRecord>
  filesModified: Map<string, ScratchpadEditRecord>
  verificationResults: ScratchpadVerificationRecord[]
  remainingWork: string[]
  createdAt: number
  updatedAt: number
}

const FORMAT_MAX_TOKENS = 300

function estimateTokens(text: string): number {
  return Math.round(text.length / 4)
}

export class ExecutionScratchpad {
  private data: ExecutionScratchpadData

  constructor(goal: string) {
    this.data = {
      goal,
      filesExamined: new Map(),
      filesModified: new Map(),
      verificationResults: [],
      remainingWork: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  recordFileExamination(path: string, summary: string): void {
    this.data.filesExamined.set(path, { summary, timestamp: Date.now() })
    this.data.updatedAt = Date.now()
  }

  recordFileModification(path: string, oldContent: string, newContent: string): void {
    const summary = newContent
      ? `modified (${newContent.split('\n').length} lines added/changed)`
      : `deleted`
    this.data.filesModified.set(path, { summary, originalContent: oldContent, newContent, timestamp: Date.now() })
    this.data.updatedAt = Date.now()
  }

  recordVerificationResult(file: string, passed: boolean, summary: string): void {
    this.data.verificationResults.push({ file, passed, summary, timestamp: Date.now() })
    this.data.updatedAt = Date.now()
  }

  setRemainingWork(items: string[]): void {
    this.data.remainingWork = items
    this.data.updatedAt = Date.now()
  }

  formatForLLM(maxTokens: number = FORMAT_MAX_TOKENS): string | null {
    const data = this.data
    const parts: string[] = []

    if (data.filesExamined.size > 0) {
      const files = [...data.filesExamined.entries()]
        .map(([path, r]) => `  - ${path}: ${r.summary}`)
      parts.push('Files examined:', ...files, '')
    }

    if (data.filesModified.size > 0) {
      const files = [...data.filesModified.entries()]
        .map(([path, r]) => `  - ${path}: ${r.summary}`)
      parts.push('Files modified:', ...files, '')
    }

    if (data.verificationResults.length > 0) {
      const results = data.verificationResults.map((r) =>
        `  - ${r.file}: ${r.passed ? '✅ Passed' : '❌ Failed'} — ${r.summary}`
      )
      parts.push('Verification:', ...results, '')
    }

    if (data.remainingWork.length > 0) {
      parts.push('Remaining work:', ...data.remainingWork.map((w) => `  - ${w}`), '')
    }

    if (parts.length === 0) return null

    let block = [
      '<execution_state>',
      `Goal: ${data.goal}`,
      ...parts,
      '</execution_state>',
    ].join('\n')

    const tokens = estimateTokens(block)
    if (tokens > maxTokens) {
      const lines = block.split('\n')
      const trimmed: string[] = []
      let tokenCount = 0
      for (const line of lines) {
        const lineTokens = estimateTokens(line + '\n')
        if (tokenCount + lineTokens > maxTokens) {
          trimmed.push(`  ... (trimmed at ${maxTokens} tokens)`)
          break
        }
        trimmed.push(line)
        tokenCount += lineTokens
      }
      block = trimmed.join('\n')
    }

    return block
  }

  get summary(): string {
    const d = this.data
    const parts: string[] = []
    if (d.filesExamined.size > 0) parts.push(`${d.filesExamined.size} files examined`)
    if (d.filesModified.size > 0) parts.push(`${d.filesModified.size} files modified`)
    if (d.verificationResults.length > 0) {
      const passedCount = d.verificationResults.filter(r => r.passed).length
      parts.push(`${passedCount}/${d.verificationResults.length} verification checks passed`)
    }
    return parts.length > 0 ? parts.join(', ') : 'no activity yet'
  }

  get isEmpty(): boolean {
    return this.data.filesExamined.size === 0
      && this.data.filesModified.size === 0
      && this.data.verificationResults.length === 0
  }

  clear(): void {
    this.data.filesExamined.clear()
    this.data.filesModified.clear()
    this.data.verificationResults = []
    this.data.remainingWork = []
    this.data.updatedAt = Date.now()
  }

  get goal(): string { return this.data.goal }
  get filesExamined(): ReadonlyMap<string, ScratchpadFileRecord> { return this.data.filesExamined }
  get filesModified(): ReadonlyMap<string, ScratchpadEditRecord> { return this.data.filesModified }
  get verificationResults(): readonly ScratchpadVerificationRecord[] { return this.data.verificationResults }
  get remainingWork(): readonly string[] { return this.data.remainingWork }
  get createdAt(): number { return this.data.createdAt }
  get updatedAt(): number { return this.data.updatedAt }

  toJSON(): Record<string, unknown> {
    return {
      goal: this.data.goal,
      filesExamined: Object.fromEntries(this.data.filesExamined),
      filesModified: Object.fromEntries(this.data.filesModified),
      verificationResults: this.data.verificationResults,
      remainingWork: this.data.remainingWork,
      createdAt: this.data.createdAt,
      updatedAt: this.data.updatedAt,
    }
  }

  static fromJSON(json: Record<string, unknown>): ExecutionScratchpad {
    const scratchpad = new ExecutionScratchpad((json.goal as string) ?? '')
    if (json.filesExamined) {
      for (const [key, val] of Object.entries(json.filesExamined as Record<string, ScratchpadFileRecord>)) {
        scratchpad.data.filesExamined.set(key, val)
      }
    }
    if (json.filesModified) {
      for (const [key, val] of Object.entries(json.filesModified as Record<string, ScratchpadEditRecord>)) {
        scratchpad.data.filesModified.set(key, val)
      }
    }
    if (json.verificationResults) {
      scratchpad.data.verificationResults = json.verificationResults as ScratchpadVerificationRecord[]
    }
    if (json.remainingWork) {
      scratchpad.data.remainingWork = json.remainingWork as string[]
    }
    scratchpad.data.createdAt = (json.createdAt as number) ?? Date.now()
    scratchpad.data.updatedAt = (json.updatedAt as number) ?? Date.now()
    return scratchpad
  }
}
