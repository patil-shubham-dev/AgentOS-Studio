import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { applyEdits, generateUnifiedDiff, type DiffEdit, type DiffEngineResult } from '@/lib/diff-engine'
import { fileContentCache } from '@/lib/FileContentCache'
import { ChangeSetManager } from '@/runtime/changeset/ChangeSetManager'
import { buildDiffFileEntry } from '@/lib/diff-review'
import { FileStateCache } from '../storage/FileStateCache'
import { isPathDenied } from '@/runtime/permissions/PathVisibilityFilter'
import { useWorkspaceStore } from '@/stores/workspace-store'

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

function recordChangeSetEntry(
  ctx: ToolContext,
  relativePath: string,
  originalContent: string,
  modifiedContent: string,
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

async function tryReadTextFile(path: string): Promise<string | null> {
  try {
    return await readTextFile(path)
  } catch {
    return null
  }
}

function resolvePath(rootPath: string | null, inputPath: string): string {
  if (!rootPath) return inputPath
  if (/^[a-zA-Z]:[\\/]/.test(inputPath)) return inputPath
  if (inputPath.startsWith('/') && !rootPath.match(/^[a-zA-Z]:/)) {
    // Absolute POSIX path
    if (inputPath.startsWith(rootPath)) return inputPath
  }
  return `${rootPath}\\${inputPath.replace(/\//g, '\\')}`
}

function validatePath(normalized: string, rootPath: string | null): string | null {
  if (normalized.includes('..')) return 'Path traversal denied'
  if (rootPath && !normalized.startsWith(rootPath)) return 'Path escapes workspace root'
  return null
}

function resolveRootPath(ctx: ToolContext): string | null {
  return ctx.workspaceStore?.rootPath ?? useWorkspaceStore.getState().rootPath ?? null
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
    return {
      content,
      matchCount: 0,
      applied: false,
      error: `EDIT_FAILED: target text not found\nExpected to find:\n\`\`\`\n${oldString}\n\`\`\`\nBut it was not found in the file.`,
    }
  }

  if (matchCount > 1 && !replaceAll) {
    return {
      content,
      matchCount,
      applied: false,
      error: `EDIT_FAILED: Found ${matchCount} occurrences of old_string. Set replace_all=true to replace all, or provide a more unique old_string with surrounding context (2-4 lines)`,
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
  description: 'Propose targeted text replacements in a file using exact search-and-replace (old_string/new_string). Changes are staged for user review and only written to disk after acceptance. For existing files, read the file first. Provide enough surrounding context (2-4 lines) in old_string for a unique match.',
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
    required: [],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_EDIT],
  getActivityDescription: (input) => {
    const p = (input as any)?.file_path || (input as any)?.path || (input as any)?.file
    return p ? `Editing ${p}` : 'Editing a file'
  },
  getRenderOutput: (input, result) => {
    const p = (input as any)?.file_path || (input as any)?.path || (input as any)?.file
    const oldStr = (input as any)?.old_string ?? (input as any)?.oldStr ?? ''
    const newStr = (input as any)?.new_string ?? (input as any)?.newStr ?? ''
    return {
      usePreview: {
        type: 'diff',
        label: p ? `Editing ${p}` : 'Editing a file',
        path: p,
        content: oldStr ? `- ${oldStr.slice(0, 200)}\n+ ${newStr.slice(0, 200)}` : undefined,
      },
      resultPreview: result?.data
        ? {
            type: 'file',
            label: `Proposed edit to ${p}`,
            path: p,
            content: undefined,
          }
        : undefined,
    }
  },
  permissions: async () => ({ behavior: 'ask', reason: 'Editing files can modify project source code' }),
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const filePath = (input.file_path as string) ?? (input.path as string) ?? (input.file as string)
    if (!filePath) {
      return { data: null, error: "edit_file requires either 'path' or 'file'", isError: true }
    }

    const rootPath = resolveRootPath(ctx)
    const fullPath = resolvePath(rootPath, filePath)

    const validationError = validatePath(fullPath, rootPath)
    if (validationError) return { data: null, error: validationError, isError: true }

    if (isPathDenied(fullPath)) {
      return { data: null, error: `File not found: "${filePath}". The file may not exist at this location.`, isError: true }
    }

    // Prefer proposed content from cache so sequential edits compose.
    const cachedContent = fileContentCache.get(fullPath)
    const diskContent = cachedContent === null ? await tryReadTextFile(fullPath) : null
    const fileExistsOnDisk = diskContent !== null || cachedContent !== null
    // When cache hit, still need to know if this is a brand-new create vs modify of existing.
    let originalContent: string
    if (cachedContent !== null) {
      originalContent = cachedContent
    } else if (diskContent !== null) {
      originalContent = diskContent
    } else {
      originalContent = ''
    }

    const isNewFile = originalContent.length === 0 && cachedContent === null && diskContent === null

    // Read-before-edit: required for existing files, not for brand-new creates.
    const fileState = FileStateCache.getInstance()
    if (!isNewFile && fileExistsOnDisk && !fileState.wasRead(fullPath) && cachedContent === null) {
      return {
        data: null,
        error: `File "${filePath}" has not been read yet. Use read_file to read it first before editing.`,
        isError: true,
      }
    }

    if (!isNewFile && fileExistsOnDisk) {
      try {
        const { stat: fsStat } = await import('@/lib/electron-api')
        const stats = await fsStat(fullPath)
        const currentMtime = typeof stats?.mtimeMs === 'number' ? stats.mtimeMs : Date.now()
        if (fileState.isStale(fullPath, currentMtime)) {
          const currentContent = await tryReadTextFile(fullPath)
          if (currentContent !== null && currentContent !== fileState.getContent(fullPath)) {
            // If we already have a proposed cache version that matches our last proposal, allow composing.
            if (cachedContent === null || currentContent !== cachedContent) {
              return {
                data: null,
                error: `File "${filePath}" has been modified since it was read. Use read_file to see the latest content before editing.`,
                isError: true,
              }
            }
          }
          if (currentContent !== null) {
            fileState.recordRead(fullPath, currentContent, currentMtime)
          }
        }
      } catch {
        // mtime not available — skip staleness check
      }
    }

    const hasEditsArray = Array.isArray(input.edits) && (input.edits as Array<unknown>).length > 0
    const hasOldNew = (input.old_string as string | undefined) !== undefined
      || (input.new_string as string | undefined) !== undefined

    if (!hasEditsArray && !hasOldNew) {
      return { data: null, error: 'edit_file requires edits, old_string/new_string, or old_content/new_content pairs', isError: true }
    }

    let modifiedContent: string
    let diff: string
    let totalHunks = 0
    let editResults: DiffEngineResult['results'] | undefined
    const changeType: 'modify' | 'create' = isNewFile ? 'create' : 'modify'

    if (hasOldNew) {
      // ── Primary search-and-replace path ──
      const oldString = String(input.old_string ?? '')
      const newString = String(input.new_string ?? '')

      if (oldString === newString) {
        return { data: null, error: 'old_string and new_string are identical — nothing to change', isError: true }
      }

      if (originalContent.length > MAX_FILE_SIZE_BYTES) {
        return { data: null, error: `File too large (${(originalContent.length / 1024 / 1024).toFixed(1)} MB) — max is 1 GiB`, isError: true }
      }

      // Creating a new file: old_string must be empty
      if (isNewFile && oldString !== '') {
        return { data: null, error: 'File is empty or does not exist. Use old_string="" to create a new file, or write_file to create it first', isError: true }
      }

      // Existing file with content: old_string must not be empty
      if (!isNewFile && originalContent.length > 0 && oldString === '') {
        return { data: null, error: 'old_string is empty but file has content. Provide the exact text to replace', isError: true }
      }

      if (isNewFile && oldString === '') {
        modifiedContent = newString
        diff = generateUnifiedDiff('', modifiedContent, fullPath)
        totalHunks = 1
      } else {
        const replaceAll = (input.replace_all as boolean) ?? false
        const result = applySearchReplace(originalContent, oldString, newString, replaceAll)

        if (!result.applied) {
          return { data: null, error: result.error ?? 'EDIT_FAILED: Search-and-replace failed', isError: true, meta: { matchCount: result.matchCount } }
        }

        modifiedContent = result.content
        diff = generateUnifiedDiff(originalContent, modifiedContent, fullPath)
        totalHunks = 1
      }
    } else {
      // ── Backward-compatible edits[] path ──
      const edits = toDiffEdits(input)
      if (edits.length === 0) {
        return { data: null, error: 'edits array is empty', isError: true }
      }

      const engineResult: DiffEngineResult = applyEdits(originalContent, edits)

      if (!engineResult.allApplied) {
        const failureResult = engineResult.results.find(r => !r.applied)
        const errorMsg = failureResult?.error ?? 'EDIT_FAILED: could not apply the requested changes'
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
      editResults = engineResult.results
    }

    // Propose only — update in-memory cache. Disk writes happen via
    // ChangeSetManager.writeAcceptedChanges / diff-review accept path.
    fileContentCache.set(fullPath, modifiedContent)

    // Register the diff in the review panel when a store is available
    const diffEntry = buildDiffFileEntry(filePath, originalContent, modifiedContent)
    ctx.diffStore?.addFileDiff(diffEntry)

    const relativePath = filePath.replace(/^[/\\]/, '')
    recordChangeSetEntry(ctx, relativePath, originalContent, modifiedContent, changeType)

    // Mark as "read" so subsequent edits in the same session can compose
    fileState.recordRead(fullPath, modifiedContent, Date.now())

    return {
      data: `Change proposed: ${totalHunks} edit(s) applied to ${relativePath}. Awaiting user review in the diff panel.`,
      meta: {
        ...(editResults
          ? {
              editResults: editResults.map(r => ({
                applied: r.applied,
                operation: r.operation,
                hunks: r.hunks,
                locations: r.locations,
              })),
            }
          : {}),
        totalHunks,
        diff,
        status: 'pending_review',
      },
    }
  },
})
