import type { RuntimeSnapshot, CrashEntry } from './types'
import { getSubscriptionRegistry, getTimerRegistry } from '@/performance/runtime-assertions'
import { getMutationTrace } from '@/runtime/runtime-diagnostics'
import { EventBus } from '@/runtime/EventBus'
import { useWorkspaceRuntime } from '@/runtime/workspace-runtime'

const CRASH_LOG_KEY = 'agentic-os-crash-log'
const MAX_ENTRIES = 100

function readLog(): CrashEntry[] {
  try {
    return JSON.parse(localStorage.getItem(CRASH_LOG_KEY) || '[]')
  } catch (err) {
    console.warn("[CrashLogger] Failed to read crash log:", err)
    return []
  }
}

function writeLog(entries: CrashEntry[]): void {
  try {
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(entries.length - MAX_ENTRIES)
    }
    localStorage.setItem(CRASH_LOG_KEY, JSON.stringify(entries))
  } catch (err) {
    console.warn("[CrashLogger] Failed to write crash log, trying smaller batch:", err)
    try {
      localStorage.setItem(CRASH_LOG_KEY, JSON.stringify(entries.slice(-20)))
    } catch (err2) {
      console.warn("[CrashLogger] Failed to write even reduced crash log, clearing:", err2)
      localStorage.removeItem(CRASH_LOG_KEY)
    }
  }
}

export async function captureRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  const snapshot: RuntimeSnapshot = {
    subscriptions: [],
    timers: [],
    mutationTrace: [],
    eventBus: { listenerCount: 0, types: [] },
    storeStatus: {
      workspaceRuntime: 'unknown',
      workspaceRuntimeHealth: 'unknown',
    },
  }

  const subReg = getSubscriptionRegistry?.() ?? new Map()
  let subCount = 0
  for (const [owner, keys] of subReg) {
    if (subCount++ >= 50) break
    snapshot.subscriptions.push({ owner, keys: [...keys] })
  }
  const timerReg = getTimerRegistry?.() ?? new Map()
  let timerCount = 0
  for (const owner of timerReg.keys()) {
    if (timerCount++ >= 50) break
    snapshot.timers.push(owner)
  }

  snapshot.mutationTrace = (getMutationTrace?.() ?? []).slice(-20)

  const bus = EventBus.getInstance()
  snapshot.eventBus = {
    listenerCount: bus.getListenerCount(),
    types: bus.getListenerTypes(),
  }

  const state = useWorkspaceRuntime.getState()
  snapshot.storeStatus = {
    workspaceRuntime: state.status,
    workspaceRuntimeHealth: state.health,
  }

  try {
    const perf = (performance as any)
    if (perf && perf.memory) {
      snapshot.memory = {
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
        usedJSHeapSize: perf.memory.usedJSHeapSize,
      }
    }
  } catch { console.warn("[CrashLogger] Failed to capture memory snapshot") }

  return snapshot
}

export async function logCrash(entry: CrashEntry): Promise<void> {
  const entries = readLog()

  const snapshot = await captureRuntimeSnapshot()
  entry.runtimeSnapshot = snapshot
  entries.push(entry)
  writeLog(entries)

  try {
    const { writeTextFile, BaseDirectory } = await import('@/lib/electron-api')
    const date = new Date().toISOString().split('T')[0]
    let line = `[${entry.timestamp}] [${entry.type.toUpperCase()}] ${entry.error}`
    if (entry.stack) line += `\nStack:\n${entry.stack}`
    if (entry.componentStack) line += `\nComponent Stack:\n${entry.componentStack}`
    if (entry.runtimeSnapshot) {
      line += `\nRuntime Snapshot:`
      line += `\n  Subscriptions: ${entry.runtimeSnapshot.subscriptions.length}`
      line += `\n  Timers: ${entry.runtimeSnapshot.timers.length}`
      line += `\n  EventBus Listeners: ${entry.runtimeSnapshot.eventBus.listenerCount}`
      line += `\n  Runtime Status: ${entry.runtimeSnapshot.storeStatus.workspaceRuntime}/${entry.runtimeSnapshot.storeStatus.workspaceRuntimeHealth}`
    }
    line += '\n'
    await writeTextFile(`.agentic-os/logs/crash-${date}.log`, line, {
      baseDir: BaseDirectory.Home,
      append: true,
    })
  } catch {
    // Tauri fs not available — localStorage is sufficient
  }
}

export function getCrashLog(): CrashEntry[] {
  return readLog()
}

export function getRecentCrashes(windowMs: number = 60000): CrashEntry[] {
  const now = Date.now()
  return readLog().filter((e) => {
    const t = new Date(e.timestamp).getTime()
    return now - t < windowMs
  })
}

export function getCrashFrequency(windowMs: number = 60000): number {
  return getRecentCrashes(windowMs).length
}

export function clearCrashLog(): void {
  localStorage.removeItem(CRASH_LOG_KEY)
}
