import type { ExecutionEvent } from "@/runtime/ExecutionEvent"

export const DEFAULT_MAX_QUEUE_SIZE = 5

export interface QueuedExecution {
  id: string
  input: string
  enqueuedAt: number
  startedAt?: number
  status: "queued" | "running" | "completed" | "failed" | "cancelled"
  generator?: AsyncGenerator<ExecutionEvent>
  abortController: AbortController
}

export interface QueueStatus {
  active: number
  queued: number
  maxQueue: number
}

type ResolveReject = { resolve: () => void; reject: (err: unknown) => void }

export class ExecutionQueue {
  private queue: QueuedExecution[] = []
  private active: QueuedExecution | null = null
  private maxQueue: number
  private pending: ResolveReject[] = []

  constructor(maxQueue = DEFAULT_MAX_QUEUE_SIZE) {
    this.maxQueue = maxQueue
  }

  enqueue(
    input: string,
    id: string,
    signal?: AbortSignal
  ): { promise: Promise<void>; controller: AbortController } {
    const total = (this.active ? 1 : 0) + this.queue.length
    if (total >= this.maxQueue) {
      throw new Error(`Too many pending tasks (max ${this.maxQueue})`)
    }

    const controller = new AbortController()
    if (signal && !signal.aborted) {
      signal.addEventListener("abort", () => controller.abort(), { once: true })
    }

    const entry: QueuedExecution = {
      id,
      input,
      enqueuedAt: Date.now(),
      status: "queued",
      abortController: controller,
    }

    const promise = new Promise<void>((resolve, reject) => {
      this.queue.push(entry)
      this.pending.push({ resolve, reject })
      this.activateNext()
    })

    return { promise, controller }
  }

  cancelAll(): void {
    if (this.active && !this.active.abortController.signal.aborted) {
      this.active.abortController.abort()
      this.active.status = "cancelled"
    }
    for (const entry of this.queue) {
      if (!entry.abortController.signal.aborted) {
        entry.abortController.abort()
      }
      entry.status = "cancelled"
    }
    this.queue = []
    this.active = null

    for (const slot of this.pending) {
      slot.reject(new Error("Execution cancelled: all tasks cancelled"))
    }
    this.pending = []
  }

  cancel(id: string): void {
    if (this.active?.id === id) {
      if (!this.active.abortController.signal.aborted) {
        this.active.abortController.abort()
      }
      this.active.status = "cancelled"
      this.active = null
      this.activateNext()
      return
    }
    const idx = this.queue.findIndex((e) => e.id === id)
    if (idx >= 0) {
      const entry = this.queue[idx]
      if (!entry.abortController.signal.aborted) {
        entry.abortController.abort()
      }
      entry.status = "cancelled"
      this.queue.splice(idx, 1)

      const slot = this.pending.splice(idx, 1)[0]
      if (slot) slot.reject(new Error(`Execution cancelled: ${id}`))
    }
  }

  getStatus(): QueueStatus {
    return {
      active: this.active ? 1 : 0,
      queued: this.queue.length,
      maxQueue: this.maxQueue,
    }
  }

  isBusy(): boolean {
    return this.active !== null || this.queue.length > 0
  }

  getActiveExecution(): QueuedExecution | null {
    return this.active
  }

  setGenerator(id: string, gen: AsyncGenerator<ExecutionEvent>): void {
    const entry = this.queue.find((e) => e.id === id)
    if (entry) {
      entry.generator = gen as any
    }
  }

  completeExecution(id: string, status: "completed" | "failed" | "cancelled" = "completed"): void {
    if (this.active?.id === id) {
      this.active.status = status
      this.active = null
      this.activateNext()
    }
  }

  private activateNext(): void {
    if (this.active) return
    const next = this.queue.shift()
    if (!next) return
    this.active = next
    next.status = "running"
    next.startedAt = Date.now()

    const slot = this.pending.shift()
    if (slot) slot.resolve()
  }
}
