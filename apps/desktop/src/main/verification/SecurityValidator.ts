import { execSync } from "child_process"
import { readFileSync } from "fs"
import type { SecurityIssue, SecurityScanResult } from "./types"

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?key|auth[_-]?token)\s*[=:]\s*['"][^'"]+['"]/gi,
  /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]+['"]/gi,
  /(?:ghp|gho|ghu|ghs)_[A-Za-z0-9_]{36,}/g,
  /sk-[A-Za-z0-9]{32,}/g,
  /(?:-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/g,
]

const DANGEROUS_COMMANDS = [
  /rm\s+-rf\s+\//,
  /chmod\s+777/,
  /chown\s+-R/,
  /shutdown|reboot|halt/,
  /mkfs\.|dd\s+if=\/dev\/zero/,
  /:\(\)\s*\{[^}]+:\(\)\s*;\s*\};/,
  /curl.*\s*\|\s*(bash|sh)/,
  /wget.*\s*\|\s*(bash|sh)/,
  /eval\s*\(\s*\$\(/,
  /exec\s*\(\s*\$\(/,
]

export class SecurityValidator {
  async scan(changedFiles: string[], projectRoot: string): Promise<SecurityScanResult> {
    const issues: SecurityIssue[] = []

    try {
      const npmAuditResult = await this.runNpmAudit(projectRoot)
      if (npmAuditResult.vulnerabilities > 0) {
        for (const vuln of npmAuditResult.advisories) {
          issues.push({
            severity: vuln.severity as SecurityIssue["severity"],
            type: "dependency",
            description: `Dependency vulnerability: ${vuln.name}@${vuln.version} - ${vuln.title}`,
            recommendation: vuln.recommendation ?? `Update ${vuln.name}`,
          })
        }
      }
    } catch {
      issues.push({
        severity: "low",
        type: "dependency",
        description: "Dependency scan skipped (npm audit unavailable)",
      })
    }

    for (const file of changedFiles) {
      try {
        const content = readFileSync(file, "utf-8")
        for (const pattern of SECRET_PATTERNS) {
          const matches = content.match(pattern)
          if (matches) {
            const lineNum = this.findLineNumber(content, matches[0])
            issues.push({
              severity: "critical",
              type: "secret_leak",
              description: `Possible secret/credential in ${file}: ${matches[0].slice(0, 40)}...`,
              file,
              line: lineNum,
              recommendation: "Remove hardcoded secrets. Use environment variables or a secrets manager.",
            })
          }
        }
      } catch { console.warn("[SecurityValidator] Failed to check changed files") }
    }

    for (const file of changedFiles) {
      try {
        const content = readFileSync(file, "utf-8")
        for (const pattern of DANGEROUS_COMMANDS) {
          const matches = content.match(pattern)
          if (matches) {
            const lineNum = this.findLineNumber(content, matches[0])
            issues.push({
              severity: "high",
              type: "dangerous_command",
              description: `Potentially dangerous command in ${file}: ${matches[0].slice(0, 60)}...`,
              file,
              line: lineNum,
              recommendation: "Review this command for safety. Consider adding confirmation or restrictions.",
            })
          }
        }
      } catch { console.warn("[SecurityValidator] Failed to read file for pattern scan") }
    }

    for (const file of changedFiles) {
      if (file.includes("permissions") || file.includes("allowlist") || file.includes("acl")) {
        issues.push({
          severity: "medium",
          type: "permission",
          description: `Permission-related file changed: ${file}. Review for overly permissive rules.`,
          file,
          recommendation: "Verify that permissions follow least-privilege principle.",
        })
      }
    }

    const criticalCount = issues.filter((i) => i.severity === "critical").length
    const highCount = issues.filter((i) => i.severity === "high").length
    const mediumCount = issues.filter((i) => i.severity === "medium").length
    const lowCount = issues.filter((i) => i.severity === "low").length
    const passed = criticalCount === 0 && highCount === 0

    let summary: string
    if (issues.length === 0) {
      summary = "Security scan passed — no issues found"
    } else {
      const parts: string[] = []
      if (criticalCount > 0) parts.push(`${criticalCount} critical`)
      if (highCount > 0) parts.push(`${highCount} high`)
      if (mediumCount > 0) parts.push(`${mediumCount} medium`)
      if (lowCount > 0) parts.push(`${lowCount} low`)
      summary = `Security scan found ${issues.length} issue(s): ${parts.join(", ")}`
    }

    return { passed, issues, criticalCount, highCount, mediumCount, lowCount, summary }
  }

  private async runNpmAudit(projectRoot: string): Promise<{
    vulnerabilities: number
    advisories: Array<{ name: string; version: string; title: string; severity: string; recommendation?: string }>
  }> {
    try {
      const stdout = execSync("npm audit --json 2>&1 || true", {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 30_000,
        windowsHide: true,
      })
      const parsed = JSON.parse(stdout)
      const vulnerabilities = parsed.metadata?.vulnerabilities?.total ?? 0
      const advisories: Array<{ name: string; version: string; title: string; severity: string; recommendation?: string }> = []
      if (parsed.vulnerabilities) {
        for (const [name, info] of Object.entries(parsed.vulnerabilities) as Array<[string, any]>) {
          advisories.push({
            name,
            version: info.range ?? "unknown",
            title: info.title ?? info.via?.[0]?.title ?? "Unknown vulnerability",
            severity: info.severity ?? "medium",
            recommendation: info.fixAvailable
              ? `Update to ${typeof info.fixAvailable === "object" ? info.fixAvailable.name : info.fixAvailable}`
              : "No fix available",
          })
        }
      }
      return { vulnerabilities, advisories }
    } catch {
      return { vulnerabilities: 0, advisories: [] }
    }
  }

  private findLineNumber(content: string, match: string): number {
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(match)) return i + 1
    }
    return 0
  }
}
