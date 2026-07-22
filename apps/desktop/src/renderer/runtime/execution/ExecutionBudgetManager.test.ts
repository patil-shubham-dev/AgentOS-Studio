import { beforeEach, describe, expect, it } from "vitest"

import { ExecutionBudgetManager } from "./ExecutionBudgetManager"

describe("ExecutionBudgetManager", () => {
  let manager: ExecutionBudgetManager

  beforeEach(() => {
    manager = ExecutionBudgetManager.getInstance()
    manager.reset()
  })

  it("reports status percentages using matching usage counters", () => {
    const budgetId = manager.createBudget({
      maxTokens: 100,
      maxIterations: 10,
      maxToolCalls: 4,
    })

    manager.recordUsage(budgetId, {
      tokens: 25,
      iterations: 2,
      toolCalls: 1,
    })

    expect(manager.getStatus(budgetId).percentage).toMatchObject({
      maxTokens: 25,
      maxIterations: 20,
      maxToolCalls: 25,
    })
  })

  it("reports remaining budget using matching usage counters", () => {
    const budgetId = manager.createBudget({
      maxTokens: 100,
      maxBrowserActions: 5,
    })

    manager.recordUsage(budgetId, {
      tokens: 40,
      browserActions: 2,
    })

    expect(manager.getRemaining(budgetId)).toMatchObject({
      maxTokens: 60,
      maxBrowserActions: 3,
    })
  })
})
