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

    // `**/` prefix: match file/dir name at any directory depth
    if (normalizedPattern.startsWith('**/')) {
      const suffix = normalizedPattern.slice(3)
      if (suffix.endsWith('*')) {
        const prefix = suffix.slice(0, -1)
        if (normalized.includes('/' + prefix) || normalized.startsWith(prefix)) return true
      } else if (suffix.endsWith('/**')) {
        const dirPrefix = suffix.slice(0, -3)
        if (normalized.includes('/' + dirPrefix + '/') || normalized.startsWith(dirPrefix + '/')) return true
      } else {
        const fileName = normalized.split('/').pop() ?? ''
        if (fileName === suffix) return true
        if (normalized.includes('/' + suffix)) return true
      }
      continue
    }

    // `*/` prefix but not `**/`: match only in root
    if (normalizedPattern.startsWith('*') && !normalizedPattern.startsWith('**')) {
      const suffix = normalizedPattern.slice(1)
      if (normalized.endsWith(suffix)) return true
      continue
    }

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
