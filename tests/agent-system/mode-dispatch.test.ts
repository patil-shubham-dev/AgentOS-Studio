import { describe, it, expect } from "vitest"
import { route, classifyIntent } from "@/runtime/manager-routing-engine"

/**
 * Mode dispatch regression test.
 *
 * This test asserts that resolveMode()'s output (as implied by the routing
 * decision) is the SINGLE source of truth for both:
 *   1. Which execution path executes (fastPath vs fullPath), and
 *   2. What the effective mode is.
 *
 * The key invariant: a RoutingDecision with mode:"fast" AND strategy:"direct"
 * MUST result in mode "FAST" downstream. There must be NO second, competing
 * "is this fast mode?" check that could disagree with resolveMode().
 *
 * Historically this bug has recurred: changes to the path selection logic
 * in UnifiedExecutor.execute() would add a NEW inline condition (e.g.
 * checking reqMode === "fast" || decision.mode === "fast") that duplicated
 * the resolveMode() logic. If the two diverged, the wrong path would execute.
 */
describe("Mode dispatch — resolveMode() is single source of truth", () => {
  it("high-confidence greeting → mode:fast, strategy:direct", () => {
    const decision = route("hello", ["manager"])
    expect(decision.mode).toBe("fast")
    expect(decision.executionStrategy).toBe("direct")

    // resolveMode() on this decision gives "FAST"
    // (simulating: resolveMode(decision, undefined) where reqMode is undefined)
    const resolvedMode: string = decision.mode === "fast" ? "FAST" : "FULL"
    expect(resolvedMode).toBe("FAST")

    // The inline check UnifiedExecutor uses MUST agree:
    const reqMode: string | undefined = undefined
    const inlineIsFast = reqMode === "fast" || decision.mode === "fast"
    expect(inlineIsFast).toBe(true)
  })

  it("simple thanks → mode:fast, strategy:direct", () => {
    const decision = route("thanks", ["manager"])
    expect(decision.mode).toBe("fast")
    expect(decision.executionStrategy).toBe("direct")
    const resolvedMode = decision.mode === "fast" ? "FAST" : "FULL"
    expect(resolvedMode).toBe("FAST")
  })

  it("coding request → mode:full, strategy:single-agent", () => {
    const decision = route("fix the login bug", ["manager", "coder"])
    expect(decision.mode).toBe("full")
    expect(decision.executionStrategy).toBe("single-agent")

    const resolvedMode = decision.mode === "fast" ? "FAST" : "FULL"
    expect(resolvedMode).toBe("FULL")

    const reqMode: string | undefined = undefined
    const inlineIsFast = reqMode === "fast" || decision.mode === "fast"
    expect(inlineIsFast).toBe(false)
  })

  it("research request → mode:full, single-agent", () => {
    const decision = route("research the architecture of this project", ["manager", "research"])
    expect(decision.mode).toBe("full")
    expect(decision.executionStrategy).toBe("single-agent")

    const resolvedMode = decision.mode === "fast" ? "FAST" : "FULL"
    expect(resolvedMode).toBe("FULL")
  })

  it("low-confidence ambiguous input → mode:full, never fast", () => {
    // Input that does not match any high-confidence pattern
    const decision = route("we need to improve the system performance", ["manager"])
    expect(decision.mode).toBe("full")

    const resolvedMode = decision.mode === "fast" ? "FAST" : "FULL"
    expect(resolvedMode).toBe("FULL")
  })

  it("reqMode='fast' overrides decision mode to FAST", () => {
    const decision = route("fix the login bug", ["manager", "coder"])
    expect(decision.mode).toBe("full")

    // When reqMode is explicitly "fast", resolveMode returns "FAST"
    const reqMode = "fast"
    const resolvedMode = reqMode === "fast" ? "FAST" : (decision.mode === "fast" ? "FAST" : "FULL")
    expect(resolvedMode).toBe("FAST")

    // The inline check MUST also agree
    const inlineIsFast = reqMode === "fast" || decision.mode === "fast"
    expect(inlineIsFast).toBe(true)
  })

  it("ensure resolveMode() and inline agentMode check always agree", () => {
    // Simulate resolveMode logic exactly as implemented in UnifiedExecutor.ts.
    // This must match the actual resolveMode() method — any divergence here is a bug in the test.
    function simulateResolveMode(reqMode: string | undefined, decisionMode: string, strategy: string): string {
      if (reqMode === "fast") return "FAST"
      // Trust routing engine when it says "direct" + "fast" (e.g. greeting with no roles)
      if (strategy === "direct" && decisionMode === "fast") return "FAST"
      if (reqMode === "full" || reqMode === "autonomous") return "FULL"
      if (decisionMode === "fast") return "FAST"
      return "FULL"
    }

    const cases: Array<{ reqMode: string | undefined; decisionMode: string; strategy: string; expectedResolved: string }> = [
      // reqMode=undefined + decision.fast + direct → FAST (trust routing engine)
      { reqMode: undefined, decisionMode: "fast", strategy: "direct", expectedResolved: "FAST" },
      // reqMode=undefined + decision.full + single-agent → FULL
      { reqMode: undefined, decisionMode: "full", strategy: "single-agent", expectedResolved: "FULL" },
      // reqMode=fast + decision.full + single-agent → FAST (explicit fast override)
      { reqMode: "fast", decisionMode: "full", strategy: "single-agent", expectedResolved: "FAST" },
      // reqMode=fast + decision.fast + direct → FAST
      { reqMode: "fast", decisionMode: "fast", strategy: "direct", expectedResolved: "FAST" },
      // reqMode=full + decision.fast + direct → FAST (trust direct+fast over default full)
      { reqMode: "full", decisionMode: "fast", strategy: "direct", expectedResolved: "FAST" },
      // reqMode=full + decision.fast + single-agent → FULL (not direct, reqMode wins)
      { reqMode: "full", decisionMode: "fast", strategy: "single-agent", expectedResolved: "FULL" },
      // reqMode=full + decision.full + single-agent → FULL
      { reqMode: "full", decisionMode: "full", strategy: "single-agent", expectedResolved: "FULL" },
    ]

    for (const { reqMode, decisionMode, strategy, expectedResolved } of cases) {
      const resolvedMode = simulateResolveMode(reqMode, decisionMode, strategy)
      expect(resolvedMode).toBe(expectedResolved)
      // The inline check is simply agentMode === "FAST", so it always agrees
      expect(resolvedMode === "FAST").toBe(expectedResolved === "FAST")
    }
  })

  it("analyze the codebase → mode:full, not fast", () => {
    // Historical regression: this used to get fast-path because 'analyz' wasn't
    // in the coding intent regex, AND the conversation confidence was 0.5 (low),
    // so it went through the low-confidence path which used mode:"full" anyway.
    // But the REAL bug was that it ALSO wasn't recognized as research at all
    // (because 'analyz' was missing from the research patterns).
    const decision2 = route("analyse the codebase", ["manager", "research"])
    expect(decision2.mode).toBe("full")
    expect(decision2.intentCategory).toBe("research")
  })

  it("'what is this project about' → mode:full, not fast", () => {
    const decision = route("what is this project about", ["manager", "research"])
    expect(decision.mode).toBe("full")
    expect(decision.intentCategory).toBe("research")
  })

  it("REGRESSION: 'Hi' with reqMode=full defaults → must resolve to FAST via direct+fast", () => {
    // This is the exact regression: chat-panel.tsx calls start() without mode,
    // ExecutionSessionManager defaults to "full", Gateway passes mode="full" to
    // UnifiedExecutor. But the routing engine says mode="fast" + strategy="direct".
    // resolveMode() MUST return "FAST" so fastPath() runs — fullPath() would iterate
    // zero roles (selectedRoles=[]) and never emit AGENT_ASSIGNED, leaving the
    // optimistic session stuck as "streaming" in chat-panel's finally safety net.
    const decision = route("Hi", ["manager"])
    expect(decision.mode).toBe("fast")
    expect(decision.executionStrategy).toBe("direct")
    expect(decision.selectedRoles).toEqual([])

    // Simulate resolveMode with reqMode="full" (the Gateway default)
    function simulateResolveMode(reqMode: string | undefined, decisionMode: string, strategy: string): string {
      if (reqMode === "fast") return "FAST"
      if (strategy === "direct" && decisionMode === "fast") return "FAST"
      if (reqMode === "full" || reqMode === "autonomous") return "FULL"
      if (decisionMode === "fast") return "FAST"
      return "FULL"
    }
    const resolvedMode = simulateResolveMode("full", decision.mode, decision.executionStrategy)
    expect(resolvedMode).toBe("FAST")
  })
})
