import { summarizeMessages, formatCompressedContext } from "@/runtime/memory-manager"
import { RUNTIME_TOKEN_LIMITS } from "@/runtime/runtime-token-config"

export function compressConversationHistory(messages: { role: string; content: string; timestamp?: number }[]) {
  if (messages.length <= RUNTIME_TOKEN_LIMITS.MAX_CONTEXT_MESSAGES) {
    return messages
  }

  const compressed = summarizeMessages(messages as any, RUNTIME_TOKEN_LIMITS.MAX_HISTORY_TOKENS)
  return compressed.blocks.map((b) => ({
    role: "user" as const,
    content: formatCompressedContext({ blocks: [b], totalTokens: b.tokenEstimate ?? 0 }),
    timestamp: b.timestamp,
  }))
}
