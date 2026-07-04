export interface SubtaskResult {
  id: string
  name: string
  success: boolean
  content: string
  error?: string
  toolCalls?: number
  tokensUsed?: number
  durationMs?: number
}

export interface ConsolidatedResult {
  success: boolean
  overallSummary: string
  results: SubtaskResult[]
  failedSubtaskCount: number
  totalDurationMs: number
  totalTokensUsed: number
  details: string
}

export function consolidateResults(results: SubtaskResult[]): ConsolidatedResult {
  const failed = results.filter((r) => !r.success)
  const succeeded = results.filter((r) => r.success)

  const totalDuration = results.reduce((sum, r) => sum + (r.durationMs || 0), 0)
  const totalTokens = results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0)
  const totalToolCalls = results.reduce((sum, r) => sum + (r.toolCalls || 0), 0)

  let overallSummary: string
  if (failed.length === 0) {
    overallSummary = `All ${results.length} subtask(s) completed successfully.`
  } else if (succeeded.length === 0) {
    overallSummary = `All ${results.length} subtask(s) failed.`
  } else {
    overallSummary = `${succeeded.length}/${results.length} subtask(s) succeeded, ${failed.length} failed.`
  }

  const detailParts: string[] = []
  detailParts.push(`# Batch Task Results\n`)
  detailParts.push(`**Overall**: ${overallSummary}`)
  detailParts.push(`**Duration**: ${formatDuration(totalDuration)}`)
  detailParts.push(`**Tokens Used**: ${totalTokens.toLocaleString()}`)
  detailParts.push(`**Tool Calls**: ${totalToolCalls}`)
  detailParts.push('')

  for (const result of results) {
    const icon = result.success ? '✅' : '❌'
    detailParts.push(`## ${icon} ${result.name}`)
    detailParts.push(`Status: ${result.success ? 'Success' : 'Failed'}`)
    if (result.durationMs) detailParts.push(`Duration: ${formatDuration(result.durationMs)}`)
    if (result.tokensUsed) detailParts.push(`Tokens: ${result.tokensUsed.toLocaleString()}`)
    if (result.error) detailParts.push(`Error: ${result.error}`)
    if (result.content) {
      const trimmedContent = result.content.length > 2000
        ? result.content.slice(0, 2000) + '\n... (truncated)'
        : result.content
      detailParts.push(`\n${trimmedContent}`)
    }
    detailParts.push('')
  }

  return {
    success: failed.length === 0,
    overallSummary,
    results,
    failedSubtaskCount: failed.length,
    totalDurationMs: totalDuration,
    totalTokensUsed: totalTokens,
    details: detailParts.join('\n'),
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
