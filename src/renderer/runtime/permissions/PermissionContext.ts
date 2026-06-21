/**
 * PermissionContext — execution context for permission resolution.
 *
 * Defines the environment in which a permission check occurs, including
 * the execution mode, role, and tool allow/deny lists.
 */

import type { ToolPermissions } from '../tools/core/ToolPermissions'

export interface PermissionContext {
  mode: 'default' | 'autonomous' | 'interactive' | 'bypass'
  role: string
  permissions: ToolPermissions
}

/**
 * Create a permission context with sensible defaults.
 * If no permissions are provided, uses default-deny mode for unknown roles.
 */
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
    ...overrides,
  }
}
