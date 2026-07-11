/**
 * SandboxPathMapper — pre-execution hook that remaps file paths from the
 * workspace root to the active sandbox worktree path.
 *
 * When a sandbox is active (via sandbox-store), all write tools that accept
 * a `path` parameter have their paths transparently remapped to the worktree.
 * This isolates agent edits without changing any tool implementation.
 *
 * Read-only tools are NOT remapped — they continue to read from the original
 * workspace so the agent can see existing files. Only write operations
 * are redirected to the sandbox.
 */

import type { PreExecutionHook } from './ToolExecutionContext'
import { useSandboxStore } from '@/stores/sandbox-store'
import { WorktreeSandboxManager } from '@/lib/git/WorktreeSandbox'

/** Write tools whose `path` or `filePath` input should be remapped to the worktree */
const WRITE_TOOLS = new Set([
  'write_file',
  'edit_file',
  'file_delete',
  'file_move',
  'file_copy',
  'folder_create',
  'folder_delete',
  'bash',
  'run_command',
])

/**
 * Pre-hook that remaps file paths to the active sandbox worktree.
 * Only active when a sandbox exists and has status "active".
 */
export const sandboxPathMapper: PreExecutionHook = async (_ctx, tool, input) => {
  const sandboxStore = useSandboxStore.getState()
  const sandbox = sandboxStore.activeSandbox

  // No active sandbox — pass through
  if (!sandbox || sandbox.status !== 'active') {
    return null
  }

  // Only remap write tools
  if (!WRITE_TOOLS.has(tool.name)) {
    return null
  }

  const manager = WorktreeSandboxManager.getInstance()
  const typedInput = input as Record<string, unknown>

  // Determine which path field to remap
  const pathFields = ['path', 'filePath', 'file_path', 'target']
  let modified = false

  for (const field of pathFields) {
    const value = typedInput[field]
    if (typeof value === 'string' && value.length > 0) {
      const originalPath = value
      const mappedPath = manager.mapPath(sandbox, originalPath)
      if (mappedPath !== originalPath) {
        typedInput[field] = mappedPath
        modified = true
      }
    }
  }

  // Also remap paths in array fields like `files` or `paths`
  for (const field of ['files', 'paths', 'filePaths']) {
    const arr = typedInput[field]
    if (Array.isArray(arr)) {
      typedInput[field] = arr.map((item: unknown) => {
        if (typeof item === 'string') {
          const mapped = manager.mapPath(sandbox, item)
          if (mapped !== item) modified = true
          return mapped
        }
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>
          for (const pf of pathFields) {
            const v = obj[pf]
            if (typeof v === 'string') {
              const mapped = manager.mapPath(sandbox, v)
              if (mapped !== v) modified = true
              obj[pf] = mapped
            }
          }
          return obj
        }
        return item
      })
    }
  }

  if (modified) {
    console.log(`[SandboxMapper] Remapped paths for tool "${tool.name}" → sandbox: ${sandbox.id}`)
    return { shouldProceed: true, input: typedInput }
  }

  return null
}
