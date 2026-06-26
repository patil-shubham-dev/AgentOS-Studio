import { getModeConfig } from "./execution-mode"
import { TerminalRuntime } from "./terminal/TerminalRuntime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import type { StructuredIssue } from "./verification/types"

export interface VerificationResult {
  typeCheck: {
    passed: boolean
    issues: StructuredIssue[]
    output: string
  } | null
  lint: {
    passed: boolean
    issues: StructuredIssue[]
    output: string
  } | null
  filesEdited: string[]
}

export class PostWriteVerifier {
  private static lastRunAt = 0
  private static readonly COOLDOWN_MS = 2_000

  static async verify(
    filesEdited: string[],
  ): Promise<VerificationResult | null> {
    const config = getModeConfig()
    if (!config.runTestsAfterImpl) return null

    const now = Date.now()
    if (now - this.lastRunAt < this.COOLDOWN_MS && this.lastRunAt > 0) {
      console.log("[PostWriteVerifier] Skipped — cooldown active")
      return null
    }
    this.lastRunAt = now

    if (filesEdited.length === 0) return null

    console.log(`[PostWriteVerifier] Running typecheck after ${filesEdited.length} file edit(s)...`)

    const typeCheck = await this.runTypeCheck()
    let lintResult = null

    if (typeCheck?.passed) {
      console.log("[PostWriteVerifier] ✅ TypeScript check passed")
      lintResult = await this.runLint()
      if (lintResult?.passed) {
        console.log("[PostWriteVerifier] ✅ Lint check passed")
      } else if (lintResult) {
        if (lintResult.issues.length <= 10) {
          console.log(`[PostWriteVerifier] ⚠️ Lint found ${lintResult.issues.length} issue(s) — attempting auto-fix...`)
          await this.autoFix()
          lintResult = await this.runLint()
        } else {
          console.log(`[PostWriteVerifier] ⚠️ Lint found ${lintResult.issues.length} issue(s) — too many to auto-fix`)
        }
      } else {
        console.log("[PostWriteVerifier] Lint unavailable — skipped")
      }
    } else if (typeCheck) {
      console.log(`[PostWriteVerifier] ❌ TypeScript check failed (${typeCheck.issues.length} errors)`)
    } else {
      console.log("[PostWriteVerifier] TypeCheck unavailable — skipped")
    }

    return {
      typeCheck,
      lint: lintResult,
      filesEdited,
    }
  }

  private static async autoFix(): Promise<boolean> {
    try {
      const { output } = await this.runTerminalCommand("npx eslint --fix --quiet --ext .ts,.tsx . 2>&1 || true")
      return output.trim().length === 0 || !output.includes("error")
    } catch {
      return false
    }
  }

  private static async runTerminalCommand(cmd: string): Promise<{
    output: string
    duration: number
  }> {
    const cwd = useWorkspaceStore.getState().rootPath
    const terminalRuntime = TerminalRuntime.getInstance()

    const lines: string[] = []
    const startedAt = performance.now()

    for await (const event of terminalRuntime.runStream(
      cmd,
      cwd,
      { role: "verification" },
    )) {
      if (event.type === "OUTPUT_LINE" && event.line) {
        lines.push(event.line)
      }
    }

    return {
      output: lines.join("\n"),
      duration: Math.round(performance.now() - startedAt),
    }
  }

  private static async runTypeCheck(): Promise<{
    passed: boolean
    issues: StructuredIssue[]
    output: string
  } | null> {
    try {
      const { output, duration } = await this.runTerminalCommand(
        "npx tsc --noEmit 2>&1",
      )

      if (!output || output.trim().length === 0) {
        return { passed: true, issues: [], output: `✅ TypeScript check: 0 errors (${duration}ms)` }
      }

      const issues = this.parseTscOutput(output)

      if (issues.length === 0 && !output.includes("Found ") && !output.includes("error")) {
        return { passed: true, issues: [], output: `✅ TypeScript check: 0 errors (${duration}ms)` }
      }

      const errorCount = issues.filter((i) => i.severity === "error").length
      return {
        passed: errorCount === 0,
        issues: issues.slice(0, 30),
        output: this.truncateOutput(output),
      }
    } catch {
      console.warn("[PostWriteVerifier] TypeCheck unavailable")
      return null
    }
  }

