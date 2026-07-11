const LOG_PREFIX = "[RuntimeDiag]"

let mutationTimestamps: { store: string; action: string; time: number }[] = []
let lastWarning = 0

export function trackMutation(store: string, action: string): void {
  if (import.meta.env.PROD) return
  const now = performance.now()
  mutationTimestamps.push({ store, action, time: now })
  if (mutationTimestamps.length > 50) {
    mutationTimestamps = mutationTimestamps.slice(-50)
  }
  const recent = mutationTimestamps.filter(m => now - m.time < 100)
  if (recent.length >= 10 && now - lastWarning > 5000) {
    lastWarning = now
    const counts = new Map<string, number>()
    for (const m of recent) {
      const key = `${m.store}.${m.action}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    console.warn(`${LOG_PREFIX} HIGH-FREQUENCY MUTATIONS (${recent.length} in 100ms):`)
    for (const [key, count] of counts) {
      console.warn(`  ${key}: ${count}x`)
    }
  }
}

export function detectCrossStoreChain(from: string, to: string): void {
  if (!import.meta.env.DEV) return
  console.warn(`${LOG_PREFIX} CROSS-STORE CHAIN: ${from} \u2192 ${to} (async via queueMicrotask)`)
}

export function assertNoRenderWrite(name: string): void {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const isRendering = (window as any).__REACT_RENDER_IN_PROGRESS
    if (isRendering) {
      console.error(`${LOG_PREFIX} STORE WRITE DURING RENDER: ${name}`)
    }
  }
}

export function resetDiagnostics(): void {
  mutationTimestamps = []
  lastWarning = 0
}

const renderCounts = new Map<string, number>()
let lastLogged = 0

export function countRender(name: string): void {
  if (!import.meta.env.DEV) return
  renderCounts.set(name, (renderCounts.get(name) || 0) + 1)
  const now = Date.now()
  if (now - lastLogged > 10000) {
    lastLogged = now
    const sorted = [...renderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    if (sorted.length > 0) {
      console.debug(`${LOG_PREFIX} Top renders (last 10s):`, sorted.map(([n, c]) => `${n}: ${c}x`).join(', '))
    }
  }
}

export function getRenderCounts(): Map<string, number> {
  return renderCounts
}

export function getMutationTrace(): { store: string; action: string; time: number }[] {
  return mutationTimestamps
}
