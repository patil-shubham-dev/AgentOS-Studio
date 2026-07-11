import type { ReadinessLevel, ReadinessState } from '../kernel/types'

type Listener = (state: ReadinessState[]) => void

const states = new Map<ReadinessLevel, ReadinessState>([
  ['shell', { level: 'shell', ready: false, label: 'UI Shell', timestamp: 0 }],
  ['settings', { level: 'settings', ready: false, label: 'Settings', timestamp: 0 }],
  ['workspace', { level: 'workspace', ready: false, label: 'Workspace', timestamp: 0 }],
  ['ai', { level: 'ai', ready: false, label: 'AI Runtime', timestamp: 0 }],
  ['browser', { level: 'browser', ready: false, label: 'Browser', timestamp: 0 }],
  ['full', { level: 'full', ready: false, label: 'Full System', timestamp: 0 }],
])

const listeners: Set<Listener> = new Set()

function notify() {
  const snapshot = Array.from(states.values())
  listeners.forEach(l => l(snapshot))
}

export const ReadinessGate = {
  mark(level: ReadinessLevel) {
    const existing = states.get(level)
    if (existing) {
      existing.ready = true
      existing.timestamp = Date.now()
      notify()
    }
  },

  isReady(level: ReadinessLevel): boolean {
    return states.get(level)?.ready ?? false
  },

  isAtLeast(level: ReadinessLevel): boolean {
    const order: ReadinessLevel[] = ['shell', 'settings', 'workspace', 'ai', 'browser', 'full']
    const targetIdx = order.indexOf(level)
    if (targetIdx === -1) return false
    for (let i = 0; i <= targetIdx; i++) {
      if (!states.get(order[i])?.ready) return false
    }
    return true
  },

  getAll(): ReadinessState[] {
    return Array.from(states.values())
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  reset() {
    for (const [key] of states) {
      states.set(key, { level: key, ready: false, label: states.get(key)!.label, timestamp: 0 })
    }
    notify()
  },
}
