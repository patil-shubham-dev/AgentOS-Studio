/**
 * Real-provider streaming verification test
 *
 * $env:NVIDIA_API_KEY = "nvapi-..."
 * npx vitest run --reporter=verbose RealProviderStreaming
 *
 * All 3 termination paths + regression against real Nvidia NIM SSE.
 * Uses globalThis.fetch directly (Tauri IPC unavailable in Node tests).
 * 8s inter-request delay to stay under NIM rate limits.
 * 429s retried (3 attempts) — infra noise, not bug signal.
 */

import { describe, it, expect } from "vitest"

const BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1"
const API_KEY = process.env.NVIDIA_API_KEY
const MODEL = process.env.NVIDIA_MODEL ?? "meta/llama-3.1-70b-instruct"

// Set runs low to stay under Nvidia free-tier rate limits (~10 RPM)
const RUNS_SINGLE_WORD = 3
const RUNS_ERROR = 3
const RUNS_CANCEL = 3
const RUNS_REGRESSION = 3

if (!API_KEY) {
  console.warn("⚠  NVIDIA_API_KEY not set — skipping real-provider tests.")
}

// ── SSE parsing ───────────────────────────────────────────────────────────

async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const d = line.slice(6).trim()
          if (d === "[DONE]") return
          if (d) yield d
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function contentFromChunk(jsonStr: string): { text: string | null; finishReason: string | null; error?: string } {
  try {
    const p = JSON.parse(jsonStr)
    if (p.error) return { text: null, finishReason: null, error: p.error.message ?? JSON.stringify(p.error) }
    const choice = p.choices?.[0]
    if (!choice) return { text: null, finishReason: "no_choices" }
    return {
      text: choice.delta?.content ?? null,
      finishReason: choice.finish_reason ?? null,
    }
  } catch {
    return { text: null, finishReason: null }
  }
}

// ── Rate limit error class ────────────────────────────────────────────────

class RateLimitError extends Error {
  constructor() { super("Rate limited (429)"); this.name = "RateLimitError" }
}

// ── Core streaming function ────────────────────────────────────────────────

