import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// ── Mocks for external dependencies ──

const mockCancelPendingRefresh = vi.fn()
const mockEventBusDestroy = vi.fn()

vi.mock("./runtime-coordinator", () => ({
  cancelPendingRefresh: mockCancelPendingRefresh,
}))

vi.mock("./EventBus", () => ({
  EventBus: {
    getInstance: vi.fn(() => ({
      destroy: mockEventBusDestroy,
    })),
  },
}))

describe("RuntimeCleanupManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // Restore any spies that were installed during tests
    vi.restoreAllMocks()
    const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
    RuntimeCleanupManager.getInstance().reset()
  })

  // ── Singleton ──

  it("is a singleton", async () => {
    const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
    const a = RuntimeCleanupManager.getInstance()
    const b = RuntimeCleanupManager.getInstance()
    expect(a).toBe(b)
  })

  // ── Resource Registration ──

  describe("resource registration", () => {
    it("registers and unregisters a generic resource", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const id = mgr.register({ type: "stream", id: "test-stream", source: "test" })
      expect(mgr.getResourceCount()).toBe(1)
      expect(mgr.getActiveResources()).toHaveLength(1)

      const unregistered = mgr.unregister(id)
      expect(unregistered).toBe(true)
      expect(mgr.getResourceCount()).toBe(0)
    })

    it("registers an abort controller and returns it", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const ctrl = mgr.registerAbortController("ac-1")
      expect(ctrl).toBeInstanceOf(AbortController)
      expect(mgr.getResourceCount()).toBe(1)

      const resources = mgr.getActiveResources()
      expect(resources[0].type).toBe("abort-controller")
      expect((resources[0] as any).controller).toBe(ctrl)
    })

    it("registers a subscription and returns a wrapped unsub that auto-unregisters", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const innerUnsub = vi.fn()
      const wrapped = mgr.registerSubscription("sub-1", innerUnsub)

      expect(mgr.getResourceCount()).toBe(1)

      // Calling wrapped should call innerUnsub AND unregister
      wrapped()
      expect(innerUnsub).toHaveBeenCalledOnce()
      expect(mgr.getResourceCount()).toBe(0)
    })

    it("registers a timer", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      mgr.registerTimer("timer-1", setTimeout(() => {}, 1000))
      expect(mgr.getResourceCount()).toBe(1)
    })

    it("registers an interval", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      mgr.registerInterval("interval-1", setInterval(() => {}, 1000))
      expect(mgr.getResourceCount()).toBe(1)
    })

    it("registers a subprocess", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      mgr.registerSubprocess("proc-1", vi.fn())
      expect(mgr.getResourceCount()).toBe(1)
    })

    it("auto-unregisters a promise when it settles", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      let resolve!: () => void
      const promise = new Promise<void>((r) => { resolve = r })
      mgr.registerPromise("prom-1", promise)
      expect(mgr.getResourceCount()).toBe(1)

      resolve!()
      // Wait for microtask queue to drain (promise.finally runs)
      await vi.waitFor(() => {
        expect(mgr.getResourceCount()).toBe(0)
      })
    })

    it("auto-generates an id when none is provided", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const id = mgr.register({ type: "stream", id: "", source: "test" })
      expect(id).toMatch(/^res_\d+$/)
    })

    it("reports resource counts by type", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      mgr.registerAbortController("ac-1")
      mgr.registerAbortController("ac-2")
      mgr.register({ type: "stream", id: "s1", source: "x" })
      mgr.register({ type: "subscription", id: "sub1", unsub: () => {} })

      const byType = mgr.getResourceCountByType()
      expect(byType["abort-controller"]).toBe(2)
      expect(byType["stream"]).toBe(1)
      expect(byType["subscription"]).toBe(1)
    })
  })

  // ── Shutdown Lifecycle ──

  describe("shutdown lifecycle", () => {
    it("returns a complete shutdown report with all phases", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const report = await mgr.shutdown()

      expect(report).toHaveProperty("success")
      expect(report).toHaveProperty("durationMs")
      expect(report).toHaveProperty("resourcesCleaned")
      expect(report).toHaveProperty("errors")
      expect(report).toHaveProperty("phases")

      const phaseNames = report.phases.map((p) => p.phase)
      expect(phaseNames).toContain("initiating")
      expect(phaseNames).toContain("aborting-operations")
      expect(phaseNames).toContain("destroying-eventbus")
    })

    it("fires the global abort signal", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const abortSpy = vi.fn()
      mgr.signal.addEventListener("abort", abortSpy)

      await mgr.shutdown()
      expect(abortSpy).toHaveBeenCalledOnce()
    })

    it("aborts all registered abort controllers", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const ctrl1 = mgr.registerAbortController("ac-1")
      const ctrl2 = mgr.registerAbortController("ac-2")
      const acSpy1 = vi.fn()
      const acSpy2 = vi.fn()
      ctrl1.signal.addEventListener("abort", acSpy1)
      ctrl2.signal.addEventListener("abort", acSpy2)

      await mgr.shutdown()
      expect(acSpy1).toHaveBeenCalledOnce()
      expect(acSpy2).toHaveBeenCalledOnce()
    })

    it("calls onShutdown listeners during initiating phase", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const listener = vi.fn()
      mgr.onShutdown("listener-1", listener)

      await mgr.shutdown()
      expect(listener).toHaveBeenCalledOnce()
      expect(listener).toHaveBeenCalledWith("initiating")
    })

    it("clears timers and intervals during shutdown", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      // Spy on clearTimeout and clearInterval
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout")
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")

      const timer = setTimeout(() => {}, 1000)
      mgr.registerTimer("timeout-1", timer)

      const interval = setInterval(() => {}, 1000)
      mgr.registerInterval("interval-1", interval)

      await mgr.shutdown()

      // clearTimeout and clearInterval should have been called for our timers
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer)
      expect(clearIntervalSpy).toHaveBeenCalledWith(interval)
    })

    it("calls unsub on registered subscriptions during shutdown", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const unsub = vi.fn()
      mgr.register({ type: "subscription", id: "sub-1", unsub })

      await mgr.shutdown()
      expect(unsub).toHaveBeenCalledOnce()
    })

    it("calls kill on registered subprocesses during shutdown", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const kill = vi.fn()
      mgr.register({ type: "subprocess", id: "proc-1", kill })

      await mgr.shutdown()
      expect(kill).toHaveBeenCalledOnce()
    })

    it("invokes external dependencies during shutdown", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      await mgr.shutdown()

      expect(mockEventBusDestroy).toHaveBeenCalled()
      expect(mockCancelPendingRefresh).toHaveBeenCalled()
    })

    it("counts cleaned resources correctly", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      mgr.registerAbortController("ac-1")
      const timer = setTimeout(() => {}, 100000)
      mgr.registerTimer("t-1", timer)
      mgr.register({ type: "subprocess", id: "p-1", kill: vi.fn() })
      mgr.register({ type: "subscription", id: "s-1", unsub: vi.fn() })

      const report = await mgr.shutdown()
      // 1 abort-controller + 1 timer + 1 subprocess + 1 subscription = 4
      expect(report.resourcesCleaned).toBe(4)
    })
  })

  // ── Double-invocation safety ──

  describe("double-invocation safety", () => {
    it("returns a no-op report on second shutdown call", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const first = await mgr.shutdown()
      expect(first.success).toBe(true)
      expect(first.phases.length).toBeGreaterThan(0)

      const second = await mgr.shutdown()
      expect(second.success).toBe(true)
      expect(second.durationMs).toBe(0)
      expect(second.resourcesCleaned).toBe(0)
      expect(second.errors).toHaveLength(0)
      expect(second.phases).toHaveLength(0)
    })

    it("only cleans resources once across two calls", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      mgr.registerAbortController("ac-1")
      mgr.register({ type: "subscription", id: "sub-1", unsub: vi.fn() })

      const first = await mgr.shutdown()
      expect(first.resourcesCleaned).toBeGreaterThanOrEqual(2)

      // Second call should have no resources to clean
      const second = await mgr.shutdown()
      expect(second.resourcesCleaned).toBe(0)
    })

    it("only invokes external cleanup once", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      await mgr.shutdown()
      await mgr.shutdown()

      expect(mockEventBusDestroy).toHaveBeenCalledTimes(1)
    })

    it("does not abort controllers a second time", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const ctrl = mgr.registerAbortController("ac-1")
      const abortSpy = vi.fn()
      ctrl.signal.addEventListener("abort", abortSpy)

      await mgr.shutdown()
      expect(abortSpy).toHaveBeenCalledTimes(1)

      await mgr.shutdown()
      // After abort, aborted stays true but new event listeners aren't fired
      expect(abortSpy).toHaveBeenCalledTimes(1)
    })

    it("preserves isShuttingDown and isShutdown state", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      expect(mgr.isShuttingDown).toBe(false)
      expect(mgr.isShutdown).toBe(false)

      await mgr.shutdown()

      expect(mgr.isShuttingDown).toBe(true)
      expect(mgr.isShutdown).toBe(true)
    })
  })

  // ── Reset ──

  describe("reset", () => {
    it("clears all registered resources", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      mgr.registerAbortController("ac-1")
      mgr.register({ type: "subscription", id: "s-1", unsub: vi.fn() })
      expect(mgr.getResourceCount()).toBe(2)

      mgr.reset()
      expect(mgr.getResourceCount()).toBe(0)
    })

    it("resets shutdown state flags", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      await mgr.shutdown()
      expect(mgr.isShuttingDown).toBe(true)
      expect(mgr.isShutdown).toBe(true)

      mgr.reset()
      expect(mgr.isShuttingDown).toBe(false)
      expect(mgr.isShutdown).toBe(false)
    })

    it("allows a fresh shutdown after reset", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      await mgr.shutdown()
      mgr.reset()

      const report = await mgr.shutdown()
      expect(report.success).toBe(true)
      expect(report.phases.length).toBeGreaterThan(0)
    })

    it("provides a new abort signal after reset", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const oldSignal = mgr.signal
      await mgr.shutdown()
      expect(oldSignal.aborted).toBe(true)

      mgr.reset()
      expect(mgr.signal.aborted).toBe(false)
      expect(mgr.signal).not.toBe(oldSignal)
    })
  })

  // ── onShutdown listeners ──

  describe("onShutdown listeners", () => {
    it("returns an unsub function that removes the listener", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const listener = vi.fn()
      const unsub = mgr.onShutdown("l-1", listener)

      unsub()
      await mgr.shutdown()
      expect(listener).not.toHaveBeenCalled()
    })

    it("runs multiple listeners in order", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      const order: number[] = []
      mgr.onShutdown("l-1", async () => { order.push(1) })
      mgr.onShutdown("l-2", async () => { order.push(2) })
      mgr.onShutdown("l-3", async () => { order.push(3) })

      await mgr.shutdown()
      expect(order).toEqual([1, 2, 3])
    })

    it("collects errors from failing listeners without crashing", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      mgr.onShutdown("bad", async () => { throw new Error("listener failed") })
      mgr.onShutdown("good", vi.fn())

      const report = await mgr.shutdown()
      expect(report.success).toBe(false)
      expect(report.errors.length).toBeGreaterThan(0)
      expect(report.errors[0]).toContain("listener failed")
    })
  })

  // ── Error resilience ──

  describe("error resilience", () => {
    it("continues shutdown when an abort controller fails", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      // Register an abort controller whose abort() throws
      const badCtrl = new AbortController()
      vi.spyOn(badCtrl, "abort").mockImplementation(() => {
        throw new Error("abort failed")
      })
      mgr.register({ type: "abort-controller", id: "bad", controller: badCtrl })

      // Register a good one that works
      const goodCtrl = mgr.registerAbortController("good")
      const goodSpy = vi.fn()
      goodCtrl.signal.addEventListener("abort", goodSpy)

      const report = await mgr.shutdown()

      // Shutdown should complete despite the error
      expect(mgr.isShutdown).toBe(true)
      expect(report.success).toBe(false)
      expect(report.errors.length).toBeGreaterThan(0)
      expect(report.errors[0]).toContain("abort failed")
    })

    it("continues shutdown when a listener fails", async () => {
      const { RuntimeCleanupManager } = await import("./RuntimeCleanupManager")
      const mgr = RuntimeCleanupManager.getInstance()

      mgr.onShutdown("bad", async () => { throw new Error("boom") })
      mgr.onShutdown("good", async () => { /* succeeds */ })

      const report = await mgr.shutdown()

      expect(mgr.isShutdown).toBe(true)
      expect(report.success).toBe(false)
      expect(report.errors.some((e) => e.includes("boom"))).toBe(true)
    })
  })
})
