import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { FileHistoryManager } from '@/lib/file-history'

async function writeTextFile(path: string, content: string): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const { writeTextFile: shimWrite } = await import('@/lib/tauri-shims/fs')
    return shimWrite(path, content)
  }
  try {
    const fs = await import('@tauri-apps/plugin-fs')
    return await fs.writeTextFile(path, content)
  } catch {
    throw new Error('File system not available in this environment')
  }
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const { readTextFile: shimRead } = await import('@/lib/tauri-shims/fs')
      return shimRead(path)
    }
    const fs = await import('@tauri-apps/plugin-fs')
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
    if (existingContent !== null) {
      const history = FileHistoryManager.getInstance()
      await history.createSnapshot(fullPath, existingContent, ctx.traceId ?? 'unknown')
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const electronApi = (window as any).electronAPI
      try {
        await electronApi.writeTextFile(fullPath, content)
      } catch {
        await writeTextFile(fullPath, content)
      }
    } else {
      await writeTextFile(fullPath, content)
    }

    useWorkspaceStore.getState().notifyFileEdited(fullPath, content)
    return { data: 'File written successfully' }
  },
})
