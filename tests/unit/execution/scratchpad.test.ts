import { describe, it, expect } from "vitest"
import { ExecutionScratchpad } from "@/runtime/execution/ExecutionScratchpad"

describe("ExecutionScratchpad", () => {
  describe("constructor", () => {
    it("creates empty scratchpad with goal", () => {
      const sp = new ExecutionScratchpad("Add rate limiter")
      expect(sp.goal).toBe("Add rate limiter")
      expect(sp.isEmpty).toBe(true)
      expect(sp.filesExamined.size).toBe(0)
      expect(sp.filesModified.size).toBe(0)
      expect(sp.verificationResults.length).toBe(0)
      expect(sp.remainingWork.length).toBe(0)
    })
  })

  describe("recordFileExamination", () => {
    it("records a file examination", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordFileExamination("src/auth.ts", "examined auth middleware")
      expect(sp.filesExamined.size).toBe(1)
      expect(sp.filesExamined.get("src/auth.ts")?.summary).toBe("examined auth middleware")
      expect(sp.isEmpty).toBe(false)
    })

    it("overwrites existing file record", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordFileExamination("src/auth.ts", "first look")
      sp.recordFileExamination("src/auth.ts", "second look")
      expect(sp.filesExamined.size).toBe(1)
      expect(sp.filesExamined.get("src/auth.ts")?.summary).toBe("second look")
    })
  })

  describe("recordFileModification", () => {
    it("records a file modification", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordFileModification("src/auth.ts", "old content", "new content")
      expect(sp.filesModified.size).toBe(1)
      expect(sp.filesModified.get("src/auth.ts")?.summary).toContain("modified")
      expect(sp.filesModified.get("src/auth.ts")?.originalContent).toBe("old content")
      expect(sp.filesModified.get("src/auth.ts")?.newContent).toBe("new content")
    })

    it("tracks line counts in summary", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordFileModification("src/auth.ts", "old", "line1\nline2\nline3")
      expect(sp.filesModified.get("src/auth.ts")?.summary).toBe("modified (3 lines added/changed)")
    })

    it("overwrites existing modification", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordFileModification("src/auth.ts", "v1", "v2")
      sp.recordFileModification("src/auth.ts", "v2", "v3")
      expect(sp.filesModified.size).toBe(1)
      expect(sp.filesModified.get("src/auth.ts")?.newContent).toBe("v3")
    })
  })

  describe("recordVerificationResult", () => {
    it("records a verification result", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordVerificationResult("src/auth.ts", true, "Lint passed")
      expect(sp.verificationResults.length).toBe(1)
      expect(sp.verificationResults[0].file).toBe("src/auth.ts")
      expect(sp.verificationResults[0].passed).toBe(true)
      expect(sp.verificationResults[0].summary).toBe("Lint passed")
    })

    it("appends multiple verification results", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordVerificationResult("src/auth.ts", true, "Lint passed")
      sp.recordVerificationResult("src/auth.ts", false, "TypeScript errors")
      expect(sp.verificationResults.length).toBe(2)
    })
  })

  describe("setRemainingWork", () => {
    it("sets remaining work items", () => {
      const sp = new ExecutionScratchpad("test")
      sp.setRemainingWork(["Add tests", "Handle edge cases"])
      expect(sp.remainingWork.length).toBe(2)
      expect(sp.remainingWork[0]).toBe("Add tests")
    })
  })

  describe("clear", () => {
    it("clears all tracked state", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordFileExamination("src/a.ts", "examined")
      sp.recordFileModification("src/b.ts", "old", "new")
      sp.recordVerificationResult("src/b.ts", true, "Passed")
      sp.setRemainingWork(["Fix it"])
      sp.clear()
      expect(sp.isEmpty).toBe(true)
      expect(sp.filesExamined.size).toBe(0)
      expect(sp.filesModified.size).toBe(0)
      expect(sp.verificationResults.length).toBe(0)
      expect(sp.remainingWork.length).toBe(0)
    })
  })

  describe("formatForLLM", () => {
    it("returns null when empty", () => {
      const sp = new ExecutionScratchpad("test")
      expect(sp.formatForLLM()).toBeNull()
    })

    it("formats a complete execution state", () => {
      const sp = new ExecutionScratchpad("Add rate limiter")
      sp.recordFileExamination("src/auth/middleware.ts", "examined auth middleware")
      sp.recordFileExamination("src/auth/login.ts", "examined login flow")
      sp.recordFileModification("src/auth/middleware.ts", "old content", "new content")
      sp.recordVerificationResult("src/auth/middleware.ts", true, "Lint passed")
      sp.setRemainingWork(["Add tests", "Handle edge cases"])

      const output = sp.formatForLLM()
      expect(output).toContain("<execution_state>")
      expect(output).toContain("Goal: Add rate limiter")
      expect(output).toContain("Files examined:")
      expect(output).toContain("src/auth/middleware.ts")
      expect(output).toContain("src/auth/login.ts")
      expect(output).toContain("Files modified:")
      expect(output).toContain("src/auth/middleware.ts")
      expect(output).toContain("Verification:")
      expect(output).toContain("✅ Passed")
      expect(output).toContain("Remaining work:")
      expect(output).toContain("Add tests")
      expect(output).toContain("</execution_state>")
    })

    it("formats failed verification", () => {
      const sp = new ExecutionScratchpad("Fix bug")
      sp.recordVerificationResult("src/bug.ts", false, "TypeScript errors")

      const output = sp.formatForLLM()
      expect(output).toContain("❌ Failed")
      expect(output).toContain("TypeScript errors")
    })

    it("truncates when exceeding token budget", () => {
      const sp = new ExecutionScratchpad("test")
      for (let i = 0; i < 50; i++) {
        sp.recordFileExamination(`src/file${i}.ts`, `examined file ${i} with lots of extra detail to fill tokens quickly `.repeat(5))
      }
      const output = sp.formatForLLM(10)
      expect(output).not.toBeNull()
      expect(output).toContain("(trimmed at")
    })
  })

  describe("summary", () => {
    it("returns 'no activity yet' for empty scratchpad", () => {
      const sp = new ExecutionScratchpad("test")
      expect(sp.summary).toBe("no activity yet")
    })

    it("counts files examined", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordFileExamination("src/a.ts", "examined")
      sp.recordFileExamination("src/b.ts", "examined")
      expect(sp.summary).toContain("2 files examined")
    })

    it("counts files modified", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordFileModification("src/a.ts", "old", "new")
      expect(sp.summary).toContain("1 files modified")
    })

    it("counts verification pass rate", () => {
      const sp = new ExecutionScratchpad("test")
      sp.recordVerificationResult("src/a.ts", true, "Lint passed")
      sp.recordVerificationResult("src/b.ts", false, "Type errors")
      expect(sp.summary).toContain("1/2 verification checks passed")
    })
  })

  describe("toJSON / fromJSON", () => {
    it("serializes and deserializes", () => {
      const sp = new ExecutionScratchpad("Add rate limiter")
      sp.recordFileExamination("src/auth.ts", "examined")
      sp.recordFileModification("src/auth.ts", "old", "new")
      sp.recordVerificationResult("src/auth.ts", true, "Lint passed")
      sp.setRemainingWork(["Add tests"])

      const json = sp.toJSON()
      const restored = ExecutionScratchpad.fromJSON(json as Record<string, unknown>)
      expect(restored.goal).toBe("Add rate limiter")
      expect(restored.filesExamined.size).toBe(1)
      expect(restored.filesModified.size).toBe(1)
      expect(restored.verificationResults.length).toBe(1)
      expect(restored.remainingWork.length).toBe(1)
      expect(restored.remainingWork[0]).toBe("Add tests")
    })
  })

  describe("updatedAt", () => {
    it("updates timestamp on mutations", () => {
      const sp = new ExecutionScratchpad("test")
      const before = sp.updatedAt
      sp.recordFileExamination("src/a.ts", "examined")
      expect(sp.updatedAt).toBeGreaterThanOrEqual(before)
    })
  })
})
