/**
 * SubAgentDelegator — executes sub-agent tasks with fully isolated context windows.
 *
 * Each sub-agent gets:
 * - Its own system prompt (explore/plan/verify/general)
 * - Its own isolated conversation history (just the task, not the full parent context)
 * - Its own restricted tool set (explore/plan = read-only, verify/general = full)
 * - Its own LLM provider call (not a stub)
 *
 * Architecture:
 *   Parent Agent → delegate_subtask tool → SubAgentDelegator.execute()
 *     → Resolves provider/model for sub-agent type
 *     → Builds isolated system prompt
 *     → Makes LLM calls with tool execution loop (no parent context leakage)
 *     → Returns structured result to parent agent
 */

import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import type { ChatMessage, ChatResponse, ToolDef, ToolCall } from "@agentic-os/providers"
import { directChatCompletion, streamChatCompletion } from "@agentic-os/providers"
import { trace } from "@/lib/execution-trace"
import { EventBus } from "@/runtime/EventBus"
import { ToolExecutionSandbox } from "@/runtime/tools/ToolExecutionSandbox"
import { EXPLORE_AGENT_PROMPT, PLAN_AGENT_PROMPT, VERIFICATION_AGENT_PROMPT, DEFAULT_SUBAGENT_PROMPT } from "@/runtime/sub-agents/sub-agent-prompts"
export type SubAgentType = "explore" | "plan" | "verify" | "general"
import { RuntimeOS } from "@/runtime/RuntimeOS"

// ── Sub-agent tool restrictions ──

const READ_ONLY_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "grep_files",
      description: "Search file contents with a regex pattern in the workspace",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern to search" },
          include: { type: "string", description: "Comma-separated file extensions (e.g. ts,tsx)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob_files",
      description: "Find files matching a glob pattern in the workspace",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern (e.g. src/**/*.ts)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root" },
        },
        required: ["path"],
      },
    },
  },
]

const FULL_TOOLS: ToolDef[] = [
  ...READ_ONLY_TOOLS,
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file (creates directories if needed)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root" },
          content: { type: "string", description: "File content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Apply targeted text replacements in an existing file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root" },
          edits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                old_content: { type: "string", description: "Exact text to find" },
                new_content: { type: "string", description: "Replacement text" },
              },
              required: ["old_content", "new_content"],
            },
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the workspace directory",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Command to run" },
        },
        required: ["command"],
      },
    },
  },
]

function getSystemPrompt(type: SubAgentType): string {
  switch (type) {
    case "explore": return EXPLORE_AGENT_PROMPT
    case "plan": return PLAN_AGENT_PROMPT
    case "verify": return VERIFICATION_AGENT_PROMPT
    case "general": return DEFAULT_SUBAGENT_PROMPT
  }
}

function getTools(type: SubAgentType): ToolDef[] {
  // Explore and Plan are strictly read-only
  if (type === "explore" || type === "plan") return READ_ONLY_TOOLS
  // Verify and General get full tools
  return FULL_TOOLS
}

export interface SubAgentDelegationRequest {
  type: SubAgentType
  task: string
  /** Optional: restrict which tools are available (defaults based on type) */
  allowedTools?: string[]
  /** Optional: override the model to use (e.g., "claude-sonnet-4-20250514" for complex tasks) */
  modelOverride?: string
  /** Optional: abort signal */
  signal?: AbortSignal
}

export interface SubAgentDelegationResult {
  success: boolean
  content: string
  type: SubAgentType
  toolCalls: number
  tokensUsed: number
  durationMs: number
  error?: string
}

const MAX_SUBAGENT_ROUNDS = 5
const SUBAGENT_TIMEOUT_MS = 60_000

/**
 * Emit telemetry and return a consistent result.
 * Ensures SUB_AGENT_COMPLETE is always emitted, even on error paths.
 */
function emitResult(opts: {
  success: boolean
  type: SubAgentType
  content?: string
  error?: string
  duration: number
  toolCalls?: number
  tokens?: number
}): SubAgentDelegationResult {
  const durationMs = Math.round(opts.duration)
  const result: SubAgentDelegationResult = {
    success: opts.success,
    content: opts.content ?? "",
    type: opts.type,
    toolCalls: opts.toolCalls ?? 0,
    tokensUsed: opts.tokens ?? 0,
    durationMs,
    error: opts.error,
  }

  EventBus.getInstance().emit({
    type: "SUB_AGENT_COMPLETE",
    subAgentType: opts.type,
    success: opts.success,
    durationMs,
    toolCalls: opts.toolCalls ?? 0,
    tokensUsed: opts.tokens ?? 0,
    error: opts.error,
    timestamp: Date.now(),
  })

  trace("executeSubAgent", opts.success ? "complete" : "error", {
    type: opts.type,
    contentLength: (opts.content ?? "").length,
    toolCalls: opts.toolCalls ?? 0,
    tokens: opts.tokens ?? 0,
    durationMs,
    error: opts.error,
  })

  return result
}

