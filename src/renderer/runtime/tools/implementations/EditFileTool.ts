import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { FileHistoryManager } from '@/lib/file-history'

async function readTextFile(path: string): Promise<string> {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const { readTextFile: shimRead } = await import('@/lib/tauri-shims/fs')
    return shimRead(path)
  }
  try {
    const fs = await import('@tauri-apps/plugin-fs')
    return await fs.readTextFile(path)
  } catch {
    throw new Error('File system not available in this environment')
  }
}

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

function resolvePath(rootPath: string | null, inputPath: string): string {
  if (!rootPath) return inputPath
  if (/^[a-zA-Z]:[\\/]/.test(inputPath)) return inputPath
  return `${rootPath}\\${inputPath.replace(/\//g, '\\')}`
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
    if (!filePath) return { data: null, error: "edit_file requires either 'path' or 'file'", isError: true }
    const rootPath = useWorkspaceStore.getState().rootPath
    const fullPath = resolvePath(rootPath, filePath)
    let currentContent = await readTextFile(fullPath)

    const history = FileHistoryManager.getInstance()
    await history.createSnapshot(fullPath, currentContent, ctx.traceId ?? 'unknown')

    const edits = Array.isArray(input.edits) && input.edits.length > 0
      ? (input.edits as Array<{ old_content: string; new_content: string }>).map(e => ({ old_string: e.old_content, new_string: e.new_content }))
      : [{ old_string: (input.old_string ?? '') as string, new_string: (input.new_string ?? '') as string }]
    for (const edit of edits) {
      if (edit.old_string === '' && edit.new_string === '') continue
      if (edit.old_string && currentContent.includes(edit.old_string)) {
        currentContent = currentContent.replace(edit.old_string, edit.new_string)
      }
    }
    await writeTextFile(fullPath, currentContent)
    useWorkspaceStore.getState().notifyFileEdited(fullPath, currentContent)
    return { data: 'File edited successfully' }
  },
})
