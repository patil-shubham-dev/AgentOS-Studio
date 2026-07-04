import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, readdirSync } from 'fs'

const REPLAY_DIR = join(app.getPath('userData'), 'replay')
const SESSIONS_DIR = join(REPLAY_DIR, 'sessions')
const INDEX_FILE = join(REPLAY_DIR, 'index.json')

function validateString(v: unknown, name: string, maxLength = 10000): string {
  if (typeof v !== 'string') throw new Error(`Invalid ${name}: must be a string`)
  if (v.length > maxLength) throw new Error(`Invalid ${name}: exceeds max length (${v.length} > ${maxLength})`)
  return v
}

function ensureDirectories(): void {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true })
}

function getSessionFile(sessionId: string): string {
  return join(SESSIONS_DIR, `${sanitizeId(sessionId)}.jsonl`)
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function loadIndex(): Record<string, unknown> {
  if (!existsSync(INDEX_FILE)) return { sessions: {}, version: 1 }
  try {
    return JSON.parse(readFileSync(INDEX_FILE, 'utf-8'))
  } catch {
    return { sessions: {}, version: 1 }
  }
}

function saveIndex(index: Record<string, unknown>): void {
  ensureDirectories()
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8')
}

export function registerReplayHandlers(): void {
  ensureDirectories()

  ipcMain.handle('replay-init', () => {
    ensureDirectories()
    const index = loadIndex()
    const sessions = index['sessions'] as Record<string, unknown> ?? {}
    const sessionIds = Object.keys(sessions)
    const orphaned: string[] = []
    let loaded = 0
    for (const sid of sessionIds) {
      const f = getSessionFile(sid)
      if (!existsSync(f)) {
        orphaned.push(sid)
      } else {
        loaded++
      }
    }
    for (const sid of orphaned) {
      delete (index['sessions'] as Record<string, unknown>)[sid]
    }
    if (orphaned.length > 0) saveIndex(index)
    return { sessionCount: loaded, orphanedCount: orphaned.length }
  })

  ipcMain.handle('replay-append-event', (_event, sessionId: string, line: string) => {
    validateString(sessionId, 'session id', 256)
    validateString(line, 'event line', 500000)
    ensureDirectories()
    const f = getSessionFile(sessionId)
    appendFileSync(f, line + '\n', 'utf-8')
  })

  ipcMain.handle('replay-append-batch', (_event, sessionId: string, lines: string[]) => {
    validateString(sessionId, 'session id', 256)
    if (!Array.isArray(lines) || lines.length > 10000) throw new Error('Invalid lines: must be an array of max 10000')
    for (const l of lines) {
      if (typeof l !== 'string' || l.length > 500000) throw new Error('Invalid line in batch')
    }
    ensureDirectories()
    const f = getSessionFile(sessionId)
    appendFileSync(f, lines.join('\n') + '\n', 'utf-8')
  })

  ipcMain.handle('replay-read-session', (_event, sessionId: string) => {
    validateString(sessionId, 'session id', 256)
    const f = getSessionFile(sessionId)
    if (!existsSync(f)) return null
    const content = readFileSync(f, 'utf-8')
    return content.split('\n').filter(Boolean).map(l => JSON.parse(l))
  })

  ipcMain.handle('replay-session-exists', (_event, sessionId: string) => {
    validateString(sessionId, 'session id', 256)
    return existsSync(getSessionFile(sessionId))
  })

  ipcMain.handle('replay-delete-session', (_event, sessionId: string) => {
    validateString(sessionId, 'session id', 256)
    const f = getSessionFile(sessionId)
    if (existsSync(f)) unlinkSync(f)
    const index = loadIndex()
    delete (index['sessions'] as Record<string, unknown>)[sessionId]
    saveIndex(index)
  })

  ipcMain.handle('replay-list-sessions', () => {
    const index = loadIndex()
    return index['sessions'] ?? {}
  })

  ipcMain.handle('replay-update-session-meta', (_event, sessionId: string, meta: Record<string, unknown>) => {
    validateString(sessionId, 'session id', 256)
    if (!meta || typeof meta !== 'object') throw new Error('Invalid meta: must be an object')
    const index = loadIndex()
    const sessions = index['sessions'] as Record<string, unknown>
    sessions[sessionId] = meta
    saveIndex(index)
  })

  ipcMain.handle('replay-get-session-meta', (_event, sessionId: string) => {
    validateString(sessionId, 'session id', 256)
    const index = loadIndex()
    const sessions = index['sessions'] as Record<string, unknown>
    return sessions[sessionId] ?? null
  })

  ipcMain.handle('replay-clear-all', () => {
    if (existsSync(SESSIONS_DIR)) {
      for (const f of readdirSync(SESSIONS_DIR)) {
        unlinkSync(join(SESSIONS_DIR, f))
      }
    }
    saveIndex({ sessions: {}, version: 1 })
  })

  ipcMain.handle('replay-get-stats', () => {
    const index = loadIndex()
    const sessions = index['sessions'] as Record<string, unknown> ?? {}
    let totalEvents = 0
    for (const meta of Object.values(sessions)) {
      totalEvents += (meta as Record<string, unknown>)['eventCount'] as number ?? 0
    }
    return { totalSessions: Object.keys(sessions).length, totalEvents, storagePath: REPLAY_DIR }
  })

  ipcMain.handle('replay-apply-retention', (_event, config: { maxAgeMs: number; maxSessions: number }) => {
    if (!config || typeof config !== 'object') throw new Error('Invalid retention config')
    const maxAgeMs = Number(config.maxAgeMs)
    const maxSessions = Number(config.maxSessions)
    if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0 || maxAgeMs > 365 * 24 * 60 * 60 * 1000) throw new Error('Invalid maxAgeMs')
    if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 10000) throw new Error('Invalid maxSessions')
    const index = loadIndex()
    const sessions = index['sessions'] as Record<string, Record<string, unknown>>
    const now = Date.now()
    const toDelete: string[] = []

    for (const [id, meta] of Object.entries(sessions)) {
      const endTime = (meta['endTime'] as number) ?? 0
      const age = now - endTime
      if (age > maxAgeMs) {
        toDelete.push(id)
      }
    }

    const entries = Object.entries(sessions).filter(([id]) => !toDelete.includes(id))
      .sort((a, b) => ((b[1]['startTime'] as number) ?? 0) - ((a[1]['startTime'] as number) ?? 0))

    while (entries.length > maxSessions) {
      const removed = entries.pop()!
      toDelete.push(removed[0])
    }

    for (const id of toDelete) {
      const f = getSessionFile(id)
      if (existsSync(f)) unlinkSync(f)
      delete sessions[id]
    }

    saveIndex(index)
    return { deletedCount: toDelete.length, remainingCount: Object.keys(sessions).length }
  })
}
