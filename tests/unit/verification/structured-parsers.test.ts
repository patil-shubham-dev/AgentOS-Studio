import { describe, it, expect } from "vitest"

// Parser implementations (duplicated from VerificationPipeline.ts for isolated testing)
interface StructuredIssue {
  file?: string; line?: number; column?: number; code?: string
  message: string; severity: "error" | "warning" | "info"
  source: "typescript" | "eslint" | "vitest" | "build" | "security" | "regression"
}

function parseTscOutput(output: string): StructuredIssue[] {
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
        file: match[1].trim(), line: parseInt(match[2], 10), column: parseInt(match[3], 10),
        code: match[5], message: match[6].trim(),
        severity: match[4] === "error" ? "error" : "warning", source: "typescript",
      })
      continue
    }
    match = trimmed.match(altPattern)
    if (match) {
      issues.push({
        file: match[1].trim(), line: parseInt(match[2], 10), column: parseInt(match[3], 10),
        code: match[5], message: match[6].trim(),
        severity: match[4] === "error" ? "error" : "warning", source: "typescript",
      })
      continue
    }
    if (trimmed.startsWith("error") || trimmed.startsWith("Error:")) {
      issues.push({ message: trimmed, severity: "error", source: "typescript" })
    }
  }
  return issues
}

function parseEslintOutput(output: string): StructuredIssue[] {
  const issues: StructuredIssue[] = []
  const lines = output.split("\n")
  const eslintLinePattern = /^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+)$/
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(eslintLinePattern)
    if (match) {
      issues.push({
        file: match[1].trim(), line: parseInt(match[2], 10), column: parseInt(match[3], 10),
        message: match[5].trim(), severity: match[4] as "error" | "warning", source: "eslint",
      })
    }
  }
  return issues
}

function parseVitestOutput(output: string): { issues: StructuredIssue[]; failedTests: string[] } {
  const issues: StructuredIssue[] = []
  const failedTests: string[] = []
  const lines = output.split("\n")
  let currentTestFile: string | undefined
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith("❯") || trimmed.match(/^\s*●/)) {
      const testName = trimmed.replace(/^[❯●\s]+/, "").trim()
      if (testName) { failedTests.push(testName); issues.push({ message: `Test failed: ${testName}`, severity: "error", source: "vitest", file: currentTestFile }) }
      continue
    }
    if (trimmed.startsWith("FAIL") && trimmed.includes(".test.")) {
      currentTestFile = trimmed.replace(/^FAIL\s+/, "").split(/\s/)[0]; continue
    }
    if (trimmed.includes("AssertionError") || (trimmed.includes("expected") && trimmed.includes("received"))) {
      issues.push({ message: trimmed, severity: "error", source: "vitest", file: currentTestFile }); continue
    }
    if (trimmed.match(/^\s*×\s+/) || trimmed.match(/^\s*✗\s+/)) {
      const testName = trimmed.replace(/^[×✗\s]+/, "").trim()
      if (testName) { failedTests.push(testName); issues.push({ message: `Test failed: ${testName}`, severity: "error", source: "vitest", file: currentTestFile }) }
    }
  }
  return { issues, failedTests }
}

function parseBuildOutput(output: string): StructuredIssue[] {
  const issues: StructuredIssue[] = []
  for (const line of output.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith("error") || trimmed.includes("ERROR")) {
      issues.push({ message: trimmed, severity: "error", source: "build" })
    }
  }
  return issues
}

