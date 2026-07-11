import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { MemoryObserver } from "@/runtime/memory/MemoryObserver"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"

vi.mock("@/runtime/observability/ObservabilityManager", () => ({
  ObservabilityManager: {
    getInstance: () => ({
      getReplay: () => ({
        subscribe: vi.fn().mockReturnValue(() => {}),
      }),
    }),
  },
}))

describe("MemoryObserver", () => {
  let observer: MemoryObserver

  beforeEach(() => {
    vi.spyOn(MemoryArchitecture, "getInstance").mockReturnValue({
      ingestExecutionEvent: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
    } as unknown as MemoryArchitecture)

    observer = MemoryObserver.getInstance()
  })

  afterEach(() => {
    observer.disable()
    vi.restoreAllMocks()
  })

  describe("getInstance", () => {
    it("returns the same instance", () => {
      const a = MemoryObserver.getInstance()
      const b = MemoryObserver.getInstance()
      expect(a).toBe(b)
    })
  })

  describe("enable / disable", () => {
    it("enable sets up subscriber", () => {
      observer.enable()
      expect(() => observer.enable()).not.toThrow()
    })

    it("disable unsubscribes", () => {
      observer.enable()
      observer.disable()
      expect(() => observer.disable()).not.toThrow()
    })
  })
})
