import type { RuntimeEvent, EventHandler } from "./RuntimeTypes"

type EventPriority = "critical" | "high" | "normal" | "low"

const LOG_PREFIX = "[EventBus]"
const MAX_LISTENERS_PER_TYPE = 50
const MAX_EMIT_DEPTH = 10

// ── V2 Types ──

export interface EventBusMiddleware {
  name: string
  pre?: (event: RuntimeEvent) => RuntimeEvent | null
  post?: (event: RuntimeEvent, error?: Error) => void
}

export interface EventPersistenceAdapter {
  save(event: RuntimeEvent): Promise<void>
  saveBatch(events: RuntimeEvent[]): Promise<void>
  load(filter: { type?: string; traceId?: string; after?: number; limit?: number }): Promise<RuntimeEvent[]>
}

export interface EventBusMetrics {
  totalEmitted: number
  totalDropped: number
  handlerCount: number
  bufferedSubscriberCount: number
  emitDepth: number
}

// ── Backward-compatible BufferedSubscriber ──

interface BufferedSubscriber {
  buffer: RuntimeEvent[]
  handler: (events: RuntimeEvent[]) => void
  rafId: number | null
}

interface TypeStats {
  listenerCount: number
  totalEmitted: number
  peakListeners: number
}

// ── EventBus V2 ──

export class EventBus {
  private listeners = new Map<string, Set<EventHandler>>()
  private bufferedSubscribers = new Map<string, BufferedSubscriber>()
  private static instance: EventBus
  private eventCount = 0
  private typeStats = new Map<string, TypeStats>()
  private emitDepth = 0

  // V2 internals
  private middlewares: EventBusMiddleware[] = []
  private persistenceAdapter: EventPersistenceAdapter | null = null
  private persistenceEnabled = false
  private replayMode = false
  private replayEvents: RuntimeEvent[] = []
  private priorityQueues = new Map<EventPriority, RuntimeEvent[]>()
  private totalDropped = 0
  private readonly maxQueueSize = 5_000

