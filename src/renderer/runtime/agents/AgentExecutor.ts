import type { RuntimeRole, AgentRoleConfig } from "@/types"
import type { ChatMessage, UsageInfo, ToolCall } from "@agentic-os/providers"
import { ProviderTransport, type TransportAdapterConfig, type TransportError } from "@agentic-os/providers"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore, getWorkspaceContextSnapshot } from "@/stores/workspace-store"
import { memoryLoader } from "@/runtime/project-memory/memory-loader"
import type { MemoryLoadResult } from "@/runtime/project-memory/memory-loader"
import { ContextManager } from "@/runtime/context/ContextManager"
import type { ContextAssemblyInput } from "@/runtime/context/context-types"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { normalizeRole } from "@/lib/role-identity"
import { getEffectiveMaxTokens } from "@/runtime/runtime-token-config"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import type { AgentTool } from "@/runtime/tools/core/AgentTool"
import { agentToolsToToolDefs } from "@/runtime/tools/conversion/agentToolToToolDef"
import { FAST_CHAT_PROMPT } from "@/runtime/runtime-role-registry"
import { trace } from "@/lib/execution-trace"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { EventChannel } from "@/runtime/streaming/EventChannel"
import { createRetryPolicy, withRetry } from "@/runtime/reliability/RetryPolicy"
import { ToolExecutionScheduler, type ToolCallEntry } from "@/runtime/tools/execution/ToolExecutionScheduler"
import { toolRelevanceMatcher } from "@/runtime/tools/core/ToolSearch"
import { pluginRegistry } from "@/runtime/plugins/PluginRegistry"

export type AgentMode = "FAST" | "FULL" | "MULTI"

export interface AgentExecutorConfig {
  executionId: string
  mode: AgentMode
  role: RuntimeRole
  input: string
  history: ChatMessage[]
  signal?: AbortSignal
}

export interface AgentExecutorResult {
  response: string
  messages: ChatMessage[]
  usage: UsageInfo
  toolCallCount: number
  totalElapsedMs: number
}

const AGENT_EXECUTION_TIMEOUT_MS = 120_000
const AGENT_SOFT_DEADLINE_MS = 60_000
const MAX_ROUNDS = 10
const MAX_TOOL_ONLY_ROUNDS = 5
const PROVIDER_RETRY_POLICY = createRetryPolicy({
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  jitterFactor: 0.25,
  retryableErrors: [/timeout/i, /rate limit/i, /429/i, /5\d{2}/, /network/i, /ECONNRESET/i, /ETIMEDOUT/i],
  budget: { maxTotalTimeMs: 30_000, maxCumulativeDelayMs: 10_000 },
})

function createTransport(): ProviderTransport {
  return new ProviderTransport({
    getApiKey: (providerId?: string) => {
      if (providerId) {
        const providers = useAppStore.getState().providers ?? []
        const p = providers.find((p) => p.id === providerId)
        return p?.apiKey
      }
      return undefined
    },
  })
}

export interface ResolvedAgentConfig {
  endpoint: string
  apiKey: string
  model: string
  providerId: string
  runtime: string | null
  temperature: number
}

export interface ResolvedFallbackConfig {
  endpoint: string
  apiKey: string
  model: string
  providerId: string
  runtime: string | null
}

function resolveFallbackProvider(fallbackModel: string): { endpoint: string; apiKey: string; providerId: string; runtime: string | null } | null {
  const providers = useAppStore.getState().providers ?? []
  for (const p of providers) {
    if (p.models.some(m => m.id === fallbackModel)) {
      return { endpoint: p.baseUrl, apiKey: p.apiKey, providerId: p.id, runtime: p.runtime }
    }
  }
  return null
}

function resolveAgentConfig(role: RuntimeRole): { primary: ResolvedAgentConfig; fallback: ResolvedFallbackConfig | null } | null {
  const { wiredAgents } = useWorkspaceRuntime.getState()
  const providers = useAppStore.getState().providers ?? []
  const normalized = normalizeRole(role) ?? role
  const wired = wiredAgents.find((a) => a.runtimeRole === normalized || a.roleId === normalized || a.runtimeRole === role)
  if (!wired) return null
  const provider = providers.find((p) => p.id === wired.providerId)
  if (!provider) return null
  const primary: ResolvedAgentConfig = {
    endpoint: provider.baseUrl,
    apiKey: provider.apiKey,
    model: wired.model,
    providerId: wired.providerId,
    runtime: provider.runtime,
    temperature: wired.temperature,
  }
  let fallback: ResolvedFallbackConfig | null = null
  if (wired.fallbackModel) {
    const fbProvider = resolveFallbackProvider(wired.fallbackModel)
    if (fbProvider) {
      fallback = { ...fbProvider, model: wired.fallbackModel }
    }
  }
  return { primary, fallback }
}

export class AgentExecutor {
  private executionId: string
  private role: RuntimeRole
  private mode: AgentMode
  private input: string
  private history: ChatMessage[]
  private signal?: AbortSignal