  private static async runLint(): Promise<{
    passed: boolean
    issues: StructuredIssue[]
    output: string
  } | null> {
    try {
      const { output, duration } = await this.runTerminalCommand(
        "npx eslint . --quiet --ext .ts,.tsx 2>&1 || true",
      )

      if (!output || output.trim().length === 0) {
        return { passed: true, issues: [], output: `✅ ESLint: 0 issues (${duration}ms)` }
      }

      const issues = this.parseEslintOutput(output)
      const errorCount = issues.filter((i) => i.severity === "error").length

      return {
        passed: errorCount === 0,
        issues: issues.slice(0, 20),
        output: this.truncateOutput(output),
      }
    } catch {
      console.warn("[PostWriteVerifier] Lint unavailable")
      return null
    }
  }

  private static parseTscOutput(output: string): StructuredIssue[] {
    const issues: StructuredIssue[] = []
    const lines = output.split("\n")
    const tscLinePattern = /^([^(]+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/
    const altPattern = /^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.+)$/

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let match = trimmed.match(tscLinePattern)
      if (match) {
        issues.push({
          file: match[1].trim(),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          code: match[5],
          message: match[6].trim(),
          severity: match[4] === "error" ? "error" : "warning",
          source: "typescript",
        })
        continue
      }

      match = trimmed.match(altPattern)
      if (match) {
        issues.push({
          file: match[1].trim(),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          code: match[5],
          message: match[6].trim(),
          severity: match[4] === "error" ? "error" : "warning",
          source: "typescript",
        })
        continue
      }

      if (trimmed.startsWith("error") || trimmed.startsWith("Error:")) {
        issues.push({
          message: trimmed,
          severity: "error",
          source: "typescript",
        })
      }
    }

    return issues
  }

  private static parseEslintOutput(output: string): StructuredIssue[] {
    const issues: StructuredIssue[] = []
    const lines = output.split("\n")
    const eslintLinePattern = /^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+)$/

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const match = trimmed.match(eslintLinePattern)
      if (match) {
        issues.push({
          file: match[1].trim(),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[5].trim(),
          severity: match[4] as "error" | "warning",
          source: "eslint",
        })
      }
    }

    return issues
  }

  private static truncateOutput(output: string): string {
    if (output.length <= 3000) return output
    return (
      output.slice(0, 3000) +
      `\n... (truncated, ${output.length - 3000} more chars)`
    )
  }

  static formatForAgent(result: VerificationResult): string {
    const parts: string[] = ["━━━ Auto-Verification Results ━━━"]

    if (result.typeCheck) {
      if (result.typeCheck.passed) {
        parts.push(result.typeCheck.output)
        if (result.lint) {
          if (result.lint.passed) {
            parts.push("✅ ESLint: 0 issues")
          } else {
            const errorCount = result.lint.issues.filter((i) => i.severity === "error").length
            const warnCount = result.lint.issues.filter((i) => i.severity === "warning").length
            parts.push(`⚠️ ESLint found ${errorCount} error(s), ${warnCount} warning(s):`)
            const sample = result.lint.issues.slice(0, 6)
            parts.push("```")
            for (const iss of sample) {
              const loc = iss.file ? `${iss.file}:${iss.line ?? "?"}` : ""
              parts.push(`  ${loc} ${iss.message}`)
            }
            if (result.lint.issues.length > 6) {
              parts.push(`  ... and ${result.lint.issues.length - 6} more issues`)
            }
            parts.push("```")
          }
        }
      } else {
        const errorCount = result.typeCheck.issues.filter((i) => i.severity === "error").length
        parts.push(`❌ TypeScript check FAILED (${errorCount} errors):`)
        const sample = result.typeCheck.issues.slice(0, 8)
        parts.push("```")
        for (const iss of sample) {
          const loc = iss.file ? `${iss.file}:${iss.line ?? "?"}:${iss.column ?? "?"}` : ""
          const code = iss.code ? ` ${iss.code}` : ""
          parts.push(`  ${loc}${code} ${iss.message}`)
        }
        if (result.typeCheck.issues.length > 8) {
          parts.push(`  ... and ${result.typeCheck.issues.length - 8} more errors`)
        }
        parts.push("```")
        parts.push("")
        parts.push("Please fix these TypeScript errors in your next step. Read the affected files and correct the issues.")
        parts.push("Prefer proper type fixes over `// @ts-ignore`, `// @ts-expect-error`, or `as any` casts.")
      }
    } else {
      parts.push("ℹ️ Auto-verification unavailable in this environment.")
      parts.push("Run `npx tsc --noEmit` manually to check for type errors after your changes.")
    }

    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return parts.join("\n")
  }
}
