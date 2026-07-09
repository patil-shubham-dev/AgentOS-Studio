import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { applyEdits, generateUnifiedDiff, type DiffEdit, type DiffEngineResult } from '@/lib/diff-engine'
import { fileContentCache } from '@/lib/FileContentCache'
import { ChangeSetManager } from '@/runtime/changeset/ChangeSetManager'
import { buildDiffFileEntry } from '@/lib/diff-review'
import { createFile } from '@/lib/filesystem'
import { FileStateCache } from '../storage/FileStateCache'

const changesetByTrace = new Map<string, string>()
const CHANGESET_MAP_MAX_SIZE = 200
function setChangeSetEntry(traceId: string, changeSetId: string): void {
  if (changesetByTrace.size >= CHANGESET_MAP_MAX_SIZE) {
    const firstKey = changesetByTrace.keys().next().value
    if (firstKey !== undefined) changesetByTrace.delete(firstKey)
  }
  changesetByTrace.set(traceId, changeSetId)
}

const MAX_FILE_SIZE_BYTES = 1_073_741_824 // 1 GiB

const SMART_QUOTE_MAP: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
}

function normalizeQuotes(text: string): string {
  return text.replace(/[\u2018\u2019\u201C\u201D]/g, (ch) => SMART_QUOTE_MAP[ch] ?? ch)
}

function sanitizeFnResult(text: string): string {
  return text.replace(/<fnr>/g, '<function_results>').replace(/<\/fnr>/g, '</function_results>')
}

async function writeTextFile(path: string, content: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const { writeTextFile: shimWrite } = await import('@/lib/electron-api')
      await shimWrite(path, content)
      return
    }
    const fs = await import('@/lib/electron-api')
    await fs.writeTextFile(path, content)
  } catch {
    await createFile(path, content)
  }
}

function recordChangeSetEntry(
  ctx: ToolContext,
  fullPath: string,
  relativePath: string,
  originalContent: string,
  modifiedContent: string,
  diff: string,
  changeType: 'modify' | 'create'
): void {
  const traceId = ctx.traceId ?? 'unknown'
  let changeSetId = changesetByTrace.get(traceId)

  if (!changeSetId) {
    const cs = ChangeSetManager.getInstance().createChangeSet({
      sessionId: traceId,
      correlationId: traceId,
      title: `Edit ${relativePath}`,
      reason: ctx.role ? `AI edit by ${ctx.role}` : 'AI edit',
      sourceToolCallIds: [traceId],
    })
    changeSetId = cs.id
    setChangeSetEntry(traceId, changeSetId)
  }

  ChangeSetManager.getInstance().addFileToChangeSet({
    changeSetId,
    path: relativePath,
    changeType,
    beforeContent: originalContent,
    afterContent: modifiedContent,
  })
}

async function readTextFile(path: string): Promise<string> {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const { readTextFile: shimRead } = await import('@/lib/electron-api')
        return shimRead(path)
  }
  try {
    const fs = await import('@/lib/electron-api')
    return await fs.readTextFile(path)
  } catch {
    throw new Error('File system not available in this environment')
  }
}

function resolvePath(rootPath: string | null, inputPath: string): string {
  if (!rootPath) return inputPath
  if (/^[a-zA-Z]:[\\/]/.test(inputPath)) return inputPath
  return `${rootPath}\\${inputPath.replace(/\//g, '\\')}`
}

function toDiffEdits(input: Record<string, unknown>): DiffEdit[] {
  const edits = input.edits as Array<Record<string, unknown>> | undefined
  if (Array.isArray(edits) && edits.length > 0) {
    return edits.map(e => {
      const oldContent = (e.old_content ?? e.oldContent) as string | undefined
      const newContent = (e.new_content ?? e.newContent) as string | undefined
      const type = e.type as string | undefined
      const target = e.target as string | undefined
      const position = e.position as 'before' | 'after' | undefined
      const allOccurrences = e.allOccurrences as boolean | undefined
      return {
        type: type as DiffEdit['type'],
        oldContent,
        newContent,
        target,
        position,
        allOccurrences,
      }
    })
  }

  const oldString = input.old_string as string | undefined
  const newString = input.new_string as string | undefined
  if (oldString !== undefined || newString !== undefined) {
    return [{
      type: 'replace',
      oldContent: oldString ?? '',
      newContent: newString ?? '',
    }]
  }

  return []
}

