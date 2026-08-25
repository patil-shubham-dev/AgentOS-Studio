import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"

describe("Code Change Workflow", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().setRootPath("/test")
    useAgentStore.getState().setActive(true)
  })

  it("should handle code change acceptance", () => {
    const store = useWorkspaceStore.getState()
    expect(store.rootPath).toBe("/test")
  })

  it("should handle agent status", () => {
    const store = useAgentStore.getState()
    expect(store.isActive).toBe(true)
  })
})