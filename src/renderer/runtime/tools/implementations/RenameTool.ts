import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { readFile, writeFile } from '@/lib/filesystem'
import { useAgentStore } from '@/stores/agent-store'

interface RenameEdit {
  path: string
  oldName: string
  newName: string
  edits: Array<{ path: string; oldContent: string; newContent: string }>
}

export const RenameTool: AgentTool = buildTool({
  name: 'rename_symbol',
  aliases: ['rename', 'refactor_rename'],
  description: 'Safely rename a symbol (function, class, variable, type, interface, etc.) across the entire project. Finds all usages and replaces them. Optionally shows a preview of changes before applying.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path where the symbol is defined (relative or absolute)',
      },
      old_name: {
        type: 'string',
        description: 'Current name of the symbol to rename',
      },
      new_name: {
        type: 'string',
        description: 'New name for the symbol',
      },
      scope: {
        type: 'string',
        enum: ['file', 'project'],
        description: 'Scope of rename: "file" = current file only, "project" = all files (default: project)',
      },
      preview: {
        type: 'boolean',
        description: 'If true, show changes without applying them',
      },
      file_filter: {
        type: 'string',
        description: 'Glob pattern to limit which files are searched (e.g., "src/**/*.ts")',
      },
    },
    required: ['path', 'old_name', 'new_name'],
  },
  promptCategory: 'core',
  promptPriority: 65,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_READ, ToolCapabilities.FILE_WRITE],
  getActivityDescription: (input) => {
    const oldN = (input as any)?.old_name
    const newN = (input as any)?.new_name
    return oldN && newN ? `Renaming ${oldN} → ${newN}` : 'Renaming a symbol'
  },
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const filePath = String(input.path ?? '')
    const oldName = String(input.old_name ?? '')
    const newName = String(input.new_name ?? '')
    const scope = (input.scope as string) ?? 'project'
    const preview = Boolean(input.preview)
    const fileFilter = input.file_filter as string | undefined

    if (!filePath) return { data: null, error: 'path is required', isError: true }
    if (!oldName) return { data: null, error: 'old_name is required', isError: true }
    if (!newName) return { data: null, error: 'new_name is required', isError: true }
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(newName)) {
      return { data: null, error: `"${newName}" is not a valid JavaScript/TypeScript identifier`, isError: true }
    }

    const rootPath = useWorkspaceStore.getState().rootPath
    const resolvedPath = rootPath && !/^[a-zA-Z]:[\\/]/.test(filePath)
      ? `${rootPath}\\${filePath.replace(/\//g, '\\')}`
      : filePath

    try {
      const definitionContent = await readFile(resolvedPath)
      const edits: RenameEdit['edits'] = []

      const wordBoundaryRegex = new RegExp(
        `(?<![a-zA-Z0-9_$])${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9_$])`,
        'g',
      )

      if (scope === 'file') {
        const count = (definitionContent.match(wordBoundaryRegex) || []).length
        const newContent = definitionContent.replace(wordBoundaryRegex, newName)
        if (newContent !== definitionContent) {
          edits.push({ path: resolvedPath, oldContent: definitionContent, newContent })
        }

        if (preview) {
          return {
            data: { edits, summary: `${count} occurrence(s) of '${oldName}' → '${newName}' in ${filePath}` },
            meta: { type: 'rename_preview', edits, oldName, newName },
          }
        }

        if (edits.length > 0) {
          await writeFile(resolvedPath, edits[0].newContent)
        }

        return {
          data: { edits, summary: `Renamed ${count} occurrence(s) of '${oldName}' → '${newName}' in ${filePath}` },
          meta: { type: 'rename_result', edits, oldName, newName },
        }
      }

      const { workspaceListFiles } = await import('@/lib/electron-api')
      let allFiles: string[]
      try {
        const root = rootPath ?? resolvedPath.split('\\').slice(0, -1).join('\\')
        allFiles = await workspaceListFiles(root)
      } catch {
        allFiles = [resolvedPath]
      }

      if (fileFilter) {
        const { minimatch } = await import('minimatch')
        allFiles = allFiles.filter((f) => minimatch(f, fileFilter))
      }

      const searchedExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.md', '.mdx', '.json', '.css', '.scss', '.less', '.html'])
      const relevantFiles = allFiles.filter((f) => searchedExts.has(f.split('.').pop()?.toLowerCase() ? `.${f.split('.').pop()}` : ''))

      let totalOccurrences = 0
      let totalFilesEdited = 0

      for (const f of relevantFiles) {
        try {
          const content = await readFile(f)
          const count = (content.match(wordBoundaryRegex) || []).length
          if (count > 0) {
            totalOccurrences += count
            const newContent = content.replace(wordBoundaryRegex, newName)
            edits.push({ path: f, oldContent: content, newContent })
            totalFilesEdited++
          }
        } catch {
          continue
        }
      }

      if (edits.length === 0) {
        return { data: null, error: `No occurrences of '${oldName}' found in project`, isError: true }
      }

      if (preview) {
        return {
          data: { edits, totalOccurrences, totalFilesEdited, summary: `Preview: ${totalOccurrences} occurrence(s) in ${totalFilesEdited} file(s)` },
          meta: { type: 'rename_preview', edits, oldName, newName, totalOccurrences, totalFilesEdited },
        }
      }

      for (const edit of edits) {
        if (edit.oldContent !== edit.newContent) {
          await writeFile(edit.path, edit.newContent)
        }
      }

      return {
        data: { edits, totalOccurrences, totalFilesEdited, summary: `Renamed ${totalOccurrences} occurrence(s) of '${oldName}' → '${newName}' across ${totalFilesEdited} file(s)` },
        meta: { type: 'rename_result', edits, oldName, newName, totalOccurrences, totalFilesEdited },
      }
    } catch (err) {
      return { data: null, error: `Rename failed: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }
  },
})
