import { describe, it, expect, vi } from "vitest"
import React from "react"

// Mock all the dependencies that CodeCanvas needs
vi.mock("@/stores/workspace-store", () => ({
  useWorkspaceStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        rootPath: "/test",
        status: "ready",
        files: [],
        openFiles: [],
        activeFile: null,
      }),
    { getState: () => ({ rootPath: "/test", status: "ready" }) },
  ),
}))

vi.mock("@/stores/app-store", () => ({
  useAppStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        providers: [],
        settings: { theme: "dark" },
      }),
    { getState: () => ({}) },
  ),
}))

vi.mock("@/runtime/workspace-runtime", () => ({
  useWorkspaceRuntime: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        status: "ready",
        wiredAgents: [],
        wiredRoles: 0,
        managerWired: true,
      }),
    { getState: () => ({ status: "ready" }) },
  ),
}))

vi.mock("@/stores/diff-store", () => ({
  useDiffStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ files: new Map() }),
    { getState: () => ({ files: new Map() }) },
  ),
}))

vi.mock("@/stores/pane-store", () => ({
  usePaneStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        panes: [],
        activePane: null,
        splitDirection: "horizontal",
      }),
    { getState: () => ({ panes: [], activePane: null }) },
  ),
}))

vi.mock("react-router-dom", () => ({
  useParams: () => ({ workspaceId: "test" }),
  useNavigate: () => vi.fn(),
}))

describe("Workspace Load Smoke Test", () => {
  it("CodeCanvas can be imported without error", async () => {
    const mod = await import("@/pages/code-canvas")
    const CodeCanvas: React.ComponentType = mod.CodeCanvasPage
    expect(CodeCanvas).toBeDefined()
  })

  it("all workspace panel imports resolve", async () => {
    const imports = [
      "@/components/workspace/WorkspaceErrorBoundary",
      "@/components/workspace/explorer/Explorer",
      "@/components/workspace/code-workspace",
      "@/components/workspace/browser/browser-workspace",
      "@/components/workspace/design-workspace",
      "@/components/workspace/diff-viewer/DiffViewerPane",
      "@/components/workspace/preview/PreviewPane",
      "@/components/workspace/chat-panel",
      "@/components/workspace/timeline/conversation",
    ]

    for (const importPath of imports) {
      await expect(import(importPath)).resolves.toBeDefined()
    }
  })

  it("all lucide-react icons used in workspace resolve", async () => {
    const lucide = await import("lucide-react")
    const requiredIcons = [
      "FileDiff", "Eye", "PanelRight", "PanelRightClose",
      "PanelLeft", "PanelLeftClose", "FolderOpen",
      "ChevronLeft", "Loader2", "XCircle", "GripVertical",
    ]
    for (const icon of requiredIcons) {
      expect(lucide[icon as keyof typeof lucide]).toBeDefined()
    }
  })
})
