/**
 * AuditLog — persisted audit trail for security and access events.
 *
 * Tracks:
 *   - Denied file access (paths outside workspace)
 *   - Permission errors (role lacks tool access)
 *   - Command allowlist violations
 *   - IPC argument validation failures
 *   - Tool misuse or blocked execution
 *
 * Storage: localStorage with structured JSON format.
 * Max entries: 10,000 (auto-prunes oldest on overflow).
 */

import { useCallback, useSyncExternalStore } from "react"

// ── Types ──

export type AuditEventType =
  | "access_denied"       // Path outside workspace
  | "permission_denied"   // Role doesn't have tool access
  | "command_blocked"     // Command not in allowlist
  | "ipc_validation"      // IPC argument validation failure
  | "tool_blocked"        // Tool execution blocked by hook/policy
  | "browser_blocked"     // Browser action blocked
  | "security_warning"    // Non-critical security observation

export type AuditSeverity = "info" | "warning" | "error" | "critical"

export interface AuditEvent {
  id: string
  timestamp: number
  type: AuditEventType
  severity: AuditSeverity
  /** Which role or component triggered the event */
  source: string
  /** A concise description of what happened */
  message: string
  /** The tool or command that was attempted */
  action?: string
  /** The arguments or parameters involved */
  args?: Record<string, unknown>
  /** The file path involved (if applicable) */
  filePath?: string
  /** Any additional metadata */
  metadata?: Record<string, unknown>
}

interface AuditLogState {
  events: AuditEvent[]
  totalCount: number
  lastCleared: number
}

// ── Constants ──

const STORAGE_KEY = "agentic-audit-log"
const MAX_EVENTS = 10_000
const SUBSCRIBERS_KEY = "audit:subscribers"

// ── AuditLog Class ──

class AuditLog {
  private static instance: AuditLog
  private events: AuditEvent[] = []
  private listeners = new Set<() => void>()
  private constructor() {
    this.loadFromStorage()
  }

  static getInstance(): AuditLog {
    if (!AuditLog.instance) {
      AuditLog.instance = new AuditLog()
    }
    return AuditLog.instance
  }

