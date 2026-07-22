import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToString } from "react-dom/server"
import { EditorTabs } from "@/components/workspace/EditorTabs"
import type { OpenFile } from "@/types"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { layout, layoutId, transition, initial, animate, ...rest } = props
      return <div {...rest}>{children}</div>
    },
    span: ({ children, ...props }: any) => {
      const { initial, animate, transition, ...rest } = props
      return <span {...rest}>{children}</span>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="close-icon">X</span>,
}))

vi.mock("@/lib/utils", () => ({ cn: (...classes: any[]) => classes.filter(Boolean).join(" ") }))

function makeFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    path: overrides.path ?? "/test/file.ts",
    name: overrides.name ?? "file.ts",
    language: overrides.language ?? "typescript",
    content: overrides.content ?? "",
    isDirty: overrides.isDirty ?? false,
    cursorPosition: overrides.cursorPosition ?? null,
  }
}

describe("EditorTabs — Component Rendering", () => {
  it("renders empty tabs container when no files", () => {
    const html = renderToString(
      <EditorTabs
        openFiles={[]}
        activeFilePath={null}
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toContain("role=\"tablist\"")
    expect(html).not.toContain("role=\"tab\"")
  })

  it("renders a single tab", () => {
    const files = [makeFile({ path: "/test/file.ts", name: "file.ts" })]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath="/test/file.ts"
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toContain("file.ts")
    expect(html).toContain("role=\"tab\"")
    expect(html).toContain("aria-selected=\"true\"")
  })

  it("renders multiple tabs", () => {
    const files = [
      makeFile({ path: "/test/a.ts", name: "a.ts" }),
      makeFile({ path: "/test/b.ts", name: "b.ts" }),
      makeFile({ path: "/test/c.ts", name: "c.ts" }),
    ]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath="/test/b.ts"
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toContain("a.ts")
    expect(html).toContain("b.ts")
    expect(html).toContain("c.ts")
  })

  it("marks the active file with aria-selected true", () => {
    const files = [
      makeFile({ path: "/test/active.ts", name: "active.ts" }),
      makeFile({ path: "/test/inactive.ts", name: "inactive.ts" }),
    ]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath="/test/active.ts"
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const activeMatch = html.match(/data-active="true"/)
    expect(activeMatch).not.toBeNull()
  })

  it('marks the live editing file with data-streaming attribute', () => {
    const files = [
      makeFile({ path: "/test/streaming.ts", name: "streaming.ts" }),
      makeFile({ path: "/test/other.ts", name: "other.ts" }),
    ]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath="/test/other.ts"
        liveEditingFile="/test/streaming.ts"
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toContain("data-streaming=\"true\"")
  })

  it("shows dirty indicator for unsaved files", () => {
    const files = [
      makeFile({ path: "/test/dirty.ts", name: "dirty.ts", isDirty: true }),
      makeFile({ path: "/test/clean.ts", name: "clean.ts", isDirty: false }),
    ]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath={null}
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const iconCount = (html.match(/title="Unsaved changes"/g) || []).length
    expect(iconCount).toBe(1)
  })
})

describe("EditorTabs — Language Display & Icon Mapping", () => {
  it("renders file extension as language indicator", () => {
    const files = [
      makeFile({ path: "/test/main.ts", name: "main.ts" }),
      makeFile({ path: "/test/style.css", name: "style.css" }),
      makeFile({ path: "/test/index.html", name: "index.html" }),
    ]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath={null}
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toContain(">ts<")
    expect(html).toContain(">css<")
    expect(html).toContain(">html<")
  })

  it("handles unknown extensions with plaintext", () => {
    const files = [makeFile({ path: "/test/unknown.xyz", name: "unknown.xyz" })]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath={null}
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toContain(">xyz<")
  })

  it("handles files without extension", () => {
    const files = [makeFile({ path: "/test/Dockerfile", name: "Dockerfile" })]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath={null}
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toContain("Dockerfile")
  })

  it("renders close buttons for each tab", () => {
    const files = [
      makeFile({ path: "/test/a.ts", name: "a.ts" }),
      makeFile({ path: "/test/b.ts", name: "b.ts" }),
    ]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath={null}
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const closeButtons = (html.match(/aria-label="Close/g) || []).length
    expect(closeButtons).toBe(2)
  })
})

describe("EditorTabs — Interaction Callbacks", () => {
  it("calls onOpen when clicking a tab", () => {
    const onOpen = vi.fn()
    const files = [makeFile({ path: "/test/file.ts", name: "file.ts" })]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath={null}
        liveEditingFile={null}
        onOpen={onOpen}
        onClose={vi.fn()}
      />,
    )
    expect(html).toContain("file.ts")
  })

  it("renders without crashing when activeFilePath is null", () => {
    const files = [makeFile({ path: "/test/file.ts", name: "file.ts" })]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath={null}
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toBeTruthy()
  })

  it("renders without crashing when liveEditingFile is null", () => {
    const files = [makeFile({ path: "/test/file.ts", name: "file.ts" })]
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath="/test/file.ts"
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toBeTruthy()
  })

  it("renders many files without crashing", () => {
    const files = Array.from({ length: 50 }, (_, i) => makeFile({
      path: `/test/file-${i}.ts`,
      name: `file-${i}.ts`,
    }))
    const html = renderToString(
      <EditorTabs
        openFiles={files}
        activeFilePath="/test/file-0.ts"
        liveEditingFile={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(html).toContain("file-49.ts")
  })
})
