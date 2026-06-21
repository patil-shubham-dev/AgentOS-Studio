import { describe, it, expect, vi } from "vitest"
import { ConfigGenerator, type ProjectProfile } from "@/runtime/project-config/ConfigGenerator"

describe("ConfigGenerator", () => {
  let generator: ConfigGenerator

  beforeEach(() => {
    generator = new ConfigGenerator()
  })

  describe("generate", () => {
    it("produces AGENTIC.md content for a project", async () => {
      const content = await generator.generate("/test/project")
      expect(content).toContain("AgenticOS Project Configuration")
      expect(content).toContain("Build & Test Commands")
      expect(content).toContain("Coding Standards")
      expect(content).toContain("Project Structure")
    })

    it("includes all required sections", async () => {
      const content = await generator.generate("/test")
      const sections = ["Build & Test Commands", "Coding Standards", "Project Structure", "Best Practices"]
      for (const section of sections) {
        expect(content).toContain(section)
      }
    })
  })

  describe("scan", () => {
    it("returns default profile for empty directory", async () => {
      const profile = await generator.scan("/nonexistent")
      expect(profile).toBeDefined()
      expect(profile.languages).toEqual([])
      expect(profile.frameworks).toEqual([])
      expect(profile.buildTool).toBeNull()
      expect(profile.testFramework).toBeNull()
    })

    it("includes all required fields", async () => {
      const profile = await generator.scan("/test")
      const requiredFields: (keyof ProjectProfile)[] = [
        "languages", "frameworks", "buildTool", "testFramework",
        "linter", "packageManager", "buildCommand", "testCommand",
        "lintCommand", "structure", "isTypeScript", "isStrictMode",
      ]
      for (const field of requiredFields) {
        expect(profile).toHaveProperty(field)
      }
    })
  })

  describe("write", () => {
    it("returns false for nonexistent path", async () => {
      const result = await generator.write("/nonexistent", "content")
      // In test environment without Tauri, write returns false
      expect(result).toBe(false)
    })
  })
})
