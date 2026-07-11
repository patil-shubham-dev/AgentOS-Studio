import type { RuntimeRole } from "@/types"
import { providerGateway } from "@/runtime/providers/ProviderGateway"
import { useAppStore } from "@/stores/app-store"
import { TokenEstimator } from "./TokenEstimator"

const AUTOCOMPACT_TRIGGER_PERCENTAGE = 90
const AUTOCOMPACT_BUFFER_TOKENS = 13_000
const PRESERVED_RECENT_MESSAGE_COUNT = 6
const MAX_CONSECUTIVE_FAILURES = 3

let consecutiveFailures = 0

export function shouldAutoCompact(estimatedTokens: number, contextWindow: number): boolean {
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return false
  const percentageUsed = (estimatedTokens / contextWindow) * 100
  return percentageUsed >= AUTOCOMPACT_TRIGGER_PERCENTAGE || (contextWindow - estimatedTokens) <= AUTOCOMPACT_BUFFER_TOKENS
}

function extractFilePaths(messages: Array<{ role: string; content?: string }>): string[] {
  const paths = new Set<string>()
  const filePattern = /(?:edited|created|updated|modified|wrote|changed|read|opened)\s+(?:file\s+)?(?:`([^`]+)`|([^\s,.]+))/gi
  for (const msg of messages) {
    if (!msg.content) continue
    let match
    while ((match = filePattern.exec(msg.content)) !== null) {
      const path = (match[1] ?? match[2])?.trim()
      if (path && path.match(/\.\w+$/)) paths.add(path)
    }
  }
  return [...paths]
}

async function reAttachFileContext(
  filePaths: string[],
): Promise<Array<{ role: string; content: string }>> {
  const attachments: Array<{ role: string; content: string }> = []
  for (const filePath of filePaths) {
    try {
      let content: string
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const { readTextFile } = await import('@/lib/electron-api')
        content = await readTextFile(filePath)
      } else {
        const fs = await import('@/lib/electron-api')
        content = await fs.readTextFile(filePath)
      }
      attachments.push({
        role: 'user',
        content: `[Re-attached file: ${filePath}]\n\`\`\`\n${content}\n\`\`\``,
      })
    } catch {
      console.warn(`[autoCompact] Could not re-attach file: ${filePath}`)
    }
  }
  return attachments
}

export async function autoCompact(
  messages: Array<{ role: string; content?: string }>,
  activeRole: RuntimeRole,
  keepRecent: number = PRESERVED_RECENT_MESSAGE_COUNT,
): Promise<{
  compacted: Array<{ role: string; content?: string }>
  summaryGenerated: boolean
}> {
  if (messages.length <= keepRecent + 2) {
    return { compacted: messages, summaryGenerated: false }
  }

  const recentMessages = messages.slice(-keepRecent)
  const olderMessages = messages.slice(0, -keepRecent)

  const filePaths = extractFilePaths(olderMessages)

  const compactPrompt = `Summarize the following conversation, preserving:
- The user's original request and requirements
- What files were created or modified and why
- Key decisions made (architecture, naming, trade-offs)
- What is still in progress
- Any errors encountered and their resolutions

Do NOT include the word "Okay" or conversational filler. Be factual and concise.

Conversation:
${olderMessages.map((m) => `[${m.role}]: ${m.content}`).join('\n')}`

  try {
    const providers = useAppStore.getState().providers ?? []
    const fastProvider = providers.find((p: any) => p.id === 'fast-inference' || p.id === 'manager')
    const providerId = fastProvider?.id ?? providers[0]?.id
    const model = fastProvider?.models?.[0]?.id ?? providers[0]?.models?.[0]?.id

    if (!providerId || !model) {
      consecutiveFailures++
      return { compacted: messages, summaryGenerated: false }
    }

    const result = await providerGateway.chat({
      messages: [{ role: 'user', content: compactPrompt }],
      providerId,
      model,
      maxTokens: 2_048,
    })

    if (!result.content) {
      consecutiveFailures++
      return { compacted: messages, summaryGenerated: false }
    }

    consecutiveFailures = 0

    const compacted: Array<{ role: string; content?: string }> = [
      {
        role: 'system',
        content: `[Conversation from earlier summarized below]\n${result.content}`,
        metadata: { compacted: true, compactedMessageCount: olderMessages.length },
      },
      {
        role: 'user',
        content: '[Continue from here. The summary above preserves all context needed.]',
      },
      ...recentMessages,
    ]

    const attachments = await reAttachFileContext(filePaths)
    if (attachments.length > 0) {
      compacted.push(...attachments)
    }

    return { compacted, summaryGenerated: true }
  } catch (err) {
    console.error('[autoCompact] summarization failed:', err)
    consecutiveFailures++
    return { compacted: messages, summaryGenerated: false }
  }
}
