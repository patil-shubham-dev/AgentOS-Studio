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

const MAX_DIFF_INPUT_SIZE = 10 * 1024 * 1024
const MAX_DIFF_LINES = 50000
const MAX_EDIT_SCRIPT_LENGTH = 100000

export function applyEdits(
  content: string,
  edits: DiffEdit[],
  options?: DiffEngineOptions
): DiffEngineResult {
  if (content.length > MAX_DIFF_INPUT_SIZE) {
    return {
      results: [],
      content,
      allApplied: false,
      error: `File too large (${(content.length / 1024 / 1024).toFixed(1)}MB) for diff engine — max is ${MAX_DIFF_INPUT_SIZE / 1024 / 1024}MB`,
    }
  }

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

export interface UnifiedDiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

function myersDiff(a: string[], b: string[]): Array<{ type: 'equal' | 'delete' | 'insert'; line: string }> {
  const N = a.length
  const M = b.length

  if (N === 0 && M === 0) return []
  if (N === 0) return b.map(line => ({ type: 'insert' as const, line }))
  if (M === 0) return a.map(line => ({ type: 'delete' as const, line }))

  const maxD = N + M
  const offset = maxD
  const V: number[] = new Array(2 * maxD + 1).fill(0)
  V[offset + 1] = 0

  const traces: number[][] = []

  for (let d = 0; d <= maxD; d++) {
    traces.push(V.slice())

    for (let k = -d; k <= d; k += 2) {
      const idx = offset + k
      let x: number
      if (k === -d || (k !== d && V[idx - 1] < V[idx + 1])) {
        x = V[idx + 1]
      } else {
        x = V[idx - 1] + 1
      }
      let y = x - k
      while (x < N && y < M && a[x] === b[y]) {
        x++
        y++
      }
      V[idx] = x
      if (x >= N && y >= M) {
        return myersBacktrack(a, b, traces, d, k, offset)
      }
    }
  }

  return buildSimpleScript(a, b)
}

function myersBacktrack(
  a: string[],
  b: string[],
  traces: number[][],
  d: number,
  k: number,
  offset: number
): Array<{ type: 'equal' | 'delete' | 'insert'; line: string }> {
  const script: Array<{ type: 'equal' | 'delete' | 'insert'; line: string }> = []
  let x = a.length
  let y = b.length

  for (let d2 = d; d2 > 0; d2--) {
    const Vcurr = traces[d2]
    const Vprev = traces[d2 - 1]

    while (x > 0 && y > 0 && a[x - 1] === b[y - 1]) {
      script.push({ type: 'equal', line: a[x - 1] })
      x--
      y--
    }

    const idx = offset + k
    if (k === -d2 || (k !== d2 && Vprev[idx - 1] < Vprev[idx + 1])) {
      script.push({ type: 'insert', line: b[y - 1] })
      y--
      k++
    } else {
      script.push({ type: 'delete', line: a[x - 1] })
      x--
      k--
    }
  }

  while (x > 0 && y > 0 && a[x - 1] === b[y - 1]) {
    script.push({ type: 'equal', line: a[x - 1] })
    x--
    y--
  }

  script.reverse()
  return script
}

function buildSimpleScript(
  a: string[],
  b: string[]
): Array<{ type: 'equal' | 'delete' | 'insert'; line: string }> {
  const script: Array<{ type: 'equal' | 'delete' | 'insert'; line: string }> = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      script.push({ type: 'equal', line: a[i] })
      i++
      j++
    } else if (j < b.length && (i >= a.length || b[j] !== a[i])) {
      script.push({ type: 'insert', line: b[j] })
      j++
    } else if (i < a.length) {
      script.push({ type: 'delete', line: a[i] })
      i++
    }
  }
  return script
}

export function computeDiff(
  original: string,
  modified: string
): UnifiedDiffHunk[] {
  if (original === modified) return []

  const a = original.split('\n')
  const b = modified.split('\n')

  let script: Array<{ type: 'equal' | 'delete' | 'insert'; line: string }>
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES || a.length + b.length > MAX_EDIT_SCRIPT_LENGTH) {
    script = buildSimpleScript(a, b)
  } else {
    script = myersDiff(a, b)
  }

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
  if (original.length > MAX_DIFF_INPUT_SIZE || modified.length > MAX_DIFF_INPUT_SIZE) {
    return `--- a/${filePath ?? 'original'}\n+++ b/${filePath ?? 'modified'}\n@@ -1 +1 @@\n-File too large to generate diff\n+File too large to generate diff\n`
  }

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
