import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { ReplayFrame } from "@/runtime/observability/ExecutionReplay"

export interface ResumedState {
  sessionId: string
  eventCount: number
  durationMs: number
  summary: string
  agents: ResumedAgent[]
  tools: ResumedTool[]
  browserActions: ResumedBrowserAction[]
  verifications: ResumedVerification[]
  timeline: ResumedEvent[]
}

export interface ResumedAgent {
  roleId: string
  roleName: string
  stepId: string
  status: "running" | "complete" | "error"
  startedAt?: number
  completedAt?: number
}

export interface ResumedTool {
  toolId: string
  toolName: string
  args: string
  status: "started" | "complete" | "error"
  result?: unknown
  error?: string
  durationMs?: number
}

export interface ResumedBrowserAction {
  action: string
  url?: string
  selector?: string
  tabId?: string
  timestamp: number
  durationMs?: number
}

export interface ResumedVerification {
  stepId?: string
  passed: boolean
  details: string[]
  recovered?: boolean
}

export interface ResumedEvent {
  type: string
  timestamp: number
  deltaMs: number
  summary: string
}

export class SessionResumer {
  resume(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): ResumedState {
    if (!events || events.length === 0) {
      return {
        sessionId: "",
        eventCount: 0,
        durationMs: 0,
        summary: "No events",
        agents: [],
        tools: [],
        browserActions: [],
        verifications: [],
        timeline: [],
      }
    }

    const first = events[0]
    const last = events[events.length - 1]
    const sessionId = first.event.executionId ?? ""
    const durationMs = last.frame.timestamp - first.frame.timestamp
    const summary = this.buildSummary(events)

    const agents = this.extractAgents(events)
    const tools = this.extractTools(events)
    const browserActions = this.extractBrowserActions(events)
    const verifications = this.extractVerifications(events)
    const timeline = this.buildTimeline(events)

    return {
      sessionId,
      eventCount: events.length,
      durationMs,
      summary,
      agents,
      tools,
      browserActions,
      verifications,
      timeline,
    }
  }

  private extractAgents(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): ResumedAgent[] {
    const agentMap = new Map<string, ResumedAgent>()

    for (const { event } of events) {
      if (event.type === "AGENT_ASSIGNED") {
        agentMap.set(event.roleId, {
          roleId: event.roleId,
          roleName: event.roleName,
          stepId: event.stepId,
          status: "running",
        })
      }
      if (event.type === "MESSAGE_COMPLETE") {
        for (const [, agent] of agentMap) {
          if (agent.status === "running") {
            agent.status = "complete"
          }
        }
      }
      if (event.type === "EXECUTION_FAILED") {
        for (const [, agent] of agentMap) {
          if (agent.status === "running") {
            agent.status = "error"
          }
        }
      }
    }

    return Array.from(agentMap.values())
  }

  private extractTools(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): ResumedTool[] {
    const toolMap = new Map<string, ResumedTool>()

    for (const { event } of events) {
      if (event.type === "TOOL_START") {
        toolMap.set(event.toolId, {
          toolId: event.toolId,
          toolName: event.toolName,
          args: typeof event.args === "string" ? event.args : JSON.stringify(event.args),
          status: "started",
        })
      }
      if (event.type === "TOOL_COMPLETE") {
        const existing = toolMap.get(event.toolId)
        if (existing) {
          existing.status = "complete"
          existing.result = event.result
          existing.durationMs = event.durationMs
        }
      }
      if (event.type === "TOOL_ERROR") {
        const existing = toolMap.get(event.toolId)
        if (existing) {
          existing.status = "error"
          existing.error = event.error
          existing.durationMs = event.durationMs
        }
      }
    }

    return Array.from(toolMap.values())
  }

