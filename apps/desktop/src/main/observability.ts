import { app } from 'electron'

let _initialized = false

export interface MainProcessLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
  data?: unknown
}

const logs: MainProcessLogEntry[] = []
const MAX_LOG_ENTRIES = 5000
const PRUNE_TARGET = 2000

export function log(level: MainProcessLogEntry['level'], source: string, message: string, data?: unknown): void {
  const entry: MainProcessLogEntry = { timestamp: Date.now(), level, source, message, data }
  logs.push(entry)
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.splice(0, logs.length - PRUNE_TARGET)
  }
  const prefix = `[${level.toUpperCase()}][${source}]`
  if (level === 'error') {
    console.error(prefix, message, data ?? '')
  } else if (level === 'warn') {
    console.warn(prefix, message, data ?? '')
  } else {
    console.log(prefix, message, data ?? '')
  }
}

function handleUncaughtException(err: Error): void {
  log('error', 'uncaughtException', err.message, { stack: err.stack })
}

function handleUnhandledRejection(reason: unknown): void {
  log('error', 'unhandledRejection', String(reason))
}

export function initializeMainProcessObservability(): void {
  if (_initialized) return
  _initialized = true

  log('info', 'lifecycle', 'Main process observability initialized', {
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node,
  })

  process.on('uncaughtException', handleUncaughtException)
  process.on('unhandledRejection', handleUnhandledRejection)

  app.on('before-quit', () => {
    log('info', 'lifecycle', 'App quitting — flushing observability')
    try {
      flushToLocalStorage()
    } catch {
      // best-effort flush
    }
  })
}

export function getMainProcessLogs(filter?: {
  level?: MainProcessLogEntry['level']
  since?: number
  limit?: number
}): MainProcessLogEntry[] {
  let result = logs
  if (filter?.level) result = result.filter((e) => e.level === filter.level)
  if (filter?.since) result = result.filter((e) => e.timestamp >= filter.since!)
  if (filter?.limit && filter.limit > 0) result = result.slice(-filter.limit)
  return result
}

function flushToLocalStorage(): void {
  try {
    const { writeFileSync, existsSync, mkdirSync } = require('fs')
    const { join } = require('path')
    const logDir = join(app.getPath('userData'), 'logs')
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
    const filePath = join(logDir, `main-process-${Date.now()}.json`)
    writeFileSync(filePath, JSON.stringify({ logs, exportedAt: Date.now(), version: app.getVersion() }), 'utf-8')
  } catch {
    // best-effort
  }
}
