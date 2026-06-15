import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { ReplayFrame } from "@/runtime/observability/ExecutionReplay"

export interface ReplaySearchQuery {
  text?: string
  eventTypes?: string[]
  dateFrom?: number
  dateTo?: number
  agents?: string[]
  tools?: string[]
  hasErrors?: boolean
  hasVerifications?: boolean
  hasBrowserActions?: boolean
}

export interface ReplaySearchResult {
  sessionId: string
  summary: string
  eventCount: number
  startTime: number
  endTime: number
  matchCount: number
  matchedEvents: string[]
}

export class ReplaySearch {
  searchSessions(
    sessions: Record<string, { summary?: string; startTime?: number; endTime?: number; eventCount?: number }>,
    query: string
  ): ReplaySearchResult[] {
    const q = query.toLowerCase().trim()
    if (!q) return []

    const results: ReplaySearchResult[] = []
    for (const [id, meta] of Object.entries(sessions)) {
      const summary = (meta.summary ?? "").toLowerCase()
      if (summary.includes(q)) {
        results.push({
          sessionId: id,
          summary: meta.summary ?? "",
          eventCount: meta.eventCount ?? 0,
          startTime: meta.startTime ?? 0,
          endTime: meta.endTime ?? 0,
          matchCount: 1,
          matchedEvents: ["summary"],
        })
      }
    }
    return results.sort((a, b) => b.startTime - a.startTime).slice(0, 50)
  }

  filterSessions(
    sessions: Record<string, {
      startTime?: number
      endTime?: number
      summary?: string
      eventCount?: number
    }>,
    query: ReplaySearchQuery
  ): string[] {
    let ids = Object.keys(sessions)

    if (query.dateFrom) {
      ids = ids.filter((id) => (sessions[id].startTime ?? 0) >= query.dateFrom!)
    }
    if (query.dateTo) {
      ids = ids.filter((id) => (sessions[id].endTime ?? 0) <= query.dateTo!)
    }
    if (query.text) {
      const q = query.text.toLowerCase()
      ids = ids.filter((id) => (sessions[id].summary ?? "").toLowerCase().includes(q))
    }

    return ids.sort((a, b) => (sessions[b].startTime ?? 0) - (sessions[a].startTime ?? 0)).slice(0, 100)
  }

  findEvents(
    events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>,
    filter: ReplaySearchQuery
  ): Array<{ event: ExecutionEvent; frame: ReplayFrame }> {
    let result = events

    if (filter.eventTypes && filter.eventTypes.length > 0) {
      result = result.filter((e) => filter.eventTypes!.includes(e.event.type))
    }
    if (filter.dateFrom) {
      result = result.filter((e) => e.frame.timestamp >= filter.dateFrom!)
    }
    if (filter.dateTo) {
      result = result.filter((e) => e.frame.timestamp <= filter.dateTo!)
    }
    if (filter.hasErrors) {
      result = result.filter((e) =>
        e.event.type === "TOOL_ERROR" || e.event.type === "EXECUTION_FAILED" || e.event.type === "COMMAND_ERROR"
      )
    }
    if (filter.hasVerifications) {
      result = result.filter((e) => e.event.type === "VERIFY_PASSED" || e.event.type === "VERIFY_FAILED")
    }
    if (filter.hasBrowserActions) {
      result = result.filter((e) =>
        e.event.type.startsWith("BROWSER_")
      )
    }
    if (filter.tools && filter.tools.length > 0) {
      result = result.filter((e) => {
        if (e.event.type === "TOOL_START" || e.event.type === "TOOL_COMPLETE" || e.event.type === "TOOL_ERROR") {
          return filter.tools!.includes((e.event as any).toolName)
        }
        return false
      })
    }
    if (filter.agents && filter.agents.length > 0) {
      result = result.filter((e) => {
        if (e.event.type === "AGENT_ASSIGNED") {
          return filter.agents!.includes((e.event as any).roleId)
        }
        return false
      })
    }
    if (filter.text) {
      const q = filter.text.toLowerCase()
      result = result.filter((e) => JSON.stringify(e.event).toLowerCase().includes(q))
    }

    return result
  }

  getEventTypes(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): string[] {
    const types = new Set(events.map((e) => e.event.type))
    return Array.from(types).sort()
  }

  getAgents(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): string[] {
    const agents = new Set<string>()
    for (const { event } of events) {
      if (event.type === "AGENT_ASSIGNED") {
        agents.add(event.roleId)
      }
    }
    return Array.from(agents).sort()
  }

  getTools(events: Array<{ event: ExecutionEvent; frame: ReplayFrame }>): string[] {
    const tools = new Set<string>()
    for (const { event } of events) {
      if (event.type === "TOOL_START" || event.type === "TOOL_COMPLETE" || event.type === "TOOL_ERROR") {
        tools.add(event.toolName)
      }
    }
    return Array.from(tools).sort()
  }
}
