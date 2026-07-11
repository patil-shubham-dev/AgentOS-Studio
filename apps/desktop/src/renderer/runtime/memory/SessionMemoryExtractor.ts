/**
 * SessionMemoryExtractor
 *
 * Analyzes an ExecutionSession's events after completion and extracts
 * structured session summaries. These summaries are:
 *   1. Written to `.agentic/memory/sessions/` as markdown files
 *   2. Injected into the MemoryArchitecture as long-term memory entries
 *   3. Made available for cross-session context injection on next startup
 *
 * This provides Claude Code Desktop-level cross-session context continuity.
 *
 * Extraction targets:
 *   - Objective and outcome
 *   - Key decisions with rationale
 *   - Files modified with change summaries
 *   - Patterns and conventions discovered
 *   - Errors encountered and fixes applied
 *   - Pending work and follow-up tasks
 */

import { MemoryArchitecture } from "./unified/MemoryArchitecture"
import { EventBus } from "@/runtime/EventBus"
import type { SessionCompletedEvent } from "@/runtime/RuntimeTypes"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"

// ── Types ──

export interface SessionSummary {
  /** When the session started */
  date: string
  /** Session identifier */
  sessionId: string
  /** Correlation ID or execution ID */
  executionId: string
  /** The user's original input */
  objective: string
  /** Session duration in human-readable format */
  duration: string
  /** Duration in ms */
  durationMs: number
  /** How many events were processed */
  eventCount: number
  /** How many files were edited */
  filesModified: number
  /** How many tool calls were made */
  toolCalls: number
  /** Key decisions extracted from the session */
  keyDecisions: string[]
  /** Files that were modified */
  filesChanged: { path: string; summary: string; changeType: "create" | "modify" | "delete" }[]
  /** Patterns or conventions discovered */
  patternsDiscovered: string[]
  /** Errors encountered */
  errorsEncountered: string[]
  /** Learnings and knowledge extracted */
  learnings: string[]
  /** Pending work items */
  pendingWork: string[]
  /** The final response content summary */
  outcome: string
}

// ── Markdown template ──

const SESSION_MEMORY_TEMPLATE = `# Session: {{objective}}

{{#if outcome}}
## Outcome
{{outcome}}
{{/if}}

{{#if keyDecisions.length}}
## Key Decisions
{{#each keyDecisions}}
- {{this}}
{{/each}}
{{/if}}

{{#if filesChanged.length}}
## Files Modified
| File | Type | Summary |
|------|------|---------|
{{#each filesChanged}}
| \`{{path}}\` | {{changeType}} | {{summary}} |
{{/each}}
{{/if}}

{{#if patternsDiscovered.length}}
## Patterns Discovered
{{#each patternsDiscovered}}
- {{this}}
{{/each}}
{{/if}}

{{#if errorsEncountered.length}}
## Errors Encountered
{{#each errorsEncountered}}
- {{this}}
{{/each}}
{{/if}}

{{#if learnings.length}}
## Learnings
{{#each learnings}}
- {{this}}
{{/each}}
{{/if}}

{{#if pendingWork.length}}
## Pending Work
{{#each pendingWork}}
- [ ] {{this}}
{{/each}}
{{/if}}

---
*Session: {{sessionId}} | Duration: {{duration}} | Events: {{eventCount}} | Files: {{filesModified}} | Date: {{date}}*
`

// ── Simple template engine (avoids adding a dependency) ──

