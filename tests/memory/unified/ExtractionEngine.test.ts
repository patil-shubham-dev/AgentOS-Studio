import { describe, it, expect, beforeEach } from "vitest"
import { ExtractionEngine } from "@/runtime/memory/unified/ExtractionEngine"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { ExtractionTrigger } from "@/runtime/memory/unified/types"

describe("ExtractionEngine", () => {
  let engine: ExtractionEngine

  beforeEach(() => {
    engine = new ExtractionEngine()
  })

  function makeEvent(type: ExecutionEvent["type"], overrides: Record<string, unknown> = {}): ExecutionEvent {
    return { executionId: "exec-1", timestamp: Date.now(), type, ...overrides } as unknown as ExecutionEvent
  }

  describe("extractFromEvent", () => {
    it("extracts nothing from unsupported event types", async () => {
      const event = makeEvent("AGENT_ASSIGNED", { roleId: "coder", roleName: "Coder", stepId: "s1" })
      const result = await engine.extractFromEvent(event, "execution_complete")
      expect(result.candidates).toHaveLength(0)
    })

    describe("EXECUTION_COMPLETE", () => {
      it("extracts a learning candidate with content", async () => {
        const event = makeEvent("EXECUTION_COMPLETE", { content: "Implemented the feature", filesEdited: 2, commandsRun: 1, toolCalls: 5 })
        const result = await engine.extractFromEvent(event, "execution_complete")
        expect(result.candidates.length).toBeGreaterThanOrEqual(1)
        const learning = result.candidates.find((c) => c.category === "learning")
        expect(learning).toBeDefined()
        expect(learning!.content).toContain("Implemented the feature")
      })

      it("extracts a workflow summary when files were edited", async () => {
        const event = makeEvent("EXECUTION_COMPLETE", { content: "done", filesEdited: 3, commandsRun: 2 })
        const result = await engine.extractFromEvent(event, "execution_complete")
        const workflow = result.candidates.find((c) => c.category === "workflow")
        expect(workflow).toBeDefined()
        expect(workflow!.content).toContain("3 file(s)")
      })

      it("skips workflow when no files edited", async () => {
        const event = makeEvent("EXECUTION_COMPLETE", { content: "done", filesEdited: 0, commandsRun: 0, toolCalls: 0 })
        const result = await engine.extractFromEvent(event, "execution_complete")
        const workflow = result.candidates.find((c) => c.category === "workflow")
        expect(workflow).toBeUndefined()
      })
    })

    describe("GOAL_ACHIEVED", () => {
      it("extracts a long-term project scope candidate", async () => {
        const event = makeEvent("GOAL_ACHIEVED", { objective: "Build a responsive dashboard", iterations: 5, stepsCompleted: 20 })
        const result = await engine.extractFromEvent(event, "goal_achieved")
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0].type).toBe("long_term")
        expect(result.candidates[0].scope).toBe("project")
        expect(result.candidates[0].importance).toBeGreaterThan(0.8)
      })

      it("returns empty when objective is missing", async () => {
        const event = makeEvent("GOAL_ACHIEVED", {})
        const result = await engine.extractFromEvent(event, "goal_achieved")
        expect(result.candidates).toHaveLength(0)
      })
    })

    describe("TOOL_COMPLETE", () => {
      it("extracts ephemeral tool_usage candidate", async () => {
        const event = makeEvent("TOOL_COMPLETE", { toolName: "grep_files", result: "found", durationMs: 150 })
        const result = await engine.extractFromEvent(event, "execution_complete")
        const toolUsage = result.candidates.find((c) => c.category === "tool_usage")
        expect(toolUsage).toBeDefined()
        expect(toolUsage!.scope).toBe("ephemeral")
        expect(toolUsage!.ttl).toBeGreaterThan(0)
      })

      it("extracts pattern candidate for file operations", async () => {
        const event = makeEvent("TOOL_COMPLETE", { toolName: "write_file", result: "written", durationMs: 50 })
        const result = await engine.extractFromEvent(event, "execution_complete")
        const pattern = result.candidates.find((c) => c.category === "pattern")
        expect(pattern).toBeDefined()
      })
    })

    describe("FILE_EDIT", () => {
      it("extracts a pattern candidate with file path", async () => {
        const event = makeEvent("FILE_EDIT", { path: "/src/index.ts", additions: 10, deletions: 2 })
        const result = await engine.extractFromEvent(event, "execution_complete")
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0].filePaths).toContain("/src/index.ts")
        expect(result.candidates[0].content).toContain("/src/index.ts")
      })

      it("returns empty when path is missing", async () => {
        const event = makeEvent("FILE_EDIT", {})
        const result = await engine.extractFromEvent(event, "execution_complete")
        expect(result.candidates).toHaveLength(0)
      })
    })

    describe("VERIFY_PASSED", () => {
      it("extracts a verification passed candidate", async () => {
        const event = makeEvent("VERIFY_PASSED", { details: ["lint passed", "types passed"] })
        const result = await engine.extractFromEvent(event, "execution_complete")
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0].tags).toContain("passed")
        expect(result.candidates[0].confidence).toBeGreaterThan(0.8)
      })

      it("marks importance higher for recovered verifications", async () => {
        const normal = makeEvent("VERIFY_PASSED", { details: [] })
        const recovered = makeEvent("VERIFY_PASSED", { details: [], recovered: true })
        const normalResult = await engine.extractFromEvent(normal, "execution_complete")
        const recoveredResult = await engine.extractFromEvent(recovered, "execution_complete")
        expect(recoveredResult.candidates[0].importance).toBeGreaterThan(normalResult.candidates[0].importance)
      })
    })

    describe("VERIFY_FAILED", () => {
      it("extracts an error candidate with failure details", async () => {
        const event = makeEvent("VERIFY_FAILED", { lintErrors: 3, typeErrors: 1, testFailures: 2 })
        const result = await engine.extractFromEvent(event, "execution_complete")
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0].category).toBe("error")
        expect(result.candidates[0].content).toContain("3 lint error(s)")
        expect(result.candidates[0].content).toContain("1 type error(s)")
      })
    })

    describe("BROWSER_NAVIGATE", () => {
      it("extracts a browser_action candidate with URL", async () => {
        const event = makeEvent("BROWSER_NAVIGATE", { url: "https://example.com", title: "Example" })
        const result = await engine.extractFromEvent(event, "execution_complete")
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0].category).toBe("browser_action")
        expect(result.candidates[0].content).toContain("https://example.com")
      })

      it("returns empty when URL is missing", async () => {
        const event = makeEvent("BROWSER_NAVIGATE", {})
        const result = await engine.extractFromEvent(event, "execution_complete")
        expect(result.candidates).toHaveLength(0)
      })
    })

    describe("BROWSER_CLICK / BROWSER_TYPE", () => {
      it("extracts ephemeral browser_action", async () => {
        const click = makeEvent("BROWSER_CLICK", { selector: "#submit-btn" })
        const result = await engine.extractFromEvent(click, "execution_complete")
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0].scope).toBe("ephemeral")
        expect(result.candidates[0].ttl).toBeGreaterThan(0)
      })
    })

    describe("EXECUTION_FAILED", () => {
      it("extracts an error candidate with error message", async () => {
        const event = makeEvent("EXECUTION_FAILED", { error: "TypeError: Cannot read property" })
        const result = await engine.extractFromEvent(event, "execution_complete")
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0].category).toBe("error")
        expect(result.candidates[0].content).toContain("TypeError")
      })
    })
  })

  describe("extractFromEvents", () => {
    it("processes multiple events and aggregates candidates", async () => {
      const events = [
        makeEvent("EXECUTION_COMPLETE", { content: "Task done", filesEdited: 1, commandsRun: 0, toolCalls: 3 }),
        makeEvent("GOAL_ACHIEVED", { objective: "Complete the task" }),
      ]
      const result = await engine.extractFromEvents(events, "execution_complete")
      expect(result.candidates.length).toBeGreaterThanOrEqual(2)
      expect(result.sourceEventCount).toBe(2)
    })
  })

  describe("extractManual", () => {
    it("creates a project-scope candidate from manual input", async () => {
      const result = await engine.extractManual({ content: "Remember to always use TypeScript strict mode", tags: ["convention"] })
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0].content).toContain("TypeScript strict mode")
      expect(result.candidates[0].scope).toBe("project")
      expect(result.trigger).toBe("manual")
    })
  })

  describe("trigger tracking", () => {
    it("records the trigger type in the result", async () => {
      const triggers: ExtractionTrigger[] = ["execution_complete", "goal_achieved", "compaction", "manual"]
      for (const trigger of triggers) {
        const event = makeEvent("EXECUTION_COMPLETE", { content: "test", filesEdited: 0, commandsRun: 0, toolCalls: 0 })
        const result = await engine.extractFromEvent(event, trigger)
        expect(result.trigger).toBe(trigger)
      }
    })
  })
})
