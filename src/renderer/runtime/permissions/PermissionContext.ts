/**
 * PermissionContext — execution context for permission resolution.
 *
 * Defines the environment in which a permission check occurs, including
 * the execution mode, role, and tool allow/deny lists.
 */

import type { ToolPermissions } from '../tools/core/ToolPermissions'
import type { AlwaysAllowRule } from './always-allow-rules'
import { getAllowedToolsForRole } from './role-tool-allowlist'

export interface PermissionContext {
  mode: 'default' | 'autonomous' | 'interactive' | 'bypass'
  role: string
  permissions: ToolPermissions
  alwaysAllowRules?: AlwaysAllowRule[]
}

export function createPermissionContext(overrides?: Partial<PermissionContext>): PermissionContext {
  return {
    mode: 'default',
    role: 'unknown',
    permissions: {
      mode: 'default',
      alwaysAllow: [],
      alwaysDeny: [],
      alwaysAsk: [],
    },
    alwaysAllowRules: [],
    ...overrides,
  }
}

export function createRolePermissionContext(role: string, overrides?: Partial<PermissionContext>): PermissionContext {
  const allowedTools = getAllowedToolsForRole(role)
  return {
    mode: 'default',
    role,
    permissions: {
      mode: 'default',
      alwaysAllow: allowedTools ?? [],
      alwaysDeny: [],
      alwaysAsk: [],
    },
    alwaysAllowRules: [],
    ...overrides,
  }
}