interface SearchReplaceResult {
  content: string
  matchCount: number
  applied: boolean
  error?: string
}

function applySearchReplace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): SearchReplaceResult {
  // Exact match first
  let matchCount = 0
  let idx = 0
  const indices: number[] = []
  while (true) {
    const found = content.indexOf(oldString, idx)
    if (found === -1) break
    indices.push(found)
    matchCount++
    idx = found + oldString.length
  }

  // Fallback: normalized-quote matching
  if (matchCount === 0) {
    const normalizedContent = normalizeQuotes(content)
    const normalizedOld = normalizeQuotes(oldString)
    idx = 0
    while (true) {
      const found = normalizedContent.indexOf(normalizedOld, idx)
      if (found === -1) break
      indices.push(found)
      matchCount++
      idx = found + normalizedOld.length
    }
  }

  // Fallback: de-sanitized matching
  if (matchCount === 0) {
    const sanitizedContent = sanitizeFnResult(content)
    const sanitizedOld = sanitizeFnResult(oldString)
    idx = 0
    while (true) {
      const found = sanitizedContent.indexOf(sanitizedOld, idx)
      if (found === -1) break
      indices.push(found)
      matchCount++
      idx = found + sanitizedOld.length
    }
  }

  if (matchCount === 0) {
    return { content, matchCount: 0, applied: false, error: 'old_string not found in file' }
  }

  if (matchCount > 1 && !replaceAll) {
    return {
      content,
      matchCount,
      applied: false,
      error: `Found ${matchCount} occurrences of old_string. Set replace_all=true to replace all, or provide a more unique old_string with surrounding context (2-4 lines)`,
    }
  }

  // Apply replacement(s) from right to left to preserve indices
  let result = content
  if (replaceAll) {
    result = content.split(oldString).join(newString)
  } else {
    const pos = indices[0]
    result = content.slice(0, pos) + newString + content.slice(pos + oldString.length)
  }

  return { content: result, matchCount, applied: true }
}

