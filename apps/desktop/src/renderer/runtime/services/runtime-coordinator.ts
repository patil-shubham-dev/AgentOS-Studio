import { useWorkspaceRuntime } from "./workspace-runtime"
import { useWorkspaceStore } from "@/stores/workspace-store"

type RefreshSource = "config_change" | "workspace_change" | "manual" | "recovery"

interface RefreshRequest {
  source: RefreshSource
  timestamp: number
}

let pending: RefreshRequest | null = null
let scheduled = false

// ── Deferred refresh (used when the user is actively typing) ──
let deferredRefresh: RefreshRequest | null = null
let deferredTimer: ReturnType<typeof setTimeout> | null = null

const LOG_PREFIX = "[RuntimeCoordinator]"

function schedule(): void {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    const req = pending
    pending = null
    if (req) {
      const elapsed = performance.now() - req.timestamp
      console.debug(`${LOG_PREFIX} processing refresh (source=${req.source}, queued=${Math.round(elapsed)}ms)`)
      useWorkspaceRuntime.getState().refresh()
    }
  })
}

function flushDeferred(): void {
  if (deferredTimer) {
    clearTimeout(deferredTimer)
    deferredTimer = null
  }
  if (deferredRefresh) {
    const req = deferredRefresh
    deferredRefresh = null
    pending = req
    schedule()
  }
}

function clearDeferred(): void {
  if (deferredTimer) {
    clearTimeout(deferredTimer)
    deferredTimer = null
  }
  deferredRefresh = null
}

/**
 * Immediately process any deferred refresh that was queued while the user was active.
 * Called when the editor loses focus (blur) so the AI gets fresh context right away.
 */
export function flushDeferredRefresh(): void {
  flushDeferred()
}

const DEFER_DELAY_MS = 3000

export function requestRefresh(source: RefreshSource): void {
  // ── Recovery bypasses all queues ──
  if (source === "recovery") {
    clearDeferred()
    pending = null
    scheduled = false
    useWorkspaceRuntime.getState().refresh()
    return
  }

  // ── User is actively typing — defer workspace_change refreshes ──
  if (source === "workspace_change") {
    const isUserActive = useWorkspaceStore.getState().isUserActive
    if (isUserActive) {
      // Accumulate and keep extending the timer while the user types
      deferredRefresh = { source, timestamp: performance.now() }
      if (deferredTimer) clearTimeout(deferredTimer)
      deferredTimer = setTimeout(() => {
        deferredTimer = null
        // Re-check: if user still active, wait another window
        if (useWorkspaceStore.getState().isUserActive) {
          deferredTimer = setTimeout(flushDeferred, DEFER_DELAY_MS)
          return
        }
        flushDeferred()
      }, DEFER_DELAY_MS)
      return
    }
  }

  // ── Normal path (user inactive, or non-activity source) ──
  // Note: we intentionally do NOT flush deferred here — the deferred timer
  // handles that when the user goes idle (or on explicit blur via flushDeferredRefresh).
  // Flushing eagerly here could lose the deferred request when pending is overwritten
  // by the incoming non-deferred request below.
  if (!pending || pending.source !== "config_change") {
    pending = { source, timestamp: performance.now() }
  }
  schedule()
}

export function cancelPendingRefresh(): void {
  pending = null
  scheduled = false
  clearDeferred()
}
