import type { MessageLike } from '../context-types'
import { AutoCompactTrigger, type CompactTriggerResult } from './AutoCompactTrigger'
import { ToolUseSummaryGenerator } from './ToolUseSummaryGenerator'
import { SessionMemoryCompact } from './SessionMemoryCompact'

export interface CompactionResult {
  messages: MessageLike[]
  summary: string
  toolUseSummary: string
  sessionMemoryTags: string[]
  compactedTurnCount: number
}

export class CompactionEngine {
  private trigger: AutoCompactTrigger
  private toolSummaryGen: ToolUseSummaryGenerator
  private sessionMemory: SessionMemoryCompact

  constructor() {
    this.trigger = new AutoCompactTrigger()
    this.toolSummaryGen = new ToolUseSummaryGenerator()
    this.sessionMemory = new SessionMemoryCompact()
  }

  shouldCompact(messages: MessageLike[], budgetUsage: number): CompactTriggerResult {
    return this.trigger.evaluate(messages, budgetUsage)
  }

  compact(messages: MessageLike[], budgetUsage: number): CompactionResult {
    const triggerResult = this.shouldCompact(messages, budgetUsage)
    if (!triggerResult.shouldCompact) {
      return {
        messages,
        summary: '',
        toolUseSummary: '',
        sessionMemoryTags: [],
        compactedTurnCount: 0,
      }
    }

    const { compacted, summary, compactedTurnCount } = this.autoCompact(messages, triggerResult)
    const toolUseSummary = this.toolSummaryGen.generate(compacted)
    const sessionMemoryTags = this.sessionMemory.extract(compacted)

    return {
      messages: compacted,
      summary,
      toolUseSummary,
      sessionMemoryTags,
      compactedTurnCount,
    }
  }

  private autoCompact(
    messages: MessageLike[],
    triggerResult: CompactTriggerResult,
  ): { compacted: MessageLike[]; summary: string; compactedTurnCount: number } {
    if (messages.length < 4) return { compacted: messages, summary: '', compactedTurnCount: 0 }

    const turnsToCompact = Math.max(2, Math.floor(messages.length * triggerResult.intensity))
    const turnsToRemove = turnsToCompact - (turnsToCompact % 2)
    if (turnsToRemove < 2) return { compacted: messages, summary: '', compactedTurnCount: 0 }

    const compactSection = messages.slice(0, turnsToRemove)
    const keptSection = messages.slice(turnsToRemove)

    const summary = this.buildSummary(compactSection)

    const compacted: MessageLike[] = [
      {
        role: 'system',
        content: `<compacted_context>\n${summary}\n</compacted_context>`,
      },
      ...keptSection,
    ]

    return { compacted, summary, compactedTurnCount: Math.floor(turnsToRemove / 2) }
  }

  private buildSummary(messages: MessageLike[]): string {
    const userMessages = messages.filter(m => m.role === 'user').slice(-5)
    const toolResults = messages.filter(m => (m as any).role === 'tool' || (m as any).isToolResult).slice(-10)

    const parts: string[] = ['Previous conversation summary:']

    for (const msg of userMessages) {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      const truncated = text.slice(0, 200)
      parts.push(`- User asked: ${truncated}`)
    }

    if (toolResults.length > 0) {
      parts.push(`- Executed ${toolResults.length} tool calls`)
    }

    return parts.join('\n')
  }
}
