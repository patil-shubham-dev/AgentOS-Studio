import { describe, it, expect, beforeEach } from "vitest"
import { ReferenceParser } from "@/lib/context-references/ReferenceParser"

describe("ReferenceParser", () => {
  let parser: ReferenceParser

  beforeEach(() => {
    parser = ReferenceParser.getInstance()
  })

  describe("parse", () => {
    it("parses @file reference", () => {
      const result = parser.parse("@file src/utils.ts")
      expect(result.references).toHaveLength(1)
      expect(result.references[0].type).toBe("file")
      expect(result.references[0].target).toBe("src/utils.ts")
    })

    it("parses @folder reference", () => {
      const result = parser.parse("@folder src/components/")
      expect(result.references).toHaveLength(1)
      expect(result.references[0].type).toBe("folder")
      expect(result.references[0].target).toBe("src/components/")
    })

    it("parses @web reference with URL", () => {
      const result = parser.parse("@web https://example.com/docs")
      expect(result.references).toHaveLength(1)
      expect(result.references[0].type).toBe("web")
      expect(result.references[0].target).toBe("https://example.com/docs")
    })

    it("parses @code reference with query in path", () => {
      const result = parser.parse("@code \"handleSubmit\" in src/")
      expect(result.references).toHaveLength(1)
      expect(result.references[0].type).toBe("code")
      expect(result.references[0].target).toBe("handleSubmit")
      expect(result.references[0].qualifier).toBe("src/")
    })

    it("parses @lines reference with range and file", () => {
      const result = parser.parse("@lines 10-30 in src/file.ts")
      expect(result.references).toHaveLength(1)
      expect(result.references[0].type).toBe("lines")
      expect(result.references[0].target).toBe("src/file.ts")
      expect(result.references[0].qualifier).toBe("10-30")
    })

    it("parses @problems reference", () => {
      const result = parser.parse("@problems")
      expect(result.references).toHaveLength(1)
      expect(result.references[0].type).toBe("problems")
    })

    it("parses @git reference", () => {
      const result = parser.parse("@git")
      expect(result.references).toHaveLength(1)
      expect(result.references[0].type).toBe("git")
    })

    it("parses @symbol reference", () => {
      const result = parser.parse("@symbol AuthService")
      expect(result.references).toHaveLength(1)
      expect(result.references[0].type).toBe("symbol")
      expect(result.references[0].target).toBe("AuthService")
    })

    it("parses multiple references in a single input", () => {
      const result = parser.parse("@file src/a.ts @git @problems")
      expect(result.references.length).toBeGreaterThanOrEqual(3)
    })

    it("removes references from the cleaned text", () => {
      const result = parser.parse("Please check @file src/utils.ts and @git")
      expect(result.text).not.toContain("@file")
      expect(result.text).not.toContain("@git")
      expect(result.text).toContain("Please check")
    })

    it("handles quoted file paths", () => {
      const result = parser.parse('@file "src/file with spaces.ts"')
      expect(result.references).toHaveLength(1)
      expect(result.references[0].target).toBe("src/file with spaces.ts")
    })

    it("handles backtick-quoted paths", () => {
      const result = parser.parse('@file `src/file.ts`')
      expect(result.references).toHaveLength(1)
      expect(result.references[0].target).toBe("src/file.ts")
    })

    it("returns empty references for plain text", () => {
      const result = parser.parse("Hello, how are you?")
      expect(result.references).toHaveLength(0)
      expect(result.text).toBe("Hello, how are you?")
    })
  })

  describe("hasReferences", () => {
    it("returns true when @-references exist", () => {
      expect(parser.hasReferences("@file test.ts")).toBe(true)
      expect(parser.hasReferences("@git status")).toBe(true)
    })

    it("returns false for plain text", () => {
      expect(parser.hasReferences("Hello world")).toBe(false)
    })
  })

  describe("getAvailableTypes", () => {
    it("returns all reference types", () => {
      const types = parser.getAvailableTypes()
      expect(types.length).toBeGreaterThanOrEqual(8)
      expect(types.some((t) => t.type === "file")).toBe(true)
      expect(types.some((t) => t.type === "git")).toBe(true)
    })
  })

  describe("singleton", () => {
    it("returns same instance", () => {
      const instance1 = ReferenceParser.getInstance()
      const instance2 = ReferenceParser.getInstance()
      expect(instance1).toBe(instance2)
    })
  })
})