  private constructor() {
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus()
    }
    return EventBus.instance
  }

  // ════════════════════════════════════════════════
  // V1 Compatibility API (unchanged behavior)
  // ════════════════════════════════════════════════

  on<T extends RuntimeEvent>(type: T["type"], handler: EventHandler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    const handlers = this.listeners.get(type)!
    handlers.add(handler as EventHandler)

    let stats = this.typeStats.get(type)
    if (!stats) {
      stats = { listenerCount: 0, totalEmitted: 0, peakListeners: 0 }
      this.typeStats.set(type, stats)
    }
    stats.listenerCount = handlers.size
    if (handlers.size > stats.peakListeners) stats.peakListeners = handlers.size

    if (handlers.size > MAX_LISTENERS_PER_TYPE && import.meta.env.DEV) {
      console.warn(`${LOG_PREFIX} HIGH LISTENER COUNT for "${type}": ${handlers.size} (max=${MAX_LISTENERS_PER_TYPE})`)
    }

    return () => {
      handlers.delete(handler as EventHandler)
      stats!.listenerCount = handlers.size
      if (handlers.size === 0) {
        this.listeners.delete(type)
      }
    }
  }

  emit(event: RuntimeEvent): void {
    const t0 = performance.now()
    this.eventCount++
    this.emitDepth++

    if (this.emitDepth > MAX_EMIT_DEPTH) {
      if (import.meta.env.DEV) {
        console.error(`${LOG_PREFIX} RECURSIVE EMIT DETECTED (depth=${this.emitDepth})`)
      }
      this.emitDepth--
      return
    }

    // Run V2 middlewares pre-hooks (with error reporting - no silent swallowing)
    let processed = this.runPreMiddlewares(event)
    if (processed === null) {
      this.emitDepth--
      return // Middleware dropped the event
    }

    // Persist if enabled
    if (this.persistenceEnabled) {
      this.persistEvent(processed).catch((err) => {
        console.error(`${LOG_PREFIX} Persistence error:`, err)
      })
    }

    // Route to V1 handlers
    let stats = this.typeStats.get(processed.type)
    if (!stats) {
      stats = { listenerCount: 0, totalEmitted: 0, peakListeners: 0 }
      this.typeStats.set(processed.type, stats)
    }
    stats.totalEmitted++

    const handlers = this.listeners.get(processed.type)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(processed)
        } catch (err) {
          // V2: REPORT errors instead of silently swallowing
          console.error(`${LOG_PREFIX} Handler error for "${processed.type}":`, err)
          this.runPostMiddlewares(processed, err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    // Route to buffered subscribers
    const buffered = this.bufferedSubscribers.get(processed.type)
    if (buffered) {
      buffered.buffer.push(processed)
    }

    this.emitDepth--
  }

  off<T extends RuntimeEvent>(type: T["type"], handler: EventHandler<T>): void {
    const handlers = this.listeners.get(type)
    if (handlers) {
      handlers.delete(handler as EventHandler)
      const stats = this.typeStats.get(type)
      if (stats) stats.listenerCount = handlers.size
      if (handlers.size === 0) {
        this.listeners.delete(type)
      }
    }
  }

  createBufferedSubscriber(
    type: string,
    handler: (events: RuntimeEvent[]) => void,
  ): () => void {
    const existing = this.bufferedSubscribers.get(type)
    if (existing) {
      if (import.meta.env.DEV) {
        console.warn(`${LOG_PREFIX} DUPLICATE BUFFERED SUBSCRIBER for "${type}" — replacing`)
      }
      if (existing.rafId !== null) {
        cancelAnimationFrame(existing.rafId)
      }
      existing.handler = handler
      existing.buffer = []
      this.scheduleFlush(type, existing)
      return () => this.destroyBufferedSubscriber(type)
    }

    const subscriber: BufferedSubscriber = {
      buffer: [],
      handler,
      rafId: null,
    }

    this.bufferedSubscribers.set(type, subscriber)
    this.scheduleFlush(type, subscriber)

    return () => this.destroyBufferedSubscriber(type)
  }

  private scheduleFlush(type: string, subscriber: BufferedSubscriber): void {
    const flush = () => {
      if (subscriber.buffer.length > 0) {
        const events = subscriber.buffer.slice()
        subscriber.buffer = []
        try {
          subscriber.handler(events)
        } catch (err) {
          console.error(`${LOG_PREFIX} Buffered handler error for "${type}":`, err)
        }
      }
      // Only reschedule if the buffer has data or the subscriber still exists and has pending events
      subscriber.rafId = this.bufferedSubscribers.has(type)
        ? requestAnimationFrame(() => {
            if (this.bufferedSubscribers.get(type)?.buffer.length) {
              this.scheduleFlush(type, subscriber)
            }
          })
        : null
    }
    subscriber.rafId = requestAnimationFrame(flush)
  }

  private destroyBufferedSubscriber(type: string): void {
    const subscriber = this.bufferedSubscribers.get(type)
    if (subscriber) {
      if (subscriber.rafId !== null) {
        cancelAnimationFrame(subscriber.rafId)
      }
      this.bufferedSubscribers.delete(type)
    }
  }

  flushAll(): void {
    for (const [, subscriber] of this.bufferedSubscribers) {
      if (subscriber.buffer.length > 0) {
        const events = subscriber.buffer.slice()
        subscriber.buffer = []
        try {
          subscriber.handler(events)
        } catch (err) {
          console.error(`${LOG_PREFIX} Buffered flush error:`, err)
        }
      }
    }
  }

  destroy(): void {
    for (const type of this.bufferedSubscribers.keys()) {
      this.destroyBufferedSubscriber(type)
    }
    this.listeners.clear()
    this.bufferedSubscribers.clear()
    this.typeStats.clear()
    this.eventCount = 0
    this.middlewares = []
    this.priorityQueues.clear()
    this.totalDropped = 0
  }

  clear(): void {
    this.destroy()
  }

  getEventCount(): number {
    return this.eventCount
  }

  getListenerCount(type?: string): number {
    if (type) {
      const handlers = this.listeners.get(type)
      return handlers?.size ?? 0
    }
    let total = 0
    for (const [, handlers] of this.listeners) {
      total += handlers.size
    }
    return total
  }

  getListenerTypes(): string[] {
    return [...this.listeners.keys()]
  }

  getTypeStats(): Map<string, TypeStats> {
    return new Map(this.typeStats)
  }

  getBufferedSubscriberCount(): number {
    return this.bufferedSubscribers.size
  }

  hasListeners(type: string): boolean {
    const handlers = this.listeners.get(type)
    return handlers !== undefined && handlers.size > 0
  }

  // ════════════════════════════════════════════════
  // V2 Enhanced API
  // ════════════════════════════════════════════════

  // ── Middleware ──

  useMiddleware(middleware: EventBusMiddleware): () => void {
    this.middlewares.push(middleware)
    return () => {
      const idx = this.middlewares.indexOf(middleware)
      if (idx !== -1) this.middlewares.splice(idx, 1)
    }
  }

  private runPreMiddlewares(event: RuntimeEvent): RuntimeEvent | null {
    let current = event
    for (const mw of this.middlewares) {
      if (mw.pre) {
        const result = mw.pre(current)
        if (result === null) return null // Drop
        current = result
      }
    }
    return current
  }

  private runPostMiddlewares(event: RuntimeEvent, error?: Error): void {
    for (const mw of this.middlewares) {
      try {
        mw.post?.(event, error)
      } catch (e) {
        console.error(`${LOG_PREFIX} Middleware "${mw.name}" post-hook error:`, e)
      }
    }
  }

  // ── Priority Emission ──

  emitWithPriority(event: RuntimeEvent, priority: EventPriority): boolean {
    if (priority === "critical") {
      // Critical events bypass queue
      this.emit(event)
      return true
    }

    if (priority === "high") {
      this.emit(event)
      return true
    }

    // Low/normal events go through priority queue
    const queue = this.priorityQueues.get(priority) ?? []
    if (queue.length >= this.maxQueueSize) {
      this.totalDropped++
      return false
    }
    queue.push(event)
    this.priorityQueues.set(priority, queue)

    // Schedule drain if needed
    if (this.emitDepth === 0) {
      queueMicrotask(() => this.drainPriorityQueues())
    }
    return true
  }

  private drainPriorityQueues(): void {
    const order: EventPriority[] = ["high", "normal", "low"]
    for (const priority of order) {
      const queue = this.priorityQueues.get(priority)
      if (!queue || queue.length === 0) continue
      const batch = queue.splice(0, 100)
      for (const event of batch) {
        this.emit(event)
      }
    }
  }

  // ── Persistence ──

  setPersistenceAdapter(adapter: EventPersistenceAdapter): void {
    this.persistenceAdapter = adapter
  }

  enablePersistence(enabled: boolean): void {
    this.persistenceEnabled = enabled
  }

  private async persistEvent(event: RuntimeEvent): Promise<void> {
    if (!this.persistenceAdapter) return
    try {
      await this.persistenceAdapter.save(event)
    } catch (err) {
      console.error(`${LOG_PREFIX} Persist failed:`, err)
    }
  }

  // ── Replay ──

  startReplayMode(): void {
    this.replayMode = true
    this.replayEvents = []
  }

  stopReplayMode(): RuntimeEvent[] {
    this.replayMode = false
    const events = [...this.replayEvents]
    this.replayEvents = []
    return events
  }

  replay(events: RuntimeEvent[]): void {
    for (const event of events) {
      // Replay bypasses persistence, middlewares, and priority queues
      const handlers = this.listeners.get(event.type)
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(event)
          } catch (err) {
            console.error(`${LOG_PREFIX} Replay handler error for "${event.type}":`, err)
          }
        }
      }
      const buffered = this.bufferedSubscribers.get(event.type)
      if (buffered) {
        buffered.buffer.push(event)
      }
    }
    // Flush buffered subscribers after replay
    this.flushAll()
  }

  // ── V2 Metrics ──

  getV2Metrics(): EventBusMetrics {
    return {
      totalEmitted: this.eventCount,
      totalDropped: this.totalDropped,
      handlerCount: this.getListenerCount(),
      bufferedSubscriberCount: this.bufferedSubscribers.size,
      emitDepth: this.emitDepth,
    }
  }

  // ── Cancellation ──

  createCancellableEmit(
    event: RuntimeEvent,
    signal: AbortSignal,
  ): { emit: () => boolean; cancelled: boolean } {
    let cancelled = false
    signal.addEventListener("abort", () => {
      cancelled = true
    }, { once: true })

    return {
      emit: () => {
        if (cancelled) return false
        this.emit(event)
        return true
      },
      get cancelled() { return cancelled },
    }
  }
}