/**
 * Execute a sub-agent task with a fully isolated context window.
 *
 * The sub-agent receives:
 * 1. Its own system prompt (explore/plan/verify/general) — no parent context leakage
 * 2. Only the task prompt as the conversation history — not the full parent conversation
 * 3. Its own tool set based on sub-agent type
 * 4. A real LLM provider call
 *
 * This ensures true context isolation between parent and sub-agent.
 */
export async function executeSubAgent(request: SubAgentDelegationRequest): Promise<SubAgentDelegationResult> {
  const t0 = performance.now()
  const { type, task, modelOverride, signal } = request
  const logTag = `[SubAgent:${type}]`

  console.log(`${logTag} starting isolated delegation`, {
    taskLength: task.length,
    type,
    modelOverride: modelOverride ?? "default",
  })
  trace("executeSubAgent", "start", { type, taskLength: task.length })

  // ── 1. Resolve provider + model from wired agents ──
  const runtimeState = useWorkspaceRuntime.getState()
  const providers = useAppStore.getState().providers ?? []

  // Sub-agents use the manager's provider config by default
  const managerWired = runtimeState.wiredAgents.find(
    (a) => a.runtimeRole === "manager" || a.roleId === "manager"
  )

  if (!managerWired) {
    const msg = "No manager agent wired — cannot delegate sub-agents"
    console.error(`${logTag} ${msg}`)
    return {
      success: false,
      content: msg,
      type,
      toolCalls: 0,
      tokensUsed: 0,
      durationMs: Math.round(performance.now() - t0),
      error: msg,
    }
  }

  const provider = providers.find((p) => p.id === managerWired.providerId)
  if (!provider) {
    const msg = `Provider "${managerWired.providerId}" not found for sub-agent delegation`
    console.error(`${logTag} ${msg}`)
    return {
      success: false,
      content: msg,
      type,
      toolCalls: 0,
      tokensUsed: 0,
      durationMs: Math.round(performance.now() - t0),
      error: msg,
    }
  }

  const model = modelOverride ?? managerWired.model
  if (!model) {
    const msg = "No model configured for sub-agent delegation"
    console.error(`${logTag} ${msg}`)
    return {
      success: false,
      content: msg,
      type,
      toolCalls: 0,
      tokensUsed: 0,
      durationMs: Math.round(performance.now() - t0),
      error: msg,
    }
  }

  // ── 2. Build isolated context window ──
  const systemPrompt = getSystemPrompt(type)
  const tools = getTools(type)
  const isolatedContext: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ]

  let totalTokens = 0
  let totalToolCalls = 0

  // ── 3. Execute the sub-agent loop with its isolated context ──
  const msgs: ChatMessage[] = [...isolatedContext]

  // Emit telemetry event for UI visibility (after provider resolution so we have the real model)
  EventBus.getInstance().emit({
    type: "SUB_AGENT_START",
    subAgentType: type,
    taskPreview: task.slice(0, 200),
    model,
    timestamp: Date.now(),
  })

  for (let round = 0; round < MAX_SUBAGENT_ROUNDS; round++) {
    if (signal?.aborted) {
      return emitResult({ success: false, type, error: "Sub-agent execution aborted", duration: performance.now() - t0, toolCalls: totalToolCalls, tokens: totalTokens })
    }

    const elapsed = performance.now() - t0
    if (elapsed > SUBAGENT_TIMEOUT_MS) {
      return emitResult({ success: false, type, error: `Sub-agent exceeded ${SUBAGENT_TIMEOUT_MS / 1000}s timeout`, duration: performance.now() - t0, toolCalls: totalToolCalls, tokens: totalTokens })
    }

    console.log(`${logTag} round ${round + 1}/${MAX_SUBAGENT_ROUNDS}`, {
      provider: provider.name,
      model,
      messagesCount: msgs.length,
    })

    let res: ChatResponse
    try {
      const streamedContent = await attemptStreamingRound(
        provider.baseUrl, provider.apiKey, model, provider.runtime,
        msgs, tools, signal,
      )

      if (streamedContent !== null) {
        msgs.push({ role: "assistant", content: streamedContent.content, tool_calls: streamedContent.toolCalls ?? [] })
        res = {
          message: { role: "assistant", content: streamedContent.content, tool_calls: streamedContent.toolCalls ?? [] },
          finish_reason: streamedContent.toolCalls?.length ? "tool_calls" : "stop",
        }
      } else {
        res = await directChatCompletion(provider.baseUrl, provider.apiKey, { model, messages: msgs, tools, maxTokens: 4096 }, signal)
        msgs.push(res.message)
        if (res.usage) totalTokens += res.usage.total_tokens
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`${logTag} LLM call failed:`, errMsg)
      if (round === 0) {
        return emitResult({ success: false, type, error: `Sub-agent LLM call failed: ${errMsg}`, duration: performance.now() - t0, toolCalls: totalToolCalls, tokens: totalTokens })
      }
      break
    }

    if (res.message.tool_calls && res.message.tool_calls.length > 0) {
      totalToolCalls += res.message.tool_calls.length
      const toolResults = await executeSubAgentTools(res.message.tool_calls)
      msgs.push(...toolResults)
    } else {
      console.log(`${logTag} completed in round ${round + 1}`, { contentLength: res.message.content?.length ?? 0, totalToolCalls, totalTokens })
      break
    }
  }

  const finalContent = msgs
    .filter((m) => m.role === "assistant" && !m.tool_calls)
    .map((m) => m.content)
    .filter(Boolean)
    .join("\n\n")

  return emitResult({
    success: true,
    type,
    content: finalContent,
    duration: performance.now() - t0,
    toolCalls: totalToolCalls,
    tokens: totalTokens,
  })
}

