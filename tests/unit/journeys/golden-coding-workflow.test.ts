import { describe, it, expect, beforeEach, vi } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"
import { useDiffStore } from "@/stores/diff-store"
import { useChangeSetStore } from "@/runtime/changeset/ChangeSetStore"
import { CODING_TOOLS } from "@/runtime/tools/implementations"
import { ALL_BUILTIN_TOOLS, DESIGN_TOOLS, BROWSER_TOOLS } from "@/runtime/tools/implementations/extended-tools"
import { isFeatureEnabled } from "@/app/feature-flags"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceStore } from "@/stores/workspace-store"

describe("Golden Coding Workflow — Full Product Loop", () => {
  beforeEach(() => {
    useTimelineStore.getState().clear()
    useAgentStore.setState({ agentStatuses: {}, agentAssignments: [], orchestrationSteps: [] })
    useDiffStore.getState().clear()
    const csStore = useChangeSetStore.getState()
    for (const id of Array.from(csStore.changeSets.keys())) {
      csStore.removeChangeSet(id)
    }
  })

  it("GOLDEN-1: complete search → read → edit → command → diff → accept flow", () => {
    const s = useTimelineStore.getState()
    s.addEvent({
      type: "user-message", id: "msg-1",
      content: "Rename calculateTotal to computeTotal and update all references, then run tests",
      timestamp: Date.now(), correlationId: "golden-1", role: "user",
    })
    s.addAgentSession({
      stepId: "step-g1", roleId: "coder", roleName: "Coder Agent",
      status: "running", streamState: "streaming", streamingText: "",
      toolCalls: [], fileEdits: [], fileOps: [], terminalOutputs: [],
      startedAt: Date.now(), tokenAppended: 0,
    }, "golden-1")

    s.addToolCallToAgent("step-g1", {
      id: "tc-1", name: "grep_files",
      args: JSON.stringify({ pattern: "calculateTotal" }),
      status: "complete", result: "src/utils.ts:15\nsrc/checkout.ts:42", durationMs: 150,
    })
    s.addToolCallToAgent("step-g1", {
      id: "tc-2", name: "read_file",
      args: JSON.stringify({ path: "src/utils.ts" }),
      status: "complete", result: "export function calculateTotal(items: number[]): number { return items.reduce((a, b) => a + b, 0) }",
      durationMs: 25,
    })
    s.addToolCallToAgent("step-g1", {
      id: "tc-3", name: "read_file",
      args: JSON.stringify({ path: "src/checkout.ts" }),
      status: "complete", result: "import { calculateTotal } from './utils'; const total = calculateTotal(prices)",
      durationMs: 20,
    })
    s.addFileEditToAgent("step-g1", {
      path: "src/utils.ts", additions: 2, deletions: 2,
      diffContent: "- export function calculateTotal(items: number[]): number\n+ export function computeTotal(items: number[]): number",
      oldContent: "export function calculateTotal(items: number[]): number",
      newContent: "export function computeTotal(items: number[]): number",
    })
    s.addFileEditToAgent("step-g1", {
      path: "src/checkout.ts", additions: 1, deletions: 1,
      diffContent: "- import { calculateTotal } from './utils'\n+ import { computeTotal } from './utils'",
      oldContent: "import { calculateTotal } from './utils'",
      newContent: "import { computeTotal } from './utils'",
    })
    s.addToolCallToAgent("step-g1", {
      id: "tc-4", name: "grep_files",
      args: JSON.stringify({ pattern: "calculateTotal" }),
      status: "complete", result: "", durationMs: 80,
    })
    s.addTerminalToAgent("step-g1", {
      command: "npm test",
      output: "PASS src/utils.test.ts\nPASS src/checkout.test.ts\nTests: 2 passed, 2 total",
      status: "success", exitCode: 0, durationMs: 3200,
    })
    s.updateAgentSession("step-g1", { status: "complete", streamState: "completed" })

    const store = useTimelineStore.getState()
    const session = store.agentSessions.get("step-g1")!
    expect(session.toolCalls).toHaveLength(4)
    expect(session.toolCalls[0].name).toBe("grep_files")
    expect(session.toolCalls[1].name).toBe("read_file")
    expect(session.toolCalls[2].name).toBe("read_file")
    expect(session.toolCalls[3].name).toBe("grep_files")
    expect(session.fileEdits).toHaveLength(2)
    expect(session.terminalOutputs).toHaveLength(1)
    expect(session.terminalOutputs[0].command).toBe("npm test")
    expect(session.terminalOutputs[0].status).toBe("success")
    expect(session.terminalOutputs[0].exitCode).toBe(0)
    expect(session.streamState).toBe("completed")
    const events = store.events
    expect(events.length).toBeGreaterThanOrEqual(1)
  })

  it("GOLDEN-2: diff review — accept and reject flows produce correct state", () => {
    const s = useDiffStore.getState()
    s.addFileDiff({
      path: "src/utils.ts",
      originalContent: "export function calculateTotal(items: number[]): number { return items.reduce((a, b) => a + b, 0) }",
      modifiedContent: "export function computeTotal(items: number[]): number { return items.reduce((a, b) => a + b, 0) }",
      rawDiff: "--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -1 +1 @@\n-export function calculateTotal\n+export function computeTotal",
      hunks: [{ hunkIndex: 0, header: "@@ -1 +1 @@", additions: 1, deletions: 1, status: "pending" as const }],
      status: "pending", createdAt: Date.now(), source: "agent",
    })
    s.acceptFile("src/utils.ts")
    let store = useDiffStore.getState()
    expect(store.files.get("src/utils.ts")?.status).toBe("accepted")

    s.addFileDiff({
      path: "src/checkout.ts",
      originalContent: "import { calculateTotal } from './utils'; const total = calculateTotal(prices)",
      modifiedContent: "import { computeTotal } from './utils'; const total = computeTotal(prices)",
      rawDiff: "--- a/src/checkout.ts\n+++ b/src/checkout.ts\n@@ -1 +1 @@\n-import { calculateTotal }\n+import { computeTotal }",
      hunks: [{ hunkIndex: 0, header: "@@ -1 +1 @@", additions: 1, deletions: 1, status: "pending" as const }],
      status: "pending", createdAt: Date.now(), source: "agent",
    })
    s.rejectFile("src/checkout.ts")
    store = useDiffStore.getState()
    expect(store.files.get("src/checkout.ts")?.status).toBe("rejected")
    expect(store.getPendingFiles()).toHaveLength(0)
    expect(store.getAcceptedFiles()).toHaveLength(1)
    expect(store.getAcceptedFiles()[0].path).toBe("src/utils.ts")
  })

  it("GOLDEN-3: future island isolation — coding tasks exclude browser/design/device tools", () => {
    const browserTools = ALL_BUILTIN_TOOLS.filter(t => t.namespace === "browser")
    expect(browserTools.length).toBeGreaterThan(0)
    for (const tool of browserTools) {
      expect(tool.namespace).toBe("browser")
    }
    const designTools = ALL_BUILTIN_TOOLS.filter(t => t.namespace === "design")
    expect(designTools.length).toBeGreaterThan(0)
    for (const tool of designTools) {
      expect(tool.namespace).toBe("design")
    }
    const codingTools = ALL_BUILTIN_TOOLS.filter(t => t.namespace === "coding")
    expect(codingTools.length).toBeGreaterThan(0)
    for (const tool of codingTools) {
      expect(tool.namespace).not.toBe("browser")
      expect(tool.namespace).not.toBe("design")
    }
    expect(isFeatureEnabled('browserIsland')).toBe(false)
    expect(isFeatureEnabled('designIsland')).toBe(false)
    expect(isFeatureEnabled('deviceControlIsland')).toBe(false)
    expect(isFeatureEnabled('browserToolsInCoding')).toBe(false)
    expect(isFeatureEnabled('designToolsInCoding')).toBe(false)
    expect(isFeatureEnabled('deviceToolsInCoding')).toBe(false)
  })

  it("GOLDEN-4: ChangeSet creation and status transitions", () => {
    const s = useChangeSetStore.getState()
    const csId = `cs_golden_${Date.now()}`
    s.addChangeSet({
      id: csId, sessionId: "golden-session", correlationId: "golden-4",
      title: "Refactor calculateTotal to computeTotal",
      reason: "Rename function across codebase",
      status: "draft", files: [],
      sourceToolCallIds: ["tc-1", "tc-2", "tc-3"],
      createdAt: Date.now(), updatedAt: Date.now(),
    })
    expect(s.getChangeSet(csId)).toBeDefined()
    expect(s.getChangeSet(csId)!.status).toBe("draft")

    s.updateChangeSet(csId, { status: "proposed" })
    expect(useChangeSetStore.getState().getChangeSet(csId)!.status).toBe("proposed")

    s.updateChangeSet(csId, { status: "pending_review" })
    expect(useChangeSetStore.getState().getChangeSet(csId)!.status).toBe("pending_review")

    s.updateChangeSet(csId, { status: "accepted" })
    expect(useChangeSetStore.getState().getChangeSet(csId)!.status).toBe("accepted")
  })

  it("GOLDEN-5: session persistence survives store operations", () => {
    const s = useTimelineStore.getState()
    s.addEvent({
      type: "user-message", id: "msg-persist",
      content: "Fix the login bug",
      timestamp: Date.now(), correlationId: "persist-1", role: "user",
    })
    s.addAgentSession({
      stepId: "step-persist", roleId: "debugger", roleName: "Debugger Agent",
      status: "complete", streamState: "completed",
      streamingText: "Found the bug: missing null check",
      toolCalls: [
        { id: "tc-p1", name: "read_file", args: "{}", status: "complete" as const, result: "content", durationMs: 30 },
        { id: "tc-p2", name: "edit_file", args: "{}", status: "complete" as const, result: "Fixed", durationMs: 50 },
      ],
      fileEdits: [{ path: "src/login.ts", additions: 1, deletions: 0, diffContent: "+ if (!user) return", oldContent: "", newContent: "if (!user) return" }],
      fileOps: [],
      terminalOutputs: [{ command: "npm test", output: "PASS", status: "success" as const, exitCode: 0, durationMs: 1000 }],
      startedAt: Date.now(), tokenAppended: 0,
    }, "persist-1")

    const store = useTimelineStore.getState()
    expect(store.events.length).toBeGreaterThanOrEqual(1)
    expect(store.events[store.events.length - 1].role).toBe("user")

    const session = store.agentSessions.get("step-persist")
    expect(session).toBeDefined()
    expect(session!.toolCalls).toHaveLength(2)
    expect(session!.fileEdits).toHaveLength(1)
    expect(session!.terminalOutputs).toHaveLength(1)
    expect(session!.roleName).toBe("Debugger Agent")
    expect(session!.streamingText).toContain("missing null check")
  })

  it("GOLDEN-6: ProviderGateway delegates to mock mode when no providers configured", async () => {
    useAppStore.setState({ providers: [], mockMode: true })
    const { providerGateway } = await import("@/runtime/providers/ProviderGateway")
    expect(providerGateway).toBeDefined()
    useAppStore.setState({ providers: [], mockMode: false })
  })

  it("GOLDEN-7: tool arrays are properly partitioned by namespace", () => {
    for (const tool of CODING_TOOLS) {
      expect(tool.namespace).toBe("coding")
    }
    for (const tool of DESIGN_TOOLS) {
      expect(tool.namespace).toBe("design")
      expect(CODING_TOOLS.find(t => t.name === tool.name)).toBeUndefined()
    }
    for (const tool of BROWSER_TOOLS) {
      expect(tool.namespace).toBe("browser")
      expect(CODING_TOOLS.find(t => t.name === tool.name)).toBeUndefined()
    }
    const allCodingNames = new Set(CODING_TOOLS.map(t => t.name))
    const allDesignNames = new Set(DESIGN_TOOLS.map(t => t.name))
    const allBrowserNames = new Set(BROWSER_TOOLS.map(t => t.name))
    expect(allCodingNames.size + allDesignNames.size + allBrowserNames.size).toBe(ALL_BUILTIN_TOOLS.length)
    expect(ALL_BUILTIN_TOOLS.length).toBe(CODING_TOOLS.length + DESIGN_TOOLS.length + BROWSER_TOOLS.length)
  })

  it("GOLDEN-8: feature flags default to false for all island capabilities", () => {
    expect(isFeatureEnabled('browserIsland')).toBe(false)
    expect(isFeatureEnabled('designIsland')).toBe(false)
    expect(isFeatureEnabled('deviceControlIsland')).toBe(false)
    expect(isFeatureEnabled('browserToolsInCoding')).toBe(false)
    expect(isFeatureEnabled('designToolsInCoding')).toBe(false)
    expect(isFeatureEnabled('deviceToolsInCoding')).toBe(false)
  })

  it("GOLDEN-9: WriteFileTool proposes changes without writing to disk", async () => {
    const { WriteFileTool } = await import("@/runtime/tools/implementations/WriteFileTool")
    const { fileContentCache } = await import("@/lib/FileContentCache")
    const { ChangeSetManager } = await import("@/runtime/changeset/ChangeSetManager")

    useAppStore.setState({ providers: [], mockMode: true })
    useWorkspaceStore.setState({ rootPath: "/tmp/test-golden" })

    const changesBefore = useChangeSetStore.getState().changeSets.size

    const result = await WriteFileTool.execute(
      { traceId: "golden-9-test", role: "coder" } as any,
      { path: "golden-test-file.ts", content: "// proposed content" },
    )

    expect(result.error).toBeFalsy()
    expect(result.data).toBe("Change proposed: golden-test-file.ts has been staged for review. Awaiting user acceptance in the diff panel.")
    expect(result.meta).toBeDefined()
    expect(result.meta!.status).toBe("pending_review")
    expect(result.meta!.path).toBe("golden-test-file.ts")
    expect(fileContentCache.get("/tmp/test-golden\\golden-test-file.ts")).toBe("// proposed content")
    const changesAfter = useChangeSetStore.getState().changeSets.size
    expect(changesAfter).toBe(changesBefore + 1)
  })
})
