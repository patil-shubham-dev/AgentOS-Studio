import type { RuntimeRole } from '@/types'
import type { RoleDefinition } from '../runtime-role-registry'
import { ALL_ROLES, getRoleByRuntimeRole } from '../runtime-role-registry'

export type ExternalRoleConfig = {
  id: string
  name: string
  runtimeRole?: string
  description: string
  systemPrompt: string
  temperature?: number
  maxTokens?: number
  tools?: string[]
  color?: string
  icon?: string
  memoryScope?: 'none' | 'session' | 'project' | 'global'
  priority?: number
  parentRole?: string
}

export class RoleRegistry {
  private roles: Map<string, RoleDefinition> = new Map()
  private builtinRoles: Map<string, RoleDefinition> = new Map()

  constructor() {
    for (const role of ALL_ROLES) {
      this.builtinRoles.set(role.id, role)
      this.builtinRoles.set(role.runtimeRole, role)
      this.builtinRoles.set(role.name.toLowerCase(), role)
    }
  }

  loadFromConfig(configs: ExternalRoleConfig[]): void {
    for (const cfg of configs) {
      const baseRole = cfg.parentRole
        ? this.builtinRoles.get(cfg.parentRole) ?? this.builtinRoles.get(`role-${cfg.parentRole}`)
        : null
      if (!baseRole && !cfg.systemPrompt) {
        console.warn(`[RoleRegistry] Cannot define role "${cfg.id}": no parentRole and no systemPrompt`)
        continue
      }
      const merged: RoleDefinition = {
        id: cfg.id,
        runtimeRole: (cfg.runtimeRole ?? baseRole?.runtimeRole ?? cfg.id) as RuntimeRole,
        name: cfg.name,
        description: cfg.description,
        color: cfg.color ?? baseRole?.color ?? 'from-gray-500/20 to-gray-500/10',
        icon: cfg.icon ?? baseRole?.icon ?? 'User',
        temperature: cfg.temperature ?? baseRole?.temperature ?? 0.3,
        maxTokens: cfg.maxTokens ?? baseRole?.maxTokens ?? 32768,
        systemPrompt: cfg.systemPrompt || baseRole!.systemPrompt,
        capabilities: baseRole?.capabilities ?? {
          coding: false, browsing: false, planning: false,
          memory: false, fileAccess: true, internetAccess: false,
          toolExecution: true, sandboxEscape: false,
          vision: false, reasoning: false, orchestration: false,
        },
        toolPermissions: cfg.tools ?? baseRole?.toolPermissions ?? [],
        memoryScope: cfg.memoryScope ?? baseRole?.memoryScope ?? 'session',
        priority: cfg.priority ?? baseRole?.priority ?? 99,
        collaborationTags: baseRole?.collaborationTags ?? [],
        executionMode: baseRole?.executionMode ?? 'worker',
      }
      this.roles.set(cfg.id, merged)
      this.roles.set(cfg.name.toLowerCase(), merged)
      if (merged.runtimeRole) {
        this.roles.set(merged.runtimeRole, merged)
      }
    }
  }

  getRole(idOrName: string): RoleDefinition | undefined {
    return this.roles.get(idOrName) ?? this.builtinRoles.get(idOrName)
  }

  getRoleByRuntimeRole(runtimeRole: string): RoleDefinition | undefined {
    return getRoleByRuntimeRole(runtimeRole)
  }

  getAllRoles(): RoleDefinition[] {
    const custom = Array.from(this.roles.values())
      .filter((r) => !this.builtinRoles.has(r.id))
    return [...custom, ...ALL_ROLES]
  }

  getBuiltinRoles(): RoleDefinition[] {
    return [...ALL_ROLES]
  }

  hasCustomRoles(): boolean {
    for (const key of this.roles.keys()) {
      if (!this.builtinRoles.has(key)) return true
    }
    return false
  }
}

export const globalRoleRegistry = new RoleRegistry()
