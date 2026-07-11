import { StartupTiming } from './startup-timing'

const STORAGE_KEY = 'agenticos-startup-history'
const MAX_SAMPLES = 20

interface BootSample {
  timestamp: number
  totalDuration: number
  tasks: Record<string, number>
}

interface RegressionResult {
  hasRegression: boolean
  warnings: string[]
  baseline: { totalDuration: number; tasks: Record<string, number> }
  current: { totalDuration: number; tasks: Record<string, number> }
}

function loadHistory(): BootSample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveHistory(samples: BootSample[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples))
  } catch {
    // localStorage full or unavailable
  }
}

function computeBaseline(samples: BootSample[]): { totalDuration: number; tasks: Record<string, number> } {
  if (samples.length === 0) return { totalDuration: 0, tasks: {} }

  const taskDurations: Record<string, number[]> = {}
  let totalSum = 0
  for (const s of samples) {
    totalSum += s.totalDuration
    for (const [name, dur] of Object.entries(s.tasks)) {
      if (!taskDurations[name]) taskDurations[name] = []
      taskDurations[name].push(dur)
    }
  }

  const taskAvg: Record<string, number> = {}
  for (const [name, durs] of Object.entries(taskDurations)) {
    taskAvg[name] = Math.round(durs.reduce((a, b) => a + b, 0) / durs.length)
  }

  return {
    totalDuration: Math.round(totalSum / samples.length),
    tasks: taskAvg,
  }
}

export function recordBootSample(): void {
  const timing = StartupTiming.getAll()
  const tasks: Record<string, number> = {}
  for (const [key, val] of Object.entries(timing)) {
    if (key.startsWith('task:') && key.endsWith(':done')) {
      tasks[key.replace('task:', '').replace(':done', '')] = val.duration
    }
  }

  const sample: BootSample = {
    timestamp: Date.now(),
    totalDuration: StartupTiming.getTotal(),
    tasks,
  }

  const history = loadHistory()
  history.push(sample)
  if (history.length > MAX_SAMPLES) {
    history.splice(0, history.length - MAX_SAMPLES)
  }
  saveHistory(history)
}

export function detectRegressions(): RegressionResult {
  const history = loadHistory()
  if (history.length < 2) {
    return {
      hasRegression: false,
      warnings: [],
      baseline: { totalDuration: 0, tasks: {} },
      current: { totalDuration: 0, tasks: {} },
    }
  }

  const current = history[history.length - 1]
  const baselineSamples = history.slice(0, -1)
  const baseline = computeBaseline(baselineSamples)

  const warnings: string[] = []
  const THRESHOLD = 1.3 // 30% slower triggers warning

  if (baseline.totalDuration > 0 && current.totalDuration > baseline.totalDuration * THRESHOLD) {
    const pct = Math.round((current.totalDuration / baseline.totalDuration) * 100 - 100)
    warnings.push(`Total startup ${current.totalDuration}ms — ${pct}% slower than baseline ${baseline.totalDuration}ms`)
  }

  for (const [name, dur] of Object.entries(current.tasks)) {
    const avg = baseline.tasks[name]
    if (avg && dur > avg * THRESHOLD) {
      const pct = Math.round((dur / avg) * 100 - 100)
      warnings.push(`"${name}" took ${dur}ms — ${pct}% slower than baseline avg ${avg}ms`)
    }
  }

  return {
    hasRegression: warnings.length > 0,
    warnings,
    baseline: { totalDuration: baseline.totalDuration, tasks: baseline.tasks },
    current: { totalDuration: current.totalDuration, tasks: current.tasks },
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}
