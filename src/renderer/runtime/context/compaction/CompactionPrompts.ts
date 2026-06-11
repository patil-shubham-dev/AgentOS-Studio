export function buildCompactPrompt(turnCount: number): string {
  return `The following is a compressed summary of the first ${turnCount} turns of our conversation.
These turns have been removed from context to save space. Key facts and decisions are preserved below.`
}

export function buildSummaryPrompt(userMessages: string[]): string {
  return `Summarize the key requests and decisions from these user messages:
${userMessages.map((m, i) => `[${i + 1}] ${m.slice(0, 500)}`).join('\n')}

Provide a concise summary (3-5 sentences) covering what was asked and what was decided.`
}

export function buildSessionMemoryPrompt(tags: string[], facts: string[]): string {
  return `Session context tags: ${tags.join(', ')}
Key facts:
${facts.map(f => `- ${f}`).join('\n')}`
}