  private extractBrowserActions(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): ResumedBrowserAction[] {
    const actions: ResumedBrowserAction[] = []

    for (const { event } of events) {
      switch (event.type) {
        case "BROWSER_NAVIGATE":
          actions.push({ action: "navigate", url: event.url, tabId: event.tabId, timestamp: event.timestamp, durationMs: event.durationMs })
          break
        case "BROWSER_CLICK":
          actions.push({ action: "click", selector: event.selector, tabId: event.tabId, timestamp: event.timestamp, durationMs: event.durationMs })
          break
        case "BROWSER_TYPE":
          actions.push({ action: "type", selector: event.selector, tabId: event.tabId, timestamp: event.timestamp, durationMs: event.durationMs })
          break
        case "BROWSER_SCROLL":
          actions.push({ action: "scroll", tabId: event.tabId, timestamp: event.timestamp })
          break
        case "BROWSER_SCREENSHOT":
          actions.push({ action: "screenshot", tabId: event.tabId, timestamp: event.timestamp, durationMs: event.durationMs })
          break
        case "BROWSER_TAB_CREATED":
          actions.push({ action: "tab_created", url: event.url, tabId: event.tabId, timestamp: event.timestamp })
          break
        case "BROWSER_TAB_CLOSED":
          actions.push({ action: "tab_closed", tabId: event.tabId, timestamp: event.timestamp })
          break
      }
    }

    return actions
  }

  private extractVerifications(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): ResumedVerification[] {
    const verifications: ResumedVerification[] = []

    for (const { event } of events) {
      if (event.type === "VERIFY_PASSED") {
        verifications.push({
          stepId: undefined,
          passed: true,
          details: event.details,
          recovered: event.recovered,
        })
      }
      if (event.type === "VERIFY_FAILED") {
        const details: string[] = []
        if (event.lintErrors > 0) details.push(`${event.lintErrors} lint errors`)
        if (event.typeErrors > 0) details.push(`${event.typeErrors} type errors`)
        if (event.buildErrors > 0) details.push(`${event.buildErrors} build errors`)
        if (event.testFailures > 0) details.push(`${event.testFailures} test failures`)
        verifications.push({
          stepId: undefined,
          passed: false,
          details,
        })
      }
    }

    return verifications
  }

  private buildTimeline(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): ResumedEvent[] {
    return events.map(({ event, frame }) => ({
      type: event.type,
      timestamp: frame.timestamp,
      deltaMs: frame.deltaMs,
      summary: this.eventSummary(event),
    }))
  }

  private buildSummary(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): string {
    const types = new Set(events.map((e) => e.event.type))
    const toolCalls = events.filter((e) => e.event.type === "TOOL_START").length
    const agentAssignments = events.filter((e) => e.event.type === "AGENT_ASSIGNED").length
    const errors = events.filter((e) => e.event.type === "TOOL_ERROR" || e.event.type === "EXECUTION_FAILED").length

    const parts: string[] = []
    if (agentAssignments > 0) parts.push(`${agentAssignments} agent(s)`)
    if (toolCalls > 0) parts.push(`${toolCalls} tool call(s)`)
    if (errors > 0) parts.push(`${errors} error(s)`)

    return parts.length > 0 ? parts.join(", ") : `${events.length} events`
  }

  private eventSummary(event: ExecutionEvent): string {
    switch (event.type) {
      case "AGENT_ASSIGNED":
        return `${event.roleName} assigned`
      case "TOOL_START":
        return `Tool: ${event.toolName}`
      case "TOOL_COMPLETE":
        return `Tool complete: ${event.toolName}`
      case "TOOL_ERROR":
        return `Tool error: ${event.toolName}`
      case "FILE_EDIT":
        return `Edited: ${event.path.split("/").pop()}`
      case "COMMAND_START":
        return `Running: ${event.command.slice(0, 40)}`
      case "COMMAND_COMPLETE":
        return `Command exit: ${event.exitCode}`
      case "BROWSER_NAVIGATE":
        return `Navigated to: ${event.url}`
      case "BROWSER_CLICK":
        return `Clicked: ${event.selector}`
      case "VERIFY_PASSED":
        return `Verification passed`
      case "VERIFY_FAILED":
        return `Verification failed`
      case "EXECUTION_COMPLETE":
        return `Execution completed`
      case "EXECUTION_FAILED":
        return `Execution failed: ${event.error?.slice(0, 60)}`
      default:
        return event.type
    }
  }

  canResume(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): boolean {
    if (!events || events.length === 0) return false
    const hasExecutionCreated = events.some((e) => e.event.type === "EXECUTION_CREATED")
    const isComplete = events.some((e) =>
      e.event.type === "EXECUTION_COMPLETE" ||
      e.event.type === "EXECUTION_FAILED" ||
      e.event.type === "GOAL_ACHIEVED"
    )
    return hasExecutionCreated && !isComplete
  }
}
