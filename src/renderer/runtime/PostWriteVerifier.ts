/**
 * PostWriteVerifier — automatically runs typecheck after file mutations
 * and feeds results back into the agent's context for self-correction.
 *
 * Built to Claude Code's verification-before-continue principle:
 * After every write_file or edit_file, the typecheck runs automatically
 * and errors are injected as a tool-like message the agent sees before
 * its next reasoning round.
 */

import { getModeConfig, type ExecutionModeId } from "./execution-mode"
import { TerminalRuntime } from "./terminal/TerminalRuntime"
import { useWorkspaceStore } from "@/stores/workspace-store"

export interface VerificationResult {
  typeCheck: {
    passed: boolean
    errors: string[]
    output: string
  } | null
  lint: {
    passed: boolean
    errors: string[]
    output: string
  } | null
  filesEdited: string[]
}

export class PostWriteVerifier {
  private static lastRunAt = 0
  /** Don't re-run within 2 seconds of the last verification */
  private static readonly COOLDOWN_MS = 2_000

  /**
   * Run post-write verification after file mutations.
   *
   * @param executionMode — current mode; respects `runTestsAfterImpl` config
   * @param filesEdited   — list of file paths that were just written/edited
   * @returns structured result, or null if verification was skipped
   */
  static async verify(
    executionMode: ExecutionModeId,
    filesEdited: string[],
  ): Promise<VerificationResult | null> {
    // Respect execution mode: only verify in modes that want it
    const config = getModeConfig(executionMode)
    if (!config.runTestsAfterImpl) return null

    // Cooldown: don't verify too frequently in rapid-succession edits
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
      // Only run lint if typecheck passed (no point linting broken code)
      lintResult = await this.runLint()
      if (lintResult?.passed) {
        console.log("[PostWriteVerifier] ✅ Lint check passed")
      } else if (lintResult) {
        console.log(`[PostWriteVerifier] ⚠️ Lint found ${lintResult.errors.length} issue(s)`)
      } else {
        console.log("[PostWriteVerifier] Lint unavailable — skipped")
      }
    } else if (typeCheck) {
      console.log(`[PostWriteVerifier] ❌ TypeScript check failed (${typeCheck.errors.length} errors)`)
    } else {
      console.log("[PostWriteVerifier] TypeCheck unavailable — skipped")
    }

    return {
      typeCheck,
      lint: lintResult,
      filesEdited,
    }
  }

  // ── Private ──

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
    errors: string[]
    output: string
  } | null> {
    try {
      const { output, duration } = await this.runTerminalCommand(
        "npx tsc --noEmit 2>&1",
      )

      // Check if output indicates success (empty or no error lines)
      if (!output || output.trim().length === 0) {
        return { passed: true, errors: [], output: `✅ TypeScript check: 0 errors (${duration}ms)` }
      }

      // Parse TypeScript errors — each error line contains "error TS..."
      // Standard TS format: "src/file.ts:10:5 - error TS2322: Type 'X' is not assignable..."
      const errorLines = output
        .split("\n")
        .filter((l) => l.includes("error TS"))
        .slice(0, 30) // Limit to 30 errors to avoid token bloat

      if (errorLines.length === 0 && !output.includes("Found ") && !output.includes("error")) {
        return { passed: true, errors: [], output: `✅ TypeScript check: 0 errors (${duration}ms)` }
      }

      return {
        passed: false,
        errors: errorLines,
        output: this.truncateOutput(output),
      }
    } catch (e) {
      // tsc not available, timeout, or environment doesn't support terminal execution
      console.warn(
        "[PostWriteVerifier] TypeCheck unavailable:",
        e instanceof Error ? e.message : String(e),
      )
      return null
    }
  }

  private static async runLint(): Promise<{
    passed: boolean
    errors: string[]
    output: string
  } | null> {
    try {
      const { output, duration } = await this.runTerminalCommand(
        "npx eslint . --quiet --ext .ts,.tsx 2>&1 || true",
      )

      if (!output || output.trim().length === 0) {
        return { passed: true, errors: [], output: `✅ ESLint: 0 issues (${duration}ms)` }
      }

      // Parse eslint issues (format: "path/file.ts:line:col: error Message")
      const issueLines = output
        .split("\n")
        .filter((l) => l.includes(": error ") || l.includes(": warning "))
        .slice(0, 20)

      return {
        passed: false,
        errors: issueLines,
        output: this.truncateOutput(output),
      }
    } catch (e) {
      console.warn(
        "[PostWriteVerifier] Lint unavailable:",
        e instanceof Error ? e.message : String(e),
      )
      return null
    }
  }

  private static truncateOutput(output: string): string {
    if (output.length <= 3000) return output
    return (
      output.slice(0, 3000) +
      `\n... (truncated, ${output.length - 3000} more chars)`
    )
  }

  /** Format verification results as a compact message for the agent's context */
  static formatForAgent(result: VerificationResult): string {
    const parts: string[] = ["━━━ Auto-Verification Results ━━━"]

    if (result.typeCheck) {
      if (result.typeCheck.passed) {
        parts.push(result.typeCheck.output)
        // Append lint results if they ran
        if (result.lint) {
          if (result.lint.passed) {
            parts.push("✅ ESLint: 0 issues")
          } else {
            parts.push(`⚠️ ESLint found ${result.lint.errors.length} issue(s):`)
            const sample = result.lint.errors.slice(0, 6)
            parts.push("```")
            parts.push(sample.join("\n"))
            if (result.lint.errors.length > 6) {
              parts.push(`... and ${result.lint.errors.length - 6} more issues`)
            }
            parts.push("```")
          }
        }
      } else {
        parts.push(`❌ TypeScript check FAILED (${result.typeCheck.errors.length} errors):`)
        // Only include the first 8 error lines to keep the context concise
        const sample = result.typeCheck.errors.slice(0, 8)
        parts.push("```")
        parts.push(sample.join("\n"))
        if (result.typeCheck.errors.length > 8) {
          parts.push(`... and ${result.typeCheck.errors.length - 8} more errors`)
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

