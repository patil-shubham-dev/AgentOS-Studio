import { matchDeniedPath } from "../tools/core/ToolPermissions"

const SENSITIVE_PATH_PATTERNS: string[] = [
  "**/.env",
  "**/.env.*",
  "**/.envrc",
  "**/.ssh/**",
  "**/*.pem",
  "**/*-key.pem",
  "**/*-key.p8",
  "**/*-key.pkcs8",
  "**/credentials*",
  "**/credentials/**",
  "**/secrets*",
  "**/secrets/**",
  "**/.secret*",
  "**/id_rsa*",
  "**/id_ed25519*",
  "**/*.key",
  "**/config.json",  // Caution: broad pattern, but most projects don't put secrets in tracked config
  "**/service-account*",
  "**/oauth*",
  "**/token*",
  "**/*credential*",
  "**/vault*",
  "**/.npmrc",
  "**/.netrc",
  "**/netrc",
]

let deniedPaths: string[] = [...SENSITIVE_PATH_PATTERNS]

export function setDeniedPaths(patterns: string[]): void {
  // Merge user-configured denied paths with built-in sensitive path patterns
  deniedPaths = [...new Set([...SENSITIVE_PATH_PATTERNS, ...patterns])]
}

export function getDeniedPaths(): string[] {
  return deniedPaths
}

export function isPathDenied(filePath: string): boolean {
  if (deniedPaths.length === 0) return false
  return matchDeniedPath(filePath, deniedPaths)
}

export function filterDeniedPaths(paths: string[]): string[] {
  if (deniedPaths.length === 0) return paths
  return paths.filter((p) => !matchDeniedPath(p, deniedPaths))
}

export function isPathDeniedSilent(filePath: string): string | null {
  if (deniedPaths.length === 0) return null
  if (matchDeniedPath(filePath, deniedPaths)) {
    return `File not found: "${filePath.split('/').pop() ?? filePath}". The file may not exist at this location.`
  }
  return null
}
