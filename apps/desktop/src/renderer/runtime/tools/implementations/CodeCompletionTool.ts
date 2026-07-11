import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { readFile } from '@/lib/filesystem'

interface CompletionContext {
  prefix: string
  suffix: string
  filePath: string
  language: string
  cursorLine: number
  cursorColumn: number
  recentLines: string[]
}

export const CodeCompletionTool: AgentTool = buildTool({
  name: 'code_complete',
  aliases: ['complete_code', 'autocomplete', 'inline_completion'],
  description: 'Generate inline code completions based on context around the cursor. Returns suggested code to insert at the cursor position. Handles multi-line completions, function bodies, and import suggestions.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path for context (relative or absolute)',
      },
      prefix: {
        type: 'string',
        description: 'Code before the cursor position (used for context)',
      },
      suffix: {
        type: 'string',
        description: 'Code after the cursor position (used for context)',
      },
      cursor_line: {
        type: 'number',
        description: 'Current line number (1-indexed)',
      },
      cursor_column: {
        type: 'number',
        description: 'Current column number (1-indexed)',
      },
      recent_lines: {
        type: 'array',
        items: { type: 'string' },
        description: 'Recent lines before the cursor for additional context',
      },
      intent: {
        type: 'string',
        enum: ['fill_in_middle', 'next_line', 'complete_statement', 'complete_function', 'suggest_imports'],
        description: 'Type of completion to generate',
      },
      max_lines: {
        type: 'number',
        description: 'Maximum lines to generate (default: 20)',
      },
    },
    required: ['path'],
  },
  promptCategory: 'core',
  promptPriority: 80,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_READ],
  getActivityDescription: (_input) => 'Generating code completion',
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const filePath = String(input.path ?? '')
    const prefix = input.prefix as string | undefined
    const suffix = input.suffix as string | undefined
    const cursorLine = input.cursor_line as number | undefined
    const cursorColumn = input.cursor_column as number | undefined
    const recentLines = input.recent_lines as string[] | undefined
    const intent = (input.intent as string) ?? 'fill_in_middle'
    const maxLines = (input.max_lines as number) ?? 20

    const rootPath = ctx.workspaceStore?.rootPath ?? null
    const resolvedPath = rootPath && !/^[a-zA-Z]:[\\/]/.test(filePath)
      ? `${rootPath}\\${filePath.replace(/\//g, '\\')}`
      : filePath

    let fileContent = ''
    try {
      fileContent = await readFile(resolvedPath)
    } catch {
      return { data: null, error: `Could not read file: ${filePath}`, isError: true }
    }

    const language = resolvedPath.split('.').pop() ?? 'txt'

    const context: CompletionContext = {
      prefix: prefix ?? '',
      suffix: suffix ?? '',
      filePath,
      language,
      cursorLine: cursorLine ?? 1,
      cursorColumn: cursorColumn ?? 1,
      recentLines: recentLines ?? [],
    }

    return {
      data: context,
      meta: {
        type: 'code_completion',
        path: filePath,
        language,
        cursorLine: context.cursorLine,
        cursorColumn: context.cursorColumn,
        intent,
        maxLines,
        fullFileLength: fileContent.length,
      },
      newMessages: [{
        role: 'user',
        content: `[Code Completion Request]
File: ${filePath}
Language: ${language}
Intent: ${intent}
Cursor: line ${cursorLine ?? '?'}, column ${cursorColumn ?? '?'}
Max lines to generate: ${maxLines}

## Context before cursor
\`\`\`${language}
${prefix?.slice(-500) ?? ''}
\`\`\`

${suffix ? `## Context after cursor\n\`\`\`${language}\n${suffix.slice(0, 200)}\n\`\`\`` : ''}

${recentLines?.length ? `## Recent edits\n${recentLines.slice(-5).map((l) => `  ${l}`).join('\n')}` : ''}

Generate the completion code. Return ONLY the code to insert (no markdown, no explanation).`,
      }],
    }
  },
})