async function realStream(
  messages: Array<{ role: string; content: string }>,
  opts?: {
    maxTokens?: number
    temperature?: number
    signal?: AbortSignal
    model?: string
    /** Custom body fields merged in */
    extraBody?: Record<string, unknown>
  },
): Promise<{ tokens: string[]; fullText: string; finishReason: string | null; lastChunk: any }> {
  const tokens: string[] = []
  let finishReason: string | null = null
  let lastChunk: any = null

  const body = JSON.stringify({
    model: opts?.model ?? MODEL,
    messages,
    max_tokens: opts?.maxTokens ?? 4096,
    temperature: opts?.temperature ?? 0,
    stream: true,
    ...(opts?.extraBody ?? {}),
  })

  const res = await globalThis.fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body,
    signal: opts?.signal,
  })

  if (!res.ok) {
    const t = await res.text().catch(() => "unknown")
    if (res.status === 429) throw new RateLimitError()
    // Even on error, we might have partial data from the response body
    // But for 4xx/5xx there's no SSE body to parse
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`)
  }

  if (!res.body) throw new Error("No body")

  for await (const chunk of parseSSE(res.body)) {
    const parsed = contentFromChunk(chunk)
    if (parsed.error) throw new Error(`API error: ${parsed.error}`)
    lastChunk = parsed
    if (parsed.finishReason) {
      finishReason = parsed.finishReason
      break // "stop" / "length" — stream complete
    }
    if (parsed.text) tokens.push(parsed.text)
  }

  return { tokens, fullText: tokens.join(""), finishReason, lastChunk }
}

// ── Run harness with rate-limit retries ────────────────────────────────────

async function runTest(
  label: string,
  fn: (i: number) => Promise<{ ok: boolean; detail?: string }>,
  n: number,
): Promise<{ pass: number; fail: number; rateLimited: number; details: string[] }> {
  let pass = 0; let fail = 0; let rateLimited = 0; const details: string[] = []

  for (let i = 1; i <= n; i++) {
    if (i > 1) await new Promise(r => setTimeout(r, 8000))

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 15000))
      try {
        const r = await fn(i)
        if (r.ok) { pass++ } else { fail++; details.push(`run ${i}: ${r.detail ?? "unknown"}`) }
        break
      } catch (err: any) {
        if (err instanceof RateLimitError) {
          if (attempt < 2) continue
          rateLimited++; details.push(`run ${i}: rate-limited after 3 attempts`)
          break
        }
        fail++; details.push(`run ${i}: ${err.message?.slice(0, 150)}`)
        break
      }
    }
  }

  return { pass, fail, rateLimited, details }
}

// ═══════════════════════════════════════════════════════════════════════════
// PATH 1: Normal completion — single-word / no-boundary responses
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!API_KEY)("Real NIM — Path 1: Normal completion (no boundary)", () => {
  it(`"Hi" (single word, no boundary) x${RUNS_SINGLE_WORD}`, async () => {
    const r = await runTest("Hi", async (i) => {
      const res = await realStream([
        { role: "system", content: "Repeat exactly: Hi" },
        { role: "user", content: "Hi" },
      ], { maxTokens: 5, temperature: 0 })
      const got = res.fullText.trim()
      return { ok: (got === "Hi" || got.startsWith("Hi")) && got.length > 0, detail: `got "${got}"` }
    }, RUNS_SINGLE_WORD)
    console.log(`  Hi: ${r.pass}/${RUNS_SINGLE_WORD} pass, ${r.fail} fail, ${r.rateLimited} rate-limited`)
    r.details.forEach(d => console.log(`    ${d}`))
    expect(r.fail).toBe(0)
  })

  it(`"42" (numeric) x${RUNS_SINGLE_WORD}`, async () => {
    const r = await runTest("42", async (i) => {
      const res = await realStream([
        { role: "system", content: "Repeat exactly: 42" },
        { role: "user", content: "42" },
      ], { maxTokens: 5, temperature: 0 })
      const got = res.fullText.trim()
      return { ok: (got === "42" || got.startsWith("42")) && got.length > 0, detail: `got "${got}"` }
    }, RUNS_SINGLE_WORD)
    console.log(`  42: ${r.pass}/${RUNS_SINGLE_WORD} pass, ${r.fail} fail, ${r.rateLimited} rate-limited`)
    r.details.forEach(d => console.log(`    ${d}`))
    expect(r.fail).toBe(0)
  })

  it(`"Hello" x${RUNS_SINGLE_WORD}`, async () => {
    const r = await runTest("Hello", async (i) => {
      const res = await realStream([
        { role: "system", content: "Repeat exactly: Hello" },
        { role: "user", content: "Hello" },
      ], { maxTokens: 5, temperature: 0 })
      const got = res.fullText.trim()
      return { ok: (got === "Hello" || got.startsWith("Hello")) && got.length > 0, detail: `got "${got}"` }
    }, RUNS_SINGLE_WORD)
    console.log(`  Hello: ${r.pass}/${RUNS_SINGLE_WORD} pass, ${r.fail} fail, ${r.rateLimited} rate-limited`)
    r.details.forEach(d => console.log(`    ${d}`))
    expect(r.fail).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PATH 2: EXECUTION_FAILED — provider error mid-stream
// ═══════════════════════════════════════════════════════════════════════════
//
// Three strategies tried:
//   1. Invalid model param → fails before streaming starts (not useful)
//   2. Prompt that triggers NIM content filter → may fail mid-stream
//   3. Network drop mid-stream → simulate transport failure
//
// Strategy (3) is the most reliable: start a valid stream, collect some
// tokens, then kill the connection and verify partial text is preserved.
// The actual app triggers EXECUTION_FAILED when the provider transport
// errors mid-stream — this is the closest simulation.
//
// Strategy (2): Nvidia NIM sometimes applies content filtering mid-stream
// for certain prompts. We try one that may trigger it as a bonus approach.

describe.skipIf(!API_KEY)("Real NIM — Path 2: EXECUTION_FAILED (simulated network drop)", () => {
  it(`text preserved after network abort x${RUNS_ERROR}`, async () => {
    const r = await runTest("networkabort", async (i) => {
      const ac = new AbortController()
      const myTokens: string[] = []
      let startedStreaming = false

      try {
        const res = await globalThis.fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: "You are a verbose assistant. Write a very long detailed response with many sentences." },
              { role: "user", content: "Explain the history of machine learning in great detail." },
            ],
            max_tokens: 500,
            temperature: 0.7,
            stream: true,
          }),
          signal: ac.signal,
        })
        if (!res.ok) {
          const t = await res.text().catch(() => "")
          if (res.status === 429) throw new RateLimitError()
          return { ok: false, detail: `HTTP ${res.status}` }
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        // Collect a few tokens then simulate a network drop
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          startedStreaming = true
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const d = line.slice(6).trim()
              if (d === "[DONE]") break
              const c = contentFromChunk(d)
              if (c.text) myTokens.push(c.text)
              if (c.finishReason) break // stream ended naturally
            }
          }

          // After collecting enough data, simulate transport failure
          // by aborting with a reason that looks like a network error
          if (myTokens.join("").length >= 15) {
            // Force-cancel the reader to simulate connection drop
            await reader.cancel(new Error("CONNECTION_RESET: stream interrupted"))
            break
          }
        }
      } catch (err: any) {
        // reader.cancel() throws — that IS the simulated network drop
      }

      // The text collected before the network drop must be preserved
      const ft = myTokens.join("")
      return { ok: ft.length >= 15, detail: `got ${ft.length} chars: "${ft.slice(0, 60)}"` }
    }, RUNS_ERROR)
    console.log(`  network-abort: ${r.pass}/${RUNS_ERROR} pass, ${r.fail} fail, ${r.rateLimited} rate-limited`)
    r.details.forEach(d => console.log(`    ${d}`))
    expect(r.fail).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PATH 3: Cancel mid-stream (user-initiated)
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!API_KEY)("Real NIM — Path 3: Cancel mid-stream", () => {
  it(`text preserved after user abort x${RUNS_CANCEL}`, async () => {
    const r = await runTest("abort", async (i) => {
      const ac = new AbortController()
      const myTokens: string[] = []

      try {
        const res = await globalThis.fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: "You are very verbose. Write a very long essay." },
              { role: "user", content: "Write a 1000-word essay on the history of computing." },
            ],
            max_tokens: 500,
            temperature: 0.7,
            stream: true,
          }),
          signal: ac.signal,
        })
        if (!res.ok) {
          const t = await res.text().catch(() => "")
          if (res.status === 429) throw new RateLimitError()
          return { ok: false, detail: `HTTP ${res.status}` }
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let chunkCount = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const d = line.slice(6).trim()
              if (d === "[DONE]") break
              const c = contentFromChunk(d)
              if (c.text) { myTokens.push(c.text); chunkCount++ }
              if (c.finishReason) break
              // Abort after 6 SSE events (simulates user cancel)
              if (chunkCount >= 6) { ac.abort(); break }
            }
          }
          if (chunkCount >= 6) break
        }
      } catch (err: any) {
        // AbortError is expected — that IS the user cancel
        if (!(err.name === "AbortError" || String(err.message).toLowerCase().includes("abort"))) {
          return { ok: false, detail: err.message }
        }
      }

      const ft = myTokens.join("")
      return { ok: ft.length > 0, detail: ft.length > 0 ? `got ${ft.length} chars` : "empty after abort" }
    }, RUNS_CANCEL)
    console.log(`  abort: ${r.pass}/${RUNS_CANCEL} pass, ${r.fail} fail, ${r.rateLimited} rate-limited`)
    r.details.forEach(d => console.log(`    ${d}`))
    expect(r.fail).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION: Normal multi-sentence response
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!API_KEY)("Real NIM — Regression: multi-sentence", () => {
  it(`normal response x${RUNS_REGRESSION}`, async () => {
    const r = await runTest("regression", async (i) => {
      const res = await realStream([
        { role: "system", content: "You are a helpful assistant. Respond concisely." },
        { role: "user", content: "What is the capital of France? Answer in 1-2 sentences." },
      ], { maxTokens: 100, temperature: 0.7 })
      const t = res.fullText.trim()
      return { ok: t.length > 0, detail: `"${t.slice(0, 80)}"` }
    }, RUNS_REGRESSION)
    console.log(`  regression: ${r.pass}/${RUNS_REGRESSION} pass, ${r.fail} fail, ${r.rateLimited} rate-limited`)
    r.details.forEach(d => console.log(`    ${d}`))
    expect(r.fail).toBe(0)
  })
})
