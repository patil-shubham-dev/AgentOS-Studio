import { resolve, normalize } from 'path'
import { existsSync, realpathSync, appendFileSync, mkdirSync } from 'fs'
import { log } from '../observability'
import { app } from 'electron'

/**
 * When no workspace is open, ALL paths are DENIED by default.
 * Only paths within an explicitly opened workspace are allowed.
 * This prevents accidental file access outside the project boundary.
 */
let allowedWorkspacePath: string | null = null
let auditLogPath: string | null = null

export function setAllowedWorkspacePath(path: string | null): void {
  allowedWorkspacePath = path ? resolve(normalize(path)) : null
}

function getAuditLogPath(): string {
  if (!auditLogPath) {
    const logsDir = app.getPath('logs')
    if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true })
    auditLogPath = resolve(logsDir, 'filesystem-audit.log')
  }
  return auditLogPath
}

function persistAuditEvent(event: string): void {
  try {
    const ts = new Date().toISOString()
    appendFileSync(getAuditLogPath(), `[${ts}] ${event}\n`, 'utf-8')
  } catch {
    // Audit logging must never throw — silent fallback
  }
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
    const msg = `Access denied: path "${targetPath}" is outside the workspace`
    console.warn(`[PathAllowlist] ${msg}`)
    log('warn', 'path-allowlist', msg, { targetPath, allowedWorkspacePath })
    persistAuditEvent(`DENY path="${targetPath}" workspace="${allowedWorkspacePath ?? "(none)"}"`)
    throw new Error(msg)
  }
}

const GIT_ALLOWED_PATHS = new Set<string>()

export function addGitAllowedPath(p: string): void {
  GIT_ALLOWED_PATHS.add(resolve(normalize(p)))
}

export function clearGitAllowedPaths(): void {
  GIT_ALLOWED_PATHS.clear()
}

export function assertGitRepoPath(repoPath: string): void {
  const resolved = resolve(normalize(repoPath))
  for (const allowed of GIT_ALLOWED_PATHS) {
    if (resolved.startsWith(allowed)) return
  }
  // Fall back to workspace path check
  assertPathAllowed(repoPath)
}
