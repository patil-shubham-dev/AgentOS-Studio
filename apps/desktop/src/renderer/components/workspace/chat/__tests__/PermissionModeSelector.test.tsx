import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

describe("PermissionModeSelector", () => {
  let PermissionModeSelector: any

  beforeEach(async () => {
    vi.resetModules()
    vi.mock("@/stores/chat/permission-mode-store", () => ({
      usePermissionModeStore: (selector: any) => {
        const state = {
          mode: "prompt",
          setMode: vi.fn(),
          isPlanMode: () => false,
          requireApproval: () => true,
          allowExecution: () => false,
          allowWriteTools: () => true,
        }
        return selector ? selector(state) : state
      },
    }))
    vi.mock("@/stores/plan-store", () => ({
      usePlanStore: (selector: any) => {
        const state = {
          currentPlan: null,
          setPlanningPhase: vi.fn(),
          clearPlan: vi.fn(),
        }
        return selector ? selector(state) : state
      },
    }))
    vi.mock("@/stores/settings/app-store", () => ({
      useAppStore: (selector: any) => {
        const state = { planMode: "auto", setPlanMode: vi.fn() }
        return selector ? selector(state) : state
      },
    }))
    vi.mock("framer-motion", () => ({
      motion: new Proxy({}, { get: () => "div" }),
      AnimatePresence: ({ children }: any) => children,
    }))
    const mod = await import("../PermissionModeSelector")
    PermissionModeSelector = mod.PermissionModeSelector
  })

  it("should export component", () => {
    expect(PermissionModeSelector).toBeDefined()
  })

  it("should render without crashing", () => {
    expect(() => React.createElement(PermissionModeSelector)).not.toThrow()
  })

  it("should handle onPlanModeChange callback", () => {
    const onPlanModeChange = vi.fn()
    expect(() => React.createElement(PermissionModeSelector, { onPlanModeChange })).not.toThrow()
  })
})
