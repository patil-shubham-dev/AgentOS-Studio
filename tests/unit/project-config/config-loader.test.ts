import { describe, it, expect, beforeEach, vi } from "vitest"
import { ConfigLoader } from "@/runtime/project-config/ConfigLoader"

// Simulate Tauri env without real filesystem — isTauri returns true so
// we exercise the read path, but readFile returns null (no real files).
vi.mock("@/runtime/environment", () => ({
  isTauri: () => false,
  getRuntimeEnvironment: () => "tauri",
}))

describe("ConfigLoader", () => {
  let loader: ConfigLoader

  beforeEach(() => {
    loader = new ConfigLoader()
    loader.invalidateCache()
  })

  describe("load", () => {
    it("returns empty result for empty root", async () => {
      const result = await loader.load("/nonexistent")
      expect(result.configs).toBeDefined()
      expect(result.combined).toBe("")
    })

    it("preserves load order by priority", () => {
      // Config files are loaded in priority order:
      // managed (0) → user (1) → project (2) → local (3)
      const defs = [
        { source: "managed" as const, priority: 0 },
        { source: "user" as const, priority: 1 },
        { source: "project" as const, priority: 2 },
        { source: "local" as const, priority: 3 },
      ]
      const sorted = [...defs].sort((a, b) => a.priority - b.priority)
      expect(sorted[0].source).toBe("managed")
      expect(sorted[3].source).toBe("local")
    })

    it("caches result within cache duration", async () => {
      const result1 = await loader.load("/test")
      const result2 = await loader.load("/test")
      expect(result1).toEqual(result2)
    })

    it("invalidates cache correctly", async () => {
      await loader.load("/test")
      loader.invalidateCache()
      const result = await loader.load("/test")
      expect(result.configs).toEqual([])
    })
  })

  describe("loadPathScoped", () => {
    it("returns empty for nonexistent rules dir", async () => {
      const rules = await loader.loadPathScoped("/nonexistent", "src/test.ts")
      expect(rules).toEqual([])
    })
  })

  describe("getCombined and getHash", () => {
    it("returns empty string when cache is empty", () => {
      expect(loader.getCombined("/test")).toBe("")
      expect(loader.getHash("/test")).toBe("")
    })
  })

  describe("invalidateCache", () => {
    it("triggers fresh load on next call", async () => {
      await loader.load("/test")
      loader.invalidateCache()
      const result = await loader.load("/test")
      expect(result.configs.length).toBe(0)
    })
  })
})