function renderTemplate(template: string, data: Record<string, unknown>): string {
  let result = template

  // {{key}} replacements
  result = result.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g, (_match, key) => {
    const value = key.split(".").reduce((obj: unknown, k: string) => {
      if (obj && typeof obj === "object" && k in (obj as Record<string, unknown>)) {
        return (obj as Record<string, unknown>)[k]
      }
      return ""
    }, data)
    return String(value ?? "")
  })

  // {{#if key}}...{{/if}} blocks
  result = result.replace(/\{\{#if ([a-zA-Z_][a-zA-Z0-9_.]*)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, key, content: string) => {
    const value = key.split(".").reduce((obj: unknown, k: string) => {
      if (obj && typeof obj === "object" && k in (obj as Record<string, unknown>)) {
        return (obj as Record<string, unknown>)[k]
      }
      return false
    }, data)
    if (value && (Array.isArray(value) ? value.length > 0 : value)) {
      return renderTemplate(content, data)
    }
    return ""
  })

  // {{#each key}}...{{/each}} blocks
  result = result.replace(/\{\{#each ([a-zA-Z_][a-zA-Z0-9_.]*)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_match, key, content: string) => {
    const arr = key.split(".").reduce((obj: unknown, k: string) => {
      if (obj && typeof obj === "object" && k in (obj as Record<string, unknown>)) {
        return (obj as Record<string, unknown>)[k]
      }
      return []
    }, data)
    if (Array.isArray(arr)) {
      return arr.map((item: unknown) => {
        if (Array.isArray(item)) {
          // {{this}} for simple arrays
          return content.replace(/\{\{this\}\}/g, String(item))
        }
        if (typeof item === "object" && item !== null) {
          // {{field}} for object arrays
          let rendered = content
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
            rendered = rendered.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v ?? ""))
          }
          return rendered
        }
        return content.replace(/\{\{this\}\}/g, String(item))
      }).join("")
    }
    return ""
  })

  return result
}

// ── SessionMemoryExtractor ──

export class SessionMemoryExtractor {
  private static instance: SessionMemoryExtractor
  private memoryArch: MemoryArchitecture
  private subscribed = false
  private unsubscribe: (() => void) | null = null

  private constructor() {
    this.memoryArch = MemoryArchitecture.getInstance()
  }

  static getInstance(): SessionMemoryExtractor {
    if (!SessionMemoryExtractor.instance) {
      SessionMemoryExtractor.instance = new SessionMemoryExtractor()
    }
    return SessionMemoryExtractor.instance
  }

  /**
   * Subscribe to the EventBus for SESSION_COMPLETED events.
   * Once subscribed, session memory extraction happens automatically
   * whenever an execution finishes — no direct calls needed.
   * Safe to call multiple times (only subscribes once).
   * Returns the unsubscribe function.
   */
  startListening(): () => void {
    if (this.subscribed) {
      return this.unsubscribe ?? (() => {})
    }

    this.subscribed = true
    this.unsubscribe = EventBus.getInstance().on<SessionCompletedEvent>(
      "SESSION_COMPLETED",
      async (event) => {
        try {
          const session = { id: event.sessionId, input: event.input }
          const summary = await this.extract(session, event.events, event.durationMs)
          summary.eventCount = event.eventCount
          await this.store(summary, event.rootPath)

          const filesCount = summary.filesChanged.length
          const decisionsCount = summary.keyDecisions.length
          const errorsCount = summary.errorsEncountered.length
          if (filesCount > 0 || decisionsCount > 0 || errorsCount > 0) {
            console.log(
              `[SessionMemoryExtractor] ✓ Session memory stored: ${filesCount} file(s), ` +
              `${decisionsCount} decision(s), ${errorsCount} error(s)`
            )
          }
        } catch (err) {
          // Memory extraction is best-effort — never fail the session for it
          console.warn('[SessionMemoryExtractor] Extraction failed (non-fatal):', err)
        }
      },
    )

    return this.unsubscribe
  }

  /**
   * Stop listening for SESSION_COMPLETED events.
   */
  stopListening(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.subscribed = false
  }

