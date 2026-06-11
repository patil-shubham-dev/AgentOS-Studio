import { resolve, normalize, realpathSync } from 'path'
import { existsSync } from 'fs'

/**
 * When no workspace is open, ALL paths are DENIED by default.
 * Only paths within an explicitly opened workspace are allowed.
 * This prevents accidental file access outside the project boundary.
 */
let allowedWorkspacePath: string | null = null

export function setAllowedWorkspacePath(path: string | null): void {
  allowedWorkspacePath = path ? resolve(normalize(path)) : null
}

function resolveSymlinks(p: string): string {
  try {
    if (existsSync(p)) return realpathSync(p)
  } catch { /* fall through to normalized path */ }
  return resolve(normalize(p))
}

function isPathAllowed(targetPath: string): boolean {
  // Deny all paths when no workspace has been explicitly opened
  if (!allowedWorkspacePath) return false
  try {
    const resolved = resolveSymlinks(targetPath)
    const allowedResolved = resolveSymlinks(allowedWorkspacePath)
    return resolved.startsWith(allowedResolved)
  } catch {
    return false
  }
}

export function assertPathAllowed(targetPath: string): void {
  if (!isPathAllowed(targetPath)) {
    throw new Error(`Access denied: path "${targetPath}" is outside the workspace`)
  }
}
