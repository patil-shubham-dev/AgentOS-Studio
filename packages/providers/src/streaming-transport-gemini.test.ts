/**
 * Regression tests for Bug B: parseGeminiStreamChunk silently discarding the
 * terminal chunk that carries finishReason but no text content.
 *
 * Before the fix the function returned null for { candidates: [{ finishReason: "STOP" }] }
 * (no content.parts) which caused onFinishReason to never fire, leaving finishReason=null
 * and producing the "tokens=0 / empty chunk" symptom reported in production.
 */
import { describe, it, expect } from "vitest"
import { parseGeminiStreamChunk, parseOpenAiStreamChunk } from "./streaming-transport"

describe("parseGeminiStreamChunk — Bug B regression", () => {
  it("[BugB] parses a normal text chunk correctly", () => {
    const data = JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: "Hello world" }] },
        },
      ],
    })
    const result = parseGeminiStreamChunk(data)
    expect(result).not.toBeNull()
    expect(result?.content).toBe("Hello world")
    expect(result?.finishReason).toBeUndefined()
  })

  it("[BugB] terminal chunk with STOP finishReason and NO content parts must NOT return null", () => {
    // This is the exact shape of Gemini's last stream event:
    // { candidates: [{ finishReason: "STOP", content: {} }] }
    // Previously returned null because content.parts was absent → Object.keys({}).length === 0
    const data = JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          // content intentionally omitted or empty — this is the terminal chunk
        },
      ],
    })
    const result = parseGeminiStreamChunk(data)
    expect(result).not.toBeNull()
    expect(result?.finishReason).toBe("stop")
    expect(result?.content).toBeUndefined()
  })

  it("[BugB] terminal chunk with content:{} (empty parts) also propagates finishReason", () => {
    const data = JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          content: {},
        },
      ],
    })
    const result = parseGeminiStreamChunk(data)
    expect(result).not.toBeNull()
    expect(result?.finishReason).toBe("stop")
  })

  it("[BugB] terminal chunk with content:{ parts:[] } (empty array) propagates finishReason", () => {
    const data = JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [] },
        },
      ],
    })
    const result = parseGeminiStreamChunk(data)
    expect(result).not.toBeNull()
    expect(result?.finishReason).toBe("stop")
  })

  it("[BugB] last text chunk that also has finishReason returns both content and finishReason", () => {
    const data = JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: "last word." }] },
        },
      ],
    })
    const result = parseGeminiStreamChunk(data)
    expect(result).not.toBeNull()
    expect(result?.content).toBe("last word.")
    expect(result?.finishReason).toBe("stop")
  })

  it("[BugB] MAX_TOKENS finishReason maps to 'length'", () => {
    const data = JSON.stringify({
      candidates: [{ finishReason: "MAX_TOKENS" }],
    })
    const result = parseGeminiStreamChunk(data)
    expect(result?.finishReason).toBe("length")
  })

  it("[BugB] SAFETY finishReason maps to 'content_filter'", () => {
    const data = JSON.stringify({
      candidates: [{ finishReason: "SAFETY" }],
    })
    const result = parseGeminiStreamChunk(data)
    expect(result?.finishReason).toBe("content_filter")
  })

  it("[BugB] completely malformed JSON returns null", () => {
    const result = parseGeminiStreamChunk("not-json{{{")
    expect(result).toBeNull()
  })

  it("[BugB] empty candidates array returns null", () => {
    const data = JSON.stringify({ candidates: [] })
    const result = parseGeminiStreamChunk(data)
    expect(result).toBeNull()
  })
})

describe("parseOpenAiStreamChunk — existing behaviour preserved", () => {
  it("[BugB] [DONE] sentinel returns finishReason:stop and no content", () => {
    const result = parseOpenAiStreamChunk("[DONE]")
    expect(result).not.toBeNull()
    expect(result?.finishReason).toBe("stop")
    expect(result?.content).toBeUndefined()
  })

  it("[BugB] normal token delta returns content without finishReason", () => {
    const data = JSON.stringify({
      choices: [{ delta: { content: "hello " }, finish_reason: null }],
    })
    const result = parseOpenAiStreamChunk(data)
    expect(result?.content).toBe("hello ")
    expect(result?.finishReason).toBeUndefined()
  })

  it("[BugB] finish_reason:stop chunk returns finishReason", () => {
    const data = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }],
    })
    const result = parseOpenAiStreamChunk(data)
    expect(result?.finishReason).toBe("stop")
  })
})