  /**
   * Extract a structured summary from a completed session's events.
   * Called automatically after each execution completes.
   */
  async extract(
    session: { id: string; input?: string },
    events: ExecutionEvent[],
    durationMs: number,
  ): Promise<SessionSummary> {
    const objective = session.input ?? ""
    const date = new Date().toISOString().split("T")[0]
    const hours = Math.floor(durationMs / 3600000)
    const minutes = Math.floor((durationMs % 3600000) / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)

    const duration = hours > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : minutes > 0
        ? `${minutes}m ${seconds}s`
        : `${seconds}s`

    const summary: SessionSummary = {
      date,
      sessionId: session.id,
      executionId: session.id,
      objective: objective.slice(0, 500),
      duration,
      durationMs,
      eventCount: events.length,
      filesModified: 0,
      toolCalls: 0,
      keyDecisions: [],
      filesChanged: [],
      patternsDiscovered: [],
      errorsEncountered: [],
      learnings: [],
      pendingWork: [],
      outcome: "",
    }

    // Analyze events to extract structured information
    for (const event of events) {
      this.analyzeEvent(event, summary)
    }

    return summary
  }

  /**
   * Store a session summary:
   *   1. Write to `.agentic/memory/sessions/` as markdown
   *   2. Inject relevant parts into MemoryArchitecture as long-term memories
   *   3. Return the markdown content
   */
  async store(summary: SessionSummary, rootPath?: string): Promise<string> {
    // Generate markdown content
    const markdown = renderTemplate(SESSION_MEMORY_TEMPLATE, summary as unknown as Record<string, unknown>)

    // 1. Write to filesystem if we have a root path
    if (rootPath) {
      await this.writeToFile(rootPath, summary.sessionId, markdown)
    }

    // 2. Inject into MemoryArchitecture as long-term memories
    await this.injectIntoMemory(summary)

    return markdown
  }

  /**
   * Load the last N session summaries from `.agentic/memory/sessions/`.
   * Returns the combined markdown content for injection into the system prompt.
   */
  async loadRecentSessions(rootPath: string, maxSessions = 5): Promise<string> {
    try {
      const sessionsDir = `${rootPath}/.agentic/memory/sessions`
      const fs = await import("@/lib/electron-api")
      let entries: { name: string }[]

      try {
        entries = await fs.readDir(sessionsDir)
      } catch {
        return ""
      }

      // Filter to markdown files, sort by name (which includes date), take last N
      const sessionFiles = entries
        .filter((e) => e.name?.endsWith(".md"))
        .sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""))
        .slice(0, maxSessions)

      if (sessionFiles.length === 0) return ""

      const contents: string[] = []
      for (const file of sessionFiles.reverse()) {
        const filePath = `${sessionsDir}/${file.name}`
        const content = await fs.readTextFile(filePath).catch(() => "")
        if (content) {
          contents.push(content)
        }
      }

      if (contents.length === 0) return ""

