const COMPACTABLE_TOOL_RESULTS = new Set([
  'read_file', 'bash', 'run_command',
  'grep_files', 'glob_files',
  'web_search', 'web_fetch',
  'edit_file', 'write_file',
])

export function microCompact(
  messages: Array<{ role: string; content?: string; metadata?: Record<string, unknown>; [key: string]: unknown }>,
): Array<{ role: string; content?: string; metadata?: Record<string, unknown>; [key: string]: unknown }> {
  let lastUserIndex = -1

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }

  return messages.map((msg, i) => {
    if (i >= lastUserIndex) return msg
    if (msg.role !== 'tool') return msg

    const toolName = extractToolName(msg)
    if (!toolName || !COMPACTABLE_TOOL_RESULTS.has(toolName)) return msg

    return {
      ...msg,
      content: `[${toolName} result from earlier — content cleared to save space]`,
      metadata: { ...(msg.metadata as Record<string, unknown> ?? {}), compacted: true, originalLength: (msg.content ?? '').length },
    }
  })
}

function extractToolName(msg: { [key: string]: unknown }): string | null {
  if (typeof msg.tool_name === 'string') return msg.tool_name
  if (typeof (msg as any).name === 'string') return (msg as any).name
  if (typeof (msg as any).tool === 'string') return (msg as any).tool
  return null
}
