import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  bootstrapWorkspace,
  ensureMarkdownSection,
  ensureClaudeMd,
  ensureOpencodeJson,
  ensureMcpJson,
  HARNESS_CONVENTIONS,
  BROWSER_MCP,
  getBootstrapTargets,
} from "./environment-bootstrapper"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "agentic-bootstrap-"))
}

describe("Environment Bootstrapper — Phase 2", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  describe("lookup table (harness-agnostic, per 06_MASTER_PLAN.md:104)", () => {
    it("exposes opencode / claude / codex conventions", () => {
      expect(HARNESS_CONVENTIONS.opencode.instructionFile).toBe("AGENTS.md")
      expect(HARNESS_CONVENTIONS.opencode.instructionNative).toBe(true)
      expect(HARNESS_CONVENTIONS.opencode.mcpFile).toBe("opencode.json")
      expect(HARNESS_CONVENTIONS.claude.instructionFile).toBe("CLAUDE.md")
      expect(HARNESS_CONVENTIONS.claude.instructionNative).toBe(false)
      expect(HARNESS_CONVENTIONS.claude.mcpFile).toBe(".mcp.json")
      expect(HARNESS_CONVENTIONS.codex.instructionFile).toBe("AGENTS.md")
      expect(HARNESS_CONVENTIONS.codex.mcpFile).toBe(".codex/config.toml")
    })

    it("defines browser MCP for all three harnesses", () => {
      expect(BROWSER_MCP.name).toBe("agentic-browser")
      expect(BROWSER_MCP.opencode.command).toEqual(["node", "./.agentic/mcp/browser-server.js"])
      expect(BROWSER_MCP.claude.command).toBe("node")
      expect(BROWSER_MCP.codex.command).toBe("node")
    })

    it("getBootstrapTargets lists 6 files", () => {
      const targets = getBootstrapTargets(dir)
      expect(targets).toHaveLength(6)
      expect(targets.some((p) => p.endsWith("AGENTS.md"))).toBe(true)
      expect(targets.some((p) => p.endsWith("CLAUDE.md"))).toBe(true)
      expect(targets.some((p) => p.endsWith("opencode.json"))).toBe(true)
      expect(targets.some((p) => p.endsWith(".mcp.json"))).toBe(true)
      expect(targets.some((p) => p.includes(".codex"))).toBe(true)
      expect(targets.some((p) => p.includes(".agentic"))).toBe(true)
    })
  })

  describe("fresh workspace", () => {
    it("creates all files with valid content and markers", () => {
      const result = bootstrapWorkspace(dir)
      expect(result.ok).toBe(true)
      expect(result.files).toHaveLength(6)

      const agents = readFileSync(join(dir, "AGENTS.md"), "utf-8")
      expect(agents).toContain("<!-- AgenticOS:START -->")
      expect(agents).toContain("<!-- AgenticOS:END -->")
      expect(agents).toContain("agentic-browser")

      const claude = readFileSync(join(dir, "CLAUDE.md"), "utf-8")
      expect(claude.trimStart().startsWith("@AGENTS.md")).toBe(true)
      expect(claude).toContain("<!-- AgenticOS:START -->")
      expect(claude).toContain("AgenticOS")

      const opencode = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"))
      expect(opencode.mcp).toBeDefined()
      expect(opencode.mcp["agentic-browser"]).toEqual(BROWSER_MCP.opencode)

      const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"))
      expect(mcp.mcpServers).toBeDefined()
      expect(mcp.mcpServers["agentic-browser"]).toEqual(BROWSER_MCP.claude)

      const codex = readFileSync(join(dir, ".codex", "config.toml"), "utf-8")
      expect(codex).toContain("# AgenticOS:START")
      expect(codex).toContain("# AgenticOS:END")
      expect(codex).toContain("[mcp_servers.agentic-browser]")

      expect(existsSync(join(dir, ".agentic", "skills"))).toBe(true)
    })

    it("is idempotent — second run reports no updates and preserves content", () => {
      bootstrapWorkspace(dir)

      const agentsBefore = readFileSync(join(dir, "AGENTS.md"), "utf-8")
      const claudeBefore = readFileSync(join(dir, "CLAUDE.md"), "utf-8")
      const opencodeBefore = readFileSync(join(dir, "opencode.json"), "utf-8")

      const second = bootstrapWorkspace(dir)
      for (const f of second.files) {
        if (f.file !== ".agentic/skills/") {
          expect(f.updated).toBe(false)
        }
      }

      expect(readFileSync(join(dir, "AGENTS.md"), "utf-8")).toBe(agentsBefore)
      expect(readFileSync(join(dir, "CLAUDE.md"), "utf-8")).toBe(claudeBefore)
      expect(readFileSync(join(dir, "opencode.json"), "utf-8")).toBe(opencodeBefore)
    })
  })

  describe("dirty workspace (user content preserved)", () => {
    it("preserves user content outside markers in AGENTS.md", () => {
      const userContent = "# My Project\n\nUser instructions here.\n"
      writeFileSync(join(dir, "AGENTS.md"), userContent, "utf-8")

      bootstrapWorkspace(dir)
      const after = readFileSync(join(dir, "AGENTS.md"), "utf-8")
      expect(after).toContain("# My Project")
      expect(after).toContain("User instructions here.")
      expect(after).toContain("<!-- AgenticOS:START -->")

      bootstrapWorkspace(dir)
      const after2 = readFileSync(join(dir, "AGENTS.md"), "utf-8")
      expect(after2).toBe(after)
      expect((after2.match(/<!-- AgenticOS:START -->/g) || []).length).toBe(1)
    })

    it("preserves user content in CLAUDE.md and ensures @AGENTS.md import", () => {
      const userClaude = "# User Claude Notes\n\nCustom instructions.\n"
      writeFileSync(join(dir, "CLAUDE.md"), userClaude, "utf-8")

      bootstrapWorkspace(dir)
      const after = readFileSync(join(dir, "CLAUDE.md"), "utf-8")
      expect(after.trimStart().startsWith("@AGENTS.md")).toBe(true)
      expect(after).toContain("Custom instructions.")
      expect(after).toContain("<!-- AgenticOS:START -->")
      expect((after.match(/<!-- AgenticOS:START -->/g) || []).length).toBe(1)
    })

    it("does not duplicate @AGENTS.md import if already present", () => {
      const withImport = "@AGENTS.md\n\n# Existing\n"
      writeFileSync(join(dir, "CLAUDE.md"), withImport, "utf-8")
      bootstrapWorkspace(dir)
      const after = readFileSync(join(dir, "CLAUDE.md"), "utf-8")
      // Only one standalone import line at top; the owned section also mentions @AGENTS.md in prose, so count exact lines
      const importLines = after.split("\n").filter((l) => l.trim() === "@AGENTS.md")
      expect(importLines.length).toBe(1)
      expect(after.trimStart().startsWith("@AGENTS.md")).toBe(true)
    })

    it("merges opencode.json preserving user mcp servers", () => {
      const userOpencode = {
        mcp: {
          "user-server": { type: "local", command: ["node", "user.js"], enabled: true },
        },
        customField: "keep-me",
      }
      writeFileSync(join(dir, "opencode.json"), JSON.stringify(userOpencode, null, 2), "utf-8")

      bootstrapWorkspace(dir)
      const after = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"))
      expect(after.mcp["user-server"]).toEqual(userOpencode.mcp["user-server"])
      expect(after.mcp["agentic-browser"]).toEqual(BROWSER_MCP.opencode)
      expect(after.customField).toBe("keep-me")

      const beforeStr = JSON.stringify(after)
      bootstrapWorkspace(dir)
      const after2 = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"))
      // Check opencode still stable via re-reading opencode
      const afterOpencode2 = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"))
      expect(JSON.stringify(afterOpencode2)).toBe(beforeStr)
    })

    it("merges .mcp.json preserving user servers", () => {
      const userMcp = {
        mcpServers: {
          "user-mcp": { command: "node", args: ["user.js"] },
        },
        otherKey: 123,
      }
      writeFileSync(join(dir, ".mcp.json"), JSON.stringify(userMcp, null, 2), "utf-8")

      bootstrapWorkspace(dir)
      const after = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"))
      expect(after.mcpServers["user-mcp"]).toEqual(userMcp.mcpServers["user-mcp"])
      expect(after.mcpServers["agentic-browser"]).toEqual(BROWSER_MCP.claude)
      expect(after.otherKey).toBe(123)
    })

    it("merges .codex/config.toml preserving user content", () => {
      const userToml = '# User config\n[other]\nkey = "value"\n'
      const codexDir = join(dir, ".codex")
      mkdirSync(codexDir, { recursive: true })
      writeFileSync(join(codexDir, "config.toml"), userToml, "utf-8")

      bootstrapWorkspace(dir)
      const after = readFileSync(join(codexDir, "config.toml"), "utf-8")
      expect(after).toContain('key = "value"')
      expect(after).toContain("[mcp_servers.agentic-browser]")
      expect(after).toContain("# AgenticOS:START")
      expect((after.match(/# AgenticOS:START/g) || []).length).toBe(1)

      bootstrapWorkspace(dir)
      const after2 = readFileSync(join(codexDir, "config.toml"), "utf-8")
      expect(after2).toBe(after)
    })

    it("handles corrupted JSON gracefully", () => {
      writeFileSync(join(dir, "opencode.json"), "{ not valid json", "utf-8")
      const result = bootstrapWorkspace(dir)
      expect(result.ok).toBe(true)
      const after = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"))
      expect(after.mcp["agentic-browser"]).toBeDefined()
    })
  })

  describe("ensureMarkdownSection helper", () => {
    it("creates file if not exists", () => {
      const p = join(dir, "test.md")
      const res = ensureMarkdownSection(p, "<!-- AgenticOS:START -->\nhello\n<!-- AgenticOS:END -->")
      expect(res.created).toBe(true)
      expect(readFileSync(p, "utf-8")).toContain("hello")
    })

    it("replaces owned section without touching user content", () => {
      const p = join(dir, "test2.md")
      const initial = "user top\n<!-- AgenticOS:START -->\nold\n<!-- AgenticOS:END -->\nuser bottom\n"
      writeFileSync(p, initial, "utf-8")
      ensureMarkdownSection(p, "<!-- AgenticOS:START -->\nnew\n<!-- AgenticOS:END -->")
      const after = readFileSync(p, "utf-8")
      expect(after).toContain("user top")
      expect(after).toContain("user bottom")
      expect(after).toContain("new")
      expect(after).not.toContain("old")
    })
  })

  describe("ensureClaudeMd helper", () => {
    it("creates CLAUDE.md with @AGENTS.md import", () => {
      const p = join(dir, "CLAUDE.md")
      const res = ensureClaudeMd(p)
      expect(res.created).toBe(true)
      const content = readFileSync(p, "utf-8")
      expect(content.trimStart().startsWith("@AGENTS.md")).toBe(true)
    })
  })

  describe("ensureOpencodeJson / ensureMcpJson helpers", () => {
    it("creates opencode.json if missing", () => {
      const res = ensureOpencodeJson(dir)
      expect(res.created).toBe(true)
      const data = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"))
      expect(data.mcp["agentic-browser"]).toEqual(BROWSER_MCP.opencode)
    })

    it("creates .mcp.json if missing", () => {
      const res = ensureMcpJson(dir)
      expect(res.created).toBe(true)
      const data = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"))
      expect(data.mcpServers["agentic-browser"]).toEqual(BROWSER_MCP.claude)
    })
  })

  describe("error handling", () => {
    it("returns ok:false for non-existent workspaceRoot", () => {
      const result = bootstrapWorkspace("/nonexistent/path/that/does/not/exist/12345")
      expect(result.ok).toBe(false)
      expect(result.error).toContain("does not exist")
    })

    it("returns ok:false for empty workspaceRoot", () => {
      const result = bootstrapWorkspace("")
      expect(result.ok).toBe(false)
    })
  })

  describe("no harness runtime dependency", () => {
    it("bootstrapper file does not import harness code", () => {
      const src = readFileSync(
        join(process.cwd(), "apps/desktop/src/main/services/environment-bootstrapper.ts"),
        "utf-8",
      )
      expect(src).not.toMatch(/from.*harness/i)
      expect(src).not.toMatch(/OpencodeAdapter/i)
      expect(src).not.toMatch(/terminal-manager/i)
      expect(src).toContain('from "fs"')
    })
  })
})
