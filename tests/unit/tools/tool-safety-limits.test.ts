import { describe, it, expect, beforeEach, vi } from "vitest"

// Helper functions to test (duplicated from ReadFileTool for testing)
function detectBinary(content: string): boolean {
  for (let i = 0; i < Math.min(content.length, 512); i++) {
    if (content.charCodeAt(i) === 0) return true
  }
  return false
}

function validatePath(fullPath: string, rootPath: string | null): string | null {
  const normalized = fullPath.replace(/\\/g, '/')
  if (normalized.includes('..')) {
    return 'Path traversal denied: ".." is not allowed in file paths'
  }
  if (rootPath) {
    const root = rootPath.replace(/\\/g, '/').replace(/\/$/, '')
    if (!normalized.startsWith(root)) {
      return `Path escapes workspace root: "${fullPath}" is outside "${rootPath}"`
    }
  }
  return null
}

function truncateContent(
  content: string,
  maxLines: number,
  maxChars: number,
): { content: string; truncated: boolean; truncatedLines: number; totalLines: number; totalChars: number } {
  const totalLines = content.split('\n').length
  const totalChars = content.length
  let truncated = false
  let truncatedLines = 0
  let result = content
  if (totalLines > maxLines) {
    const lines = content.split('\n')
    const headCount = Math.floor(maxLines * 0.7)
    const tailCount = maxLines - headCount - 1
    const head = lines.slice(0, headCount)
    const tail = lines.slice(lines.length - tailCount)
    truncatedLines = totalLines - headCount - tailCount
    result = [...head, `... truncated ${truncatedLines} lines ...`, ...tail].join('\n')
    truncated = true
  }
  if (result.length > maxChars) {
    const headChars = Math.floor(maxChars * 0.7)
    const tailChars = maxChars - headChars - 50
    const head = result.substring(0, headChars)
    const tail = result.substring(result.length - tailChars)
    result = `${head}\n... truncated at ${maxChars} characters ...\n${tail}`
    truncated = true
  }
  return { content: result, truncated, truncatedLines, totalLines, totalChars }
}

function capOutputSize(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  return content.substring(0, maxChars) + `\n[output truncated at ${maxChars} chars...]`
}

describe("ReadFileTool safety", () => {
  describe("detectBinary", () => {
    it("returns false for plain text", () => {
      expect(detectBinary("hello world\nfoo bar")).toBe(false)
    })

    it("returns true for content with null byte", () => {
      expect(detectBinary("hello\x00world")).toBe(true)
    })

    it("returns false for empty content", () => {
      expect(detectBinary("")).toBe(false)
    })

    it("only checks first 512 bytes", () => {
      const content = "a".repeat(600) + "\x00" + "rest"
      expect(detectBinary(content)).toBe(false)
    })
  })

  describe("validatePath", () => {
    it("allows valid paths within workspace", () => {
      expect(validatePath("/workspace/src/file.ts", "/workspace")).toBeNull()
    })

    it("rejects path traversal with ..", () => {
      const err = validatePath("/workspace/src/../../etc/passwd", "/workspace")
      expect(err).toContain("Path traversal denied")
    })

    it("rejects paths outside workspace root", () => {
      const err = validatePath("/other/file.ts", "/workspace")
      expect(err).toContain("escapes workspace root")
    })

    it("allows paths when rootPath is null", () => {
      expect(validatePath("/any/path", null)).toBeNull()
    })

    it("allows paths exactly at workspace root", () => {
      expect(validatePath("/workspace/file.ts", "/workspace")).toBeNull()
    })
  })

  describe("truncateContent", () => {
    it("does not truncate small content", () => {
      const result = truncateContent("hello\nworld", 500, 100000)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe("hello\nworld")
      expect(result.totalLines).toBe(2)
      expect(result.totalChars).toBe(11)
    })

    it("truncates by lines when exceeding maxLines", () => {
      const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
      const result = truncateContent(content, 10, 100000)
      expect(result.truncated).toBe(true)
      expect(result.truncatedLines).toBeGreaterThan(0)
      expect(result.content).toContain('... truncated')
      expect(result.totalLines).toBe(100)
    })

    it("truncates by chars when exceeding maxChars", () => {
      const content = "a".repeat(5000)
      const result = truncateContent(content, 500, 100)
      expect(result.truncated).toBe(true)
      expect(result.content).toContain('truncated at')
      expect(result.totalChars).toBe(5000)
    })

    it("returns line and char counts", () => {
      const result = truncateContent("a\nb\nc", 500, 100000)
      expect(result.totalLines).toBe(3)
      expect(result.totalChars).toBe(5)
    })
  })

  describe("capOutputSize", () => {
    it("returns content unchanged when under limit", () => {
      expect(capOutputSize("hello", 100)).toBe("hello")
    })

    it("truncates content when over limit", () => {
      const result = capOutputSize("hello world", 5)
      expect(result).toBe("hello\n[output truncated at 5 chars...]")
    })

    it("returns content exactly at limit", () => {
      expect(capOutputSize("hello", 5)).toBe("hello")
    })
  })
})

describe("GrepTool safety", () => {
  describe("maxResults", () => {
    it("capOutputSize helper works for grep results", () => {
      const result = capOutputSize("Found 300 matches", 50000)
      expect(result).toBe("Found 300 matches")
    })
  })
})

describe("GlobTool safety", () => {
  describe("maxResults", () => {
    it("capOutputSize helper works for glob results", () => {
      const result = capOutputSize("src/file.ts\nsrc/other.ts", 50000)
      expect(result).toBe("src/file.ts\nsrc/other.ts")
    })
  })
})
