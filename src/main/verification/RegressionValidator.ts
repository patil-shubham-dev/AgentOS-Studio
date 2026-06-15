import { execSync } from "child_process"
import { join } from "path"
import type { RegressionIssue, RegressionScanResult } from "./types"

export class RegressionValidator {
  async scan(projectRoot: string): Promise<RegressionScanResult> {
    const issues: RegressionIssue[] = []

    try {
      const testOutput = execSync("npx vitest run --reporter=verbose 2>&1", {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 120_000,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      }) as string

      const passMatch = testOutput.match(/(\d+)\s+passed/)
      const currentPass = passMatch ? parseInt(passMatch[1], 10) : 0

      const baselineKey = join(projectRoot, ".regression-baseline")
      const { existsSync, readFileSync, writeFileSync } = await import("fs")

      if (existsSync(baselineKey)) {
        const raw = readFileSync(baselineKey, "utf-8")
        const baseline = JSON.parse(raw) as { passCount: number; timestamp: number }

        if (currentPass < baseline.passCount) {
          issues.push({
            type: "test_regression",
            description: `Test regression detected: ${baseline.passCount} → ${currentPass} tests passing`,
            previousValue: `${baseline.passCount} passing`,
            currentValue: `${currentPass} passing`,
            severity: "high",
          })
        }

        writeFileSync(baselineKey, JSON.stringify({ testCount: currentPass, passCount: currentPass, timestamp: Date.now() }), "utf-8")
      } else {
        writeFileSync(baselineKey, JSON.stringify({ testCount: currentPass, passCount: currentPass, timestamp: Date.now() }), "utf-8")
      }
    } catch {}

    const passed = issues.length === 0

    let summary: string
    if (passed) {
      summary = "Regression scan passed — no regressions detected"
    } else {
      const high = issues.filter((i) => i.severity === "high").length
      const medium = issues.filter((i) => i.severity === "medium").length
      summary = `Regression scan found ${issues.length} issue(s): ${high} high, ${medium} medium`
    }

    return { passed, issues, summary }
  }
}
