import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildChatUrl,
  buildStreamUrl,
  normalizeChatUrl,
  getGatewayProviderHealth,
  recordProviderSuccess,
  recordProviderFailure,
  providerSupportsStreaming,
} from './provider-gateway'
import { streamChatCompletion } from './ai-service'

// ── Helpers ──

const OPENAI_BASE = 'https://api.openai.com/v1'
const API_KEY = 'sk-test-key-12345'

/**
 * Create a ReadableStream that yields SSE-formatted chunks.
 */
function sseStream(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

function mockFetchStream(body: ReadableStream<Uint8Array>, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  } as unknown as Response)
}

describe('provider-gateway — URL builders', () => {
  describe('normalizeChatUrl', () => {
    it('strips trailing slash', () => {
      expect(normalizeChatUrl('https://api.openai.com/v1/', true)).toBe('https://api.openai.com/v1')
    })

    it('strips /chat/completions suffix', () => {
      expect(normalizeChatUrl('https://api.openai.com/v1/chat/completions', true)).toBe('https://api.openai.com/v1')
    })

    it('deduplicates /v1/v1', () => {
      expect(normalizeChatUrl('https://api.openai.com/v1/v1/chat/completions', true)).toBe('https://api.openai.com/v1')
    })

    it('appends /v1 for OpenAI-compatible without it', () => {
      expect(normalizeChatUrl('https://api.openai.com', true)).toBe('https://api.openai.com/v1')
    })

    it('does not append /v1 for non-OpenAI-compatible', () => {
      expect(normalizeChatUrl('https://api.anthropic.com', false)).toBe('https://api.anthropic.com')
    })
  })

  describe('buildChatUrl', () => {
    it('builds URL for OpenAI-compatible', () => {
      const url = buildChatUrl(OPENAI_BASE, true)
      expect(url).toBe('https://api.openai.com/v1')
    })

    it('builds URL for non-OpenAI-compatible', () => {
      const url = buildChatUrl('https://api.anthropic.com', false)
      expect(url).toBe('https://api.anthropic.com')
    })

    it('defaults isOpenAiCompatible to true', () => {
      const url = buildChatUrl(OPENAI_BASE)
      expect(url).toBe('https://api.openai.com/v1')
    })
  })

  describe('buildStreamUrl', () => {
    it('appends /chat/completions for OpenAI-compatible', () => {
      const url = buildStreamUrl(OPENAI_BASE, true)
      expect(url).toBe('https://api.openai.com/v1/chat/completions')
    })

    it('does not append /v1/chat/completions for non-OpenAI-compatible', () => {
      const url = buildStreamUrl('https://api.anthropic.com', false)
      expect(url).toBe('https://api.anthropic.com/chat/completions')
    })
  })
})

