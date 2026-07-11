export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface DiffResult {
  lines: DiffLine[]
  added: number
  removed: number
  unchanged: number
}

export function computeDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffResult = { lines: [], added: 0, removed: 0, unchanged: 0 }

  const lcs = computeLCS(oldLines, newLines)
  let oldIdx = 0
  let newIdx = 0

  for (const commonLine of lcs) {
    while (oldIdx < oldLines.length && oldLines[oldIdx] !== commonLine) {
      result.lines.push({ type: 'removed', content: oldLines[oldIdx], oldLineNumber: oldIdx + 1 })
      result.removed++
      oldIdx++
    }
    while (newIdx < newLines.length && newLines[newIdx] !== commonLine) {
      result.lines.push({ type: 'added', content: newLines[newIdx], newLineNumber: newIdx + 1 })
      result.added++
      newIdx++
    }
    result.lines.push({ type: 'unchanged', content: commonLine, oldLineNumber: oldIdx + 1, newLineNumber: newIdx + 1 })
    result.unchanged++
    oldIdx++
    newIdx++
  }

  while (oldIdx < oldLines.length) {
    result.lines.push({ type: 'removed', content: oldLines[oldIdx], oldLineNumber: oldIdx + 1 })
    result.removed++
    oldIdx++
  }
  while (newIdx < newLines.length) {
    result.lines.push({ type: 'added', content: newLines[newIdx], newLineNumber: newIdx + 1 })
    result.added++
    newIdx++
  }

  return result
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const result: string[] = []
  let i = m; let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1])
      i--; j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) i--
    else j--
  }
  return result
}
