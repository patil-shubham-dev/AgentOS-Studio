/**
 * PermissionContext — execution context for permission resolution.
 *
 * Defines the environment in which a permission check occurs, including
 * the execution mode, role, and tool allow/deny lists.
 */

import type { ToolPermissions } from '../tools/core/ToolPermissions'
import { getAllowedToolsForRole } from './role-tool-allowlist'

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

/**
 * Create a permission context for a specific role, automatically populating
 * the alwaysAllow list from the shared role-tool allowlist.
 */
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
    ...overrides,
  }
}
