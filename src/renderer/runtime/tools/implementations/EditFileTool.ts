import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { applyEdits, generateUnifiedDiff, type DiffEdit, type DiffEngineResult } from '@/lib/diff-engine'
import { fileContentCache } from '@/lib/FileContentCache'
import { ChangeSetManager } from '@/runtime/changeset/ChangeSetManager'
import { buildDiffFileEntry } from '@/lib/diff-review'
import { useDiffStore } from '@/stores/diff-store'
import { createFile } from '@/lib/filesystem'

const changesetByTrace = new Map<string, string>()

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
    changesetByTrace.set(traceId, changeSetId)
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

    // Write to disk immediately so the file reflects the edit.
    // This matches WriteFileTool's behavior — the AI reads the file afterward
    // to verify its work, so the write must be visible.
    try {
      await writeTextFile(fullPath, modifiedContent)
    } catch (writeErr) {
      return {
        data: null,
        error: `Failed to write edited file: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
        isError: true,
      }
    }

    // Update in-memory cache so subsequent reads see current content
    fileContentCache.set(fullPath, modifiedContent)

    // Register the diff in the review panel so the user can see what changed
    // and revert if needed. The diff-store tracks accepted/rejected state per hunk.
    const diffEntry = buildDiffFileEntry(filePath, originalContent, modifiedContent)
    useDiffStore.getState().addFileDiff(diffEntry)

    const relativePath = filePath.replace(/^[/\\]/, '')
    recordChangeSetEntry(ctx, fullPath, relativePath, originalContent, modifiedContent, diff, 'modify')

    const totalHunks = engineResult.results.reduce((sum, r) => sum + r.hunks, 0)
    return {
      data: `Applied ${totalHunks} edit(s) to ${relativePath}. Changes written to disk and available for review.`,
      meta: {
        editResults: engineResult.results.map(r => ({
          applied: r.applied,
          operation: r.operation,
          hunks: r.hunks,
          locations: r.locations,
        })),
        totalHunks,
        diff,
        status: 'written',
      },
    }
  },
})
