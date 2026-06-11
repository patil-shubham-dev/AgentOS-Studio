export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal"

export type LogDomain =
  | "system"
  | "execution"
  | "agent"
  | "browser"
  | "search"
  | "indexing"
  | "tool"
  | "persistence"
  | "security"
  | "network"
  | "ui"

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  domain: LogDomain
  message: string
  error?: string
  stack?: string
  durationMs?: number
  metadata?: Record<string, unknown>
}

const MAX_LOG_ENTRIES = 5000
const PRUNE_TARGET = 2000
let logEntries: LogEntry[] = []
let logIdCounter = 0

const LEVEL_NUMBERS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, fatal: 4,
}

let minLevel: LogLevel = "debug"
let persistenceAdapter: { save(entry: LogEntry): Promise<void> } | null = null

export function setLogLevel(level: LogLevel): void {
  minLevel = level
}

export function setLogPersistence(adapter: { save(entry: LogEntry): Promise<void> }): void {
  persistenceAdapter = adapter
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_NUMBERS[level] >= LEVEL_NUMBERS[minLevel]
}

function makeEntry(level: LogLevel, domain: LogDomain, message: string, opts?: {
  error?: Error | string
  durationMs?: number
  metadata?: Record<string, unknown>
}): LogEntry {
  return {
    id: `log-${++logIdCounter}-${Date.now()}`,
    timestamp: Date.now(),
    level,
    domain,
    message,
    error: opts?.error instanceof Error ? opts.error.message : opts?.error,
    stack: opts?.error instanceof Error ? opts.error.stack : undefined,
    durationMs: opts?.durationMs,
    metadata: opts?.metadata,
  }
}

function pushEntry(entry: LogEntry): void {
  logEntries.push(entry)
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries = logEntries.slice(-PRUNE_TARGET)
  }
  if (persistenceAdapter) {
    persistenceAdapter.save(entry).catch(() => {})
  }
}

export function debug(domain: LogDomain, message: string, opts?: Parameters<typeof makeEntry>[3]): void {
  if (!shouldLog("debug")) return
  const entry = makeEntry("debug", domain, message, opts)
  pushEntry(entry)
}

export function info(domain: LogDomain, message: string, opts?: Parameters<typeof makeEntry>[3]): void {
  if (!shouldLog("info")) return
  const entry = makeEntry("info", domain, message, opts)
  pushEntry(entry)
}

export function warn(domain: LogDomain, message: string, opts?: Parameters<typeof makeEntry>[3]): void {
  if (!shouldLog("warn")) return
  const entry = makeEntry("warn", domain, message, opts)
  pushEntry(entry)
  console.warn(`[${domain}] ${message}`, opts?.error ?? "")
}

export function error(domain: LogDomain, message: string, opts?: Parameters<typeof makeEntry>[3]): void {
  if (!shouldLog("error")) return
  const entry = makeEntry("error", domain, message, opts)
  pushEntry(entry)
  console.error(`[${domain}] ${message}`, opts?.error ?? "")
}

export function fatal(domain: LogDomain, message: string, opts?: Parameters<typeof makeEntry>[3]): void {
  const entry = makeEntry("fatal", domain, message, opts)
  pushEntry(entry)
  console.error(`[FATAL][${domain}] ${message}`, opts?.error ?? "")
}

export function getLogs(filter?: {
  level?: LogLevel
  domain?: LogDomain
  since?: number
  limit?: number
}): LogEntry[] {
  let result = logEntries
  if (filter?.level) {
    const min = LEVEL_NUMBERS[filter.level]
    result = result.filter((e) => LEVEL_NUMBERS[e.level] >= min)
  }
  if (filter?.domain) {
    result = result.filter((e) => e.domain === filter.domain)
  }
  if (filter?.since) {
    result = result.filter((e) => e.timestamp >= filter.since!)
  }
  if (filter?.limit && filter.limit > 0) {
    result = result.slice(-filter.limit)
  }
  return result
}

export function getLogStats(): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const entry of logEntries) {
    const key = `${entry.domain}:${entry.level}`
    stats[key] = (stats[key] ?? 0) + 1
  }
  return stats
}

export function clearLogs(): void {
  logEntries = []
}

export function getLogger(domain: LogDomain) {
  return {
    debug: (msg: string, opts?: Parameters<typeof makeEntry>[3]) => debug(domain, msg, opts),
    info: (msg: string, opts?: Parameters<typeof makeEntry>[3]) => info(domain, msg, opts),
    warn: (msg: string, opts?: Parameters<typeof makeEntry>[3]) => warn(domain, msg, opts),
    error: (msg: string, opts?: Parameters<typeof makeEntry>[3]) => error(domain, msg, opts),
    fatal: (msg: string, opts?: Parameters<typeof makeEntry>[3]) => fatal(domain, msg, opts),
  }
}
