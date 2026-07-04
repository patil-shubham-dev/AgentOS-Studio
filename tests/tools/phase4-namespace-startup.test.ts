import { describe, it, expect } from "vitest"
import { CODING_TOOLS, BROWSER_TOOLS, DESIGN_TOOLS, ALL_BUILTIN_TOOLS } from "@/runtime/tools/implementations/extended-tools"
import { isFeatureEnabled, type RuntimeFeatureFlag } from "@/app/feature-flags"

const BROWSER_TOOL_NAMES = new Set([
  "launch_browser", "browser_navigate", "browser_screenshot",
  "browser_click", "browser_fill", "browser_execute_js",
  "browser_get_title", "browser_get_text", "browser_wait",
  "browser_close", "browser_get_url", "browser_press_key",
  "browser_reload", "browser_new_tab", "browser_list_tabs",
])

const DESIGN_TOOL_NAMES = new Set([
  "design_create_artifact",
  "design_add_version",
  "design_generate_preview",
])

const CODING_TOOL_NAMES = new Set([
  "read_file", "write_file", "edit_file",
  "glob_files", "grep_files", "search_content",
  "run_command", "web_search", "web_fetch",
  "delegate_subtask", "run_skill",
  "query_codebase", "query_graph",
  "save_preference", "question", "todowrite",
  "rename_symbol", "code_explain", "git_commit", "code_complete",
  "github_list_issues", "github_create_issue", "github_close_issue",
  "github_list_pull_requests", "github_create_pull_request",
  "github_merge_pull_request", "github_search_issues", "github_search_repo",
  "github_review_pull_request", "batch_parallel_task",
])

describe("Phase 4 — Namespace Startup Isolation", () => {
  describe("CODING_TOOLS exports", () => {
    it("includes all expected coding tools", () => {
      const names = new Set(CODING_TOOLS.map(t => t.name))
      for (const n of CODING_TOOLS) {
        expect(CODING_TOOL_NAMES.has(n.name)).toBe(true)
      }
    })

    it("excludes browser tool names", () => {
      const names = CODING_TOOLS.map(t => t.name)
      for (const browserName of BROWSER_TOOL_NAMES) {
        expect(names).not.toContain(browserName)
      }
    })

    it("excludes design tool names", () => {
      const names = CODING_TOOLS.map(t => t.name)
      for (const designName of DESIGN_TOOL_NAMES) {
        expect(names).not.toContain(designName)
      }
    })

    it("all coding tools have namespace === 'coding'", () => {
      for (const t of CODING_TOOLS) {
        expect(t.namespace).toBe("coding")
      }
    })

    it("is a subset of ALL_BUILTIN_TOOLS", () => {
      for (const t of CODING_TOOLS) {
        expect(ALL_BUILTIN_TOOLS).toContain(t)
      }
    })
  })

  describe("BROWSER_TOOLS exports", () => {
    it("includes all expected browser tools", () => {
      const names = BROWSER_TOOLS.map(t => t.name)
      for (const n of BROWSER_TOOL_NAMES) {
        expect(names).toContain(n)
      }
    })

    it("all browser tools have namespace === 'browser'", () => {
      for (const t of BROWSER_TOOLS) {
        expect(t.namespace).toBe("browser")
      }
    })
  })

  describe("DESIGN_TOOLS exports", () => {
    it("includes all expected design tools", () => {
      const names = DESIGN_TOOLS.map(t => t.name)
      for (const n of DESIGN_TOOL_NAMES) {
        expect(names).toContain(n)
      }
    })

    it("all design tools have namespace === 'design'", () => {
      for (const t of DESIGN_TOOLS) {
        expect(t.namespace).toBe("design")
      }
    })
  })

  describe("Feature flag gating defaults", () => {
    it("codingCore is enabled by default", () => {
      expect(isFeatureEnabled("codingCore")).toBe(true)
    })

    it("browserIsland is disabled by default", () => {
      expect(isFeatureEnabled("browserIsland")).toBe(false)
    })

    it("designIsland is disabled by default", () => {
      expect(isFeatureEnabled("designIsland")).toBe(false)
    })

    it("mcp is disabled by default", () => {
      expect(isFeatureEnabled("mcp")).toBe(false)
    })

    it("plugins is disabled by default", () => {
      expect(isFeatureEnabled("plugins")).toBe(false)
    })
  })

  describe("Known tool name sets are mutually exclusive", () => {
    it("browser and coding tool name sets do not overlap", () => {
      for (const name of BROWSER_TOOL_NAMES) {
        expect(CODING_TOOL_NAMES.has(name)).toBe(false)
      }
    })

    it("design and coding tool name sets do not overlap", () => {
      for (const name of DESIGN_TOOL_NAMES) {
        expect(CODING_TOOL_NAMES.has(name)).toBe(false)
      }
    })

    it("browser and design tool name sets do not overlap", () => {
      for (const name of BROWSER_TOOL_NAMES) {
        expect(DESIGN_TOOL_NAMES.has(name)).toBe(false)
      }
    })
  })

  describe("ALL_BUILTIN_TOOLS completeness", () => {
    it("contains all coding, browser, and design tools", () => {
      const all = new Set(ALL_BUILTIN_TOOLS.map(t => t.name))
      for (const t of CODING_TOOLS) expect(all.has(t.name)).toBe(true)
      for (const t of BROWSER_TOOLS) expect(all.has(t.name)).toBe(true)
      for (const t of DESIGN_TOOLS) expect(all.has(t.name)).toBe(true)
    })

    it("total count equals sum of parts", () => {
      expect(ALL_BUILTIN_TOOLS.length).toBe(
        CODING_TOOLS.length + BROWSER_TOOLS.length + DESIGN_TOOLS.length
      )
    })
  })
})
