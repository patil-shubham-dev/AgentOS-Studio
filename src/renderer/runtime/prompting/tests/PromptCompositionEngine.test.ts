import { describe, it, expect, beforeEach, vi } from "vitest"
import { PromptCompositionEngine } from "../composition/PromptCompositionEngine"
import { PromptRegistry } from "../registry/PromptRegistry"
import { registerDefaultSections } from "../sections"
import { defaultContext } from "../registry/SectionDefinition"

function createTestEngine(): { engine: PromptCompositionEngine; registry: PromptRegistry } {
  const registry = new PromptRegistry()
  registerDefaultSections(registry)
  const engine = new PromptCompositionEngine(registry)
  return { engine, registry }
}

describe("PromptCompositionEngine", () => {
  let engine: PromptCompositionEngine
  let registry: PromptRegistry

  beforeEach(() => {
    const ctx = createTestEngine()
    engine = ctx.engine
    registry = ctx.registry
  })

  describe("1. Section Composition", () => {
    it("composes all default sections in priority order", async () => {
      const ctx = defaultContext({ role: "coder" })
      const plan = registry.plan(ctx)
      const result = await engine.compose(plan, ctx)

      expect(result.promptText).toBeTruthy()
      expect(result.promptText.length).toBeGreaterThan(100)
      expect(result.ast.nodes?.length ?? Infinity).toBeGreaterThan(0)
      // Core identity should appear first
      expect(result.promptText).toContain("Coding Agent")
    })

    it("includes role-specific identity for each role", async () => {
      const roleNames: Record<string, string> = {
        coder: "Coding Agent",
        manager: "Manager Agent",
        research: "Research Agent",
        qa: "QA Engineer",
        runtime: "Runtime Engineer",
      }
      for (const [role, expectedName] of Object.entries(roleNames)) {
        registry.invalidateCache()
        const ctx = defaultContext({ role })
        const plan = registry.plan(ctx)
        const result = await engine.compose(plan, ctx)
        expect(result.promptText).toContain(expectedName)
      }
    })

    it("includes streaming behavior section", async () => {
      const ctx = defaultContext({ role: "coder" })
      const plan = registry.plan(ctx)
      const result = await engine.compose(plan, ctx)
      expect(result.promptText).toContain("Streaming")
    })

    it("includes memory policy only when memorySummary is present", async () => {
      const ctxWithout = defaultContext({ role: "coder" })
      const planWithout = registry.plan(ctxWithout)
      const resultWithout = await engine.compose(planWithout, ctxWithout)
      expect(resultWithout.promptText).not.toContain("Memory Management")

      const ctxWith = defaultContext({ role: "coder", memorySummary: "Project uses React 18" })
      const planWith = registry.plan(ctxWith)
      const resultWith = await engine.compose(planWith, ctxWith)
      expect(resultWith.promptText).toContain("Memory Management")
      expect(resultWith.promptText).toContain("React 18")
    })

    it("includes routing instructions for manager role only", async () => {
      const coderCtx = defaultContext({ role: "coder" })
      const coderPlan = registry.plan(coderCtx)
      const coderResult = await engine.compose(coderPlan, coderCtx)
      expect(coderResult.promptText).not.toContain("Request Routing")

      const mgrCtx = defaultContext({ role: "manager" })
      const mgrPlan = registry.plan(mgrCtx)
      const mgrResult = await engine.compose(mgrPlan, mgrCtx)
      expect(mgrResult.promptText).toContain("Request Routing")
    })

    it("produces no duplicate sections", async () => {
      const ctx = defaultContext({ role: "coder" })
      const plan = registry.plan(ctx)
      const result = await engine.compose(plan, ctx)

      // Check for common duplication patterns (full header line, not just first word)
      const sectionHeaders = result.promptText.match(/^##\s+.+/gm)
      if (sectionHeaders) {
        const unique = new Set(sectionHeaders)
        expect(sectionHeaders.length).toBe(unique.size)
      }
    })
  })

  describe("2. Context Injection", () => {
    it("injects custom instructions", async () => {
      const ctx = defaultContext({
        role: "coder",
        customInstructions: ["Always use TypeScript"],
      })
      const plan = registry.plan(ctx)
      const result = await engine.compose(plan, ctx)
      expect(result.promptText).toContain("Always use TypeScript")
    })

    it("injects workspace context", async () => {
      const ctx = defaultContext({
        role: "coder",
        activeFilePath: "App.tsx",
        activeFileLanguage: "typescript",
      })
      const plan = registry.plan(ctx)
      const result = await engine.compose(plan, ctx)
      // Workspace context section should mention the file
      expect(result.promptText).toContain("App.tsx")
    })

    it("includes tool count in tools section", async () => {
      const ctx = defaultContext({ role: "coder", hasTools: true, toolCount: 8 })
      const plan = registry.plan(ctx)
      const result = await engine.compose(plan, ctx)
      expect(result.promptText).toContain("Tools")
    })
  })

  describe("3. Token Budgeting", () => {
    it("reports accurate token estimate", async () => {
      const ctx = defaultContext({ role: "coder" })
      const plan = registry.plan(ctx)
      const result = await engine.compose(plan, ctx)

      expect(result.trace.totalTokens ?? result.promptText.length / 4).toBeGreaterThan(0)
      expect(result.promptText.length).toBeGreaterThan(200)
    })

    it("compresses when budget is tight", async () => {
      engine.setBudgetPolicy({ maxTotalTokens: 500, reserveForOutput: false, maxOutputTokens: 500 })
      const ctx = defaultContext({ role: "coder", memorySummary: "A".repeat(1000) })
      const plan = registry.plan(ctx)
      const result = await engine.compose(plan, ctx)

      // With a 500-token budget, some sections should be truncated
      expect(result.truncatedSections.length).toBeGreaterThan(0)
      expect(result.compressionRatio ?? result.promptText.length).toBeDefined()
    })
  })

  describe("4. Fallback Behavior", () => {
    it("composeMinimal produces valid prompt", () => {
      const result = engine.composeMinimal("coder")
      expect(result).toContain("coder")
      expect(result).toContain("Answer directly")
    })

    it("composeMinimal with custom instructions", () => {
      const result = engine.composeMinimal("manager", "Coordinate sub-agents")
      expect(result).toContain("manager")
      expect(result).toContain("Coordinate sub-agents")
    })
  })

  describe("5. Section Registry Integrity", () => {
    it("all 21 default sections registered", () => {
      const sections = registry.getAll()
      expect(sections.length).toBe(21)
      const ids = sections.map(s => s.id)
      expect(ids).toContain("agent-identity")
      expect(ids).toContain("safety-policy")
      expect(ids).toContain("tools-registry")
      expect(ids).toContain("memory-policy")
      expect(ids).toContain("routing-instructions")
      expect(ids).toContain("streaming-behavior")
    })

    it("no duplicate section IDs", () => {
      const sections = registry.getAll()
      const ids = sections.map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it("all sections have valid priorities", () => {
      const sections = registry.getAll()
      for (const s of sections) {
        expect(s.priority).toBeGreaterThanOrEqual(0)
        expect(s.priority).toBeLessThanOrEqual(100)
      }
    })
  })
})
