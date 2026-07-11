import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

interface GitFileChange {
  path: string
  additions: number
  deletions: number
}

interface CommitPlan {
  message: string
  files: string[]
  type: 'feat' | 'fix' | 'refactor' | 'docs' | 'style' | 'test' | 'chore' | 'perf'
  scope?: string
  body?: string
}

export const GitCommitTool: AgentTool = buildTool({
  name: 'git_commit',
  aliases: ['commit', 'commit_changes'],
  description: 'Create a git commit with the staged changes. Fetches current git status, diffs, and generates an appropriate commit message. Use this after editing files to commit the work.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Optional explicit commit message. If not provided, one will be generated from the diff.',
      },
      type: {
        type: 'string',
        enum: ['feat', 'fix', 'refactor', 'docs', 'style', 'test', 'chore', 'perf'],
        description: 'Conventional commit type',
      },
      scope: {
        type: 'string',
        description: 'Scope of the change (e.g., component name, module)',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific files to include. If empty, all changes are committed.',
      },
      auto_add: {
        type: 'boolean',
        description: 'Automatically stage all changes before committing (default: true)',
      },
      body: {
        type: 'string',
        description: 'Optional commit body with details',
      },
    },
    required: [],
  },
  promptCategory: 'core',
  promptPriority: 75,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  requiredCapabilities: () => [ToolCapabilities.COMMAND_EXECUTION],
  getActivityDescription: (_input) => 'Creating git commit',
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const rootPath = ctx.workspaceStore?.rootPath
    if (!rootPath) return { data: null, error: 'No workspace open', isError: true }

    const message = input.message as string | undefined
    const commitType = (input.type as string) ?? 'chore'
    const scope = input.scope as string | undefined
    const files = input.files as string[] | undefined
    const autoAdd = input.auto_add !== false
    const body = input.body as string | undefined

    const validTypes = ['feat', 'fix', 'refactor', 'docs', 'style', 'test', 'chore', 'perf']
    const resolvedType = validTypes.includes(commitType) ? commitType : 'chore'

    try {
      const { invoke } = await import('@/lib/electron-api')

      if (autoAdd) {
        if (files && files.length > 0) {
          for (const f of files) {
            try {
              await invoke('git_add', { repoPath: rootPath, file: f })
            } catch {
              console.warn(`[GitCommitTool] Failed to stage file: ${f}`)
            }
          }
        } else {
          try {
            const statusResult = await invoke<Array<{ status: string; file: string }>>('git_status', { workingDir: rootPath })
            if (Array.isArray(statusResult)) {
              for (const change of statusResult) {
                try {
                  await invoke('git_add', { repoPath: rootPath, file: change.file })
                } catch { /* skip */ }
              }
            }
          } catch { /* skip */ }
        }
      }

      if (!message) {
        let diffText = ''
        try {
          diffText = await invoke<string>('git_diff', { repoPath: rootPath, file: '--cached' })
          if (!diffText) {
            diffText = await invoke<string>('git_diff', { repoPath: rootPath })
          }
        } catch { /* skip */ }

        const changedFiles: GitFileChange[] = []
        const diffLines = diffText.split('\n')
        let currentFile = ''
        for (const line of diffLines) {
          const fileMatch = line.match(/^\+\+\+ b\/(.+)/)
          if (fileMatch) currentFile = fileMatch[1]
          if (currentFile) {
            if (!changedFiles.find((f) => f.path === currentFile)) {
              changedFiles.push({ path: currentFile, additions: 0, deletions: 0 })
            }
          }
        }

        const fileList = changedFiles.map((f) => f.path).join(', ') || 'various files'

        const autoMessage = `${resolvedType}${scope ? `(${scope})` : ''}: update ${fileList.slice(0, 72)}`
        const commitMessage = body
          ? `${autoMessage}\n\n${body}`
          : diffLines.length > 100
            ? `${autoMessage}\n\nSee diff for details.`
            : autoMessage

        try {
          await invoke('git_commit', { repoPath: rootPath, message: commitMessage })
        } catch {
          return { data: null, error: 'No changes to commit. Nothing is staged or modified.', isError: true }
        }

        let logResult = ''
        try {
          const log = await invoke<Array<{ hash: string; message: string }>>('git_log', { repoPath: rootPath, maxCount: 1 })
          if (log?.[0]) {
            logResult = `\nCommit: ${log[0].hash}\nMessage: ${log[0].message}`
          }
        } catch { /* skip */ }

        return {
          data: {
            message: commitMessage,
            files: fileList,
            hash: logResult ? logResult.match(/Commit: (\w+)/)?.[1] : undefined,
          },
          meta: { type: 'git_commit', message: commitMessage, files: fileList },
        }
      }

      const scopePrefix = scope ? `(${scope})` : ''
      const commitMessage = body
        ? `${resolvedType}${scopePrefix}: ${message}\n\n${body}`
        : `${resolvedType}${scopePrefix}: ${message}`

      try {
        await invoke('git_commit', { repoPath: rootPath, message: commitMessage })
      } catch {
        return { data: null, error: 'No changes to commit. Nothing is staged or modified.', isError: true }
      }

      let logResult = ''
      try {
        const log = await invoke<Array<{ hash: string; message: string }>>('git_log', { repoPath: rootPath, maxCount: 1 })
        if (log?.[0]) {
          logResult = `\nCommit: ${log[0].hash}\nMessage: ${log[0].message}`
        }
      } catch { /* skip */ }

      return {
        data: { message: commitMessage },
        meta: { type: 'git_commit', message: commitMessage },
      }
    } catch (err) {
      return {
        data: null,
        error: `Commit failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  },
})
