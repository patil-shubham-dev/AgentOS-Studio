import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { ChangeSetManager } from '@/runtime/changeset/ChangeSetManager'
import { fileContentCache } from '@/lib/FileContentCache'
import { FileStateCache } from '../storage/FileStateCache'
import { isPathDenied } from '@/runtime/permissions/PathVisibilityFilter'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { buildDiffFileEntry } from '@/lib/diff-review'

const changesetByTrace = new Map<string, string>()
const CHANGESET_MAP_MAX_SIZE = 200
function setChangeSetEntry(traceId: string, changeSetId: string): void {
  if (changesetByTrace.size >= CHANGESET_MAP_MAX_SIZE) {
    const firstKey = changesetByTrace.keys().next().value
    if (firstKey !== undefined) changesetByTrace.delete(firstKey)
  }
  changesetByTrace.set(traceId, changeSetId)
}

function recordWriteChangeSetEntry(
  ctx: ToolContext,
  relativePath: string,
  beforeContent: string | null,
  afterContent: string,
): void {
  const traceId = ctx.traceId ?? 'unknown'
  let changeSetId = changesetByTrace.get(traceId)

  if (!changeSetId) {
    const cs = ChangeSetManager.getInstance().createChangeSet({
      sessionId: traceId,
      correlationId: traceId,
      title: `Write ${relativePath}`,
      reason: ctx.role ? `AI write by ${ctx.role}` : 'AI write',
      sourceToolCallIds: [traceId],
    })
    changeSetId = cs.id
    setChangeSetEntry(traceId, changeSetId)
  }

  ChangeSetManager.getInstance().addFileToChangeSet({
    changeSetId,
    path: relativePath,
    changeType: beforeContent !== null ? 'modify' : 'create',
    beforeContent: beforeContent ?? undefined,
    afterContent,
  })
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const { readTextFile: shimRead } = await import('@/lib/electron-api')
      return shimRead(path)
    }
    const fs = await import('@/lib/electron-api')
    return await fs.readTextFile(path)
  } catch {
    return null
  }
}

function resolvePath(rootPath: string | null, inputPath: string): string {
  if (!rootPath) return inputPath
  if (/^[a-zA-Z]:[\\/]/.test(inputPath)) return inputPath
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

export const WriteFileTool: AgentTool = buildTool({
  name: 'write_file',
  description: 'Propose writing content to a file (creates directories if needed). Changes are staged for user review and only written to disk after acceptance. For existing files, read the file first.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace root' },
      content: { type: 'string', description: 'File content to write' },
    },
    required: ['path', 'content'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_WRITE],
  getActivityDescription: (input) => {
    const p = (input as any)?.path
    return p ? `Writing ${p}` : 'Writing a file'
  },
  permissions: async () => ({ behavior: 'ask', reason: 'Writing files can modify project source code' }),
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const path = String(input.path ?? '')
    const content = String(input.content ?? '')
    if (!path) return { data: null, error: 'path is required', isError: true }
    const rootPath = resolveRootPath(ctx)
    const fullPath = resolvePath(rootPath, path)

    const validationError = validatePath(fullPath, rootPath)
    if (validationError) return { data: null, error: validationError, isError: true }

    if (isPathDenied(fullPath)) {
      return { data: null, error: `Cannot write to "${path}". The path is not accessible.`, isError: true }
    }

    const cachedContent = fileContentCache.get(fullPath)
    const existingContent = cachedContent !== null ? cachedContent : await readTextFile(fullPath)
    const isNewFile = existingContent === null

    // Read-before-write: required for existing files, not for brand-new creates.
    const fileState = FileStateCache.getInstance()
    if (!isNewFile && !fileState.wasRead(fullPath) && cachedContent === null) {
      return {
        data: null,
        error: `File "${path}" has not been read yet. Use read_file to read it first before writing.`,
        isError: true,
      }
    }

    if (!isNewFile) {
      try {
        const { stat: fsStat } = await import('@/lib/electron-api')
        const stats = await fsStat(fullPath)
        const currentMtime = typeof stats?.mtimeMs === 'number' ? stats.mtimeMs : Date.now()
        if (fileState.isStale(fullPath, currentMtime)) {
          const currentContent = await readTextFile(fullPath)
          if (currentContent !== null && currentContent !== fileState.getContent(fullPath)) {
            if (cachedContent === null || currentContent !== cachedContent) {
              return {
                data: null,
                error: `File "${path}" has been modified since it was read. Use read_file to see the latest content before writing.`,
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

    // Propose only — update in-memory cache. Disk writes happen via
    // ChangeSetManager.writeAcceptedChanges / diff-review accept path.
    fileContentCache.set(fullPath, content)

    // Register the diff for review when a store is available
    const beforeForDiff = existingContent ?? ''
    const diffEntry = buildDiffFileEntry(path, beforeForDiff, content)
    ctx.diffStore?.addFileDiff(diffEntry)

    const relativePath = path.replace(/^[/\\]/, '')
    recordWriteChangeSetEntry(ctx, relativePath, existingContent, content)

    // Mark as read so subsequent edits/writes in the same session can compose
    fileState.recordRead(fullPath, content, Date.now())

    return {
      data: `Change proposed: ${relativePath} has been staged for review. Awaiting user acceptance in the diff panel.`,
      meta: {
        path: relativePath,
        status: 'pending_review',
        changeType: existingContent !== null ? 'modify' : 'create',
      },
    }
  },
})
