import type { PermissionResult, PermissionBehavior } from '../tools/core/ToolPermissions'
import type { PermissionContext } from './PermissionContext'

export type PolicyRule = {
  toolName: string | string[]
  behavior: PermissionBehavior
  reason?: string
  conditions?: Array<{
    field: string
    operator: 'eq' | 'contains' | 'regex'
    value: string
  }>
}

export class PolicyResolver {
  private rules: PolicyRule[] = []

  addRule(rule: PolicyRule): void {
    this.rules.push(rule)
  }

  addRules(rules: PolicyRule[]): void {
    for (const r of rules) this.addRule(r)
  }

  clearRules(): void {
    this.rules = []
  }

  resolve(toolName: string, input: unknown, ctx: PermissionContext): PermissionResult | null {
    for (const rule of this.rules) {
      const names = Array.isArray(rule.toolName) ? rule.toolName : [rule.toolName]
      if (!names.includes(toolName)) continue

      if (rule.conditions) {
        const allMatch = rule.conditions.every(c => {
          const inputRecord = input as Record<string, unknown>
          const val = String(inputRecord[c.field] ?? '')
          switch (c.operator) {
            case 'eq': return val === c.value
            case 'contains': return val.includes(c.value)
            case 'regex': return new RegExp(c.value).test(val)
            default: return false
          }
        })
        if (!allMatch) continue
      }

      return { behavior: rule.behavior, reason: rule.reason }
    }

    return null
  }

  resolveWithMode(toolName: string, input: unknown, ctx: PermissionContext): PermissionResult {
    if (ctx.permissions.alwaysAllow.includes(toolName)) {
      return { behavior: 'allow', reason: 'In always-allow list' }
    }
    if (ctx.permissions.alwaysDeny.includes(toolName)) {
      return { behavior: 'deny', reason: 'In always-deny list' }
    }

    const ruleResult = this.resolve(toolName, input, ctx)
    if (ruleResult) return ruleResult

    if (ctx.mode === 'autonomous') return { behavior: 'allow', reason: 'Autonomous mode' }
    if (ctx.mode === 'bypass') return { behavior: 'allow', reason: 'Permissions bypassed' }

    return { behavior: 'ask', reason: 'No matching policy rule' }
  }
}