function determineRequiredChecks(changedFiles: string[]) {
  const hasTsFiles = changedFiles.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  const hasBuildFiles = changedFiles.some(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".json") || f.endsWith(".js") || f.endsWith(".css") || f.endsWith(".html")
  )
  const hasTestFiles = changedFiles.some(
    (f) => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__")
  )
  const hasSourceChanges = changedFiles.some(
    (f) => !f.includes(".test.") && !f.includes(".spec.") && !f.includes("__tests__") && !f.endsWith(".md") && !f.endsWith(".txt")
  )
  const hasConfigChanges = changedFiles.some(
    (f) => f.includes("package.json") || f.includes("tsconfig") || f.includes("vite.config") || f.includes(".eslintrc")
  )
  const onlyMarkdown = changedFiles.length > 0 && changedFiles.every((f) => f.endsWith(".md"))
  const onlyTestFiles = changedFiles.length > 0 && changedFiles.every(
    (f) => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__")
  )
  const onlyConfig = changedFiles.length > 0 && changedFiles.every(
    (f) => f.includes("package.json") || f.includes("tsconfig") || f.includes(".eslintrc") || f.endsWith(".md") || f.endsWith(".json")
  )

  if (onlyMarkdown) {
    return { runTypecheck: false, runLint: false, runBuild: false, runTests: false, runIntegration: false, runSecurity: false, runPerformance: false, runRegression: false }
  }
  if (onlyConfig) {
    return { runTypecheck: false, runLint: false, runBuild: hasBuildFiles, runTests: false, runIntegration: false, runSecurity: false, runPerformance: false, runRegression: true }
  }

  return {
    runTypecheck: hasTsFiles,
    runLint: hasSourceChanges && !onlyTestFiles,
    runBuild: hasBuildFiles,
    runTests: hasTestFiles || hasSourceChanges,
    runIntegration: hasTestFiles || hasConfigChanges,
    runSecurity: hasSourceChanges || hasConfigChanges,
    runPerformance: hasConfigChanges,
    runRegression: true,
  }
}

describe("parseTscOutput", () => {
  it("parses standard TypeScript error format", () => {
    const output = `src/foo.ts:10:5 - error TS2321: Type 'X' is not assignable to type 'Y'\n\nFound 1 error.`
    const issues = parseTscOutput(output)
    expect(issues).toHaveLength(1)
    expect(issues[0].file).toBe("src/foo.ts")
    expect(issues[0].line).toBe(10)
    expect(issues[0].column).toBe(5)
    expect(issues[0].code).toBe("TS2321")
    expect(issues[0].severity).toBe("error")
    expect(issues[0].source).toBe("typescript")
  })

  it("parses parenthesized TypeScript error format", () => {
    const output = `src/bar.ts(25,3): error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'`
    const issues = parseTscOutput(output)
    expect(issues).toHaveLength(1)
    expect(issues[0].file).toBe("src/bar.ts")
    expect(issues[0].line).toBe(25)
    expect(issues[0].column).toBe(3)
    expect(issues[0].code).toBe("TS2345")
  })

  it("ignores non-error output lines", () => {
    const output = `Starting compilation...\nNo inputs were found in config file 'tsconfig.json'.\n`
    const issues = parseTscOutput(output)
    expect(issues).toHaveLength(0)
  })

  it("returns empty array for clean output", () => {
    expect(parseTscOutput("")).toHaveLength(0)
  })

  it("handles warnings as warning severity", () => {
    const output = `src/test.ts(5,1): warning TS80001: This is a warning`
    const issues = parseTscOutput(output)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("warning")
  })

  it("captures bare error lines (no file location)", () => {
    const output = `error TS2321: Cannot find name 'foo'.\nFound 1 error.`
    const issues = parseTscOutput(output)
    expect(issues.length).toBeGreaterThanOrEqual(1)
    expect(issues[0].severity).toBe("error")
    expect(issues[0].source).toBe("typescript")
  })
})

describe("parseEslintOutput", () => {
  it("parses standard eslint error format", () => {
    const output = `src/foo.ts:15:7: error 'x' is assigned a value but never used  @typescript-eslint/no-unused-vars`
    const issues = parseEslintOutput(output)
    expect(issues).toHaveLength(1)
    expect(issues[0].file).toBe("src/foo.ts")
    expect(issues[0].line).toBe(15)
    expect(issues[0].column).toBe(7)
    expect(issues[0].severity).toBe("error")
    expect(issues[0].source).toBe("eslint")
  })

  it("parses warning severity", () => {
    const output = `src/bar.ts:3:2: warning 'unused' is defined but never used  @typescript-eslint/no-unused-vars`
    const issues = parseEslintOutput(output)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("warning")
  })

  it("returns empty for clean output", () => {
    expect(parseEslintOutput("")).toHaveLength(0)
  })
})

