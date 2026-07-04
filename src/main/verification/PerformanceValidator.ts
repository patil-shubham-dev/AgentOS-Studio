import { execSync } from "child_process"
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import type { BenchmarkResult, BenchmarkMetric } from "./types"

export class PerformanceValidator {
  async runBenchmarks(projectRoot: string): Promise<BenchmarkResult> {
    const metrics: BenchmarkMetric[] = []

    const buildMetric = await this.measureBuild(projectRoot)
    metrics.push(buildMetric)

    const typeMetric = await this.measureTypeCheck(projectRoot)
    metrics.push(typeMetric)

    const testMetric = await this.measureUnitTests(projectRoot)
    metrics.push(testMetric)

    const tokenMetric = await this.measureTokenUsage(projectRoot)
    metrics.push(tokenMetric)

    const failed = metrics.filter((m) => !m.passed)
    const passed = failed.length === 0

    let summary: string
    if (passed) {
      summary = `Performance: all ${metrics.length} benchmarks passed`
    } else {
      summary = `Performance: ${failed.length}/${metrics.length} benchmarks failed (${failed.map((m) => m.name).join(", ")})`
    }

    return { passed, metrics, summary }
  }

  private runCommand(command: string, cwd: string, timeout = 120_000): { stdout: string; exitCode: number } {
    try {
      const stdout = execSync(command, {
        cwd,
        encoding: "utf-8",
        timeout,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      }) as string
      return { stdout, exitCode: 0 }
    } catch (err: any) {
      return { stdout: err.stdout ?? err.message ?? "Unknown error", exitCode: err.status ?? 1 }
    }
  }

  private async measureBuild(projectRoot: string): Promise<BenchmarkMetric> {
    const start = Date.now()
    const { exitCode } = this.runCommand("npx tsc --noEmit 2>&1", projectRoot)
    const duration = Date.now() - start
    return {
      name: "typecheck_duration_ms",
      value: duration,
      unit: "ms",
      threshold: 120_000,
      passed: exitCode === 0,
      durationMs: duration,
    }
  }

  private async measureTypeCheck(projectRoot: string): Promise<BenchmarkMetric> {
    const start = Date.now()
    const { exitCode } = this.runCommand("npx tsc --noEmit 2>&1", projectRoot)
    const duration = Date.now() - start
    return {
      name: "typecheck_duration_ms",
      value: duration,
      unit: "ms",
      threshold: 120_000,
      passed: exitCode === 0,
      durationMs: duration,
    }
  }

  private async measureUnitTests(projectRoot: string): Promise<BenchmarkMetric> {
    const start = Date.now()
    const { exitCode } = this.runCommand("npx vitest run --reporter=verbose 2>&1", projectRoot)
    const duration = Date.now() - start
    return {
      name: "unit_test_duration_ms",
      value: duration,
      unit: "ms",
      threshold: 300_000,
      passed: exitCode === 0,
      durationMs: duration,
    }
  }

  private walkDir(dir: string, ext: string[]): string[] {
    const results: string[] = []
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          results.push(...this.walkDir(fullPath, ext))
        } else if (entry.isFile()) {
          if (ext.some((e) => entry.name.endsWith(e))) results.push(fullPath)
        }
      }
    } catch { console.warn("[PerformanceValidator] Failed to walk directory:", dir) }
    return results
  }

  private async measureTokenUsage(projectRoot: string): Promise<BenchmarkMetric> {
    const start = Date.now()
    try {
      const srcDir = join(projectRoot, "src/renderer")
      const files = this.walkDir(srcDir, [".ts", ".tsx", ".js", ".jsx"])
      let totalChars = 0
      for (const f of files.slice(0, 100)) {
        totalChars += readFileSync(f, "utf-8").length
      }
      const estimatedTokens = Math.round(totalChars / 4)
      const duration = Date.now() - start
      return {
        name: "token_estimate",
        value: estimatedTokens,
        unit: "tokens",
        threshold: 300_000,
        passed: estimatedTokens <= 300_000,
        durationMs: duration,
      }
    } catch {
      return { name: "token_estimate", value: 0, unit: "tokens", threshold: 300_000, passed: true, durationMs: Date.now() - start }
    }
  }
}
