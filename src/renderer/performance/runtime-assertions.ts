const LOG_PREFIX = "[RuntimeAssert]"
const enabled = import.meta.env.DEV

const subscriptionRegistry = new Map<string, Set<string>>()
const timerRegistry = new Map<string, ReturnType<typeof setTimeout>>()
let renderDepth = 0

export function beginRender(): void {
  if (!enabled) return
  renderDepth++
}

export function endRender(): void {
  if (!enabled) return
  renderDepth--
}

export function assertNoStoreWriteDuringRender(storeName: string, action: string): void {
  if (!enabled) return
  if (renderDepth > 0) {
    console.error(`${LOG_PREFIX} STORE WRITE DURING RENDER: ${storeName}.${action} (renderDepth=${renderDepth})`)
    if (import.meta.env.DEV) {
      throw new Error(`${LOG_PREFIX} Store write during render: ${storeName}.${action}`)
    }
  }
}

export function assertNoDuplicateSubscription(owner: string, key: string): void {
  if (!enabled) return
  if (!subscriptionRegistry.has(owner)) {
    subscriptionRegistry.set(owner, new Set())
  }
  const subs = subscriptionRegistry.get(owner)!
  if (subs.has(key)) {
    console.warn(`${LOG_PREFIX} DUPLICATE SUBSCRIPTION: ${owner} already has "${key}"`)
  }
  subs.add(key)
}

export function releaseSubscription(owner: string, key: string): void {
  if (!enabled) return
  const subs = subscriptionRegistry.get(owner)
  if (subs) {
    subs.delete(key)
    if (subs.size === 0) subscriptionRegistry.delete(owner)
  }
}

export function assertNoOrphanSubscription(owner: string): void {
  if (!enabled) return
  const subs = subscriptionRegistry.get(owner)
  if (subs && subs.size > 0) {
    console.warn(`${LOG_PREFIX} ORPHAN SUBSCRIPTIONS: ${owner} has ${subs.size} active: [${[...subs].join(', ')}]`)
  }
}

export function registerTimer(owner: string, timerId: ReturnType<typeof setTimeout>): void {
  if (!enabled) return
  const existing = timerRegistry.get(owner)
  if (existing) {
    console.warn(`${LOG_PREFIX} DUPLICATE TIMER: ${owner} — previous was not cleared`)
    clearTimeout(existing)
  }
  timerRegistry.set(owner, timerId)
}

export function releaseTimer(owner: string): void {
  if (!enabled) return
  timerRegistry.delete(owner)
}

export function assertTimersCleaned(owner: string): void {
  if (!enabled) return
  const timer = timerRegistry.get(owner)
  if (timer !== undefined) {
    console.warn(`${LOG_PREFIX} ORPHAN TIMER: ${owner} — not cleared before dispose`)
    clearTimeout(timer)
    timerRegistry.delete(owner)
  }
}

export function assertNoRecursiveRefresh(triggerChain: string[]): void {
  if (!enabled) return
  if (triggerChain.length > 5) {
    throw new Error(`${LOG_PREFIX} REFRESH RECURSION DETECTED: chain=${triggerChain.join(' -> ')}`)
  }
}

export function getSubscriptionCount(): number {
  let total = 0
  for (const [, subs] of subscriptionRegistry) {
    total += subs.size
  }
  return total
}

export function getTimerCount(): number {
  return timerRegistry.size
}

export function getSubscriptionRegistry(): Map<string, Set<string>> {
  return subscriptionRegistry
}

export function getTimerRegistry(): Map<string, ReturnType<typeof setTimeout>> {
  return timerRegistry
}

export function resetAssertions(): void {
  subscriptionRegistry.clear()
  timerRegistry.clear()
}
