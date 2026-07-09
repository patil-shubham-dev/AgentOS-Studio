import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import type { PermissionResult } from '../core/ToolPermissions'
import { ToolValidator } from './ToolValidation'
import type { PreExecutionHook, PostExecutionHook, ToolExecutionEvent } from './ToolExecutionContext'
import { PermissionEngine } from '../../permissions/PermissionEngine'
import { ToolRegistry } from '../registry/ToolRegistry'
import { ToolExecutionPolicy } from '../policies/ToolExecutionPolicy'

export type ExecutionOptions = {
  skipValidation?: boolean
  skipPermission?: boolean
  preHooks?: PreExecutionHook[]
  postHooks?: PostExecutionHook[]
  onEvent?: (event: ToolExecutionEvent) => void
}

export class ToolExecutionPipeline {
  private validator: ToolValidator
  private permissionEngine: PermissionEngine
  private registry: ToolRegistry
  private preHooks: PreExecutionHook[] = []
  private postHooks: PostExecutionHook[] = []
  private policy: ToolExecutionPolicy | null = null

  constructor(registry: ToolRegistry, permissionEngine: PermissionEngine) {
    this.registry = registry
    this.validator = new ToolValidator()
    this.permissionEngine = permissionEngine
  }

  setPolicy(policy: ToolExecutionPolicy): void {
    this.policy = policy
  }

  registerPreHook(hook: PreExecutionHook): void {
    this.preHooks.push(hook)
  }

  registerPostHook(hook: PostExecutionHook): void {
    this.postHooks.push(hook)
  }

  async execute(toolName: string, input: unknown, ctx: ToolContext, options?: ExecutionOptions): Promise<ToolResult> {
    const startTime = performance.now()
    const opts: ExecutionOptions = { skipValidation: false, skipPermission: false, preHooks: [], postHooks: [], ...options }
    const allPreHooks = [...this.preHooks, ...(opts.preHooks ?? [])]
    const allPostHooks = [...this.postHooks, ...(opts.postHooks ?? [])]

    this.emit(opts, { type: 'tool:start', toolName, timestamp: Date.now() })

    const tool = this.registry.resolve(toolName)
    if (!tool) {
      const errResult: ToolResult = { data: null, error: `Tool "${toolName}" not found`, isError: true }
      this.emit(opts, { type: 'tool:error', toolName, timestamp: Date.now(), error: `Not found: ${toolName}` })
      return errResult
    }

    if (!opts.skipValidation) {
      const validation = this.validator.validate(tool, input, ctx)
      if (!validation.valid) {
        const errResult: ToolResult = { data: null, error: validation.error, isError: true }
        this.emit(opts, { type: 'tool:error', toolName, timestamp: Date.now(), error: validation.error })
        return errResult
      }
    }

    if (ctx.signal?.aborted) {
      return { data: null, error: 'Tool execution aborted', isError: true }
    }

    let processedInput = input

    for (const hook of allPreHooks) {
      const result = await hook(ctx, tool, processedInput)
      if (result === null) continue
      if (!result.shouldProceed) {
        const errResult: ToolResult = { data: null, error: result.message ?? 'Pre-execution hook blocked tool', isError: true }
        this.emit(opts, { type: 'tool:error', toolName, timestamp: Date.now(), error: result.message })
        return errResult
      }
      processedInput = result.input
    }

    if (!opts.skipPermission) {
      const permResult: PermissionResult = await tool.permissions(processedInput as any)

      if (permResult.behavior !== 'allow') {
        this.emit(opts, { type: 'tool:permission', toolName, permissionResult: permResult, timestamp: Date.now() })
      }

      const finalPermission = await this.permissionEngine.evaluate(toolName, permResult, ctx)
      if (finalPermission.behavior === 'hidden') {
        // Hidden: silently return empty result — model never learns the path existed
        return { data: null, isError: false }
      }
      if (finalPermission.behavior === 'deny') {
        const errResult: ToolResult = { data: null, error: finalPermission.message ?? 'Permission denied', isError: true }
        return errResult
      }

      if (finalPermission.behavior === 'ask' && !opts.skipPermission) {
        const askResult = await this.permissionEngine.requestApproval(toolName, processedInput, ctx)
        if (!askResult.approved) {
          return { data: null, error: askResult.reason ?? 'Permission denied by user', isError: true }
        }
      }
    }

    // Check tool execution policy (role-based permissions)
    if (this.policy) {
      const policyCheck = this.policy.isAllowed(tool, ctx)
      if (!policyCheck.allowed) {
        const errResult: ToolResult = { data: null, error: policyCheck.reason ?? 'Tool not allowed by policy', isError: true }
        this.emit(opts, { type: 'tool:error', toolName, timestamp: Date.now(), error: policyCheck.reason })
        return errResult
      }
    }

    try {
      let result: ToolResult

      if (ctx.signal?.aborted) {
        return { data: null, error: 'Tool execution aborted', isError: true }
      }

      result = await tool.execute(ctx, processedInput as any)

      for (const hook of allPostHooks) {
        result = await hook(ctx, tool, processedInput, result)
      }

      const durationMs = Math.round(performance.now() - startTime)
      this.emit(opts, { type: 'tool:end', toolName, timestamp: Date.now(), durationMs })

      return result
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const errResult: ToolResult = { data: null, error: errMsg, isError: true }
      this.emit(opts, { type: 'tool:error', toolName, timestamp: Date.now(), error: errMsg })
      return errResult
    }
  }

  private emit(opts: ExecutionOptions, event: ToolExecutionEvent): void {
    opts.onEvent?.(event)
  }

  getValidator(): ToolValidator { return this.validator }
}
