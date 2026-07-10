import type { PermissionResult, PermissionBehavior } from '../tools/core/ToolPermissions'
import type { ToolContext } from '../tools/core/ToolContext'
import { PolicyResolver } from './PolicyResolver'
import { ApprovalManager } from './ApprovalManager'
import { AuditLog } from '@/lib/audit/AuditLog'
import { createRolePermissionContext } from './PermissionContext'

export type ApprovalDecision = {
  approved: boolean
  reason?: string
}

export class PermissionEngine {
  private policyResolver: PolicyResolver
  private approvalManager: ApprovalManager
  private permissionCache: Map<string, { result: PermissionResult; expiresAt: number }> = new Map()
  private cacheTTLMs: number = 5_000

  constructor() {
    this.policyResolver = new PolicyResolver()
    this.approvalManager = new ApprovalManager()
  }

  getPolicyResolver(): PolicyResolver { return this.policyResolver }
  getApprovalManager(): ApprovalManager { return this.approvalManager }

  setCacheTTL(ms: number): void {
    this.cacheTTLMs = ms
  }

  clearCache(): void {
    this.permissionCache.clear()
  }

  async evaluate(toolName: string, toolResult: PermissionResult, ctx: ToolContext): Promise<PermissionResult> {
    const cacheKey = `${toolName}:${ctx.executionMode ?? 'default'}:${ctx.role}`
    const cached = this.permissionCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result
    }

    if (toolResult.behavior === 'allow') {
      const result: PermissionResult = { behavior: 'allow', reason: toolResult.reason }
      this.cache(cacheKey, result)
      return result
    }

    const permCtx: PermissionContext = createRolePermissionContext(ctx.role, {
      mode: (ctx.executionMode as any) ?? 'default',
    })

    const policyResult = this.policyResolver.resolveWithMode(toolName, {}, permCtx)

    if (policyResult.behavior === 'deny' || policyResult.behavior === 'hidden') {
      this.cache(cacheKey, policyResult)
      this.logDenied(toolName, policyResult, ctx)
      return policyResult
    }

    if (toolResult.behavior === 'deny') {
      this.logDenied(toolName, toolResult, ctx)
      return { behavior: 'deny', reason: toolResult.reason ?? 'Denied by tool permission check' }
    }

    if (policyResult.behavior === 'ask') {
      return { behavior: 'ask', reason: 'Permission required' }
    }

    return { behavior: 'allow' }
  }

  async requestApproval(toolName: string, input: unknown, ctx: ToolContext): Promise<ApprovalDecision> {
    const result = await this.approvalManager.requestApproval(toolName, input, {
      role: ctx.role,
      mode: ctx.executionMode ?? 'default',
    })
    if (!result.approved) {
      this.logDenied(toolName, { behavior: 'deny', reason: result.reason ?? 'Denied by user' }, ctx)
    }
    return result
  }

  setAutoApprove(enabled: boolean): void {
    this.approvalManager.setAutoApprove(enabled)
  }

  private logDenied(toolName: string, result: PermissionResult, ctx: ToolContext): void {
    try {
      AuditLog.getInstance().recordPermissionDenied(
        ctx.role ?? 'unknown',
        toolName,
        result.reason ?? 'Permission denied',
        { executionMode: ctx.executionMode }
      )
    } catch {
      // audit log unavailable — skip
    }
  }

  private cache(key: string, result: PermissionResult): void {
    this.permissionCache.set(key, { result, expiresAt: Date.now() + this.cacheTTLMs })
  }
}
