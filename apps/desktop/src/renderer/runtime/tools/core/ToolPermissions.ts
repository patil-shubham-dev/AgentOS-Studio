export type PermissionBehavior = 'allow' | 'deny' | 'hidden' | 'ask'
export type PermissionMode = 'default' | 'autonomous' | 'interactive' | 'bypass'

export type PermissionResult = {
  behavior: PermissionBehavior
  reason?: string
  message?: string
}

export type ToolPermissions = {
  mode: PermissionMode
  alwaysAllow: string[]
  alwaysDeny: string[]
  alwaysAsk: string[]
  deniedPaths?: string[]
}

export function matchDeniedPath(filePath: string, deniedPatterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  for (const pattern of deniedPatterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/').toLowerCase()
    if (normalizedPattern.endsWith('*')) {
      const prefix = normalizedPattern.slice(0, -1)
      if (normalized.startsWith(prefix)) return true
    } else if (normalized === normalizedPattern) {
      return true
    } else if (normalized.startsWith(normalizedPattern + '/') || normalized.startsWith(normalizedPattern + '\\')) {
      return true
    }
  }
  return false
}
