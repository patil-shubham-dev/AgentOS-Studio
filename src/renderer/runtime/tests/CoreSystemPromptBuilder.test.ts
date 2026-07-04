import { describe, it, expect, beforeEach } from "vitest"
import { CoreSystemPromptBuilder } from "@/runtime/prompting/CoreSystemPromptBuilder"

describe("CoreSystemPromptBuilder golden tests", () => {
  let builder: CoreSystemPromptBuilder

  beforeEach(() => {
    builder = new CoreSystemPromptBuilder()
  })

  it("builds a system prompt for coder role", async () => {
    const result = await builder.build({
      role: "coder",
      userMessage: "Fix the login bug in auth.ts",
    })

    expect(result.promptText.length).toBeGreaterThan(0)
    expect(result.totalTokens).toBeGreaterThan(0)
    expect(result.sections.length).toBeGreaterThan(0)
    expect(result.compressionRatio).toBeGreaterThanOrEqual(0)

    expect(result.promptText).toMatchSnapshot("coder-prompt")
  })

  it("builds a system prompt for runtime role", async () => {
    const result = await builder.build({
      role: "runtime",
      userMessage: "Run npm test",
    })

    expect(result.promptText.length).toBeGreaterThan(0)
    expect(result.totalTokens).toBeGreaterThan(0)
    expect(result.sections.length).toBeGreaterThan(0)

    expect(result.promptText).toMatchSnapshot("runtime-prompt")
  })

  it("includes sections with ids and content", async () => {
    const result = await builder.build({
      role: "coder",
      userMessage: "test",
    })

    for (const section of result.sections) {
      expect(section.id).toBeTruthy()
      expect(typeof section.tokens).toBe("number")
      expect(section.tokens).toBeGreaterThanOrEqual(0)
    }
  })

  it("different roles produce different prompts", async () => {
    const coder = await builder.build({
      role: "coder",
      userMessage: "test",
    })

    const designer = await builder.build({
      role: "designer",
      userMessage: "test",
    })

    const manager = await builder.build({
      role: "manager",
      userMessage: "test",
    })

    const texts = new Set([coder.promptText, designer.promptText, manager.promptText])
    expect(texts.size).toBeGreaterThan(1)
  })

  it("compression ratio is a number between 0 and 1", async () => {
    const result = await builder.build({
      role: "coder",
      userMessage: "test",
    })

    expect(result.compressionRatio).toBeGreaterThanOrEqual(0)
    expect(result.compressionRatio).toBeLessThanOrEqual(1)
  })

  it("activeFilePath is included in resolution context", async () => {
    const withPath = await builder.build({
      role: "coder",
      userMessage: "Fix bugs",
      activeFilePath: "src/auth.ts",
    })

    expect(withPath.promptText.length).toBeGreaterThan(0)
  })

  it("can reset and rebuild independently", async () => {
    const first = await builder.build({
      role: "coder",
      userMessage: "first",
    })

    builder.reset()

    const second = await builder.build({
      role: "coder",
      userMessage: "second",
    })

    expect(second.sections.length).toBe(first.sections.length)
  })
})
