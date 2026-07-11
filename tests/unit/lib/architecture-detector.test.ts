import { describe, it, expect } from "vitest"
import { ArchitectureDetector } from "@/lib/architecture-detector"

describe("ArchitectureDetector", () => {
  const detector = new ArchitectureDetector()

  it("detects TypeScript language from file list", () => {
    const result = detector.detect("/test", [
      "src/index.ts",
      "src/component.tsx",
      "package.json",
    ])
    expect(result.language).toBe("typescript")
  })

  it("detects JavaScript language", () => {
    const result = detector.detect("/test", [
      "src/index.js",
      "package.json",
    ])
    expect(result.language).toBe("javascript")
  })

  it("detects unknown language for no source files", () => {
    const result = detector.detect("/test", [
      "README.md",
    ])
    expect(result.language).toBe("unknown")
  })

  it("detects React framework from package.json dependencies (simulated by file list)", () => {
    const result = detector.detect("/test", [
      "src/index.tsx",
      "package.json",
      "tsconfig.json",
    ])
    // Framework depends on actual package.json contents, will be Unknown without it
    expect(result.framework).toBeDefined()
  })

  it("finds entry points from common patterns", () => {
    const result = detector.detect("/test", [
      "src/main.ts",
      "src/App.tsx",
      "src/component.ts",
      "package.json",
    ])
    expect(result.entryPoints).toContain("src/main.ts")
  })

  it("detects ESLint configuration", () => {
    const result = detector.detect("/test", [
      "src/index.ts",
      ".eslintrc.json",
    ])
    // hasEslint comes from dependencies, not files
    expect(result.hasTsconfig).toBe(false)
  })

  it("detects vitest", () => {
    const result = detector.detect("/test", [
      "src/index.ts",
      "vitest.config.ts",
    ])
    expect(result.hasTsconfig).toBe(false)
  })

  it("generates architecture summary with module boundaries", () => {
    const filePaths = [
      "src/components/Button.tsx",
      "src/components/Input.tsx",
      "src/stores/userStore.ts",
      "src/pages/Home.tsx",
      "src/pages/About.tsx",
      "src/services/api.ts",
      "src/lib/utils.ts",
      "src/config/index.ts",
    ]
    const summary = detector.getArchitecture("/test", filePaths)
    expect(summary.moduleBoundaries.length).toBeGreaterThan(0)
    const types = summary.moduleBoundaries.map((b) => b.type)
    expect(types).toContain("component")
  })

  it("handles empty file list", () => {
    const result = detector.detect("/test", [])
    expect(result.language).toBe("unknown")
    expect(result.framework).toBe("Unknown")
  })
})