  constructor(config: AgentExecutorConfig) {
    this.executionId = config.executionId
    this.mode = config.mode
    this.role = config.role
    this.input = config.input
    this.history = config.history
    this.signal = config.signal
  }

  async *execute(): AsyncGenerator<ExecutionEvent> {
    if (this.mode === "FAST") {
      yield* this.executeFast()
    } else {
      yield* this.executeFull()
    }
  }

  private async *executeFast(): AsyncGenerator<ExecutionEvent> {
    const eid = this.executionId
    const config = resolveAgentConfig(this.role)
    if (!config) throw new Error(`Role "${this.role}" is not wired. Configure it in Settings → Roles.`)

    const messages: ChatMessage[] = [
      { role: "system", content: FAST_CHAT_PROMPT },
      ...this.history,
      { role: "user", content: this.input },
    ]

    let content = ""
    let usage: UsageInfo = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    const primary = config.primary
    const fallback = config.fallback

    function buildAdapterConfig(cfg: ResolvedAgentConfig | ResolvedFallbackConfig): TransportAdapterConfig {
      return {
        baseUrl: cfg.endpoint,
        apiKey: cfg.apiKey,
        runtime: cfg.runtime,
        providerId: cfg.providerId,
        providerName: thisRole,
      }
    }

    const thisRole = this.role
    const transport = createTransport()
    let lastAttemptError: string | null = null

    yield { type: "THINKING_STARTED", executionId: eid, label: "Thinking", timestamp: Date.now() }
    yield { type: "PROVIDER_CONNECTING", executionId: eid, model: primary.model, provider: this.role, temperature: primary.temperature, timestamp: Date.now() }

    let usedFallback = false

    // Attempt 1: streaming with primary model
    try {
      const channel = new EventChannel()
      const streamPromise = transport.streamChatCompletion(
        buildAdapterConfig(primary),
        { model: primary.model, messages, maxTokens: 4096, temperature: primary.temperature, signal: this.signal },
        {
          onToken: (token: string) => {
            content += token
            channel.push({ type: "TOKEN", executionId: eid, token, timestamp: Date.now() })
          },
          onToolCallBegin: () => {},
          onToolCallDelta: () => {},
          onToolCallEnd: () => {},
          onFinish: () => {},
          onError: (error: TransportError) => {
            lastAttemptError = error.message
            channel.push({ type: "EXECUTION_FAILED", executionId: eid, error: error.message, durationMs: 0, timestamp: Date.now() })
            channel.close()
          },
          onDone: () => channel.close(),
        },
      )

      for await (const event of channel) {
        yield event
      }
      await streamPromise
    } catch (err) {
      lastAttemptError = err instanceof Error ? err.message : String(err)
      console.warn("[AgentExecutor] Primary streaming failed:", lastAttemptError)
    }

    // Attempt 2: streaming with fallback model if primary streaming failed
    if (!content && fallback) {
      usedFallback = true
      yield { type: "FALLBACK_ACTIVATED", executionId: eid, fromModel: primary.model, toModel: fallback.model, reason: "primary streaming failed", timestamp: Date.now() }
      try {
        const channel = new EventChannel()
        const streamPromise = transport.streamChatCompletion(
          buildAdapterConfig(fallback),
          { model: fallback.model, messages, maxTokens: 4096, signal: this.signal },
          {
            onToken: (token: string) => {
              content += token
              channel.push({ type: "TOKEN", executionId: eid, token, timestamp: Date.now() })
            },
            onToolCallBegin: () => {},
            onToolCallDelta: () => {},
            onToolCallEnd: () => {},
            onFinish: () => {},
            onError: (error: TransportError) => {
              lastAttemptError = error.message
              channel.push({ type: "EXECUTION_FAILED", executionId: eid, error: error.message, durationMs: 0, timestamp: Date.now() })
              channel.close()
            },
            onDone: () => channel.close(),
          },
        )

        for await (const event of channel) {
          yield event
        }
        await streamPromise
      } catch (err) {
        lastAttemptError = err instanceof Error ? err.message : String(err)
        console.warn("[AgentExecutor] Fallback streaming failed:", lastAttemptError)
      }
    }

    const effectiveModel = usedFallback ? fallback!.model : primary.model
    yield { type: "PROVIDER_CONNECTED", executionId: eid, model: effectiveModel, provider: this.role, temperature: usedFallback ? primary.temperature : primary.temperature, timestamp: Date.now() }

    // Attempt 3: non-streaming with primary (or fallback if fallback streaming was used)
    if (!content) {
      const cfg = usedFallback ? fallback! : primary
      try {
        const result = await transport.chatCompletion(
          buildAdapterConfig(cfg),
          { model: cfg.model, messages, maxTokens: 4096, temperature: 'temperature' in cfg ? (cfg as ResolvedAgentConfig).temperature : primary.temperature, signal: this.signal },
        )
        content = result.content
        if (result.usage) {
          usage = {
            prompt_tokens: result.usage.promptTokens,
            completion_tokens: result.usage.completionTokens,
            total_tokens: result.usage.totalTokens,
          }
        }
      } catch (err) {
        lastAttemptError = err instanceof Error ? err.message : String(err)
        // Attempt 4: non-streaming with the other model if we haven't tried both
        if (!usedFallback && fallback) {
          console.warn("[AgentExecutor] Primary non-streaming failed, trying fallback:", lastAttemptError)
          try {
            const result = await transport.chatCompletion(
              buildAdapterConfig(fallback),
              { model: fallback.model, messages, maxTokens: 4096, signal: this.signal },
            )
            content = result.content
            if (result.usage) {
              usage = {
                prompt_tokens: result.usage.promptTokens,
                completion_tokens: result.usage.completionTokens,
                total_tokens: result.usage.totalTokens,
              }
            }
          } catch (fbErr) {
            lastAttemptError = fbErr instanceof Error ? fbErr.message : String(fbErr)
            console.warn("[AgentExecutor] Fallback non-streaming also failed:", lastAttemptError)
          }
        } else {
          console.warn("[AgentExecutor] Non-streaming failed:", lastAttemptError)
        }
      }
      if (content) {
        yield { type: "MESSAGE_UPDATE", executionId: eid, content, timestamp: Date.now() }
      }
    }

    if (!content && lastAttemptError) {
      yield { type: "EXECUTION_FAILED", executionId: eid, error: `All provider attempts failed: ${lastAttemptError}`, durationMs: 0, timestamp: Date.now() }
    }

    yield { type: "MESSAGE_COMPLETE", executionId: eid, stepId: eid, content, finishReason: "stop", timestamp: Date.now(), tokensIn: usage.prompt_tokens, tokensOut: usage.completion_tokens }
  }

