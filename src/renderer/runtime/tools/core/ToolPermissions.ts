export type PermissionBehavior = 'allow' | 'deny' | 'ask'
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
}
