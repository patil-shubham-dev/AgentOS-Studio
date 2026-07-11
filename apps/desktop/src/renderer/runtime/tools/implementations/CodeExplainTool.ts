import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { readFile } from '@/lib/filesystem'

export const CodeExplainTool: AgentTool = buildTool({
  name: 'code_explain',
  aliases: ['explain_code', 'explain'],
  description: 'Explain what a piece of code does at any level of detail. Use this when the user asks "what does this code do?" or you need to understand code before modifying it.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path (relative or absolute) of the code to explain',
      },
      code: {
        type: 'string',
        description: 'Inline code snippet to explain (instead of path). Provide this if the code is not in a file.',
      },
      lines: {
        type: 'string',
        description: 'Line range in the file to focus on (e.g., "10-25" or "42")',
      },
      detail: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Detail level: high=thorough analysis, medium=balanced, low=summary',
      },
      focus: {
        type: 'string',
        enum: ['overview', 'logic', 'types', 'data_flow', 'side_effects', 'performance'],
        description: 'What aspect to focus the explanation on',
      },
    },
    anyOf: [
      { required: ['path'] },
      { required: ['code'] },
    ],
  },
  promptCategory: 'core',
  promptPriority: 70,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_READ],
  getActivityDescription: (input) => {
    const p = (input as any)?.path
    return p ? `Explaining code in ${p}` : 'Explaining code snippet'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const filePath = input.path as string | undefined
    const code = input.code as string | undefined
    const lines = input.lines as string | undefined
    const detail = (input.detail as string) ?? 'medium'
    const focus = (input.focus as string) ?? 'overview'

    let sourceCode = code ?? ''
    let sourcePath = filePath ?? 'inline snippet'

    if (filePath) {
      const rootPath = ctx.workspaceStore?.rootPath ?? null
      const resolvedPath = rootPath && !/^[a-zA-Z]:[\\/]/.test(filePath)
        ? `${rootPath}\\${filePath.replace(/\//g, '\\')}`
        : filePath

      try {
        const fileContent = await readFile(resolvedPath)
        sourceCode = fileContent
        sourcePath = filePath

        if (lines) {
          const [startStr, endStr] = lines.split('-')
          const startLine = parseInt(startStr, 10)
          const endLine = endStr ? parseInt(endStr, 10) : startLine
          const allLines = sourceCode.split('\n')
          sourceCode = allLines.slice(Math.max(0, startLine - 1), endLine).join('\n')
          sourcePath = `${filePath}:${startLine}${endLine !== startLine ? `-${endLine}` : ''}`
        }
      } catch {
        return { data: null, error: `Could not read file: ${filePath}`, isError: true }
      }
    }

    if (!sourceCode.trim()) {
      return { data: null, error: 'No code provided to explain', isError: true }
    }

    const lang = sourcePath.split('.').pop() ?? 'txt'
    const linesCount = sourceCode.split('\n').length
    const charCount = sourceCode.length

    return {
      data: sourceCode,
      meta: {
        type: 'explain',
        path: sourcePath,
        language: lang,
        lines: linesCount,
        chars: charCount,
        detail,
        focus,
      },
      newMessages: [{
        role: 'user',
        content: `[Code Explain Request]\nFile: ${sourcePath}\nLanguage: ${lang}\nLines: ${linesCount}\nChars: ${charCount}\nDetail: ${detail}\nFocus: ${focus}\n\n\`\`\`${lang}\n${sourceCode}\n\`\`\``,
      }],
    }
  },
})
