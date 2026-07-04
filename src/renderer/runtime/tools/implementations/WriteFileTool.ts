import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { ChangeSetManager } from '@/runtime/changeset/ChangeSetManager'
import { fileContentCache } from '@/lib/FileContentCache'

const changesetByTrace = new Map<string, string>()

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
    changesetByTrace.set(traceId, changeSetId)
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

export const WriteFileTool: AgentTool = buildTool({
  name: 'write_file',
  description: 'Write content to a file (creates directories if needed)',
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
    const rootPath = useWorkspaceStore.getState().rootPath
    const fullPath = resolvePath(rootPath, path)

    const existingContent = await readTextFile(fullPath)

    // Update in-memory cache so subsequent reads see proposed content
    fileContentCache.set(fullPath, content)

    const relativePath = path.replace(/^[/\\]/, '')
    recordWriteChangeSetEntry(ctx, relativePath, existingContent, content)

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
