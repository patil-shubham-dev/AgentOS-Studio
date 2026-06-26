import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { FileHistoryManager } from '@/lib/file-history'
import { applyEdits, generateUnifiedDiff, type DiffEdit, type DiffEngineResult } from '@/lib/diff-engine'
import { fileContentCache } from '@/lib/FileContentCache'

const snapshottedFilesByTrace = new Map<string, Set<string>>()

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

async function writeTextFile(path: string, content: string): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const { writeTextFile: shimWrite } = await import('@/lib/electron-api')
        return shimWrite(path, content)
  }
  try {
    const fs = await import('@/lib/electron-api')
    return await fs.writeTextFile(path, content)
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

export const EditFileTool: AgentTool = buildTool({
  name: 'edit_file',
  description: 'Apply targeted text replacements in an existing file using one or more exact old_content/new_content edits',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the workspace root' },
      edits: {
        type: 'array',
        description: 'Minimal exact replacements to apply in order',
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
      old_string: { type: 'string', description: 'Backward-compatible text to find' },
      new_string: { type: 'string', description: 'Backward-compatible replacement text' },
    },
    required: [],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_EDIT],
  getActivityDescription: (input) => {
    const p = (input as any)?.path || (input as any)?.file
    return p ? `Editing ${p}` : 'Editing a file'
  },
  permissions: async () => ({ behavior: 'ask', reason: 'Editing files can modify project source code' }),
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const filePath = (input.path as string) ?? (input.file as string)
    if (!filePath) {
      return { data: null, error: "edit_file requires either 'path' or 'file'", isError: true }
    }

    const rootPath = useWorkspaceStore.getState().rootPath
    const fullPath = resolvePath(rootPath, filePath)

    const cachedContent = fileContentCache.get(fullPath)
    const originalContent = cachedContent ?? await readTextFile(fullPath)

    const edits = toDiffEdits(input)
    if (edits.length === 0) {
      return { data: null, error: 'edit_file requires edits, old_string/new_string, or old_content/new_content pairs', isError: true }
    }

    const history = FileHistoryManager.getInstance()
    const traceKey = ctx.traceId ?? 'unknown'
    if (!snapshottedFilesByTrace.has(traceKey)) {
      snapshottedFilesByTrace.set(traceKey, new Set())
    }
    const snapshottedFiles = snapshottedFilesByTrace.get(traceKey)!
    let snapshot: string | undefined
    if (!snapshottedFiles.has(fullPath)) {
      snapshot = await history.createSnapshot(fullPath, originalContent, traceKey)
      if (!snapshot && originalContent.length > 0) {
        return {
          data: null,
          error: 'EDIT_FAILED: snapshot could not be created — undo will not work for this edit',
          isError: true,
        }
      }
      snapshottedFiles.add(fullPath)
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

    const modifiedContent = engineResult.content
    const diff = generateUnifiedDiff(originalContent, modifiedContent, fullPath)

    await writeTextFile(fullPath, modifiedContent)
    fileContentCache.set(fullPath, modifiedContent)
    fileContentCache.invalidate(fullPath)

    const writtenContent = await readTextFile(fullPath)
    const verificationErrors: string[] = []
    if (writtenContent !== modifiedContent) {
      verificationErrors.push('content after write does not match expected output — file was externally modified')
    } else {
      for (let i = 0; i < engineResult.results.length; i++) {
        const result = engineResult.results[i]
        if (!result.applied) continue
        const edit = edits[i]
        if (!edit) continue
        if (result.operation === 'replace' || result.operation === 'insert') {
          const newContent = edit.newContent ?? ''
          if (newContent && !writtenContent.includes(newContent)) {
            verificationErrors.push(`newContent "${newContent.slice(0, 50)}" not found in written file`)
          }
        }
        if ((result.operation === 'replace' || result.operation === 'delete') && edit.allOccurrences) {
          const oldContent = edit.oldContent ?? ''
          if (oldContent && writtenContent.includes(oldContent)) {
            verificationErrors.push(`oldContent "${oldContent.slice(0, 50)}" still present after all-occurrences ${result.operation}`)
          }
        }
      }
    }
    if (verificationErrors.length > 0) {
      const errorStr = `EDIT_FAILED: ${verificationErrors.join('; ')}`
      return {
        data: null,
        error: `${errorStr}\n${diff}`,
        isError: true,
        meta: {
          editResults: engineResult.results.map(r => ({
            applied: r.applied,
            operation: r.operation,
            hunks: r.hunks,
            locations: r.locations,
          })),
          totalHunks: engineResult.results.reduce((sum, r) => sum + r.hunks, 0),
          diff,
          verificationErrors,
        },
      }
    }

    useWorkspaceStore.getState().notifyFileEdited(fullPath, modifiedContent)

    const totalHunks = engineResult.results.reduce((sum, r) => sum + r.hunks, 0)
    return {
      data: `File edited successfully. Applied ${totalHunks} change(s) across ${engineResult.results.length} edit(s).`,
      meta: {
        editResults: engineResult.results.map(r => ({
          applied: r.applied,
          operation: r.operation,
          hunks: r.hunks,
          locations: r.locations,
        })),
        totalHunks,
        diff,
      },
    }
  },
})
