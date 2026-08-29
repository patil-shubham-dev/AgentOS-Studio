// Phase 6 — User-vs-Agent Edit Attribution (revised scope, v2 pivot)
// No structured tool-call events exist anymore (ExecutionSessionManager deleted).
// Attribution uses two signals:
// 1) File-watcher external writes while a harness PTY session is active and
//    the editor did NOT originate the change => agent.
// 2) Monaco onDidChangeModelContent with isFlush === false and non-empty changes
//    originating from keyboard/input => user.

export type EditOrigin = "user" | "agent" | "external"

export interface AttributionEvent {
  path: string
  origin: EditOrigin
  at: number
  hasActiveHarness: boolean
}

const attributionLog: AttributionEvent[] = []
const MAX_LOG = 200

export function recordAttribution(path: string, origin: EditOrigin, hasActiveHarness: boolean): void {
  attributionLog.push({ path, origin, at: Date.now(), hasActiveHarness })
  if (attributionLog.length > MAX_LOG) attributionLog.shift()
  if (import.meta.env.DEV) {
    console.debug(`[edit-attribution] ${origin} -> ${path} (harness=${hasActiveHarness})`)
  }
}

export function getRecentAttributions(path?: string): AttributionEvent[] {
  if (!path) return [...attributionLog]
  return attributionLog.filter((e) => e.path === path)
}

// Plain-text fallback: when no structured feedback channel exists, the harness
// reads context from a file or the user pastes prepended context into the terminal.
export function formatAttributionForTerminal(path: string, origin: EditOrigin, content: string): string {
  if (origin !== "agent") return content
  return `[agent-edit ${path}]\n${content}`
}
