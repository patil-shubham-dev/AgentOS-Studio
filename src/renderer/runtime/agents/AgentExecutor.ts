import type { RuntimeRole, AgentRoleConfig } from "@/types"
import type { ChatMessage, UsageInfo, ToolCall } from "@agentic-os/providers"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore, getWorkspaceContextSnapshot } from "@/stores/workspace-store"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import type { StructuredProjectConfig } from "@/runtime/project-config/ProjectConfigTypes"
import { ContextManager } from "@/runtime/context/ContextManager"
import type { ContextAssemblyInput } from "@/runtime/context/context-types"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { ExecutionScratchpad } from "@/runtime/execution/ExecutionScratchpad"
import { normalizeRole } from "@/lib/role-identity"
import { normalizeError } from "@/lib/normalize-error"
import * as wi from "@/lib/workspace-intelligence"
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
import { toolResultCache } from "@/runtime/tools/core/ToolResultCache"
import { pluginRegistry } from "@/runtime/plugins/PluginRegistry"
import { providerGateway } from "@/runtime/providers/ProviderGateway"
import type { GatewayRequest } from "@/runtime/providers/ProviderGateway"

const TOOL_OUTPUT_MAX_CHARS = 50000

export type AgentMode = "FAST" | "FULL"

function capOutputSize(content: string): string {
  if (content.length <= TOOL_OUTPUT_MAX_CHARS) return content
  return content.substring(0, TOOL_OUTPUT_MAX_CHARS) + `\n[output truncated at ${TOOL_OUTPUT_MAX_CHARS} chars...]`
}

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

function resolveWiredAgent(role: RuntimeRole) {
  const { wiredAgents } = useWorkspaceRuntime.getState()
  const normalized = normalizeRole(role) ?? role
  return wiredAgents.find((a) => a.runtimeRole === normalized || a.roleId === normalized || a.runtimeRole === role) ?? null
}

export class AgentExecutor {
  private executionId: string
  private role: RuntimeRole
  private mode: AgentMode
  private input: string
  private history: ChatMessage[]
  private signal?: AbortSignal
  private scratchpad?: ExecutionScratchpad

  constructor(config: AgentExecutorConfig) {
    this.executionId = config.executionId
    this.mode = config.mode
    this.role = config.role
    this.input = config.input
    this.history = config.history
    this.signal = config.signal
  }

  setScratchpad(sp: ExecutionScratchpad): void {
    this.scratchpad = sp
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
    const wired = resolveWiredAgent(this.role)
    if (!wired) throw new Error(`Role "${this.role}" is not wired. Configure it in Settings → Roles.`)

    const messages: GatewayRequest["messages"] = [
      ...this.history.map((m) => {
        const base: GatewayRequest["messages"][number] = {
          role: m.role as "user" | "assistant" | "system" | "tool",
          content: m.content,
        }
        if (m.tool_call_id) base.tool_call_id = m.tool_call_id
        if (m.tool_calls) base.tool_calls = m.tool_calls
        return base
      }),
      { role: "user" as const, content: this.input },
    ]

    let content = ""
    let tokensIn = 0
    let tokensOut = 0
    let failed = false

    yield { type: "THINKING_STARTED", executionId: eid, label: "Thinking", timestamp: Date.now() }

    const stream = providerGateway.stream({
      systemPrompt: FAST_CHAT_PROMPT,
      messages,
      model: wired.model,
      signal: this.signal,
    })

    for await (const event of stream) {
      switch (event.type) {
        case "status":
          if (event.status === "connecting") {
            yield { type: "PROVIDER_CONNECTING", executionId: eid, model: event.model ?? wired.model, provider: this.role, temperature: wired.temperature, timestamp: Date.now(), note: event.note }
          } else if (event.status === "completed") {
            yield { type: "PROVIDER_CONNECTED", executionId: eid, model: event.model ?? wired.model, provider: this.role, temperature: wired.temperature, timestamp: Date.now() }
          }
          break
        case "token":
          content += event.text
          yield { type: "TOKEN", executionId: eid, token: event.text, timestamp: Date.now() }
          break
        case "reasoning_token":
          yield { type: "REASONING_TOKEN", executionId: eid, token: event.text, timestamp: Date.now() }
          break
        case "done":
          if (event.usage) {
            tokensIn = event.usage.tokensIn
            tokensOut = event.usage.tokensOut
          }
          break
        case "error":
          failed = true
          yield { type: "EXECUTION_FAILED", executionId: eid, error: event.userMessage, durationMs: 0, timestamp: Date.now() }
          break
      }
    }

    if (failed) return

    yield { type: "MESSAGE_COMPLETE", executionId: eid, stepId: eid, content, finishReason: "stop", timestamp: Date.now(), tokensIn, tokensOut }
  }

