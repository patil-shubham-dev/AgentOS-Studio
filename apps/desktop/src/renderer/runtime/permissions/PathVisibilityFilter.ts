import { matchDeniedPath } from "../tools/core/ToolPermissions"

let deniedPaths: string[] = []

export function setDeniedPaths(patterns: string[]): void {
  deniedPaths = patterns
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