  private async *executeFull(): AsyncGenerator<ExecutionEvent> {
    const eid = this.executionId
    const startedAt = performance.now()
    const config = resolveAgentConfig(this.role)
    if (!config) throw new Error(`Role "${this.role}" is not wired. Configure it in Settings → Roles.`)

    trace("AgentExecutor", "start", { role: this.role, mode: this.mode })

    const normalizedRole = normalizeRole(this.role) ?? "coder"

    // ── Phase 5: Read memory scope and filter memory accordingly ──
    const roleConfigs = useAppStore.getState().roleConfigs ?? []
    const myRoleConfig = roleConfigs.find(r => r.runtimeRole === this.role || r.id === this.role)
    const memoryScope = myRoleConfig?.memoryScope ?? "project"

    const rootPath = useWorkspaceStore.getState().rootPath
    let projectRules: string | undefined
    const memoryPromise = rootPath
      ? memoryLoader.load(rootPath).then((memory) => {
          const filtered = this.filterMemoryByScope(memory, memoryScope)
          if (filtered.combined.trim().length > 0) {
            projectRules = filtered.combined.trim()
          }
        }).catch((err) => { console.warn("[AgentExecutor] Memory loading failed:", err) })
      : Promise.resolve()

    const wsSnapshot = getWorkspaceContextSnapshot()
    const assemblyInput: ContextAssemblyInput = {
      role: normalizedRole,
      userMessage: this.input,
      customInstructions: projectRules,
      activeFilePath: wsSnapshot.activeFilePath ?? undefined,
      activeFileName: wsSnapshot.activeFileName ?? undefined,
      activeFileLanguage: wsSnapshot.activeFileLanguage ?? undefined,
      activeFileLines: wsSnapshot.activeFileLines > 0 ? wsSnapshot.activeFileLines : undefined,
      openFiles: wsSnapshot.openFiles.length > 0 ? wsSnapshot.openFiles : undefined,
      selectedText: wsSnapshot.selectedText || undefined,
      cursorLine: wsSnapshot.cursorLine > 0 ? wsSnapshot.cursorLine : undefined,
      cursorColumn: wsSnapshot.cursorColumn > 0 ? wsSnapshot.cursorColumn : undefined,
      visibleRangeStart: wsSnapshot.visibleRangeStart > 0 ? wsSnapshot.visibleRangeStart : undefined,
      visibleRangeEnd: wsSnapshot.visibleRangeEnd > 0 ? wsSnapshot.visibleRangeEnd : undefined,
      unsavedChanges: wsSnapshot.unsavedChanges > 0 ? wsSnapshot.unsavedChanges : undefined,
      recentEdits: wsSnapshot.recentEdits.length > 0 ? wsSnapshot.recentEdits : undefined,
      fileTreeSummary: wsSnapshot.fileTreeSummary || undefined,
    }

    yield { type: "THINKING_STARTED", executionId: eid, label: "Planning", timestamp: Date.now() }

    const [promptResult] = await Promise.all([
      ContextManager.getInstance().assembleSystemPrompt(assemblyInput),
      memoryPromise,
    ])
    const systemPrompt = promptResult.systemPrompt

    yield { type: "THINKING_UPDATE", executionId: eid, label: "Building context", timestamp: Date.now() }
    yield { type: "CONTEXT_LOADING", executionId: eid, source: "workspace", timestamp: Date.now() }

    const contextResult = await ContextManager.getInstance().buildContext(this.input, this.role)
    const systemMessage: ChatMessage = { role: "system", content: systemPrompt }
    const contextMessage = contextResult.promptBlock
      ? [{ role: "system" as const, content: contextResult.promptBlock }]
      : []
    let msgs: ChatMessage[] = [systemMessage, ...contextMessage, ...this.history, { role: "user", content: this.input }]

    yield { type: "CONTEXT_READY", executionId: eid, source: "workspace", tokens: 0, timestamp: Date.now() }

    const totalUsage: UsageInfo = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    let softDeadlineLogged = false
    let consecutiveToolOnlyRounds = 0
    let finalResponse = ""

    // ── Phase 3: Filter tools by role capabilities + relevance ──
    const runtimeOS = RuntimeOS.getInstance()
    const roleTools = runtimeOS.toolRegistry.getByMode(this.role)
    const capabilities = myRoleConfig?.capabilities
    let filteredTools = capabilities ? this.filterToolsByCapabilities(roleTools, capabilities) : roleTools

    // ── ToolSearch: dynamically filter tool definitions by relevance to the user's input ──
    // This reduces prompt bloat by 10-30% by excluding irrelevant tools.
    // Unknown tools (MCP, plugins, etc.) pass through by default.
    const relevantToolNames = new Set(toolRelevanceMatcher.match(this.input))
    filteredTools = filteredTools.filter(
      t => relevantToolNames.has(t.name) || !toolRelevanceMatcher.hasEntry(t.name)
    )

    const exposedToolNames = filteredTools.map(t => t.name)
    yield {
      type: "TOOLS_EXPOSED",
      executionId: eid,
      role: this.role,
      tools: exposedToolNames,
      totalAvailable: roleTools.length,
      totalFiltered: roleTools.length - filteredTools.length,
      timestamp: Date.now(),
    }
    const toolDefs = agentToolsToToolDefs(filteredTools)

    const primary = config.primary
    const fallback = config.fallback

    function buildAdapterConfig(cfg: ResolvedAgentConfig | ResolvedFallbackConfig): TransportAdapterConfig {
      return {
        baseUrl: cfg.endpoint,
        apiKey: cfg.apiKey,
        runtime: cfg.runtime,
        providerId: cfg.providerId,
        providerName: thisRole,
      }
    }

    const thisRole = this.role
    const transport = createTransport()
    let lastAttemptError: string | null = null

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const elapsed = performance.now() - startedAt

      if (!softDeadlineLogged && elapsed > AGENT_SOFT_DEADLINE_MS) {
        console.warn(`[Agent:${this.mode}:${this.role}] SOFT DEADLINE exceeded (${elapsed}ms)`)
        softDeadlineLogged = true
      }
      if (elapsed > AGENT_EXECUTION_TIMEOUT_MS) {
        throw new Error(`Agent execution exceeded ${AGENT_EXECUTION_TIMEOUT_MS / 1000}s timeout`)
      }
      if (this.signal?.aborted) {
        throw new DOMException("Agent execution aborted", "AbortError")
      }

      yield { type: "THINKING_UPDATE", executionId: eid, label: `Round ${round + 1}`, timestamp: Date.now() }
      trace("AgentExecutor", "provider_request", { round: round + 1 })

      const maxTokens = getEffectiveMaxTokens(this.role, primary.model)
      let responseContent = ""
      let responseToolCalls: ToolCall[] = []
      let usedFallback = false

      yield { type: "PROVIDER_CONNECTING", executionId: eid, model: primary.model, provider: this.role, temperature: primary.temperature, timestamp: Date.now() }

      // Attempt 1: streaming with primary model
      try {
        const channel = new EventChannel()
        const streamPromise = transport.streamChatCompletion(
          buildAdapterConfig(primary),
          { model: primary.model, messages: msgs, tools: toolDefs, maxTokens, temperature: primary.temperature, signal: this.signal },
          {
            onToken: (token: string) => {
              responseContent += token
              channel.push({ type: "TOKEN", executionId: eid, token, timestamp: Date.now() })
            },
            onToolCallBegin: () => {},
            onToolCallDelta: () => {},
            onToolCallEnd: () => {},
            onToolCallsComplete: (toolCalls) => {
              responseToolCalls = toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              }))
            },
            onFinish: () => {},
            onError: (error: TransportError) => {
              lastAttemptError = error.message
              channel.push({ type: "EXECUTION_FAILED", executionId: eid, error: error.message, durationMs: 0, timestamp: Date.now() })
              channel.close()
            },
            onDone: () => channel.close(),
          },
        )

        for await (const event of channel) {
          yield event
        }
        await streamPromise
      } catch (err) {
        lastAttemptError = err instanceof Error ? err.message : String(err)
        console.warn("[AgentExecutor] Primary streaming failed:", lastAttemptError)
      }

      // Attempt 2: streaming with fallback model if primary streaming produced nothing
      if (!responseContent && responseToolCalls.length === 0 && fallback) {
        usedFallback = true
        yield { type: "FALLBACK_ACTIVATED", executionId: eid, fromModel: primary.model, toModel: fallback.model, reason: "primary streaming failed", timestamp: Date.now() }
        try {
          const channel = new EventChannel()
          const streamPromise = transport.streamChatCompletion(
            buildAdapterConfig(fallback),
            { model: fallback.model, messages: msgs, tools: toolDefs, maxTokens, signal: this.signal },
            {
              onToken: (token: string) => {
                responseContent += token
                channel.push({ type: "TOKEN", executionId: eid, token, timestamp: Date.now() })
              },
              onToolCallBegin: () => {},
              onToolCallDelta: () => {},
              onToolCallEnd: () => {},
              onToolCallsComplete: (toolCalls) => {
                responseToolCalls = toolCalls.map((tc) => ({
                  id: tc.id,
                  type: "function" as const,
                  function: { name: tc.name, arguments: tc.arguments },
                }))
              },
              onFinish: () => {},
              onError: (error: TransportError) => {
                lastAttemptError = error.message
                channel.push({ type: "EXECUTION_FAILED", executionId: eid, error: error.message, durationMs: 0, timestamp: Date.now() })
                channel.close()
              },
              onDone: () => channel.close(),
            },
          )

          for await (const event of channel) {
            yield event
          }
          await streamPromise
        } catch (err) {
          lastAttemptError = err instanceof Error ? err.message : String(err)
          console.warn("[AgentExecutor] Fallback streaming failed:", lastAttemptError)
        }
      }

      const effectiveModel = usedFallback ? fallback!.model : primary.model
      yield { type: "PROVIDER_CONNECTED", executionId: eid, model: effectiveModel, provider: this.role, temperature: primary.temperature, timestamp: Date.now() }

      // Attempt 3: non-streaming if streaming produced nothing
      if (!responseContent && responseToolCalls.length === 0) {
        const cfg = usedFallback ? fallback! : primary
        try {
          const result = await transport.chatCompletion(
            buildAdapterConfig(cfg),
            { model: cfg.model, messages: msgs, tools: toolDefs, maxTokens, temperature: primary.temperature, signal: this.signal },
          )
          responseContent = result.content
          if (result.toolCalls) {
            responseToolCalls = result.toolCalls as ToolCall[]
          }
          if (result.usage) {
            totalUsage.prompt_tokens += result.usage.promptTokens
            totalUsage.completion_tokens += result.usage.completionTokens
            totalUsage.total_tokens += result.usage.totalTokens
          }
        } catch (err) {
          lastAttemptError = err instanceof Error ? err.message : String(err)
          // Attempt 4: non-streaming with the other model if haven't tried both
          if (!usedFallback && fallback) {
            console.warn("[AgentExecutor] Primary non-streaming failed, trying fallback:", lastAttemptError)
            try {
              const result = await transport.chatCompletion(
                buildAdapterConfig(fallback),
                { model: fallback.model, messages: msgs, tools: toolDefs, maxTokens, signal: this.signal },
              )
              responseContent = result.content
              if (result.toolCalls) {
                responseToolCalls = result.toolCalls as ToolCall[]
              }
              if (result.usage) {
                totalUsage.prompt_tokens += result.usage.promptTokens
                totalUsage.completion_tokens += result.usage.completionTokens
                totalUsage.total_tokens += result.usage.totalTokens
              }
            } catch (fbErr) {
              lastAttemptError = fbErr instanceof Error ? fbErr.message : String(fbErr)
              console.warn("[AgentExecutor] Fallback non-streaming also failed:", lastAttemptError)
            }
          } else {
            console.warn("[AgentExecutor] Non-streaming failed:", lastAttemptError)
          }
        }
      }

      if (responseContent) {
        yield { type: "MESSAGE_UPDATE", executionId: eid, content: responseContent, timestamp: Date.now() }
      }

      if (!responseContent && responseToolCalls.length === 0 && lastAttemptError && round === 0) {
        yield { type: "EXECUTION_FAILED", executionId: eid, error: `All provider attempts failed: ${lastAttemptError}`, durationMs: Math.round(performance.now() - startedAt), timestamp: Date.now() }
        break
      }

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: responseContent,
        tool_calls: responseToolCalls.length > 0 ? responseToolCalls : undefined,
      }
      msgs.push(assistantMsg)
      ContextManager.getInstance().updateBudget(msgs as any)

      if (responseToolCalls.length > 0) {
        yield { type: "THINKING_UPDATE", executionId: eid, label: `Executing ${responseToolCalls.length} tool(s)`, timestamp: Date.now() }

        // ── Parallel Tool Execution ──
        // Partition tools into groups: read tools run in parallel,
        // write tools run sequentially. Each group executes before
        // the next begins, preserving write ordering.

        // First, yield TOOL_START for ALL tool calls (so UI shows them)
        const toolEntries: ToolCallEntry[] = responseToolCalls.map((tc) => {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
          return { id: tc.id, name: tc.function.name, args }
        })

        // Schedule into execution groups
        const scheduler = ToolExecutionScheduler.getInstance()
        const groups = scheduler.schedule(toolEntries)
        const concurrencyLimit = scheduler.getConcurrencyLimit()

        // Build a map: toolId → group index for parallel group info
        const toolGroupMap = new Map<string, number>()
        for (const group of groups) {
          for (const entry of group.tools) {
            toolGroupMap.set(entry.id, group.groupIndex)
          }
        }

        // Yield TOOL_START for all tools upfront with parallel group info
        for (const entry of toolEntries) {
          yield {
            type: "TOOL_START",
            executionId: eid,
            toolId: entry.id,
            toolName: entry.name,
            args: JSON.stringify(entry.args),
            parallelGroup: toolGroupMap.get(entry.id),
            timestamp: Date.now(),
          }
        }

        const editedFiles: string[] = []
        const pipeline = runtimeOS.toolExecutionPipeline

        console.log(`[AgentExecutor] Parallel execution: ${groups.length} group(s) from ${toolEntries.length} tool(s)`)

        for (const group of groups) {
          if (this.signal?.aborted) break

          const { tools: groupTools, type: groupType } = group

          // For read groups with multiple tools, execute in parallel
          if (groupType === "read" && groupTools.length > 1) {
            // Limit concurrency
            const batches: ToolCallEntry[][] = []
            for (let i = 0; i < groupTools.length; i += concurrencyLimit) {
              batches.push(groupTools.slice(i, i + concurrencyLimit))
            }

            for (const batch of batches) {
              if (this.signal?.aborted) break

              // Yield TOOL_PROGRESS for all tools in batch
              for (const entry of batch) {
                yield { type: "TOOL_PROGRESS", executionId: eid, toolId: entry.id, progress: `Reading ${entry.name.replace(/_/g, ' ')}...`, timestamp: Date.now() }
              }

              // Execute all tools in batch in parallel
              const results = await Promise.allSettled(
                batch.map(async (entry) => {
                  const toolStart = performance.now()
                  try {
                    const toolCtx: import("@/runtime/tools/core/ToolContext").ToolContext = {
                      role: this.role,
                      signal: this.signal,
                    }
                    const retryResult = await withRetry(
                      () => pipeline.execute(entry.name, entry.args, toolCtx),
                      PROVIDER_RETRY_POLICY,
                      `tool:${entry.name}`,
                      this.signal,
                    )
                    const durationMs = Math.round(performance.now() - toolStart)
                    return { entry, result: retryResult.data, durationMs, error: null }
                  } catch (err) {
                    return {
                      entry,
                      result: null as any,
                      durationMs: Math.round(performance.now() - toolStart),
                      error: err instanceof Error ? err.message : String(err),
                    }
                  }
                })
              )

              // Process results — iterate by index to match batch entries
              for (let ri = 0; ri < results.length; ri++) {
                const settled = results[ri]
                const entry = batch[ri]
                if (!entry) continue

                if (settled.status !== "fulfilled") {
                  const errorStr = "Parallel execution rejected"
                  msgs.push({ tool_call_id: entry.id, role: 'tool' as const, content: errorStr })
                  yield { type: "TOOL_ERROR", executionId: eid, toolId: entry.id, toolName: entry.name, error: errorStr, durationMs: 0, timestamp: Date.now() }
                  yield { type: "TOOL_COMPLETE", executionId: eid, toolId: entry.id, toolName: entry.name, result: errorStr, durationMs: 0, timestamp: Date.now() }
                  continue
                }

                // TypeScript narrows settled to PromiseFulfilledResult after the rejected check
                const { result, durationMs, error } = settled.value

                if (error) {
                  msgs.push({ tool_call_id: entry.id, role: 'tool' as const, content: `Error: ${error}` })
                  yield { type: "TOOL_ERROR", executionId: eid, toolId: entry.id, toolName: entry.name, error, durationMs, timestamp: Date.now() }
                  yield { type: "TOOL_COMPLETE", executionId: eid, toolId: entry.id, toolName: entry.name, result: `Error: ${error}`, durationMs, timestamp: Date.now() }
                  continue
                }

                const resultContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                msgs.push({ tool_call_id: entry.id, role: 'tool' as const, content: resultContent })
                yield { type: "TOOL_COMPLETE", executionId: eid, toolId: entry.id, toolName: entry.name, result: resultContent, durationMs, timestamp: Date.now() }
              }
            }
          } else {
            // Single tool or write/browser tool — execute sequentially
            for (const entry of groupTools) {
              if (this.signal?.aborted) break                // ── Plugin: onBeforeTool hook — can block execution ──
              const pluginAllow = await pluginRegistry.dispatchOnBeforeTool(entry.name, entry.args)
              if (!pluginAllow) {
                // Plugin blocked this tool
                msgs.push({
                  tool_call_id: entry.id,
                  role: 'tool' as const,
                  content: `Tool "${entry.name}" was blocked by a plugin`,
                })
                yield {
                  type: "TOOL_ERROR",
                  executionId: eid,
                  toolId: entry.id,
                  toolName: entry.name,
                  error: 'Blocked by plugin policy',
                  durationMs: 0,
                  timestamp: Date.now(),
                }
                yield {
                  type: "TOOL_COMPLETE",
                  executionId: eid,
                  toolId: entry.id,
                  toolName: entry.name,
                  result: 'Blocked by plugin policy',
                  durationMs: 0,
                  timestamp: Date.now(),
                }
                continue
              }

              const isCommand = entry.name === 'run_command'
              const commandStr = isCommand ? (entry.args.command as string || '') : ''

              if (isCommand) {
                yield { type: "COMMAND_START", executionId: eid, command: commandStr, timestamp: Date.now() }
              }

              const toolNameDisplay = entry.name.replace(/_/g, ' ')
              yield { type: "TOOL_PROGRESS", executionId: eid, toolId: entry.id, progress: `Running ${toolNameDisplay}...`, timestamp: Date.now() }

              const toolStart = performance.now()
              let result: import("@/runtime/tools/core/ToolResult").ToolResult

              if (isCommand) {
                const channel = new EventChannel()
                const streamCtx: import("@/runtime/tools/core/ToolContext").ToolContext = {
                  role: this.role,
                  signal: this.signal,
                  onOutput: (line: string) => {
                    if (!channel.closed) {
                      channel.push({ type: "COMMAND_OUTPUT", executionId: eid, output: line + "\n", timestamp: Date.now() })
                    }
                  },
                }
                const execPromise = pipeline.execute(entry.name, entry.args, streamCtx).then(
                  (r) => { channel.close(); return r },
                  (err) => { channel.close(); throw err },
                )
                for await (const event of channel) {
                  yield event
                }
                result = await execPromise
              } else {
                const toolCtx: import("@/runtime/tools/core/ToolContext").ToolContext = {
                  role: this.role,
                  signal: this.signal,
                }
                try {
                  const retryResult = await withRetry(
                    () => pipeline.execute(entry.name, entry.args, toolCtx),
                    PROVIDER_RETRY_POLICY,
                    `tool:${entry.name}`,
                    this.signal,
                  )
                  result = retryResult.data
                } catch (retryErr) {
                  result = {
                    data: undefined,
                    isError: true,
                    error: retryErr instanceof Error ? retryErr.message : String(retryErr),
                  }
                }
              }

              const toolDuration = performance.now() - toolStart

              if (result.isError) {
                msgs.push({
                  tool_call_id: entry.id,
                  role: 'tool' as const,
                  content: `Error executing ${entry.name}: ${result.error}`,
                })
                yield {
                  type: "TOOL_ERROR",
                  executionId: eid,
                  toolId: entry.id,
                  toolName: entry.name,
                  error: result.error ?? "Unknown error",
                  durationMs: Math.round(toolDuration),
                  timestamp: Date.now(),
                }
                yield {
                  type: "TOOL_COMPLETE",
                  executionId: eid,
                  toolId: entry.id,
                  toolName: entry.name,
                  result: `Error: ${result.error}`,
                  durationMs: Math.round(toolDuration),
                  timestamp: Date.now(),
                }
                if (isCommand) {
                  yield { type: "COMMAND_ERROR", executionId: eid, error: result.error ?? "Unknown error", durationMs: Math.round(toolDuration), timestamp: Date.now() }
                }
                continue
              }

              const resultContent = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)
              msgs.push({
                tool_call_id: entry.id,
                role: 'tool' as const,
                content: resultContent,
              })

              yield {
                type: "TOOL_COMPLETE",
                executionId: eid,
                toolId: entry.id,
                toolName: entry.name,
                result: resultContent,
                durationMs: Math.round(toolDuration),
                timestamp: Date.now(),
              }

              // ── Plugin: onAfterTool hook ──
              pluginRegistry.dispatchOnAfterTool(entry.name, entry.args, result.data).catch((err) => {
                console.warn(`[AgentExecutor] Plugin onAfterTool hook failed for ${entry.name}:`, err)
              })

              if (isCommand) {
                yield { type: "COMMAND_COMPLETE", executionId: eid, exitCode: 0, durationMs: Math.round(toolDuration), timestamp: Date.now() }
              }

              if (entry.name === 'write_file' || entry.name === 'edit_file') {
                const path = (entry.args.path || entry.args.file) as string || ''
                if (path) editedFiles.push(path)
                const content = (entry.args.content || entry.args.new_string) as string || ''
                yield {
                  type: "FILE_EDIT",
                  executionId: eid,
                  path,
                  additions: content ? content.split('\n').length : 0,
                  deletions: 0,
                  oldContent: (entry.args.old_string || entry.args.old_content) as string || '',
                  newContent: content,
                  timestamp: Date.now(),
                }
              }

              if (entry.name === 'delegate_subtask') {
                let parsed: Record<string, unknown> = {}
                try { parsed = JSON.parse(resultContent) } catch { /* ignore */ }
                yield {
                  type: "ACTION",
                  executionId: eid,
                  agentRole: "manager",
                  action: `delegate_subtask:${parsed.subAgentType ?? 'unknown'}`,
                  status: parsed.success ? "success" : "error",
                  summary: `${parsed.subAgentType ?? 'unknown'} agent: ${parsed.toolCalls ?? '?'} tool calls, ${parsed.tokensUsed ?? '?'} tokens, ${parsed.durationMs ?? '?'}ms`,
                  timestamp: Date.now(),
                }
              }
            }
          }
        }

        const compactResult = ContextManager.getInstance().compact(msgs as any)
        if (compactResult?.retainedMessages && compactResult.tokensRecovered > 0) {
          msgs = compactResult.retainedMessages as unknown as ChatMessage[]
          console.log(`[Agent:${this.mode}:${this.role}] compacted: ${compactResult.tokensRecovered} tokens (${compactResult.strategy}), ${compactResult.messagesRetained} msgs retained`)
        }

        if (editedFiles.length > 0) {
          try {
            const pipeline = VerificationPipeline.getInstance()
            const verifyResult = await pipeline.fastVerify([...new Set(editedFiles)])
            if (verifyResult) {
              const verifyMsg = pipeline.formatForLLM(verifyResult)
              msgs.push({ role: "user" as const, content: verifyMsg })
            }
          } catch (err) {
            console.warn("[AgentExecutor] fastVerify failed:", err)
          }
        }

        if (responseToolCalls.length > 0 && !responseContent) {
          consecutiveToolOnlyRounds++
          if (consecutiveToolOnlyRounds >= MAX_TOOL_ONLY_ROUNDS) {
            console.warn(`[Agent:${this.mode}:${this.role}] tool-only loop detected, forcing completion`)
            break
          }
        } else {
          consecutiveToolOnlyRounds = 0
        }
      } else {
        finalResponse = responseContent
        break
      }
    }

    const toolCallCount = msgs.filter((m) => m.role === "tool").length
    const totalElapsedMs = performance.now() - startedAt

    yield {
      type: "ACTION",
      executionId: eid,
      agentRole: this.role,
      action: `agent:${this.role}`,
      status: "success",
      summary: `Agent completed with ${toolCallCount} tool calls, ${totalUsage.total_tokens} tokens in ${totalElapsedMs}ms`,
      timestamp: Date.now(),
    }

    const assistantMessages = msgs.filter((m) => m.role === "assistant" && !m.tool_calls)
    const lastResponse = assistantMessages[assistantMessages.length - 1]?.content || finalResponse || ""

    trace("AgentExecutor", "complete", { role: this.role, mode: this.mode, elapsedMs: totalElapsedMs })

    yield { type: "MESSAGE_COMPLETE", executionId: eid, stepId: eid, content: lastResponse, finishReason: "stop", timestamp: Date.now(), tokensIn: totalUsage.prompt_tokens, tokensOut: totalUsage.completion_tokens }
  }

  private filterMemoryByScope(memory: MemoryLoadResult, scope: string): MemoryLoadResult {
    if (scope === "none") {
      return { files: [], combined: "", rules: [] }
    }
    const allowedSources = this.scopeToSources(scope)
    const filtered = memory.files.filter(f => allowedSources.includes(f.source as any))
    return {
      files: filtered,
      combined: filtered
        .sort((a, b) => a.priority - b.priority)
        .map(f => f.content)
        .join("\n\n"),
      rules: filtered.filter(f => f.source === "rules"),
    }
  }

  private scopeToSources(scope: string): string[] {
    switch (scope) {
      case "session": return ["local"]
      case "project": return ["project", "local", "rules"]
      case "global": return ["global", "project", "local", "rules"]
      default: return []
    }
  }

  private filterToolsByCapabilities(tools: AgentTool[], capabilities: AgentRoleConfig["capabilities"]): AgentTool[] {
    const toolCapabilityMap: Record<string, keyof typeof capabilities> = {
      write_file: "coding",
      edit_file: "coding",
      read_file: "fileAccess",
      grep_files: "fileAccess",
      glob_files: "fileAccess",
      run_command: "toolExecution",
      bash: "toolExecution",
      browser_navigate: "browsing",
      browser_click: "browsing",
      browser_type: "browsing",
      browser_snapshot: "browsing",
      web_fetch: "internetAccess",
      web_search: "internetAccess",
      delegate_task: "orchestration",
      spawn_agent: "orchestration",
    }
    return tools.filter(t => {
      const required = toolCapabilityMap[t.name]
      if (!required) return true
      return capabilities[required] === true
    })
  }
}
