import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { ChangeSetManager } from '@/runtime/changeset/ChangeSetManager'
import { fileContentCache } from '@/lib/FileContentCache'
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
    // Fall back to filesystem lib
    await createFile(path, content)
  }
}

function resolvePath(rootPath: string | null, inputPath: string): string {
  if (!rootPath) return inputPath
  if (/^[a-zA-Z]:[\\/]/.test(inputPath)) return inputPath
  return `${rootPath}\\${inputPath.replace(/\//g, '\\')}`
}

export const WriteFileTool: AgentTool = buildTool({
  name: 'write_file',
  description: 'Write content to a file (creates directories if needed), updating the file on disk immediately',
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
    const rootPath = ctx.workspaceStore?.rootPath ?? null
    const fullPath = resolvePath(rootPath, path)

    // Read-before-write enforcement (P1.2)
    const fileState = FileStateCache.getInstance()
    if (!fileState.wasRead(fullPath)) {
      return { data: null, error: `File "${path}" has not been read yet. Use read_file to read it first before writing.`, isError: true }
    }
    try {
      const { stat: fsStat } = await import('@/lib/electron-api')
      const stats = await fsStat(fullPath)
      const currentMtime = typeof stats?.mtimeMs === 'number' ? stats.mtimeMs : Date.now()
      if (fileState.isStale(fullPath, currentMtime)) {
        const currentContent = await readTextFile(fullPath)
        if (currentContent !== fileState.getContent(fullPath)) {
          return { data: null, error: `File "${path}" has been modified since it was read. Use read_file to see the latest content before writing.`, isError: true }
        }
        fileState.recordRead(fullPath, currentContent, currentMtime)
      }
    } catch {
      // mtime not available — skip staleness check
    }

    const existingContent = await readTextFile(fullPath)

    // Write to disk immediately so the file appears in the explorer
    try {
      await writeTextFile(fullPath, content)
    } catch (writeErr) {
      return { data: null, error: `Failed to write file: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`, isError: true }
    }

    // Update in-memory cache so subsequent reads see current content
    fileContentCache.set(fullPath, content)

    const relativePath = path.replace(/^[/\\]/, '')
    recordWriteChangeSetEntry(ctx, relativePath, existingContent, content)

    return {
      data: `File written to ${relativePath}${existingContent !== null ? ' (modified)' : ' (created)'}`,
      meta: {
        path: relativePath,
        status: 'written',
        changeType: existingContent !== null ? 'modify' : 'create',
      },
    }
  },
})