  private async *executeFull(): AsyncGenerator<ExecutionEvent> {
    const eid = this.executionId
    const startedAt = performance.now()
    const wired = resolveWiredAgent(this.role)
    if (!wired) throw new Error(`Role "${this.role}" is not wired. Configure it in Settings → Roles.`)

    trace("AgentExecutor", "start", { role: this.role, mode: this.mode })

    const normalizedRole = normalizeRole(this.role) ?? "coder"

    // ── Phase 5: Read memory scope and filter memory accordingly ──
    const roleConfigs = useAppStore.getState().roleConfigs ?? []
    const myRoleConfig = roleConfigs.find(r => r.runtimeRole === this.role || r.id === this.role)
    const memoryScope = myRoleConfig?.memoryScope ?? "project"

    const rootPath = useWorkspaceStore.getState().rootPath
    let projectRules: string | undefined
    const memoryPromise = rootPath
      ? configLoader.loadProjectMemory(rootPath).then((memory) => {
          const parts: string[] = []
          if (memory.combined.trim().length > 0) {
            parts.push(memory.combined.trim())
          }
          if (memory.projectConfig && memory.projectConfig.trim().length > 0) {
            parts.push(`## Project Configuration\n\n${memory.projectConfig.trim()}`)
          }
          if (parts.length > 0) {
            projectRules = parts.join("\n\n")
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
      executionScratchpad: this.scratchpad?.formatForLLM() ?? undefined,
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
    const roleTools = runtimeOS.toolPoolAssembler.assembleForRole(this.role)
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

    const modelForRole = wired.model
    const maxTokens = getEffectiveMaxTokens(this.role, modelForRole)
    let totalTokensIn = 0
    let totalTokensOut = 0

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

      let responseContent = ""
      const responseToolCalls: ToolCall[] = []
      let failed = false
      let roundError = ""

      const gwMessages: GatewayRequest["messages"] = msgs.map((m) => {
        const base: GatewayRequest["messages"][number] = {
          role: m.role as "user" | "assistant" | "system" | "tool",
          content: typeof m.content === "string" ? m.content : "",
        }
        if (m.tool_call_id) base.tool_call_id = m.tool_call_id
        if (m.tool_calls) base.tool_calls = m.tool_calls
        return base
      })

      const gwRequest: GatewayRequest = {
        messages: gwMessages,
        maxTokens,
        tools: toolDefs,
        model: modelForRole,
        signal: this.signal,
      }

      console.log("[FLOW:14] AgentExecutor.executeFull: calling providerGateway.stream (round " + round + ")")
      const stream = providerGateway.stream(gwRequest)
      for await (const event of stream) {
        switch (event.type) {
          case "status":
            if (event.status === "connecting") {
              yield { type: "PROVIDER_CONNECTING", executionId: eid, model: event.model ?? modelForRole, provider: this.role, temperature: wired.temperature, timestamp: Date.now(), note: event.note }
            } else if (event.status === "completed") {
              yield { type: "PROVIDER_CONNECTED", executionId: eid, model: event.model ?? modelForRole, provider: this.role, temperature: wired.temperature, timestamp: Date.now() }
            }
            break
          case "token":
            responseContent += event.text
            yield { type: "TOKEN", executionId: eid, token: event.text, timestamp: Date.now() }
            break
          case "reasoning_token":
            yield { type: "REASONING_TOKEN", executionId: eid, token: event.text, timestamp: Date.now() }
            break
          case "tool_call":
            responseToolCalls.push(event.toolCall)
            break
          case "done":
            if (event.usage) {
              totalTokensIn += event.usage.tokensIn
              totalTokensOut += event.usage.tokensOut
              totalUsage.prompt_tokens += event.usage.tokensIn
              totalUsage.completion_tokens += event.usage.tokensOut
              totalUsage.total_tokens += event.usage.tokensIn + event.usage.tokensOut
            }
            break
          case "error":
            failed = true
            roundError = event.userMessage
            yield { type: "EXECUTION_FAILED", executionId: eid, error: event.userMessage, durationMs: Math.round(performance.now() - startedAt), timestamp: Date.now() }
            break
        }
      }
      console.log("[FLOW:15] AgentExecutor.executeFull: provider for-await complete (round " + round + ", failed=" + failed + ", contentLen=" + responseContent.length + ", toolCalls=" + responseToolCalls.length + ")")

      if (failed) {
        const errorMsg = roundError || "Request failed — provider returned an error"
        const toolCount = msgs.filter((m) => m.role === "tool").length
        const totalElapsedMs = performance.now() - startedAt
        yield { type: "MESSAGE_COMPLETE", executionId: eid, stepId: eid, content: `${errorMsg}`, finishReason: "error", timestamp: Date.now(), tokensIn: totalUsage.prompt_tokens, tokensOut: totalUsage.completion_tokens }
        return
      }

      if (responseContent) {
        yield { type: "MESSAGE_UPDATE", executionId: eid, content: responseContent, timestamp: Date.now() }
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
                  const cacheKey = toolResultCache.isCacheable(entry.name)
                    ? toolResultCache.key(entry.name, entry.args)
                    : null
                  const cached = cacheKey ? toolResultCache.get(cacheKey) : null
                  if (cached) {
                    return { entry, result: cached, durationMs: 0, error: null }
                  }
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
                    const result = retryResult.data
                    if (cacheKey && !result.isError) {
                      toolResultCache.set(cacheKey, entry.name, result)
                    }
                    return { entry, result, durationMs, error: null }
                  } catch (err) {
                    return {
                      entry,
                      result: null as any,
                      durationMs: Math.round(performance.now() - toolStart),
                      error: normalizeError(err),
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

                const resultContent = capOutputSize(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
                msgs.push({ tool_call_id: entry.id, role: 'tool' as const, content: resultContent })
                yield { type: "TOOL_COMPLETE", executionId: eid, toolId: entry.id, toolName: entry.name, result: resultContent, durationMs, timestamp: Date.now() }
                if (entry.name === 'read_file') {
                  this.recordToolInScratchpad(entry, result)
                }
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
                yield { type: "COMMAND_START", executionId: eid, command: commandStr, cwd: ctx.cwd, timestamp: Date.now() }
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
                const cacheKey = toolResultCache.isCacheable(entry.name)
                  ? toolResultCache.key(entry.name, entry.args)
                  : null
                const cached = cacheKey ? toolResultCache.get(cacheKey) : null
                if (cached) {
                  result = cached
                } else {
                  try {
                    const retryResult = await withRetry(
                      () => pipeline.execute(entry.name, entry.args, toolCtx),
                      PROVIDER_RETRY_POLICY,
                      `tool:${entry.name}`,
                      this.signal,
                    )
                    result = retryResult.data
                    if (cacheKey && !result.isError) {
                      toolResultCache.set(cacheKey, entry.name, result)
                    }
                  } catch (retryErr) {
                    result = {
                      data: undefined,
                      isError: true,
                      error: normalizeError(retryErr),
                    }
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
                  error: result.error,
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

              const resultContent = capOutputSize(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2))
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

              if (entry.name === 'read_file') {
                this.recordToolInScratchpad(entry, result.data)
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
                this.recordToolInScratchpad(entry, result.data)
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
          for (const f of [...new Set(editedFiles)]) {
            try {
              const analysis = wi.analyzeImpact(f)
              const impactMsg = wi.formatImpactForLLM(analysis)
              msgs.push({ role: "user" as const, content: impactMsg })
            } catch {
              // impact analysis is advisory only, silently skip on failure
            }
          }

          try {
            const pipeline = VerificationPipeline.getInstance()
            const verifyResult = await pipeline.fastVerify([...new Set(editedFiles)])
            if (verifyResult) {
              const verifyMsg = pipeline.formatForLLM(verifyResult)
              msgs.push({ role: "user" as const, content: verifyMsg })
              if (this.scratchpad) {
                const allFiles = [...new Set(editedFiles)]
                const summary = verifyResult.details?.join('; ') ?? ''
                for (const f of allFiles) {
                  this.scratchpad.recordVerificationResult(f, verifyResult.passed, summary)
                }
              }
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
    console.log("[FLOW:16] AgentExecutor.executeFull: yielding MESSAGE_COMPLETE (contentLen=" + lastResponse.length + ")")

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

  private recordToolInScratchpad(entry: { name: string; args: Record<string, unknown> }, result: unknown): void {
    if (!this.scratchpad) return
    if (entry.name === 'read_file') {
      const path = (entry.args.path || entry.args.file) as string || ''
      if (path) {
        const content = typeof result === 'string' ? result : (result as any)?.data ?? ''
        const lineCount = typeof content === 'string' && content ? content.split('\n').length : 0
        const charCount = typeof content === 'string' ? content.length : 0
        const summary = content ? `read (${lineCount} lines, ${charCount} chars)` : 'read'
        this.scratchpad.recordFileExamination(path, summary)
      }
    } else if (entry.name === 'write_file' || entry.name === 'edit_file') {
      const path = (entry.args.path || entry.args.file) as string || ''
      if (path) {
        const oldContent = (entry.args.old_string || entry.args.old_content) as string || ''
        const newContent = (entry.args.content || entry.args.new_string) as string || ''
        this.scratchpad.recordFileModification(path, oldContent, newContent)
      }
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
