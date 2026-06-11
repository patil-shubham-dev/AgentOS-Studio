import { DiskBackedResultStore, type StoredResult } from '../../storage/DiskBackedResultStore'

export interface TruncationResult {
  text: string
  truncated: boolean
  originalLength: number
  truncatedLength: number
  lineCount: number
  truncatedLineCount: number
  storedResultId?: string
  storedResult?: StoredResult
}

export interface TruncationConfig {
  maxChars: number
  maxLines: number
  maxBytes: number
  diskBackedThreshold: number
  showLineCount: boolean
  ellipsis: string
}

const DEFAULT_CONFIG: TruncationConfig = {
  maxChars: 10_000,
  maxLines: 500,
  maxBytes: 100_000,
  diskBackedThreshold: 50_000,
  showLineCount: true,
  ellipsis: '\n... [${truncatedLines} lines truncated, ${truncatedChars} chars]',
}

export function truncateOutput(output: string, config: Partial<TruncationConfig> = {}): TruncationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const lines = output.split('\n')
  const originalLength = output.length
  const lineCount = lines.length
  let truncated = false
  let result = output

  if (originalLength >= cfg.diskBackedThreshold) {
    const store = DiskBackedResultStore.getInstance()
    const resultId = `tool_result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const stored = store.storeResult(resultId, output, 'run_command')

    const previewLines = Math.min(cfg.maxLines, 50)
    const previewChars = Math.min(cfg.maxChars, 2000)
    let preview = lines.slice(0, previewLines).join('\n')
    if (preview.length > previewChars) {
      preview = preview.slice(0, previewChars)
    }

    const relPath = stored.filePath
      ? stored.filePath.replace(/\\/g, '/')
      : '.agentic-tool-results/' + resultId + '.json'

    result = preview + `\n\n... [Full output: ${originalLength} chars, ${lineCount} lines — stored at \`${relPath}\`]`
    truncated = true

    return {
      text: result,
      truncated: true,
      originalLength,
      truncatedLength: result.length,
      lineCount,
      truncatedLineCount: lineCount - previewLines,
      storedResultId: resultId,
      storedResult: stored,
    }
  }

  if (result.length > cfg.maxChars) {
    result = result.slice(0, cfg.maxChars)
    truncated = true
  }

  if (lines.length > cfg.maxLines) {
    result = lines.slice(0, cfg.maxLines).join('\n')
    truncated = true
  }

  if (truncated) {
    const truncatedLines = lineCount - result.split('\n').length
    const truncatedChars = originalLength - result.length
    const ellipsis = cfg.ellipsis
      .replace('${truncatedLines}', String(truncatedLines))
      .replace('${truncatedChars}', String(truncatedChars))
    result += ellipsis
  }

  return {
    text: result,
    truncated,
    originalLength,
    truncatedLength: result.length,
    lineCount,
    truncatedLineCount: truncated ? lineCount - result.split('\n').length + 1 : 0,
  }
}

export function truncateForDisplay(output: string, maxPreviewChars: number = 500): string {
  if (output.length <= maxPreviewChars) return output
  return output.slice(0, maxPreviewChars) + `\n... [${output.length - maxPreviewChars} more chars]`
}
