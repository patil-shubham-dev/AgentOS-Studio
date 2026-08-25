import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"

describe("Research Workflow", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().setRootPath("/test-research")
    useAgentStore.getState().setActive(true)
  })

  it("should handle research task acceptance", () => {
    const store = useWorkspaceStore.getState()
    expect(store.rootPath).toBe("/test-research")
  })

  it("should handle agent status during research", () => {
    const store = useAgentStore.getState()
    expect(store.isActive).toBe(true)
  })
})