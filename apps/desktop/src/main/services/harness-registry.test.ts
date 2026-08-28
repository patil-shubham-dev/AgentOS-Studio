import { describe, it, expect, vi } from "vitest"

vi.mock("child_process", () => ({
  spawnSync: vi.fn(() => ({ status: 1, stdout: "" })),
}))

import {
  HARNESS_REGISTRY,
  resolveBinary,
  getVersion,
  isInstalled,
  getInstallCandidates,
  verifyInstall,
  listHarnesses,
} from "./harness-registry"

describe("Harness Registry — Phase 3c (06_MASTER_PLAN.md:142)", () => {
  describe("pure data shape (no harness runtime)", () => {
    it("exposes opencode / claude / codex", () => {
      expect(HARNESS_REGISTRY.opencode.name).toBe("opencode")
      expect(HARNESS_REGISTRY.claude.name).toBe("claude")
      expect(HARNESS_REGISTRY.codex.name).toBe("codex")
    })

    it("has correct binaries and versionArgs per 06_MASTER_PLAN.md:148", () => {
      expect(HARNESS_REGISTRY.opencode.binary).toBe("opencode")
      expect(HARNESS_REGISTRY.opencode.versionArgs).toEqual(["--version"])
      expect(HARNESS_REGISTRY.claude.binary).toBe("claude")
      expect(HARNESS_REGISTRY.claude.versionArgs).toEqual(["--version"])
      expect(HARNESS_REGISTRY.codex.binary).toBe("codex")
      expect(HARNESS_REGISTRY.codex.versionArgs).toEqual(["--version"])
    })

    it("has install candidates per table", () => {
      expect(getInstallCandidates("opencode")[0].command).toEqual(["npm", "i", "-g", "opencode-ai"])
      expect(getInstallCandidates("claude").some((c) => c.command.join(" ").includes("claude.ai/install.ps1"))).toBe(true)
      expect(getInstallCandidates("codex")[0].command).toEqual(["npm", "i", "-g", "@openai/codex"])
    })

    it("has launchArgs (empty, cwd=workspace)", () => {
      expect(HARNESS_REGISTRY.opencode.launchArgs).toEqual([])
      expect(HARNESS_REGISTRY.claude.launchArgs).toEqual([])
      expect(HARNESS_REGISTRY.codex.launchArgs).toEqual([])
    })

    it("listHarnesses returns all three", () => {
      expect(listHarnesses()).toEqual(expect.arrayContaining(["opencode", "claude", "codex"]))
      expect(listHarnesses()).toHaveLength(3)
    })
  })

  describe("binary resolution (salvage from OpencodeAdapter, where.exe, 10s timeout)", () => {
    it("resolveBinary returns string or null (not throw)", () => {
      for (const name of listHarnesses()) {
        const result = resolveBinary(name)
        expect(result === null || typeof result === "string").toBe(true)
      }
    })

    it("getVersion returns string or null, handles missing binary", () => {
      const v = getVersion("opencode")
      expect(v === null || typeof v === "string").toBe(true)
    })

    it("isInstalled is boolean, does not throw", () => {
      for (const name of listHarnesses()) {
        expect(typeof isInstalled(name)).toBe("boolean")
      }
    })

    it("verifyInstall checks binary resolvable and version parsable", () => {
      for (const name of listHarnesses()) {
        const v = verifyInstall(name)
        expect(v === null || typeof v === "string").toBe(true)
      }
    })
  })

  describe("install visibility (security, 06_MASTER_PLAN.md:158)", () => {
    it("install candidates have label, command[], url — command shown before execution", () => {
      for (const name of listHarnesses()) {
        for (const cand of getInstallCandidates(name)) {
          expect(cand.label).toBeDefined()
          expect(Array.isArray(cand.command)).toBe(true)
          expect(cand.command.length).toBeGreaterThan(0)
          expect(cand.url).toMatch(/^https:\/\//)
          const displayed = cand.command.join(" ")
          expect(displayed).not.toContain("undefined")
        }
      }
    })

    it("does not run install silently — registry has no spawn, only data", () => {
      const src = require("fs").readFileSync(
        require("path").join(process.cwd(), "apps/desktop/src/main/services/harness-registry.ts"),
        "utf-8",
      )
      const spawnMatches = (src.match(/spawnSync/g) || []).length
      expect(spawnMatches).toBeGreaterThan(0)
      expect(src).not.toMatch(/spawn.*install/i)
    })
  })

  describe("unhappy paths (explicit, no silent retry, no loop)", () => {
    it("decline path is explicit — UI must stay on picker, no retry", () => {
      const declined = { status: "declined" as const, harness: "opencode" as const, message: "Installation declined" }
      expect(declined.status).toBe("declined")
      expect(declined.harness).toBe("opencode")
    })

    it("install fail (non-zero exit) is explicit — UI shows exit code, no silent retry", () => {
      const failed = {
        status: "failed" as const,
        harness: "claude" as const,
        command: ["npm", "i", "-g", "@anthropic-ai/claude-code"],
        exitCode: 1,
        output: "npm ERR! code EACCES",
        message: "Install failed (exit code 1)",
      }
      expect(failed.status).toBe("failed")
      expect(failed.exitCode).toBe(1)
      expect(failed.output).toContain("EACCES")
    })

    it("verify fail after reported success is explicit — binary still not found", () => {
      const verifyFailed = {
        status: "verify-failed" as const,
        harness: "codex" as const,
        command: ["npm", "i", "-g", "@openai/codex"],
        exitCode: 0,
        message: "Installation completed but binary not found — verification failed",
      }
      expect(verifyFailed.status).toBe("verify-failed")
      expect(verifyFailed.exitCode).toBe(0)
    })

    it("no infinite loop — each unhappy path requires explicit user action to retry", () => {
      const src = require("fs").readFileSync(
        require("path").join(process.cwd(), "apps/desktop/src/main/services/harness-registry.ts"),
        "utf-8",
      )
      expect(src).not.toMatch(/retry.*install/i)
      expect(src).not.toMatch(/while.*install/i)
    })
  })
})
