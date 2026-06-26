import type { Task, TaskOutput, TaskInput } from "./types"
import type { ExecutionSession } from "./ExecutionSession"
import type { TaskExecutor } from "./Scheduler"
import { ToolRegistry } from "../tools/registry/ToolRegistry"
import { ToolExecutionPipeline } from "../tools/execution/ToolExecutionPipeline"
import { PermissionEngine } from "../permissions/PermissionEngine"
import type { ToolContext } from "../tools/core/ToolContext"
import type { ToolResult } from "../tools/core/ToolResult"

const DEFAULT_TYPE_TO_TOOL: Record<string, string> = {
  code: "write_file",
  browser: "browser_navigate",
  research: "web_search",
  verify: "grep_files",
  design: "design_create_artifact",
  memory: "query_graph",
  runtime: "run_command",
  vision: "browser_screenshot",
  manager: "delegate_subtask",
}

export interface ToolTaskExecutorConfig {
  registry: ToolRegistry
  pipeline?: ToolExecutionPipeline
  permissionEngine?: PermissionEngine
  typeToTool?: Record<string, string>
  defaultRole?: string
  defaultCwd?: string
}

export class ToolTaskExecutor implements TaskExecutor {
  private registry: ToolRegistry
  private pipeline: ToolExecutionPipeline | null
  private permissionEngine: PermissionEngine | null
  private typeToTool: Record<string, string>
  private defaultRole: string
  private defaultCwd: string

  constructor(config: ToolTaskExecutorConfig) {
    this.registry = config.registry
    this.pipeline = config.pipeline ?? null
    this.permissionEngine = config.permissionEngine ?? null
    this.typeToTool = { ...DEFAULT_TYPE_TO_TOOL, ...config.typeToTool }
    this.defaultRole = config.defaultRole ?? "assistant"
    this.defaultCwd = config.defaultCwd ?? ""
  }

  async executeTask(task: Task, session: ExecutionSession): Promise<Task> {
    const toolName = this.resolveToolName(task)
    if (!toolName) {
      task.outputs.push({
        name: "result",
        type: "text",
        value: `Task "${task.title}" completed (no tool)`,
      })
      task.completedAt = Date.now()
      return task
    }

    const tool = this.registry.resolve(toolName)
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found for task "${task.id}"`)
    }

    const toolInput = this.buildToolInput(task)
    const toolCtx = this.buildToolContext(task, session)

    if (this.pipeline) {
      const result = await this.pipeline.execute(toolName, toolInput, toolCtx, {
        skipPermission: true,
      })

      if (result.isError && result.error) {
        throw new Error(result.error)
      }

      this.applyToolResult(task, result)
    } else {
      const permResult = await tool.permissions(toolInput)
      if (permResult.behavior === "deny") {
        throw new Error(
          `Permission denied for tool "${toolName}": ${permResult.message ?? "no reason"}`,
        )
      }

      const result = await tool.execute(toolCtx, toolInput)

      if (result.isError && result.error) {
        throw new Error(result.error)
      }

      this.applyToolResult(task, result)
    }

    task.completedAt = Date.now()
    return task
  }

  private resolveToolName(task: Task): string | null {
    if (task.metadata?.toolName && typeof task.metadata.toolName === "string") {
      return task.metadata.toolName
    }
    return this.typeToTool[task.type] ?? null
  }

  private buildToolInput(task: Task): Record<string, unknown> {
    if (task.metadata?.toolInput && typeof task.metadata.toolInput === "object") {
      return task.metadata.toolInput as Record<string, unknown>
    }

    const input: Record<string, unknown> = {}
    for (const taskInput of task.inputs) {
      input[taskInput.name] = taskInput.value
    }
    return input
  }

  private buildToolContext(task: Task, session: ExecutionSession): ToolContext {
    const traceId = session.id
    return {
      role: (task.metadata?.toolRole as string) ?? this.defaultRole,
      executionMode: task.metadata?.executionMode as string | undefined,
      provider: task.metadata?.provider as string | undefined,
      model: task.metadata?.model as string | undefined,
      signal: task.metadata?.abortSignal as AbortSignal | undefined,
      traceId,
      cwd: (task.metadata?.cwd as string) ?? this.defaultCwd,
      env: task.metadata?.env as Record<string, string> | undefined,
    }
  }

  private applyToolResult(task: Task, result: ToolResult): void {
    if (result.data !== undefined && result.data !== null) {
      const dataStr = typeof result.data === "string" ? result.data : JSON.stringify(result.data)
      task.outputs.push({
        name: "result",
        type: "tool_result",
        value: dataStr,
        metadata: result.meta as Record<string, unknown> | undefined,
      })
    }

    if (result.meta) {
      task.metadata["__toolMeta__"] = result.meta
    }

    if (result.newMessages) {
      task.metadata["__newMessages__"] = result.newMessages
    }
  }
}