      return [
        "## Previous Sessions",
        "",
        "The following are summaries of recent sessions. Use them for continuity:",
        "",
        ...contents.map((c) => c.trim()).join("\n\n---\n\n"),
      ].join("\n")
    } catch {
      return ""
    }
  }

  // ── Private ──

  private analyzeEvent(event: ExecutionEvent, summary: SessionSummary): void {
    switch (event.type) {
      case "FILE_EDIT": {
        const e = event as ExecutionEvent & { path?: string; additions?: number; deletions?: number }
        if (e.path && !summary.filesChanged.some((f) => f.path === e.path)) {
          const changeType = (e as any).changeType ?? "modify"
          summary.filesChanged.push({
            path: e.path,
            summary: `+${e.additions ?? 0}/-${e.deletions ?? 0} lines`,
            changeType: changeType as "create" | "modify" | "delete",
          })
          summary.filesModified++
        }
        break
      }

      case "TOOL_COMPLETE": {
        const e = event as ExecutionEvent & { toolName?: string }
        if (e.toolName) summary.toolCalls++
        break
      }

      case "EXECUTION_FAILED": {
        const e = event as ExecutionEvent & { error?: string }
        if (e.error) {
          summary.errorsEncountered.push(e.error.slice(0, 300))
        }
        break
      }

      case "VERIFY_FAILED": {
        const e = event as ExecutionEvent & { lintErrors?: number; typeErrors?: number; buildErrors?: number; testFailures?: number }
        const parts: string[] = []
        if (e.lintErrors) parts.push(`${e.lintErrors} lint error(s)`)
        if (e.typeErrors) parts.push(`${e.typeErrors} type error(s)`)
        if (e.buildErrors) parts.push(`${e.buildErrors} build error(s)`)
        if (e.testFailures) parts.push(`${e.testFailures} test failure(s)`)
        if (parts.length > 0) {
          summary.errorsEncountered.push(`Verification failed: ${parts.join(", ")}`)
        }
        break
      }

      case "MESSAGE_COMPLETE": {
        const e = event as ExecutionEvent & { content?: string }
        if (e.content && e.content.length > 100) {
          // Extract the last MESSAGE_COMPLETE as the outcome
          summary.outcome = e.content.slice(0, 300).replace(/\n+/g, " ").trim()
        }
        break
      }

      case "AGENT_ASSIGNED": {
        const e = event as ExecutionEvent & { roleName?: string }
        if (e.roleName) {
          summary.learnings.push(`Agent used: ${e.roleName}`)
        }
        break
      }
    }
  }

  private async writeToFile(rootPath: string, sessionId: string, content: string): Promise<void> {
    try {
      const fs = await import("@/lib/electron-api")
      const sessionsDir = `${rootPath}/.agentic/memory/sessions`
      await fs.mkdir(sessionsDir).catch(() => {}) // Already exists

      const dateStr = new Date().toISOString().split("T")[0]
      const filename = `${dateStr}-${sessionId.slice(0, 12)}.md`
      const filePath = `${sessionsDir}/${filename}`

      await fs.writeTextFile(filePath, content)
    } catch (err) {
      console.warn("[SessionMemoryExtractor] Failed to write session memory file:", err)
    }
  }

  private async injectIntoMemory(summary: SessionSummary): Promise<void> {
    try {
      const arch = MemoryArchitecture.getInstance()
      if (!arch.isInitialized()) return

      // Store overall session as a long-term memory
      await arch.storeManualMemory({
        content: `Session: ${summary.objective.slice(0, 200)} — ${summary.duration}, ${summary.filesModified} file(s) modified, ${summary.toolCalls} tool call(s)`,
        tags: ["session", "summary", ...summary.filesChanged.map((f) => f.path.split("/").pop() ?? f.path)],
        category: "learning",
        scope: "session",
        source: "session-extractor",
      })

      // Store decisions as individual memories
      for (const decision of summary.keyDecisions) {
        await arch.storeManualMemory({
          content: decision,
          tags: ["decision", "architecture"],
          category: "decision",
          scope: "project",
          source: "session-extractor",
        })
      }

      // Store patterns as project-level memories
      for (const pattern of summary.patternsDiscovered) {
        await arch.storeManualMemory({
          content: pattern,
          tags: ["pattern", "convention"],
          category: "pattern",
          scope: "project",
          source: "session-extractor",
        })
      }

      // Store errors as learning memories (negative examples)
      for (const error of summary.errorsEncountered.slice(0, 5)) {
        await arch.storeManualMemory({
          content: `Error encountered: ${error}`,
          tags: ["error", "learning"],
          category: "error",
          scope: "project",
          source: "session-extractor",
        })
      }

      // Store learnings
      for (const learning of summary.learnings) {
        await arch.storeManualMemory({
          content: learning,
          tags: ["learning", "knowledge"],
          category: "learning",
          scope: "project",
          source: "session-extractor",
        })
      }
    } catch (err) {
      console.warn("[SessionMemoryExtractor] Failed to inject into memory architecture:", err)
    }
  }
}

/** Singleton instance */
export const sessionMemoryExtractor = SessionMemoryExtractor.getInstance()
