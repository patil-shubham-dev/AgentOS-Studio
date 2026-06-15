import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"

describe("MemoryArchitecture", () => {
  let arch: MemoryArchitecture

  beforeEach(async () => {
    arch = MemoryArchitecture.getInstance()
    await arch.initialize({
      extractionEnabled: true,
      consolidationEnabled: false,
      autoInjectEnabled: true,
    })
    await arch.clear()
  })

  afterEach(() => {
    arch.destroy()
  })

  function makeEvent(type: ExecutionEvent["type"], overrides: Record<string, unknown> = {}): ExecutionEvent {
    return { executionId: "exec-1", timestamp: Date.now(), type, ...overrides } as unknown as ExecutionEvent
  }

  describe("initialize", () => {
    it("sets initialized flag", () => {
      expect(arch.isInitialized()).toBe(true)
    })

    it("can be re-initialized without error", async () => {
      await arch.initialize()
      expect(arch.isInitialized()).toBe(true)
    })
  })

  describe("ingestExecutionEvent", () => {
    it("stores candidates from EXECUTION_COMPLETE with content", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "Refactored the database layer", filesEdited: 3, commandsRun: 1, toolCalls: 10 }),
        "execution_complete",
      )
      const entries = await arch.getAll()
      const learning = entries.find((e) => e.category === "learning")
      expect(learning).toBeDefined()
      expect(learning!.content).toContain("Refactored the database layer")
    })

    it("stores candidates from GOAL_ACHIEVED", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("GOAL_ACHIEVED", { objective: "Complete user authentication system", iterations: 3, stepsCompleted: 15 }),
        "goal_achieved",
      )
      const entries = await arch.getAll()
      expect(entries.length).toBeGreaterThanOrEqual(1)
      expect(entries[0].type).toBe("long_term")
    })

    it("stores browser navigation memories", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("BROWSER_NAVIGATE", { url: "https://docs.example.com", title: "Docs" }),
        "execution_complete",
      )
      const entries = await arch.getAll()
      const browser = entries.find((e) => e.type === "browser")
      expect(browser).toBeDefined()
      expect(browser!.content).toContain("docs.example.com")
    })

    it("stores verification failure memories", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("VERIFY_FAILED", { lintErrors: 5, typeErrors: 2 }),
        "execution_complete",
      )
      const entries = await arch.getAll()
      expect(entries.length).toBeGreaterThanOrEqual(1)
      expect(entries[0].category).toBe("error")
    })

    it("skips events when extraction is disabled", async () => {
      const disabledArch = MemoryArchitecture.getInstance()
      await disabledArch.initialize({ extractionEnabled: false })
      await disabledArch.clear()

      await disabledArch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "test", filesEdited: 0, commandsRun: 0, toolCalls: 0 }),
        "execution_complete",
      )
      const entries = await disabledArch.getAll()
      expect(entries).toHaveLength(0)
    })

    it("skips events with unregistered trigger", async () => {
      const arch2 = MemoryArchitecture.getInstance()
      await arch2.initialize({ extractionTriggers: ["manual"] })
      await arch2.clear()

      await arch2.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "test", filesEdited: 0, commandsRun: 0, toolCalls: 0 }),
        "execution_complete",
      )
      const entries = await arch2.getAll()
      expect(entries).toHaveLength(0)
    })

    it("stores browser action candidates with scored importance >= 0.3", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("BROWSER_CLICK", { selector: "#btn", durationMs: 100 }),
        "execution_complete",
      )
      const entries = await arch.getAll({ minImportance: 0.3 })
      const browserEntries = entries.filter((e) => e.type === "browser")
      expect(browserEntries.length).toBeGreaterThanOrEqual(1)
    })

    it("stores candidates with scored importance >= 0.3", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "test", filesEdited: 0, commandsRun: 0, toolCalls: 0 }),
        "execution_complete",
      )
      const entries = await arch.getAll()
      expect(entries.every((e) => e.importance >= 0.3)).toBe(true)
    })
  })

  describe("ingestExecutionEvents", () => {
    it("processes multiple events in batch", async () => {
      await arch.ingestExecutionEvents([
        makeEvent("EXECUTION_COMPLETE", { content: "First task", filesEdited: 1, commandsRun: 0, toolCalls: 2 }),
        makeEvent("EXECUTION_COMPLETE", { content: "Second task", filesEdited: 2, commandsRun: 1, toolCalls: 5 }),
      ], "execution_complete")
      const entries = await arch.getAll()
      expect(entries.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe("storeManualMemory", () => {
    it("stores a manual memory entry", async () => {
      const content = await arch.storeManualMemory({
        content: "Always validate user input on the server side",
        tags: ["security", "convention"],
        category: "convention",
        source: "manual",
      })
      expect(content).toBeTruthy()
      const entries = await arch.getAll()
      const manual = entries.find((e) => e.source === "manual")
      expect(manual).toBeDefined()
      expect(manual!.tags).toContain("security")
    })
  })

  describe("query and search", () => {
    it("queries by text", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "Implemented caching layer", filesEdited: 2, commandsRun: 0, toolCalls: 4 }),
        "execution_complete",
      )
      const results = await arch.query({ text: "caching" })
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it("performs ranked search via retrieval", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "Built the authentication module", filesEdited: 3, commandsRun: 0, toolCalls: 5 }),
        "execution_complete",
      )
      const results = await arch.search({ text: "authentication" })
      expect(results.entries.length).toBeGreaterThanOrEqual(1)
      expect(results.totalMatches).toBeGreaterThanOrEqual(1)
    })

    it("searches by file", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("FILE_EDIT", { path: "/src/auth.ts", additions: 5, deletions: 0 }),
        "execution_complete",
      )
      const results = await arch.searchByFile("/src/auth.ts")
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it("searches by tag", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "Fixed critical bug", filesEdited: 1, commandsRun: 0, toolCalls: 2 }),
        "execution_complete",
      )
      const results = await arch.searchByTag(["execution"])
      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("CRUD operations", () => {
    it("gets entry by id", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "test", filesEdited: 0, commandsRun: 0, toolCalls: 0 }),
        "execution_complete",
      )
      const all = await arch.getAll()
      if (all.length > 0) {
        const retrieved = await arch.get(all[0].id)
        expect(retrieved).toBeDefined()
        expect(retrieved!.id).toBe(all[0].id)
      }
    })

    it("updates entry fields", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "original", filesEdited: 0, commandsRun: 0, toolCalls: 0 }),
        "execution_complete",
      )
      const all = await arch.getAll()
      if (all.length > 0) {
        await arch.update(all[0].id, { importance: 0.95 })
        const updated = await arch.get(all[0].id)
        expect(updated!.importance).toBe(0.95)
      }
    })

    it("deletes an entry", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "to delete", filesEdited: 0, commandsRun: 0, toolCalls: 0 }),
        "execution_complete",
      )
      const all = await arch.getAll()
      if (all.length > 0) {
        await arch.delete(all[0].id)
        const deleted = await arch.get(all[0].id)
        expect(deleted).toBeUndefined()
      }
    })
  })

  describe("getStats", () => {
    it("returns aggregated statistics", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "test task", filesEdited: 1, commandsRun: 0, toolCalls: 2 }),
        "execution_complete",
      )
      const stats = await arch.getStats()
      expect(stats.totalEntries).toBeGreaterThanOrEqual(1)
      expect(stats.averageImportance).toBeGreaterThan(0)
    })
  })

  describe("clear and clearScope", () => {
    it("clears all entries", async () => {
      await arch.ingestExecutionEvent(
        makeEvent("EXECUTION_COMPLETE", { content: "test", filesEdited: 0, commandsRun: 0, toolCalls: 0 }),
        "execution_complete",
      )
      await arch.clear()
      const entries = await arch.getAll()
      expect(entries).toHaveLength(0)
    })

    it("clears by scope", async () => {
      await arch.clear()
      await arch.storeManualMemory({
        content: "project memory",
        scope: "project",
      })
      await arch.clearScope("project")
      const entries = await arch.getAll()
      expect(entries.every((e) => e.scope !== "project")).toBe(true)
    })
  })
})