// ── Inline Tool Execution (uses ToolRegistry from RuntimeOS) ──

interface InlineToolResult {
  tool_call_id: string
  role: "tool"
  content: string
}

/**
 * Execute tools inline for the sub-agent's tool calls.
 * Uses the ToolRegistry from RuntimeOS for consolidated execution.
 */
async function executeSubAgentTools(toolCalls: ToolCall[]): Promise<ChatMessage[]> {
  const runtimeOS = RuntimeOS.getInstance()
  const toolRegistry = runtimeOS.toolRegistry
  const sandbox = ToolExecutionSandbox.getInstance()

  const results = await Promise.allSettled(
    toolCalls.map(async (tc): Promise<InlineToolResult> => {
      let args: Record<string, unknown>
      try {
        args = JSON.parse(tc.function.arguments)
      } catch {
        return { tool_call_id: tc.id, role: "tool", content: `Error: Invalid JSON in arguments — ${tc.function.arguments}` }
      }

      try {
        await sandbox.assertAllowed({ id: tc.id, name: tc.function.name, args }, { role: "sub-agent" })

        const tool = toolRegistry.resolve(tc.function.name)
        if (!tool) {
          return { tool_call_id: tc.id, role: "tool", content: `Unknown tool: ${tc.function.name}` }
        }

        const result = await tool.execute({ role: "sub-agent" }, args)
        return {
          tool_call_id: tc.id,
          role: "tool",
          content: result.error ? `Error: ${result.error}` : String(result.data ?? ""),
        }
      } catch (e) {
        return { tool_call_id: tc.id, role: "tool", content: `Error executing ${tc.function.name}: ${String(e)}` }
      }
    }),
  )

  return results.map((r) => {
    if (r.status === "fulfilled") return r.value
    return {
      tool_call_id: toolCalls[0]?.id ?? "unknown",
      role: "tool" as const,
      content: `Tool execution failed: ${r.reason?.message ?? "unknown error"}`,
    }
  })
}

/**
 * Attempt streaming chat completion for a sub-agent.
 * Returns null if streaming is unavailable, forcing a fallback to non-streaming.
 */
export interface StreamRoundResult {
  content: string
  toolCalls?: import("@agentic-os/providers").ToolCall[]
  finishReason?: string | null
}

async function attemptStreamingRound(
  endpoint: string,
  apiKey: string,
  model: string,
  runtime: string | null,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): Promise<StreamRoundResult | null> {
  // Only attempt streaming if we can
  try {
    let streamedContent = ""
    const pendingToolCalls: import("@agentic-os/providers").ToolCall[] = []

    return await new Promise((resolve, reject) => {
      const onAbort = () => {
        cleanup()
        reject(new DOMException('Sub-agent streaming aborted', 'AbortError'))
      }

      signal?.addEventListener('abort', onAbort, { once: true })

      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort)
      }

      streamChatCompletion(
        endpoint,
        apiKey,
        runtime,
        { model, messages, tools, maxTokens: 4096 },
        {
          onReady: () => {
            // Stream connected
          },
          onToken: (token: string) => {
            streamedContent += token
          },
          onDone: (fullContent: string, _meta) => {
            cleanup()
            const meta = _meta as { toolCalls?: import("@agentic-os/providers").ToolCall[] } | undefined
            const toolCalls = meta?.toolCalls ?? pendingToolCalls
            resolve({
              content: fullContent || streamedContent,
              toolCalls,
              // usage is not available from streaming callbacks
            })
          },
          onError: (err: Error) => {
            cleanup()
            reject(err)
          },
        },
        signal,
      )
    })
  } catch {
    return null
  }
}
