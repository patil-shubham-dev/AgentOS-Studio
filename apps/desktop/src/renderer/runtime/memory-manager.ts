import { RUNTIME_TOKEN_LIMITS } from "./runtime-token-config"

export interface MemoryBlock {
  type: "raw" | "summary"
  content: string
  timestamp: number
  tokenEstimate?: number
}

export interface CompressedContext {
  blocks: MemoryBlock[]
  totalTokens: number
}

const AVG_CHARS_PER_TOKEN = 4
const RECENT_RAW_MESSAGES = 6
const MAX_SUMMARY_LENGTH = 2000

function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN)
}

function truncateToTokenBudget(text: string, budget: number): string {
  const maxChars = budget * AVG_CHARS_PER_TOKEN
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 100) + `\n// ... [truncated to ~${budget} tokens]`
}

export function summarizeMessages(
  messages: { role: string; content: string; timestamp?: number }[],
  maxTokens: number = RUNTIME_TOKEN_LIMITS.MAX_CONTEXT_TOKENS,
): CompressedContext {
  const blocks: MemoryBlock[] = []
  let totalTokens = 0

  if (messages.length === 0) return { blocks, totalTokens }

  const recentRaw: { role: string; content: string; timestamp?: number }[] = []
  const older: { role: string; content: string; timestamp?: number }[] = []

  const splitIndex = Math.max(0, messages.length - RECENT_RAW_MESSAGES)
  for (let i = 0; i < messages.length; i++) {
    if (i < splitIndex) older.push(messages[i])
    else recentRaw.push(messages[i])
  }

  for (const msg of recentRaw) {
    const t = estimateTokens(msg.content)
    if (totalTokens + t <= maxTokens) {
      blocks.push({
        type: "raw",
        content: `${msg.role}: ${msg.content}`,
        timestamp: msg.timestamp ?? Date.now(),
        tokenEstimate: t,
      })
      totalTokens += t
    } else {
      const budget = maxTokens - totalTokens
      if (budget > 10) {
        const truncated = truncateToTokenBudget(msg.content, budget)
        blocks.push({
          type: "raw",
          content: `${msg.role}: ${truncated}`,
          timestamp: msg.timestamp ?? Date.now(),
          tokenEstimate: budget,
        })
        totalTokens += budget
      }
      break
    }
  }

  if (older.length > 0) {
    const summaryBudget = Math.min(MAX_SUMMARY_LENGTH, Math.floor(maxTokens * 0.2))
    const summaries: string[] = []
    const roles = new Set(older.map((m) => m.role))

    for (const role of roles) {
      const roleMessages = older.filter((m) => m.role === role)
      const roleSummary = roleMessages
        .map((m) => {
          const preview = m.content.length > 100 ? m.content.slice(0, 100) + "..." : m.content
          return preview
        })
        .join("; ")
      summaries.push(`[${role} (${roleMessages.length} messages)]: ${roleSummary}`)
    }

    const summaryText = summaries.join("\n")
    const trimmed = truncateToTokenBudget(summaryText, Math.floor(summaryBudget / AVG_CHARS_PER_TOKEN))
    const t = estimateTokens(trimmed)

    if (totalTokens + t <= maxTokens) {
      blocks.unshift({
        type: "summary",
        content: `[Previous context summary]\n${trimmed}`,
        timestamp: older[0]?.timestamp ?? Date.now(),
        tokenEstimate: t,
      })
      totalTokens += t
    }
  }

  return { blocks, totalTokens }
}

export function formatCompressedContext(ctx: CompressedContext): string {
  return ctx.blocks
    .map((b) => (b.type === "summary" ? `<<< ${b.content} >>>` : b.content))
    .join("\n")
}

export function getMemoryPressure(ctx: CompressedContext, maxTokens: number = RUNTIME_TOKEN_LIMITS.MAX_CONTEXT_TOKENS): number {
  return Math.round((ctx.totalTokens / maxTokens) * 100)
}
