export type DiffOperation = 'insert' | 'replace' | 'delete'

export interface DiffEdit {
  type?: DiffOperation
  oldContent?: string
  newContent?: string
  target?: string
  position?: 'before' | 'after'
  allOccurrences?: boolean
}

export interface DiffLocation {
  startLine: number
  endLine: number
}

export interface DiffResult {
  applied: boolean
  fileChanged: boolean
  operation: DiffOperation
  hunks: number
  locations: DiffLocation[]
  error?: string
}

export interface DiffEngineOptions {
  failFast?: boolean
}

export interface DiffEngineResult {
  results: DiffResult[]
  content: string
  allApplied: boolean
  error?: string
}

function lineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

function countLines(text: string): number {
  return text.split('\n').length
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

function applyReplace(content: string, edit: DiffEdit): { content: string; result: DiffResult } {
  const oldContent = edit.oldContent ?? ''
  const newContent = edit.newContent ?? ''

  if (!oldContent) {
    return {
      content,
      result: {
        applied: false,
        fileChanged: false,
        operation: 'replace',
        hunks: 0,
        locations: [],
        error: `EDIT_FAILED: oldContent is empty for replace operation`,
      }
    }
  }

  if (!content.includes(oldContent)) {
    return {
      content,
      result: {
        applied: false,
        fileChanged: false,
        operation: 'replace',
        hunks: 0,
        locations: [],
        error: `EDIT_FAILED: target text not found\nExpected to find:\n\`\`\`\n${oldContent}\n\`\`\`\nBut it was not found in the file.`,
      }
    }
  }

  const locations: DiffLocation[] = []
  let resultContent: string
  let hunks = 0

  if (edit.allOccurrences) {
    let searchIndex = 0
    const parts: string[] = []
    while (searchIndex < content.length) {
      const matchIndex = content.indexOf(oldContent, searchIndex)
      if (matchIndex === -1) {
        parts.push(content.slice(searchIndex))
        break
      }
      parts.push(content.slice(searchIndex, matchIndex))
      parts.push(newContent)
      const startLine = lineNumber(content, matchIndex)
      const endLine = startLine + countLines(oldContent) - 1
      locations.push({ startLine, endLine })
      hunks++
      searchIndex = matchIndex + oldContent.length
    }
    resultContent = parts.join('')
  } else {
    const matchIndex = content.indexOf(oldContent)
    const startLine = lineNumber(content, matchIndex)
    const endLine = startLine + countLines(oldContent) - 1
    locations.push({ startLine, endLine })
    hunks = 1
    resultContent = content.replace(oldContent, newContent)
  }

  if (newContent && !resultContent.includes(newContent)) {
    return {
      content: resultContent,
      result: {
        applied: false,
        fileChanged: false,
        operation: 'replace',
        hunks: 0,
        locations: [],
        error: `EDIT_FAILED: edit did not produce expected output — newContent not found after replacement\nExpected to find:\n\`\`\`\n${newContent}\n\`\`\``,
      },
    }
  }

  return {
    content: resultContent,
    result: {
      applied: true,
      fileChanged: oldContent !== newContent,
      operation: 'replace',
      hunks,
      locations,
    },
  }
}

function applyInsert(content: string, edit: DiffEdit): { content: string; result: DiffResult } {
  const target = edit.target ?? ''
  const newContent = edit.newContent ?? ''
  const position = edit.position ?? 'after'

  if (!target) {
    return {
      content,
      result: {
        applied: false,
        fileChanged: false,
        operation: 'insert',
        hunks: 0,
        locations: [],
        error: `EDIT_FAILED: target is empty for insert operation`,
      }
    }
  }

  const matchIndex = content.indexOf(target)
  if (matchIndex === -1) {
    return {
      content,
      result: {
        applied: false,
        fileChanged: false,
        operation: 'insert',
        hunks: 0,
        locations: [],
        error: `EDIT_FAILED: target text not found\nExpected to find:\n\`\`\`\n${target}\n\`\`\`\nBut it was not found in the file.`,
      }
    }
  }

  const startLine = lineNumber(content, matchIndex)
  let resultContent: string

  if (position === 'before') {
    resultContent = content.slice(0, matchIndex) + newContent + '\n' + content.slice(matchIndex)
  } else {
    const insertAt = matchIndex + target.length
    resultContent = content.slice(0, insertAt) + '\n' + newContent + content.slice(insertAt)
  }

  const endLine = position === 'before' ? startLine : startLine + countLines(target) - 1

  if (newContent && !resultContent.includes(newContent)) {
    return {
      content: resultContent,
      result: {
        applied: false,
        fileChanged: false,
        operation: 'insert',
        hunks: 0,
        locations: [],
        error: `EDIT_FAILED: edit did not produce expected output — newContent not found after insertion\nExpected to find:\n\`\`\`\n${newContent}\n\`\`\``,
      },
    }
  }

  return {
    content: resultContent,
    result: {
      applied: true,
      fileChanged: true,
      operation: 'insert',
      hunks: 1,
      locations: [{ startLine, endLine }],
    },
  }
}

function applyDelete(content: string, edit: DiffEdit): { content: string; result: DiffResult } {
  const oldContent = edit.oldContent ?? ''

  if (!oldContent) {
    return {
      content,
      result: {
        applied: false,
        fileChanged: false,
        operation: 'delete',
        hunks: 0,
        locations: [],
        error: `EDIT_FAILED: oldContent is empty for delete operation`,
      }
    }
  }

  if (!content.includes(oldContent)) {
    return {
      content,
      result: {
        applied: false,
        fileChanged: false,
        operation: 'delete',
        hunks: 0,
        locations: [],
        error: `EDIT_FAILED: target text not found\nExpected to find:\n\`\`\`\n${oldContent}\n\`\`\`\nBut it was not found in the file.`,
      }
    }
  }

  const locations: DiffLocation[] = []
  let resultContent: string
  let hunks = 0

  if (edit.allOccurrences) {
    let searchIndex = 0
    const parts: string[] = []
    while (searchIndex < content.length) {
      const matchIndex = content.indexOf(oldContent, searchIndex)
      if (matchIndex === -1) {
        parts.push(content.slice(searchIndex))
        break
      }
      parts.push(content.slice(searchIndex, matchIndex))
      const startLine = lineNumber(content, matchIndex)
      const endLine = startLine + countLines(oldContent) - 1
      locations.push({ startLine, endLine })
      hunks++
      searchIndex = matchIndex + oldContent.length
    }
    resultContent = parts.join('')
  } else {
    const matchIndex = content.indexOf(oldContent)
    const startLine = lineNumber(content, matchIndex)
    const endLine = startLine + countLines(oldContent) - 1
    locations.push({ startLine, endLine })
    hunks = 1
    resultContent = content.replace(oldContent, '')
  }

  const origCount = content.split(oldContent).length - 1
  const resultCount = resultContent.split(oldContent).length - 1
  const expectedRemoved = edit.allOccurrences ? origCount : 1
  if (origCount - resultCount !== expectedRemoved) {
    return {
      content: resultContent,
      result: {
        applied: false,
        fileChanged: false,
        operation: 'delete',
        hunks: 0,
        locations: [],
        error: `EDIT_FAILED: edit did not produce expected output — expected to remove ${expectedRemoved} occurrence(s), removed ${origCount - resultCount}\nExpected to remove:\n\`\`\`\n${oldContent}\n\`\`\``,
      },
    }
  }

  return {
    content: resultContent,
    result: {
      applied: true,
      fileChanged: true,
      operation: 'delete',
      hunks,
      locations,
    },
  }
}

function detectOperation(edit: DiffEdit): DiffOperation {
  if (edit.type) return edit.type
  if (edit.target) return 'insert'
  if (edit.oldContent && edit.newContent !== undefined) return 'replace'
  if (edit.oldContent && edit.newContent === undefined) return 'delete'
  return 'replace'
}

function normalizeEdit(edit: DiffEdit): DiffEdit {
  return {
    type: detectOperation(edit),
    oldContent: edit.oldContent,
    newContent: edit.newContent,
    target: edit.target,
    position: edit.position ?? 'after',
    allOccurrences: edit.allOccurrences ?? false,
  }
}

export function applyEdits(
  content: string,
  edits: DiffEdit[],
  options?: DiffEngineOptions
): DiffEngineResult {
  const opts: DiffEngineOptions = { failFast: true, ...options }
  let currentContent = normalizeContent(content)
  const results: DiffResult[] = []

  for (const edit of edits) {
    const normalized = normalizeEdit(edit)
    let result: { content: string; result: DiffResult }

    switch (normalized.type) {
      case 'insert':
        result = applyInsert(currentContent, normalized)
        break
      case 'delete':
        result = applyDelete(currentContent, normalized)
        break
      case 'replace':
      default:
        result = applyReplace(currentContent, normalized)
        break
    }

    results.push(result.result)

    if (!result.result.applied && opts.failFast) {
      return {
        results,
        content: currentContent,
        allApplied: false,
        error: result.result.error,
      }
    }

    currentContent = result.content
  }

  return {
    results,
    content: currentContent,
    allApplied: results.every(r => r.applied),
    error: results.some(r => !r.applied)
      ? `${results.filter(r => !r.applied).length} edit(s) failed. Check individual results for details.`
      : undefined,
  }
}

export function applyPatch(
  content: string,
  edits: DiffEdit[],
  options?: DiffEngineOptions
): DiffEngineResult {
  return applyEdits(content, edits, options)
}

function lcsLength(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp
}

function buildEditScript(a: string[], b: string[], dp: number[][]): Array<{ type: 'equal' | 'delete' | 'insert'; line: string }> {
  const script: Array<{ type: 'equal' | 'delete' | 'insert'; line: string }> = []
  let i = a.length
  let j = b.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      script.unshift({ type: 'equal', line: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      script.unshift({ type: 'insert', line: b[j - 1] })
      j--
    } else {
      script.unshift({ type: 'delete', line: a[i - 1] })
      i--
    }
  }
  return script
}

export interface UnifiedDiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export function computeDiff(
  original: string,
  modified: string
): UnifiedDiffHunk[] {
  const a = original.split('\n')
  const b = modified.split('\n')
  const dp = lcsLength(a, b)
  const script = buildEditScript(a, b, dp)

  const hunks: UnifiedDiffHunk[] = []
  const CONTEXT_LINES = 3
  let i = 0
  while (i < script.length) {
    if (script[i].type === 'equal') { i++; continue }
    const start = Math.max(0, i - CONTEXT_LINES)
    let end = i
    while (end < script.length && (script[end].type !== 'equal' || (end - i) < CONTEXT_LINES * 2)) {
      if (script[end].type === 'equal') {
        let eqCount = 0
        while (end + eqCount < script.length && script[end + eqCount].type === 'equal' && eqCount < CONTEXT_LINES * 2) {
          eqCount++
        }
        end += Math.min(eqCount, CONTEXT_LINES * 2)
        break
      }
      end++
    }

    const hunkLines: string[] = []
    let oldLineNum = 0
    let newLineNum = 0
    for (let k = 0; k < start; k++) {
      if (script[k].type !== 'insert') oldLineNum++
      if (script[k].type !== 'delete') newLineNum++
    }

    const oldStart = oldLineNum + 1
    const newStart = newLineNum + 1

    for (let k = start; k < Math.min(end, script.length); k++) {
      const entry = script[k]
      switch (entry.type) {
        case 'equal':
          hunkLines.push(' ' + entry.line)
          oldLineNum++
          newLineNum++
          break
        case 'delete':
          hunkLines.push('-' + entry.line)
          oldLineNum++
          break
        case 'insert':
          hunkLines.push('+' + entry.line)
          newLineNum++
          break
      }
    }

    const oldLines = oldLineNum - (oldStart - 1)
    const newLines = newLineNum - (newStart - 1)

    hunks.push({
      oldStart,
      oldLines,
      newStart,
      newLines,
      lines: hunkLines,
    })

    i = end
    while (i < script.length && script[i].type !== 'equal') i++
    while (i < script.length && script[i].type === 'equal') i++
  }

  return hunks
}

export function generateUnifiedDiff(
  original: string,
  modified: string,
  filePath?: string
): string {
  if (original === modified) return ''

  const hunks = computeDiff(original, modified)
  if (hunks.length === 0) return ''

  const lines: string[] = []
  const oldFile = filePath ?? 'original'
  const newFile = filePath ?? 'modified'

  lines.push(`--- a/${oldFile}`)
  lines.push(`+++ b/${newFile}`)

  for (const hunk of hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)
    lines.push(...hunk.lines)
  }

  return lines.join('\n')
}
