import type { ExecutionEvent } from "@/runtime/ExecutionEvent"

export class EventChannel implements AsyncIterable<ExecutionEvent> {
  private buffer: (ExecutionEvent | null)[] = []
  private resolveQueue: Array<(value: ExecutionEvent | null) => void> = []
  private _closed = false
  private maxBufferSize: number
  private droppedCount = 0

  constructor(maxBufferSize = 5000) {
    this.maxBufferSize = maxBufferSize
  }

  push(event: ExecutionEvent): void {
    if (this._closed) return
    if (this.resolveQueue.length > 0) {
      const resolve = this.resolveQueue.shift()!
      resolve(event)
    } else {
      if (this.buffer.length >= this.maxBufferSize) {
        this.buffer.shift()
        this.droppedCount++
      }
      this.buffer.push(event)
    }
  }

  close(): void {
    if (this._closed) return
    this._closed = true
    for (const resolve of this.resolveQueue) {
      resolve(null)
    }
    this.resolveQueue = []
  }

  get closed(): boolean {
    return this._closed
  }

  [Symbol.asyncIterator](): AsyncIterator<ExecutionEvent> {
    return {
      next: () => {
        if (this.buffer.length > 0) {
          const value = this.buffer.shift()!
          if (value === null) return Promise.resolve({ done: true as const, value: undefined as any })
          return Promise.resolve({ done: false, value })
        }
        if (this._closed) return Promise.resolve({ done: true, value: undefined as any })
        return new Promise((resolve) => {
          this.resolveQueue.push((event) => {
            if (event === null) resolve({ done: true, value: undefined as any })
            else resolve({ done: false, value: event })
          })
        })
      },
    }
  }
}