export const EditFileTool: AgentTool = buildTool({
  name: 'edit_file',
  description: 'Apply targeted text replacements in a file using exact search-and-replace (old_string/new_string). For safety, read the file first. Provide enough surrounding context (2-4 lines) in old_string for a unique match.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to the file to edit (relative to workspace root)' },
      old_string: { type: 'string', description: 'Exact text to find and replace (must be unique in file). Include 2-4 lines of surrounding context for reliable matching.' },
      new_string: { type: 'string', description: 'Replacement text' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences of old_string. Use with caution — prefer unique matches (default: false)' },
      path: { type: 'string', description: 'Backward-compatible file path (prefer file_path)' },
      edits: {
        type: 'array',
        description: 'Backward-compatible multiple edit operations (prefer old_string/new_string)',
        items: {
          type: 'object',
          properties: {
            old_content: { type: 'string', description: 'Exact text to find' },
            new_content: { type: 'string', description: 'Replacement text' },
          },
          required: ['old_content', 'new_content'],
        },
      },
      file: { type: 'string', description: 'Backward-compatible absolute file path' },
    },
    required: ['file_path'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_EDIT],
  getActivityDescription: (input) => {
    const p = (input as any)?.file_path || (input as any)?.path || (input as any)?.file
    return p ? `Editing ${p}` : 'Editing a file'
  },
  permissions: async () => ({ behavior: 'ask', reason: 'Editing files can modify project source code' }),
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const filePath = (input.file_path as string) ?? (input.path as string) ?? (input.file as string)
    if (!filePath) {
      return { data: null, error: 'edit_file requires file_path (or path/file for backward compatibility)', isError: true }
    }

    const rootPath = ctx.workspaceStore?.rootPath ?? null
    const fullPath = resolvePath(rootPath, filePath)

    // Read-before-edit enforcement (P1.2)
    const fileState = FileStateCache.getInstance()
    if (!fileState.wasRead(fullPath)) {
      return { data: null, error: `File "${filePath}" has not been read yet. Use read_file to read it first before editing.`, isError: true }
    }
    try {
      const { stat: fsStat } = await import('@/lib/electron-api')
      const stats = await fsStat(fullPath)
      const currentMtime = typeof stats?.mtimeMs === 'number' ? stats.mtimeMs : Date.now()
      if (fileState.isStale(fullPath, currentMtime)) {
        const currentContent = await readTextFile(fullPath)
        if (currentContent !== fileState.getContent(fullPath)) {
          return { data: null, error: `File "${filePath}" has been modified since it was read. Use read_file to see the latest content before editing.`, isError: true }
        }
        fileState.recordRead(fullPath, currentContent, currentMtime)
      }
    } catch {
      // mtime not available — skip staleness check
    }

    const cachedContent = fileContentCache.get(fullPath)
    const originalContent = cachedContent ?? await readTextFile(fullPath)

    const hasEditsArray = Array.isArray(input.edits) && (input.edits as Array<unknown>).length > 0
    const hasOldNew = (input.old_string as string | undefined) !== undefined
      || (input.new_string as string | undefined) !== undefined

    if (!hasEditsArray && !hasOldNew) {
      return { data: null, error: 'edit_file requires old_string/new_string (or edits array for backward compatibility)', isError: true }
    }

    let modifiedContent: string
    let diff: string
    let totalHunks = 0
    let changeType: 'modify' | 'create' = 'modify'

    if (hasOldNew) {
      // ── Primary search-and-replace path ──
      const oldString = String(input.old_string ?? '')
      const newString = String(input.new_string ?? '')

      // Validation: no-op
      if (oldString === newString) {
        return { data: null, error: 'old_string and new_string are identical — nothing to change', isError: true }
      }

      // Validation: file size
      if (originalContent.length > MAX_FILE_SIZE_BYTES) {
        return { data: null, error: `File too large (${(originalContent.length / 1024 / 1024).toFixed(1)} MB) — max is 1 GiB`, isError: true }
      }

      // Check if file exists
      const isNewFile = originalContent.length === 0

      // Validation: empty file with old_string
      if (isNewFile && oldString !== '') {
        return { data: null, error: 'File is empty or does not exist. Use old_string="" to create a new file, or write_file to create it first', isError: true }
      }

      // Validation: file has content but old_string is empty
      if (!isNewFile && oldString === '') {
        return { data: null, error: 'old_string is empty but file has content. Provide the exact text to replace', isError: true }
      }

      const replaceAll = (input.replace_all as boolean) ?? false
      const result = applySearchReplace(originalContent, oldString, newString, replaceAll)

      if (!result.applied) {
        return { data: null, error: result.error ?? 'Search-and-replace failed', isError: true, meta: { matchCount: result.matchCount } }
      }

      modifiedContent = result.content
      diff = generateUnifiedDiff(originalContent, modifiedContent, fullPath)
      totalHunks = 1
    } else {
      // ── Backward-compatible edits[] path ──
      const edits = toDiffEdits(input)
      if (edits.length === 0) {
        return { data: null, error: 'edits array is empty', isError: true }
      }

      const engineResult: DiffEngineResult = applyEdits(originalContent, edits)

      if (!engineResult.allApplied) {
        const failureResult = engineResult.results.find(r => !r.applied)
        const errorMsg = failureResult?.error ?? 'Edit failed: could not apply the requested changes'
        return {
          data: null,
          error: errorMsg,
          isError: true,
          meta: {
            editResults: engineResult.results.map(r => ({
              applied: r.applied,
              operation: r.operation,
              hunks: r.hunks,
              locations: r.locations,
              error: r.error,
            })),
            appliedCount: engineResult.results.filter(r => r.applied).length,
            failedCount: engineResult.results.filter(r => !r.applied).length,
            diff: '',
          },
        }
      }

      modifiedContent = engineResult.content
      diff = generateUnifiedDiff(originalContent, modifiedContent, fullPath)
      totalHunks = engineResult.results.reduce((sum, r) => sum + r.hunks, 0)
    }

    // Write to disk
    try {
      await writeTextFile(fullPath, modifiedContent)
    } catch (writeErr) {
      return {
        data: null,
        error: `Failed to write edited file: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
        isError: true,
      }
    }

    // Update in-memory cache
    fileContentCache.set(fullPath, modifiedContent)

    // Register the diff in the review panel
    const diffEntry = buildDiffFileEntry(filePath, originalContent, modifiedContent)
    ctx.diffStore?.addFileDiff(diffEntry)

    const relativePath = filePath.replace(/^[/\\]/, '')
    recordChangeSetEntry(ctx, fullPath, relativePath, originalContent, modifiedContent, diff, changeType)

    return {
      data: `Applied edit to ${relativePath}. Changes written to disk and available for review.`,
      meta: {
        diff,
        status: 'written',
      },
    }
  },
})