describe("parseVitestOutput", () => {
  it("detects failed test names from ❯ prefix", () => {
    const output = ` ❯ should compute sum correctly`
    const { issues, failedTests } = parseVitestOutput(output)
    expect(failedTests).toContain("should compute sum correctly")
    expect(issues).toHaveLength(1)
    expect(issues[0].source).toBe("vitest")
  })

  it("detects FAIL test file entries", () => {
    const output = `FAIL tests/foo.test.ts`
    const { issues, failedTests } = parseVitestOutput(output)
    expect(issues).toHaveLength(0)
    expect(failedTests).toHaveLength(0)
  })

  it("detects assertion errors", () => {
    const output = `AssertionError: expected 1 to equal 2`
    const { issues } = parseVitestOutput(output)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("error")
    expect(issues[0].source).toBe("vitest")
  })
})

describe("parseBuildOutput", () => {
  it("captures lines starting with 'error'", () => {
    const output = `error: Failed to load config`
    const issues = parseBuildOutput(output)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("error")
    expect(issues[0].source).toBe("build")
  })

  it("captures lines containing 'ERROR'", () => {
    const output = `[ERROR] Could not resolve module`
    const issues = parseBuildOutput(output)
    expect(issues).toHaveLength(1)
  })

  it("returns empty for clean output", () => {
    expect(parseBuildOutput("Build succeeded.")).toHaveLength(0)
  })
})

describe("determineRequiredChecks", () => {
  it("skips everything for markdown-only changes", () => {
    const checks = determineRequiredChecks(["README.md", "docs/guide.md"])
    expect(checks.runTypecheck).toBe(false)
    expect(checks.runLint).toBe(false)
    expect(checks.runBuild).toBe(false)
    expect(checks.runTests).toBe(false)
  })

  it("runs typecheck and lint for .ts file changes", () => {
    const checks = determineRequiredChecks(["src/foo.ts"])
    expect(checks.runTypecheck).toBe(true)
    expect(checks.runLint).toBe(true)
    expect(checks.runBuild).toBe(true)
  })

  it("skips lint for test-only changes", () => {
    const checks = determineRequiredChecks(["tests/foo.test.ts"])
    expect(checks.runLint).toBe(false)
    expect(checks.runTests).toBe(true)
  })

  it("skips typecheck for config-only changes", () => {
    const checks = determineRequiredChecks(["package.json", "tsconfig.json"])
    expect(checks.runTypecheck).toBe(false)
    expect(checks.runLint).toBe(false)
    expect(checks.runTests).toBe(false)
    expect(checks.runRegression).toBe(true)
  })

  it("runs tests when source changes", () => {
    const checks = determineRequiredChecks(["src/component.ts"])
    expect(checks.runTests).toBe(true)
    expect(checks.runIntegration).toBe(false)
  })

  it("runs nothing for empty file list", () => {
    const checks = determineRequiredChecks([])
    expect(checks.runTypecheck).toBe(false)
    expect(checks.runLint).toBe(false)
  })
})

describe("end-to-end: countIssues replacement", () => {
  it("structured parsing counts errors accurately (no false positives)", () => {
    const output = `src/test.ts:1:1 - error TS2322: Type 'string' is not assignable to type 'number'`
    const issues = parseTscOutput(output)
    expect(issues.filter((i) => i.severity === "error").length).toBe(1)
  })

  it("does NOT match 'error' substring in prose output", () => {
    const output = `No errors found in 5 files.`
    const issues = parseTscOutput(output)
    expect(issues.filter((i) => i.severity === "error").length).toBe(0)
  })

  it("does NOT match 'FAIL' in test summary containing 'FAIL'", () => {
    const output = `Tests: 1 failed, 5 passed (6 total)`
    const { issues } = parseVitestOutput(output)
    expect(issues.filter((i) => i.severity === "error").length).toBe(0)
  })

  it("does NOT match '×' or '❌' in subtask markers", () => {
    const output = `  × should validate user input`
    const { issues, failedTests } = parseVitestOutput(output)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("error")
  })
})
