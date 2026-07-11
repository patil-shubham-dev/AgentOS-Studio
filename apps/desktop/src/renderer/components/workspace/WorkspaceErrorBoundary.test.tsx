import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderToString } from "react-dom/server"
import { WorkspaceErrorBoundary } from "./WorkspaceErrorBoundary"
import * as crashHandling from "@/core/crash-handling"

vi.mock("@/core/crash-handling", () => ({
  logCrash: vi.fn(() => Promise.resolve()),
}))

const { logCrash } = crashHandling as { logCrash: ReturnType<typeof vi.fn> }

describe("WorkspaceErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders children when no error", () => {
    const html = renderToString(
      <WorkspaceErrorBoundary>
        <div>healthy workspace content</div>
      </WorkspaceErrorBoundary>,
    )
    expect(html).toContain("healthy workspace content")
    expect(html).not.toContain("Workspace Crashed")
  })

  it("captures error via getDerivedStateFromError", () => {
    const error = new Error("workspace render failure")
    error.stack = "Error: workspace render failure\n  at Component.render"
    const state = WorkspaceErrorBoundary.getDerivedStateFromError(error)

    expect(state.hasError).toBe(true)
    expect(state.error!.message).toBe("workspace render failure")
    expect(state.stackTrace).toBe(error.stack)
  })

  it("shows error UI when in error state", () => {
    const ErrorStateBoundary = class extends WorkspaceErrorBoundary {
      constructor(props: WorkspaceErrorBoundaryProps) {
        super(props)
        this.state = {
          hasError: true,
          error: new Error("crash detail message"),
          stackTrace: "line 1\nline 2",
        }
      }
    }

    const html = renderToString(
      <ErrorStateBoundary>
        <div>should not appear</div>
      </ErrorStateBoundary>,
    )

    expect(html).toContain("Workspace Crashed")
    expect(html).toContain("crash detail message")
    expect(html).toContain("line 1")
    expect(html).not.toContain("should not appear")
  })

  it("shows Retry, Open Folder, and Report Issue buttons on crash", () => {
    const ErrorStateBoundary = class extends WorkspaceErrorBoundary {
      constructor(props: WorkspaceErrorBoundaryProps) {
        super(props)
        this.state = {
          hasError: true,
          error: new Error("boom"),
          stackTrace: null,
        }
      }
    }

    const html = renderToString(
      <ErrorStateBoundary onOpenFolder={vi.fn()}>
        <div>hidden</div>
      </ErrorStateBoundary>,
    )

    expect(html).toContain("Retry")
    expect(html).toContain("Open Folder")
    expect(html).toContain("Report Issue")
  })

  it("handleRetry clears error state", () => {
    const boundary = new WorkspaceErrorBoundary({ children: null })
    boundary.setState = vi.fn()

    boundary.state = { hasError: true, error: new Error("crash"), stackTrace: "stack" }
    boundary.handleRetry()

    expect(boundary.setState).toHaveBeenCalledWith({
      hasError: false,
      error: null,
      stackTrace: null,
    })
  })

  it("calls logCrash in componentDidCatch", () => {
    const boundary = new WorkspaceErrorBoundary({ children: null })
    const error = new Error("component crash")
    const info: React.ErrorInfo = { componentStack: "at BrokenComponent" }

    boundary.componentDidCatch(error, info)

    expect(logCrash).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace",
        error: "component crash",
        stack: error.stack,
        componentStack: "at BrokenComponent",
        route: "/",
      }),
    )
  })

  it("calls logCrash when Report Issue is clicked", () => {
    const boundary = new WorkspaceErrorBoundary({ children: null })
    boundary.state = { hasError: true, error: new Error("persistent crash"), stackTrace: "trace" }

    boundary.handleReportIssue()

    expect(logCrash).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace",
        error: "persistent crash",
        metadata: expect.objectContaining({ action: "user_report", fromErrorBoundary: true }),
      }),
    )
  })
})