describe('ai-service — Streaming (via unified transport)', () => {
  describe('streamChatCompletion', () => {
    it('sends streaming request and calls onToken/onDone', async () => {
      const stream = sseStream(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      )
      mockFetchStream(stream)

      const callbacks = {
        onReady: vi.fn(),
        onToken: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion(
        OPENAI_BASE,
        API_KEY,
        null,
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
        callbacks,
      )

      expect(callbacks.onReady).toHaveBeenCalled()
      expect(callbacks.onToken).toHaveBeenCalledTimes(2)
      expect(callbacks.onToken).toHaveBeenNthCalledWith(1, 'Hello')
      expect(callbacks.onToken).toHaveBeenNthCalledWith(2, ' world')
      expect(callbacks.onDone).toHaveBeenCalledWith('Hello world', expect.objectContaining({ finishReason: 'stop' }))
      expect(callbacks.onError).not.toHaveBeenCalled()
    })

    it('handles empty content tokens', async () => {
      const stream = sseStream(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      )
      mockFetchStream(stream)

      const callbacks = {
        onReady: vi.fn(),
        onToken: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion(
        OPENAI_BASE,
        API_KEY,
        null,
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
        callbacks,
      )

      expect(callbacks.onReady).toHaveBeenCalled()
      expect(callbacks.onToken).not.toHaveBeenCalled()
      expect(callbacks.onDone).toHaveBeenCalled()
    })

    it('calls onError on fetch failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const callbacks = {
        onReady: vi.fn(),
        onToken: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion(
        OPENAI_BASE,
        API_KEY,
        null,
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
        callbacks,
      )

      expect(callbacks.onError).toHaveBeenCalled()
    })

    it('passes runtime header when runtime is provided', async () => {
      const stream = sseStream('data: [DONE]\n\n')
      const fetchSpy = mockFetchStream(stream)

      const callbacks = {
        onReady: vi.fn(),
        onToken: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion(
        OPENAI_BASE,
        API_KEY,
        'Groq',
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
        callbacks,
      )

      const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(callArgs[1].headers).toEqual(
        expect.objectContaining({
          'X-Runtime': 'Groq',
        } as Record<string, string>),
      )
    })

    it('collects tool calls from the stream', async () => {
      const stream = sseStream(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":"{\\\"city\\\":\\\"NYC\\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      )
      mockFetchStream(stream)

      const callbacks = {
        onReady: vi.fn(),
        onToken: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion(
        OPENAI_BASE,
        API_KEY,
        null,
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
        callbacks,
      )

      expect(callbacks.onReady).toHaveBeenCalled()
      expect(callbacks.onDone).toHaveBeenCalled()
      expect(callbacks.onDone.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          toolCalls: [
            expect.objectContaining({
              id: 'call_1',
              function: expect.objectContaining({
                name: 'get_weather',
                arguments: '{"city":"NYC"}',
              }),
            }),
          ],
        }),
      )
      expect(callbacks.onError).not.toHaveBeenCalled()
    })
  })
})

describe('provider-gateway — Health tracking (sync)', () => {
  // Use unique URLs per test to avoid cross-test pollution from shared cache
  let testUrlCounter = 0

  function uniqueUrl(): string {
    testUrlCounter++
    return `https://test-provider-${testUrlCounter}.example.com/v1`
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getGatewayProviderHealth', () => {
    it('returns undefined for unknown provider', () => {
      const health = getGatewayProviderHealth('https://unknown.example.com')
      expect(health).toBeUndefined()
    })

    it('returns health entry after recording success', () => {
      const url = uniqueUrl()
      recordProviderSuccess(url, 150, true)
      const health = getGatewayProviderHealth(url)
      expect(health).toBeDefined()
      expect(health!.avgLatencyMs).toBe(150)
      expect(health!.streamingSupported).toBe(true)
      expect(health!.samples).toBe(1)
      expect(health!.lastSuccess).toBeGreaterThan(0)
    })

    it('returns health entry after recording failure', () => {
      const url = uniqueUrl()
      recordProviderFailure(url)
      const health = getGatewayProviderHealth(url)
      expect(health).toBeDefined()
      expect(health!.lastFailure).toBeGreaterThan(0)
      expect(health!.avgLatencyMs).toBe(0)
      expect(health!.samples).toBe(0)
    })

    it('tracks multiple samples with averaged latency', () => {
      const url = uniqueUrl()
      recordProviderSuccess(url, 100, true)
      recordProviderSuccess(url, 200, true)
      const health = getGatewayProviderHealth(url)
      expect(health!.avgLatencyMs).toBe(150)
      expect(health!.samples).toBe(2)
    })
  })

  describe('providerSupportsStreaming', () => {
    it('returns null for unknown provider', () => {
      expect(providerSupportsStreaming('https://unknown.example.com')).toBeNull()
    })

    it('returns streaming status after recording', () => {
      const url = uniqueUrl()
      recordProviderSuccess(url, 100, true)
      expect(providerSupportsStreaming(url)).toBe(true)
    })

    it('returns null when streaming not specified', () => {
      const url = uniqueUrl()
      recordProviderSuccess(url, 100)
      expect(providerSupportsStreaming(url)).toBeNull()
    })
  })
})
