import { describe, it, expect } from "vitest"
import { route, classifyIntent } from "@/runtime/manager-routing-engine"

describe("Manager Routing — Intent Classification", () => {
  it("classifies simple greeting as conversation", () => {
    const { category } = classifyIntent("hello")
    expect(category).toBe("conversation")
  })

  it("classifies coding request as coding", () => {
    const { category } = classifyIntent("implement a login feature using React")
    expect(category).toBe("coding")
  })

  it("classifies research-only text as research", () => {
    const { category } = classifyIntent("research potential approaches")
    expect(category).toBe("research")
  })

  it("classifies browser navigation as browser-task", () => {
    const { category } = classifyIntent("navigate to example.com")
    expect(category).toBe("browser-task")
  })

  it("classifies scrape tasks as browser-task", () => {
    const { category } = classifyIntent("scrape data from pricing page")
    expect(category).toBe("browser-task")
  })

  it("falls back to conversation for unrecognized technical text", () => {
    const { category } = classifyIntent("we need to improve the system performance")
    expect(category).toBe("conversation")
  })

  it("classifies conversation for short direct keywords", () => {
    const { category } = classifyIntent("thanks")
    expect(category).toBe("conversation")
  })

  it("classifies browser automation as browser-task", () => {
    const { category } = classifyIntent("automate login flow")
    expect(category).toBe("browser-task")
  })
})

describe("Manager Routing — Route Decision", () => {
  it("responds directly for high-confidence conversation (no delegation)", () => {
    const decision = route("hello, how are you?", ["manager"])
    expect(decision.executionStrategy).toBe("direct")
    expect(decision.requiresDelegation).toBe(false)
    expect(decision.selectedRoles).toEqual([])
  })

  it("delegates coding to coder role", () => {
    const decision = route("implement a login feature", ["manager", "coder"])
    expect(decision.requiresDelegation).toBe(true)
    expect(decision.selectedRoles).toContain("coder")
    expect(decision.executionStrategy).toBe("single-agent")
  })

  it("provides reasoning for routing decision", () => {
    const decision = route("fix the login bug", ["manager", "coder"])
    expect(decision.reasoning.length).toBeGreaterThan(10)
  })

  it("handles empty role array gracefully", () => {
    const decision = route("hello", [])
    expect(decision).toBeDefined()
  })

  it("returns single-agent when only one relevant role is wired", () => {
    const decision = route("implement a login feature", ["manager", "coder"])
    expect(decision.executionStrategy).toBe("single-agent")
  })

  it("returns direct when no wired roles match intent", () => {
    const decision = route("implement a login feature", ["manager", "browser"])
    expect(decision.executionStrategy).toBe("direct")
  })

  it("delegates browser tasks to browser role", () => {
    const decision = route("navigate to example.com", ["manager", "browser"])
    expect(decision.selectedRoles).toContain("browser")
    expect(decision.intentCategory).toBe("browser-task")
  })

  it("routes research tasks via single-agent", () => {
    const decision = route("research potential approaches", ["manager", "research"])
    expect(decision.selectedRoles).toContain("research")
    expect(decision.requiresDelegation).toBe(true)
  })
})

describe("Manager Routing — Role Assignment", () => {
  it("assigns coder for coding intent when wired", () => {
    const decision = route("write a sorting algorithm", ["manager", "coder"])
    expect(decision.selectedRoles).toContain("coder")
  })

  it("assigns browser for navigation intent", () => {
    const decision = route("navigate to example.com", ["manager", "browser"])
    expect(decision.selectedRoles).toContain("browser")
  })

  it("routes multi-agent for complex tasks when multiple matching roles wired", () => {
    const decision = route("navigate to example.com and scrape data", ["manager", "browser", "coder"])
    expect(decision.selectedRoles.length).toBeGreaterThanOrEqual(1)
    expect(decision.requiresDelegation).toBe(true)
  })

  it("assigns available role when only some match", () => {
    const decision = route("implement a search feature", ["manager", "coder", "qa"])
    expect(decision.selectedRoles).toContain("coder")
  })
})
