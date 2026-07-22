import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import type { PermissionResult } from '../core/ToolPermissions'
import { ToolValidator } from './ToolValidation'
import type { PreExecutionHook, PostExecutionHook, ToolExecutionEvent } from './ToolExecutionContext'
import { PermissionEngine } from '../../permissions/PermissionEngine'
import { ToolRegistry } from '../registry/ToolRegistry'
import { ToolExecutionPolicy } from '../policies/ToolExecutionPolicy'
import { classifyToolCall } from '../../permissions/speculativeClassifier'
import type { ClassifierResult } from '../../permissions/speculativeClassifier'
import type { LifecycleHookRegistry } from '../../lifecycle/LifecycleHookRegistry'
import { RuntimeOS } from '../../RuntimeOS'
import { EventBus } from '../../EventBus'
import { ToolFallbackRegistry } from '../policies/ToolFallbackRegistry'
import { ToolRollbackManager } from './ToolRollbackManager'
import { usePlanStore } from '@/stores/plan-store'
import { usePermissionModeStore } from '@/stores/chat/permission-mode-store'

const WRITE_TOOLS = new Set([
  'write_file', 'edit_file', 'file_delete', 'file_move', 'file_copy',
  'folder_create', 'folder_delete', 'bash', 'run_command',
])

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
  private fallbackRegistry: ToolFallbackRegistry | null = null

  constructor(registry: ToolRegistry, permissionEngine: PermissionEngine) {
    this.registry = registry
    this.validator = new ToolValidator()
    this.permissionEngine = permissionEngine
  }

  setPolicy(policy: ToolExecutionPolicy): void {
    this.policy = policy
  }

  setFallbackRegistry(registry: ToolFallbackRegistry): void {
    this.fallbackRegistry = registry
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
    const eventBus = EventBus.getInstance()

    this.emit(opts, { type: 'tool:start', toolName, timestamp: Date.now() })

    const tool = this.registry.resolve(toolName)
    if (!tool) {
      const errResult: ToolResult = { data: null, error: `Tool "${toolName}" not found`, isError: true }
      this.emit(opts, { type: 'tool:error', toolName, timestamp: Date.now(), error: `Not found: ${toolName}` })
      eventBus.emit({ type: 'tool:error', toolName, error: `Tool "${toolName}" not found`, timestamp: Date.now() } as any)
      return errResult
    }

    const classificationPromise: Promise<ClassifierResult | null> = Promise.resolve(
      toolName === 'bash' || toolName === 'command_run'
        ? classifyToolCall(toolName, input)
        : null,
    )

    if (!opts.skipValidation) {
      const validation = this.validator.validate(tool, input, ctx)
      if (!validation.valid) {
        const errResult: ToolResult = { data: null, error: validation.error, isError: true }
        this.emit(opts, { type: 'tool:error', toolName, timestamp: Date.now(), error: validation.error })
        eventBus.emit({ type: 'EXECUTION_ERROR', stepId: ctx.sessionId ?? '', role: '', message: `Tool validation failed: ${validation.error}` })
        return errResult
      }
    }

    if (ctx.signal?.aborted) {
      return { data: null, error: 'Tool execution aborted', isError: true }
    }

    // ── Plan mode restriction: block write tools during planning phase ──
    if ((usePlanStore.getState().isPlanningPhase || !usePermissionModeStore.getState().allowWriteTools()) && WRITE_TOOLS.has(toolName)) {
      const errResult: ToolResult = { data: null, error: `Tool "${toolName}" is restricted during planning phase — only read-only tools are allowed`, isError: true }
      this.emit(opts, { type: 'tool:error', toolName, timestamp: Date.now(), error: `Restricted in planning phase: ${toolName}` })
      eventBus.emit({ type: 'EXECUTION_ERROR', stepId: ctx.sessionId ?? '', role: '', message: `Write tool "${toolName}" blocked during planning phase` })
      return errResult
    }

    let processedInput = input

    // ── Lifecycle: preToolUse ──
    const lifecycleHooks: LifecycleHookRegistry | undefined = RuntimeOS.getInstance()?.lifecycleHooks
    if (lifecycleHooks) {
      await lifecycleHooks.dispatch('preToolUse', { toolName, toolArgs: input, sessionId: ctx.sessionId }).catch(() => {})
    }

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
        console.warn(
          `%c⚠️ PERMISSION DENIED — Tool "${toolName}" blocked by permission policy. ` +
          `Message: ${finalPermission.message ?? '(no message)'}.`,
          'background: #ff8800; color: white; font-weight: bold; padding: 2px 4px; border-radius: 2px; font-size: 13px;'
        )
        const errResult: ToolResult = { data: null, error: finalPermission.message ?? 'Permission denied', isError: true }
        return errResult
      }

      if (finalPermission.behavior === 'ask' && !opts.skipPermission) {
        const classifierResult = await classificationPromise
        if (classifierResult?.behavior === 'allow') {
          this.emit(opts, { type: 'tool:permission', toolName, timestamp: Date.now(), meta: { classifier: 'allow', reason: classifierResult.reason } })
        } else if (classifierResult?.behavior === 'block') {
          return { data: null, error: `Blocked by classifier: ${classifierResult.reason}`, isError: true }
        } else {
          const askResult = await this.permissionEngine.requestApproval(toolName, processedInput, ctx)
          if (!askResult.approved) {
            return { data: null, error: askResult.reason ?? 'Permission denied by user', isError: true }
          }
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

    const isWriteTool = WRITE_TOOLS.has(toolName)

    let rollbackPointId: string | null = null
    if (isWriteTool) {
      try {
        const rp = await ToolRollbackManager.getInstance().createPoint(ctx.sessionId ?? toolName, toolName, processedInput)
        rollbackPointId = rp.id
      } catch {
        // Rollback point capture is best-effort
      }
    }

    try {
      let result: ToolResult

      if (ctx.signal?.aborted) {
        return { data: null, error: 'Tool execution aborted', isError: true }
      }

      result = await tool.execute(ctx, processedInput as any)

      if (result.isError && this.fallbackRegistry) {
        const strategy = this.fallbackRegistry.get(toolName)
        if (strategy) {
          const fallbackResult = await strategy(tool, processedInput, result.error ?? '', ctx, (name) => this.registry.resolve(name))
          if (fallbackResult && !fallbackResult.isError) {
            result = {
              data: fallbackResult.data,
              meta: { ...fallbackResult.meta, fallbackFrom: toolName },
            }
          }
        }
      }

      for (const hook of allPostHooks) {
        result = await hook(ctx, tool, processedInput, result)
      }

      // ── Lifecycle: postToolUse ──
      if (lifecycleHooks) {
        await lifecycleHooks.dispatchAll('postToolUse', { toolName, toolArgs: input, toolResult: result, sessionId: ctx.sessionId }).catch(() => {})
      }

      if (rollbackPointId) {
        ToolRollbackManager.getInstance().confirmPoint(rollbackPointId)
      }

      const durationMs = Math.round(performance.now() - startTime)
      this.emit(opts, { type: 'tool:end', toolName, timestamp: Date.now(), durationMs })

      return result
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)

      if (this.fallbackRegistry) {
        const strategy = this.fallbackRegistry.get(toolName)
        if (strategy) {
          const fallbackResult = await strategy(tool, processedInput, errMsg, ctx, (name) => this.registry.resolve(name))
          if (fallbackResult && !fallbackResult.isError) {
            const durationMs = Math.round(performance.now() - startTime)
            this.emit(opts, { type: 'tool:end', toolName, timestamp: Date.now(), durationMs })
            return { data: fallbackResult.data, meta: { ...fallbackResult.meta, fallbackFrom: toolName } }
          }
        }
      }

      // ── Lifecycle: errorEscalation ──
      if (lifecycleHooks) {
        await lifecycleHooks.dispatchAll('errorEscalation', { error: err instanceof Error ? err : new Error(errMsg), toolName, sessionId: ctx.sessionId }).catch(() => {})
      }

      eventBus.emit({ type: 'EXECUTION_ERROR', stepId: ctx.sessionId ?? '', role: '', message: `Tool "${toolName}" failed: ${errMsg}` })

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
