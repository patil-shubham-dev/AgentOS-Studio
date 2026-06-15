import { describe, it, expect, beforeEach, vi } from "vitest"
import { PreCompactHookSystem } from "@/runtime/context/PreCompactHookSystem"
import type { PreCompactHookName } from "@/runtime/context/context-types"

describe("PreCompactHookSystem", () => {
  let system: PreCompactHookSystem

  beforeEach(() => {
    system = new PreCompactHookSystem()
  })

  describe("registerHook", () => {
    it("registers a hook by name", () => {
      system.registerHook("memory_extraction", {
        name: "memory_extraction",
        priority: 10,
        execute: async () => ({ preservedContent: "memory data", metadata: {}, sizeTokens: 100 }),
      })
      expect(system.getRegisteredHooks()).toContain("memory_extraction")
    })
  })

  describe("executeAll", () => {
    it("executes hooks in priority order", async () => {
      const order: number[] = []
      system.registerHook("execution_summary", {
        name: "execution_summary",
        priority: 20,
        execute: async () => { order.push(20); return { preservedContent: "", metadata: {}, sizeTokens: 0 } },
      })
      system.registerHook("workspace_snapshot", {
        name: "workspace_snapshot",
        priority: 10,
        execute: async () => { order.push(10); return { preservedContent: "", metadata: {}, sizeTokens: 0 } },
      })
      system.registerHook("memory_extraction", {
        name: "memory_extraction",
        priority: 30,
        execute: async () => { order.push(30); return { preservedContent: "", metadata: {}, sizeTokens: 0 } },
      })
      await system.executeAll()
      expect(order).toEqual([10, 20, 30])
    })

    it("handles hook failures gracefully", async () => {
      const origError = console.error
      console.error = vi.fn()
      system.registerHook("memory_extraction", {
        name: "memory_extraction",
        priority: 10,
        execute: async () => { throw new Error("hook error") },
      })
      const results = await system.executeAll()
      const result = results.get("memory_extraction")
      expect(result).toBeDefined()
      expect(result!.metadata).toHaveProperty("error")
      console.error = origError
    })
  })

  describe("executeByNames", () => {
    it("executes only specified hooks", async () => {
      let executed1 = false
      let executed2 = false
      system.registerHook("memory_extraction", {
        name: "memory_extraction",
        priority: 10,
        execute: async () => { executed1 = true; return { preservedContent: "m1", metadata: {}, sizeTokens: 50 } },
      })
      system.registerHook("execution_summary", {
        name: "execution_summary",
        priority: 10,
        execute: async () => { executed2 = true; return { preservedContent: "e1", metadata: {}, sizeTokens: 100 } },
      })
      await system.executeByNames(["memory_extraction"])
      expect(executed1).toBe(true)
      expect(executed2).toBe(false)
    })
  })

  describe("getTotalPreservedTokens", () => {
    it("sums token sizes from results", () => {
      const results = new Map()
      results.set("memory_extraction", { preservedContent: "a", metadata: {}, sizeTokens: 100 })
      results.set("execution_summary", { preservedContent: "b", metadata: {}, sizeTokens: 200 })
      expect(system.getTotalPreservedTokens(results)).toBe(300)
    })
  })

  describe("registerExecutor", () => {
    it("executes a registered executor function via executeByNames", async () => {
      let called = false
      system.registerExecutor("workspace_snapshot", async () => {
        called = true
        return { preservedContent: "snapshot", metadata: {}, sizeTokens: 150 }
      })
      const results = await system.executeByNames(["workspace_snapshot"])
      expect(called).toBe(true)
      expect(results.get("workspace_snapshot")!.preservedContent).toBe("snapshot")
    })
  })

  describe("unregisterHook", () => {
    it("removes a hook", () => {
      system.registerHook("memory_extraction", {
        name: "memory_extraction",
        priority: 10,
        execute: async () => ({ preservedContent: "", metadata: {}, sizeTokens: 0 }),
      })
      system.unregisterHook("memory_extraction")
      expect(system.getRegisteredHooks()).not.toContain("memory_extraction")
    })
  })

  describe("clear", () => {
    it("removes all hooks", () => {
      system.registerHook("memory_extraction", {
        name: "memory_extraction",
        priority: 10,
        execute: async () => ({ preservedContent: "", metadata: {}, sizeTokens: 0 }),
      })
      system.clear()
      expect(system.getRegisteredHooks()).toHaveLength(0)
    })
  })
})
