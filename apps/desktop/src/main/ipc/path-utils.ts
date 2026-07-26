import { resolve, normalize, basename } from 'path'
import { existsSync, realpathSync, appendFileSync, mkdirSync } from 'fs'
import { app } from 'electron'
import { sep } from 'path'

/**
 * When no workspace is open, ALL paths are DENIED by default.
 * Only paths within an explicitly opened workspace are allowed.
 * This prevents accidental file access outside the project boundary.
 */

/** Sensitive file/directory patterns that should never be readable even inside the workspace */
const SENSITIVE_PATH_PATTERNS = [
  // Environment / secrets
  '.env', '.env.local', '.env.production', '.env.development',
  '.npmrc', '.yarnrc', '.pnpmrc',
  '.gitconfig', '.git-credentials',
  'credentials.json', 'credentials.yaml', 'credentials.yml',
  'service-account.json', 'service-account.yaml',
  'id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa',
  // Token / API key files
  '.token', '.tokens', 'token.txt', 'tokens.txt',
  'config.json', // common credential storage pattern
  // Certificates
  '*.pem', '*.key', '*.cert', '*.crt', '*.p12', '*.pfx',
  // Private key material
  '.ssh/', 'ssh/',
  // Session / auth state
  '.auth', 'auth.json', 'auth.tokens', 'session.json',
  // Cloud provider creds
  'aws-credentials', 'gcp-credentials', 'azure-credentials',
  '.aws/credentials', '.gcp/credentials', '.azure/credentials',
  'sops-age-key.txt',
  // OS keyrings
  '.gnupg/', '.password-store/',
  // vault / walleth
  '.vault', 'vault.json', 'vault.yaml',
  // Database
  '*.sqlite', '*.sqlite3', '*.db',
  '*.kdbx', // Keepass databases
  // Browser state
  'Cookies', 'Login Data', 'Web Data', 'Local State',
  // Windows-specific secrets
  '.msi', '.pfx',
]

let allowedWorkspacePath: string | null = null
let auditLogPath: string | null = null

function isPathInsideDirectory(targetPath: string, directoryPath: string): boolean {
  const normalizedTarget = resolve(normalize(targetPath))
  const normalizedDirectory = resolve(normalize(directoryPath))
  const target = process.platform === 'win32' ? normalizedTarget.toLowerCase() : normalizedTarget
  const directory = process.platform === 'win32' ? normalizedDirectory.toLowerCase() : normalizedDirectory
  const root = directory.endsWith('\\') || directory.endsWith('/')
    ? directory.slice(0, -1)
    : directory

  return target === root || target.startsWith(`${root}${sep}`)
}

function toPortablePath(path: string): string {
  return path.replace(/\\/g, '/')
}

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

export function isPathAllowed(targetPath: string): boolean {
  // Deny all paths when no workspace has been explicitly opened
  if (!allowedWorkspacePath) return false
  try {
    const resolved = resolveSymlinks(targetPath)
    const allowedResolved = resolveSymlinks(allowedWorkspacePath)
    if (!isPathInsideDirectory(resolved, allowedResolved)) return false

    // Check against sensitive path patterns (case-insensitive on Windows)
    const fileName = basename(resolved).toLowerCase()
    const resolvedLower = resolved.toLowerCase()
    const portableResolved = toPortablePath(resolvedLower)
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      const p = pattern.toLowerCase()
      if (p.startsWith('*')) {
        // Glob-like pattern: *.ext
        if (fileName.endsWith(p.slice(1))) return false
      } else if (p.endsWith('/')) {
        // Directory pattern: .ssh/
        const dirPattern = `/${p}`
        if (portableResolved.includes(dirPattern) || portableResolved.endsWith(dirPattern.slice(0, -1))) return false
      } else if (p.includes('/')) {
        // Nested file pattern: .aws/credentials
        if (portableResolved.endsWith(`/${p}`)) return false
      } else {
        // Exact filename match
        if (fileName === p) return false
      }
    }

    return true
  } catch {
    return false
  }
}

export function assertPathAllowed(targetPath: string): void {
  if (!isPathAllowed(targetPath)) {
    persistAuditEvent(`DENY path="${targetPath}" workspace="${allowedWorkspacePath ?? "(none)"}"`)
    // Invisibility mode: throw ENOENT instead of revealing the path exists
    const err = new Error(`ENOENT: no such file or directory`)
    ;(err as { code: string }).code = "ENOENT"
    ;(err as NodeJS.ErrnoException).errno = -2
    throw err
  }
}

/**
 * Filter out denied paths from a list of file entries.
 * Used by directory listing handlers to make sensitive paths invisible.
 */
export function filterDeniedPaths(entries: Array<{ name: string; path?: string }>): Array<{ name: string; path?: string }> {
  if (!allowedWorkspacePath) return entries
  return entries.filter((entry) => {
    const fullPath = entry.path ? resolve(normalize(entry.path)) : resolve(normalize(entry.name))
    return isPathAllowed(fullPath)
  })
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
    if (isPathInsideDirectory(resolved, allowed)) return
  }
  // Fall back to workspace path check
  assertPathAllowed(repoPath)
}
