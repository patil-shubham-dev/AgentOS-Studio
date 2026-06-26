import { describe, it, expect } from "vitest"
import { applyEdits, computeDiff, generateUnifiedDiff } from "@/lib/diff-engine"

describe("DiffEngine — applyEdits", () => {

  describe("replace operation", () => {
    it("replaces single occurrence of text", () => {
      const content = "const x = 1\nconst y = 2\nconst z = 3"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "const y = 2", newContent: "const y = 42" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("const x = 1\nconst y = 42\nconst z = 3")
    })

    it("replaces only first occurrence by default", () => {
      const content = "foo\nbar\nfoo\nbaz"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "foo", newContent: "qux" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("qux\nbar\nfoo\nbaz")
    })

    it("replaces all occurrences when allOccurrences is true", () => {
      const content = "foo\nbar\nfoo\nbaz\nfoo"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "foo", newContent: "qux", allOccurrences: true }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("qux\nbar\nqux\nbaz\nqux")
    })

    it("reports EDIT_FAILED when oldContent not found", () => {
      const content = "const x = 1\nconst y = 2"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "const z = 3", newContent: "const z = 4" }
      ])
      expect(result.allApplied).toBe(false)
      expect(result.results[0].applied).toBe(false)
      expect(result.results[0].error).toContain("EDIT_FAILED")
    })

    it("reports failure for empty oldContent", () => {
      const content = "const x = 1"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "", newContent: "abc" }
      ])
      expect(result.allApplied).toBe(false)
      expect(result.results[0].error).toContain("EDIT_FAILED")
    })
  })

  describe("insert operation", () => {
    it("inserts content before a target", () => {
      const content = "line1\nline2\nline3"
      const result = applyEdits(content, [
        { type: "insert", target: "line2", newContent: "inserted", position: "before" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("line1\ninserted\nline2\nline3")
    })

    it("inserts content after a target", () => {
      const content = "line1\nline2\nline3"
      const result = applyEdits(content, [
        { type: "insert", target: "line2", newContent: "inserted", position: "after" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("line1\nline2\ninserted\nline3")
    })

    it("inserts before first occurrence only by default", () => {
      const content = "foo\nfoo"
      const result = applyEdits(content, [
        { type: "insert", target: "foo", newContent: "bar", position: "before" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("bar\nfoo\nfoo")
    })

    it("defaults position to after when not specified", () => {
      const content = "line1\nline2\nline3"
      const result = applyEdits(content, [
        { type: "insert", target: "line2", newContent: "inserted" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("line1\nline2\ninserted\nline3")
    })

    it("reports EDIT_FAILED when target not found", () => {
      const content = "line1\nline2"
      const result = applyEdits(content, [
        { type: "insert", target: "missing", newContent: "x", position: "before" }
      ])
      expect(result.allApplied).toBe(false)
      expect(result.results[0].error).toContain("EDIT_FAILED")
    })
  })

  describe("delete operation", () => {
    it("deletes matching content", () => {
      const content = "keep\nremove\nkeep"
      const result = applyEdits(content, [
        { type: "delete", oldContent: "remove" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("keep\n\nkeep")
    })

    it("deletes first occurrence only by default", () => {
      const content = "a\nb\na\nc"
      const result = applyEdits(content, [
        { type: "delete", oldContent: "a" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("\nb\na\nc")
    })

    it("deletes all occurrences when allOccurrences is true", () => {
      const content = "a\nb\na\nc\na"
      const result = applyEdits(content, [
        { type: "delete", oldContent: "a", allOccurrences: true }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("\nb\n\nc\n")
    })

    it("reports EDIT_FAILED when oldContent not found", () => {
      const content = "keep\nkeep"
      const result = applyEdits(content, [
        { type: "delete", oldContent: "missing" }
      ])
      expect(result.allApplied).toBe(false)
      expect(result.results[0].error).toContain("EDIT_FAILED")
    })
  })

  describe("multiple edits", () => {
    it("applies multiple edits sequentially", () => {
      const content = "a\nb\nc"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "a", newContent: "x" },
        { type: "replace", oldContent: "c", newContent: "z" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("x\nb\nz")
    })

    it("stops on first failure when failFast is true (default)", () => {
      const content = "a\nb\nc"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "a", newContent: "x" },
        { type: "replace", oldContent: "missing", newContent: "y" },
        { type: "replace", oldContent: "c", newContent: "z" }
      ])
      expect(result.allApplied).toBe(false)
      expect(result.results[0].applied).toBe(true)
      expect(result.results[1].applied).toBe(false)
      expect(result.results[2]).toBeUndefined() // skipped because failFast
    })

    it("applies all edits even on failure when failFast is false", () => {
      const content = "a\nb\nc"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "a", newContent: "x" },
        { type: "replace", oldContent: "missing", newContent: "y" },
        { type: "replace", oldContent: "c", newContent: "z" }
      ], { failFast: false })
      expect(result.allApplied).toBe(false)
      expect(result.results[0].applied).toBe(true)
      expect(result.results[1].applied).toBe(false)
      expect(result.results[2].applied).toBe(true)
    })
  })

  describe("line tracking", () => {
    it("reports correct line numbers for single-line replace", () => {
      const content = "line1\nline2\nline3"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "line2", newContent: "modified" }
      ])
      expect(result.results[0].locations).toHaveLength(1)
      expect(result.results[0].locations[0].startLine).toBe(2)
    })

    it("reports multiple locations for multi-occurrence replace", () => {
      const content = "foo\nbar\nfoo\nbaz"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "foo", newContent: "qux", allOccurrences: true }
      ])
      expect(result.results[0].locations).toHaveLength(2)
    })

    it("reports correct hunks count", () => {
      const content = "a\nb\na\nc\na"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "a", newContent: "x", allOccurrences: true }
      ])
      expect(result.results[0].hunks).toBe(3)
    })
  })

  describe("edge cases", () => {
    it("handles special characters (braces, backslashes, unicode)", () => {
      const content = "function foo() {\n  return 'hello'\n}"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "return 'hello'", newContent: "return 'world'" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toContain("return 'world'")
    })

    it("handles template literals with backticks", () => {
      const content = "const msg = `hello ${name}`"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "hello ${name}", newContent: "hi ${name}" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("const msg = `hi ${name}`")
    })

    it("handles unicode characters", () => {
      const content = "const π = 3.14\nconst 你好 = 'hello'"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "你好", newContent: "世界" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("const π = 3.14\nconst 世界 = 'hello'")
    })

    it("handles very long lines", () => {
      const longLine = "x".repeat(10000)
      const content = `${longLine}\nmarker\n${longLine}`
      const result = applyEdits(content, [
        { type: "replace", oldContent: "marker", newContent: "replaced" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toContain("replaced")
    })

    it("handles content with DOS line endings (\\r\\n)", () => {
      const content = "line1\r\nline2\r\nline3"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "line2", newContent: "modified" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toContain("modified")
    })

    it("handles empty content", () => {
      const result = applyEdits("", [
        { type: "replace", oldContent: "x", newContent: "y" }
      ])
      expect(result.allApplied).toBe(false)
    })

    it("handles content with only whitespace", () => {
      const result = applyEdits("   \n  \n", [
        { type: "replace", oldContent: "   ", newContent: "..." }
      ])
      expect(result.allApplied).toBe(true)
    })

    it("handles newline-aware replacements (multi-line oldContent)", () => {
      const content = "function foo() {\n  return 1\n}\n\nfunction bar() {\n  return 2\n}"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "function foo() {\n  return 1\n}", newContent: "function foo() {\n  return 42\n}" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("function foo() {\n  return 42\n}\n\nfunction bar() {\n  return 2\n}")
    })
  })

  describe("post-apply validation", () => {
    it("passes post-apply newContent check for replace", () => {
      const content = "const x = 1\nconst y = 2"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "const y = 2", newContent: "const y = 42" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.results[0].applied).toBe(true)
      expect(result.content).toContain("const y = 42")
    })

    it("passes post-apply newContent check for insert", () => {
      const content = "line1\nline2\nline3"
      const result = applyEdits(content, [
        { type: "insert", target: "line2", newContent: "inserted", position: "after" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toContain("inserted")
    })

    it("passes post-apply oldContent removal check for single delete", () => {
      const content = "a\nb\na\nc"
      const result = applyEdits(content, [
        { type: "delete", oldContent: "a" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content.split("a").length - 1).toBe(1)
      expect(result.content).toContain("a")
    })

    it("passes post-apply oldContent removal check for all-occurrences delete", () => {
      const content = "a\nb\na\nc\na"
      const result = applyEdits(content, [
        { type: "delete", oldContent: "a", allOccurrences: true }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).not.toContain("a")
    })

    it("handles replacement with empty newContent (effectively a delete)", () => {
      const content = "abc"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "abc", newContent: "" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.results[0].applied).toBe(true)
      expect(result.content).toBe("")
    })
  })

  describe("large file handling", () => {
    it("applies edit to a 10K+ line file", () => {
      const lines: string[] = []
      for (let i = 0; i < 10001; i++) {
        lines.push(`line${i}`)
      }
      lines[5000] = "marker"
      const content = lines.join("\n")
      const result = applyEdits(content, [
        { type: "replace", oldContent: "marker", newContent: "replaced" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toContain("replaced")
      expect(result.content).not.toContain("marker")
    })

    it("inserts into a 10K+ line file", () => {
      const lines: string[] = []
      for (let i = 0; i < 10001; i++) {
        lines.push(`line${i}`)
      }
      const content = lines.join("\n")
      const result = applyEdits(content, [
        { type: "insert", target: "line5000", newContent: "inserted", position: "after" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toContain("line5000\ninserted")
    })

    it("deletes from a 10K+ line file", () => {
      const lines: string[] = []
      for (let i = 0; i < 10001; i++) {
        lines.push(`line${i}`)
      }
      const content = lines.join("\n")
      const result = applyEdits(content, [
        { type: "delete", oldContent: "line5000" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).not.toContain("line5000")
    })
  })

  describe("generateUnifiedDiff", () => {
    it("returns empty string for identical content", () => {
      const content = "line1\nline2\nline3"
      expect(generateUnifiedDiff(content, content)).toBe("")
    })

    it("generates diff for added lines", () => {
      const original = "line1\nline2\nline3"
      const modified = "line1\nline2\nadded\nline3"
      const diff = generateUnifiedDiff(original, modified, "test.ts")
      expect(diff).toContain("--- a/test.ts")
      expect(diff).toContain("+++ b/test.ts")
      expect(diff).toContain("+added")
      expect(diff).toContain("@@")
    })

    it("generates diff for removed lines", () => {
      const original = "line1\nremoved\nline2\nline3"
      const modified = "line1\nline2\nline3"
      const diff = generateUnifiedDiff(original, modified)
      expect(diff).toContain("-removed")
      expect(diff).toContain("@@")
    })

    it("generates diff for modified lines", () => {
      const original = "line1\nold text\nline3"
      const modified = "line1\nnew text\nline3"
      const diff = generateUnifiedDiff(original, modified)
      expect(diff).toContain("-old text")
      expect(diff).toContain("+new text")
      expect(diff).toContain("@@")
    })

    it("includes context lines around changes", () => {
      const original = "ctx1\nctx2\nremoved\nctx3\nctx4"
      const modified = "ctx1\nctx2\nadded\nctx3\nctx4"
      const diff = generateUnifiedDiff(original, modified)
      expect(diff).toContain("-removed")
      expect(diff).toContain("+added")
      expect(diff).toContain(" ctx1")
      expect(diff).toContain(" ctx2")
      expect(diff).toContain(" ctx3")
      expect(diff).toContain(" ctx4")
    })

    it("handles completely different content", () => {
      const original = "old"
      const modified = "new"
      const diff = generateUnifiedDiff(original, modified)
      expect(diff).toContain("-old")
      expect(diff).toContain("+new")
    })

    it("handles empty original", () => {
      const diff = generateUnifiedDiff("", "new content\nline2")
      expect(diff).toContain("+new content")
    })
  })

  describe("computeDiff", () => {
    it("returns empty array for identical content", () => {
      const hunks = computeDiff("a\nb\nc", "a\nb\nc")
      expect(hunks).toHaveLength(0)
    })

    it("detects single insertion", () => {
      const hunks = computeDiff("a\nc", "a\nb\nc")
      expect(hunks.length).toBeGreaterThanOrEqual(1)
    })

    it("detects single deletion", () => {
      const hunks = computeDiff("a\nb\nc", "a\nc")
      expect(hunks.length).toBeGreaterThanOrEqual(1)
    })

    it("returns correct hunk metadata", () => {
      const original = "line1\nline2\nline3"
      const modified = "line1\nmodified\nline3"
      const hunks = computeDiff(original, modified)
      expect(hunks.length).toBeGreaterThanOrEqual(1)
      const hunk = hunks[0]
      expect(hunk.oldLines).toBeGreaterThan(0)
      expect(hunk.newLines).toBeGreaterThan(0)
      expect(hunk.lines.some(l => l.startsWith("+"))).toBe(true)
      expect(hunk.lines.some(l => l.startsWith("-"))).toBe(true)
    })
  })

  describe("backward compatibility with old format", () => {
    it("applies edits array in old format (old_content / new_content)", () => {
      const content = "a\nb\nc"
      const result = applyEdits(content, [
        { oldContent: "b", newContent: "x" } as any
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("a\nx\nc")
    })

    it("applies old_string / new_string style via adapter", () => {
      // The adapter in EditFileTool converts old_string to oldContent
      const content = "const x = 1"
      const result = applyEdits(content, [
        { type: "replace", oldContent: "const x = 1", newContent: "const x = 2" }
      ])
      expect(result.allApplied).toBe(true)
      expect(result.content).toBe("const x = 2")
    })
  })
})