  // ── Loading / Persistence ──

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: AuditLogState = JSON.parse(stored)
        this.events = parsed.events ?? []
      }
    } catch {
      // Corrupted storage — start fresh
      this.events = []
    }
  }

  private saveToStorage(): void {
    try {
      const state: AuditLogState = {
        events: this.events,
        totalCount: this.events.length,
        lastCleared: Date.now(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // localStorage might be full — prune more aggressively
      this.events = this.events.slice(-(MAX_EVENTS / 2))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ events: this.events, totalCount: this.events.length, lastCleared: Date.now() }))
      } catch {
        // Give up on persistence
      }
    }
  }

  // ── Event Recording ──

  /**
   * Record an audit event.
   * Thread-safe via synchronous single-threaded JS.
   */
  record(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
    const fullEvent: AuditEvent = {
      ...event,
      id: this.generateId(),
      timestamp: Date.now(),
    }

    this.events.push(fullEvent)

    // Prune if over limit
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS)
    }

    this.saveToStorage()
    this.notify()

    return fullEvent
  }

  /**
   * Convenience: record a denied access event.
   */
  recordAccessDenied(
    source: string,
    filePath: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent {
    return this.record({
      type: "access_denied",
      severity: "error",
      source,
      message: reason,
      action: "access",
      args: { filePath },
      filePath,
      metadata,
    })
  }

  /**
   * Convenience: record a permission denied event.
   */
  recordPermissionDenied(
    source: string,
    toolName: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent {
    return this.record({
      type: "permission_denied",
      severity: "warning",
      source,
      message: reason,
      action: toolName,
      metadata,
    })
  }

  /**
   * Convenience: record a blocked command event.
   */
  recordCommandBlocked(
    source: string,
    command: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent {
    return this.record({
      type: "command_blocked",
      severity: "error",
      source,
      message: reason,
      action: "command",
      args: { command },
      metadata,
    })
  }

  /**
   * Convenience: record an IPC validation failure.
   */
  recordIpcValidationFailure(
    source: string,
    channel: string,
    reason: string,
    args?: Record<string, unknown>,
  ): AuditEvent {
    return this.record({
      type: "ipc_validation",
      severity: "warning",
      source,
      message: reason,
      action: channel,
      args,
    })
  }

  // ── Querying ──

  /**
   * Get all audit events, newest first.
   */
  getEvents(): AuditEvent[] {
    return [...this.events].reverse()
  }

  /**
   * Get events filtered by criteria.
   */
  query(filters: {
    types?: AuditEventType[]
    severities?: AuditSeverity[]
    source?: string
    since?: number
    until?: number
    limit?: number
    offset?: number
  }): AuditEvent[] {
    let filtered = [...this.events]

    if (filters.types && filters.types.length > 0) {
      filtered = filtered.filter((e) => filters.types!.includes(e.type))
    }
    if (filters.severities && filters.severities.length > 0) {
      filtered = filtered.filter((e) => filters.severities!.includes(e.severity))
    }
    if (filters.source) {
      filtered = filtered.filter((e) => e.source.toLowerCase().includes(filters.source!.toLowerCase()))
    }
    if (filters.since) {
      filtered = filtered.filter((e) => e.timestamp >= filters.since!)
    }
    if (filters.until) {
      filtered = filtered.filter((e) => e.timestamp <= filters.until!)
    }

    // Sort newest first
    filtered.sort((a, b) => b.timestamp - a.timestamp)

    // Apply pagination
    const offset = filters.offset ?? 0
    const limit = filters.limit ?? 100
    return filtered.slice(offset, offset + limit)
  }

  /**
   * Get summary statistics.
   */
  getStats(): {
    total: number
    byType: Record<string, number>
    bySeverity: Record<string, number>
    last24h: number
    lastHour: number
  } {
    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000
    const hourAgo = now - 60 * 60 * 1000

    const byType: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}

    for (const event of this.events) {
      byType[event.type] = (byType[event.type] ?? 0) + 1
      bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1
    }

    return {
      total: this.events.length,
      byType,
      bySeverity,
      last24h: this.events.filter((e) => e.timestamp >= dayAgo).length,
      lastHour: this.events.filter((e) => e.timestamp >= hourAgo).length,
    }
  }

  /**
   * Get total count of events.
   */
  getCount(): number {
    return this.events.length
  }

  // ── Management ──

  /**
   * Clear all audit events.
   */
  clear(): void {
    this.events = []
    this.saveToStorage()
    this.notify()
  }

  /**
   * Remove events older than the given timestamp.
   */
  pruneOlderThan(timestamp: number): number {
    const before = this.events.length
    this.events = this.events.filter((e) => e.timestamp >= timestamp)
    const pruned = before - this.events.length
    if (pruned > 0) {
      this.saveToStorage()
      this.notify()
    }
    return pruned
  }

  // ── React Integration ──

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): AuditEvent[] {
    return this.getEvents()
  }

  getServerSnapshot(): AuditEvent[] {
    return []
  }

  /** Hook to subscribe to audit log changes in React */
  useAuditLog(): AuditEvent[] {
    return useSyncExternalStore(
      useCallback((cb: () => void) => this.subscribe(cb), []),
      useCallback(() => this.getSnapshot(), []),
      useCallback(() => this.getServerSnapshot(), []),
    )
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try { listener() } catch { /* ignore */ }
    }
  }

  // ── Helpers ──

  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

/** Singleton instance */
export const auditLog = AuditLog.getInstance()

/** Severity color mapping for UI */
export const SEVERITY_COLORS: Record<AuditSeverity, { badge: string; bg: string; text: string }> = {
  info: { badge: "bg-blue-500/20 text-blue-300", bg: "bg-blue-500/5", text: "text-blue-300" },
  warning: { badge: "bg-amber-500/20 text-amber-300", bg: "bg-amber-500/5", text: "text-amber-300" },
  error: { badge: "bg-red-500/20 text-red-300", bg: "bg-red-500/5", text: "text-red-300" },
  critical: { badge: "bg-red-500/40 text-red-200", bg: "bg-red-500/10", text: "text-red-200" },
}

/** Event type color mapping */
export const EVENT_TYPE_COLORS: Record<AuditEventType, { label: string; icon: string }> = {
  access_denied: { label: "Access Denied", icon: "🔒" },
  permission_denied: { label: "Permission Denied", icon: "⛔" },
  command_blocked: { label: "Command Blocked", icon: "🚫" },
  ipc_validation: { label: "IPC Validation", icon: "📋" },
  tool_blocked: { label: "Tool Blocked", icon: "🔧" },
  browser_blocked: { label: "Browser Blocked", icon: "🌐" },
  security_warning: { label: "Security Warning", icon: "⚠️" },
}
