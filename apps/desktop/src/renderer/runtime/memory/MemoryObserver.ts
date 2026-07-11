import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { MemoryArchitecture } from "./unified/MemoryArchitecture"
import { ObservabilityManager } from "@/runtime/observability/ObservabilityManager"
import type { ExtractionTrigger } from "./unified/types"

const MEMORY_RELEVANT_EVENTS = new Set([
  "EXECUTION_COMPLETE",
  "EXECUTION_FAILED",
  "GOAL_ACHIEVED",
  "TOOL_COMPLETE",
  "FILE_EDIT",
  "VERIFY_PASSED",
  "VERIFY_FAILED",
  "BROWSER_NAVIGATE",
  "BROWSER_CLICK",
  "BROWSER_TYPE",
])

const TRIGGER_MAP: Record<string, ExtractionTrigger> = {
  EXECUTION_COMPLETE: "execution_complete",
  GOAL_ACHIEVED: "goal_achieved",
}

export class MemoryObserver {
  private static instance: MemoryObserver
  private unsubscribe: (() => void) | null = null
  private enabled = false

  static getInstance(): MemoryObserver {
    if (!MemoryObserver.instance) {
      MemoryObserver.instance = new MemoryObserver()
    }
    return MemoryObserver.instance
  }

  enable(): void {
    if (this.enabled) return

    const replay = ObservabilityManager.getInstance().getReplay()
    this.unsubscribe = replay.subscribe((event: ExecutionEvent) => {
      this.handleEvent(event)
    })
    this.enabled = true
    console.log("[MemoryObserver] enabled — subscribing to execution event stream")
  }

  disable(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.enabled = false
  }

  private handleEvent(event: ExecutionEvent): void {
    if (!MEMORY_RELEVANT_EVENTS.has(event.type)) return

    const arch = MemoryArchitecture.getInstance()
    if (!arch.isInitialized()) return

    const trigger: ExtractionTrigger = TRIGGER_MAP[event.type] ?? "execution_complete"

    arch.ingestExecutionEvent(event, trigger).catch((err) => {
      console.error("[MemoryObserver] extraction error:", err)
    })
  }
}
