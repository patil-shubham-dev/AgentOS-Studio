import { describe, it, expect } from "vitest"
import { route, classifyIntent } from "@/runtime/manager-routing-engine"
import { resolveExecutionMode } from "@/runtime/execution/UnifiedExecutor"
import type { RoutingDecision } from "@/runtime/manager-routing-engine"

/**
 * Mode dispatch regression test.
 *
 * resolveExecutionMode() is the single source of truth for mode dispatch
 * in UnifiedExecutor.execute(). Every test here calls the REAL exported
 * function — never a hand-written simulation — so logic drift is impossible.
 *
 * The guard invariant: a RoutingDecision with mode:"fast" AND strategy:"direct"
 * MUST result in mode "FAST" regardless of reqMode, because "direct" means the
 * routing engine explicitly determined no role delegation is needed.
 */

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    requiresDelegation: false,
    selectedRoles: [],
    executionStrategy: "single-agent",
    mode: "full",
    reasoning: "test",
    intentCategory: "conversation",
    ...overrides,
  }
}

describe("resolveExecutionMode — single source of truth", () => {
  it("fast + direct → FAST regardless of reqMode (full, undefined, fast)", () => {
    const d = makeDecision({ mode: "fast", executionStrategy: "direct" })
    expect(resolveExecutionMode(d, "full")).toBe("FAST")
    expect(resolveExecutionMode(d, undefined)).toBe("FAST")
    expect(resolveExecutionMode(d, "fast")).toBe("FAST")
  })

  it("fast + single-agent → FULL when reqMode=full, FAST when reqMode=undefined", () => {
    const d = makeDecision({ mode: "fast", executionStrategy: "single-agent" })
    expect(resolveExecutionMode(d, "full")).toBe("FULL")
    expect(resolveExecutionMode(d, undefined)).toBe("FAST")
    expect(resolveExecutionMode(d, "fast")).toBe("FAST")
  })

  it("full + any strategy → FULL", () => {
    const dDirect = makeDecision({ mode: "full", executionStrategy: "direct" })
    const dSingle = makeDecision({ mode: "full", executionStrategy: "single-agent" })
    expect(resolveExecutionMode(dDirect, undefined)).toBe("FULL")
    expect(resolveExecutionMode(dDirect, "full")).toBe("FULL")
    expect(resolveExecutionMode(dSingle, undefined)).toBe("FULL")
    expect(resolveExecutionMode(dSingle, "full")).toBe("FULL")
  })

  it("reqMode=fast always wins → FAST", () => {
    const d = makeDecision({ mode: "full", executionStrategy: "single-agent" })
    expect(resolveExecutionMode(d, "fast")).toBe("FAST")
  })

  it("reqMode=autonomous → FULL", () => {
    const d = makeDecision({ mode: "fast", executionStrategy: "direct" })
    expect(resolveExecutionMode(d, "autonomous")).toBe("FULL")
  })

  it("default (no match) → FULL", () => {
    const d = makeDecision({ mode: "full" as const, executionStrategy: "multi-agent" as any })
    expect(resolveExecutionMode(d, undefined)).toBe("FULL")
  })
})

describe("Routing decisions for real inputs", () => {
  it("high-confidence greeting → mode:fast, strategy:direct, selectedRoles:[]", () => {
    const d = route("hello", ["manager"])
    expect(d.mode).toBe("fast")
    expect(d.executionStrategy).toBe("direct")
    expect(d.selectedRoles).toEqual([])
  })

  it("simple thanks → mode:fast, strategy:direct", () => {
    const d = route("thanks", ["manager"])
    expect(d.mode).toBe("fast")
    expect(d.executionStrategy).toBe("direct")
  })

  it("coding request → mode:full, strategy:single-agent", () => {
    const d = route("fix the login bug", ["manager", "coder"])
    expect(d.mode).toBe("full")
    expect(d.executionStrategy).toBe("single-agent")
  })

  it("research request → mode:full, single-agent", () => {
    const d = route("research the architecture of this project", ["manager", "research"])
    expect(d.mode).toBe("full")
    expect(d.executionStrategy).toBe("single-agent")
  })

  it("low-confidence ambiguous input → mode:full, never fast", () => {
    const d = route("we need to improve the system performance", ["manager"])
    expect(d.mode).toBe("full")
  })

  it("analyze the codebase → mode:full, not fast", () => {
    const d = route("analyse the codebase", ["manager", "research"])
    expect(d.mode).toBe("full")
    expect(d.intentCategory).toBe("research")
  })

  it("'what is this project about' → mode:full, not fast", () => {
    const d = route("what is this project about", ["manager", "research"])
    expect(d.mode).toBe("full")
    expect(d.intentCategory).toBe("research")
  })
})

describe("REGRESSION — plain conversational message, zero roles, must succeed via FAST mode", () => {
  it("'Hi' routes to fast+direct with no roles", () => {
    const decision = route("Hi", ["manager"])
    expect(decision.mode).toBe("fast")
    expect(decision.executionStrategy).toBe("direct")
    expect(decision.selectedRoles).toEqual([])
  })

  it("'Hi' resolves to FAST even with reqMode=full (Gateway default)", () => {
    const decision = route("Hi", ["manager"])
    const mode = resolveExecutionMode(decision, "full")
    expect(mode).toBe("FAST")
  })

  it("'Hi' resolves to FAST with reqMode=undefined", () => {
    const decision = route("Hi", ["manager"])
    const mode = resolveExecutionMode(decision, undefined)
    expect(mode).toBe("FAST")
  })

  it("'Hi' resolves to FAST with reqMode=fast", () => {
    const decision = route("Hi", ["manager"])
    const mode = resolveExecutionMode(decision, "fast")
    expect(mode).toBe("FAST")
  })
})
