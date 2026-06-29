import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeError, ProviderError, safeValidateProvider, safeDetectRuntime, resolveProviderManagerAdapter } from './provider-manager'
import { validateProvider } from './provider-gateway'

const mockTauriFetch = vi.hoisted(() => vi.fn())
vi.mock('./http-client', () => ({
  tauriFetch: mockTauriFetch,
}))
vi.mock('./provider-health', () => ({
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  addTrace: vi.fn(),
  getOrCreateHealth: vi.fn(() => ({
    state: 'unknown',
    consecutiveFailures: 0,
    lastSuccess: null,
    lastFailure: null,
    latencySamples: [],
    validationRuns: [],
    traces: [],
  })),
}))

describe('normalizeError', () => {
  it('returns ProviderError unchanged', () => {
    const original = new ProviderError('INVALID_API_KEY', 'Invalid API key')
    expect(normalizeError(original)).toBe(original)
  })

  it('classifies 401 errors', () => {
    const err = normalizeError(new Error('HTTP 401 Unauthorized'))
    expect(err.code).toBe('INVALID_API_KEY')
  })

  it('classifies timeout errors', () => {
    const err = normalizeError(new Error('Connection timed out'))
    expect(err.code).toBe('CONNECTION_TIMED_OUT')
  })

  it('classifies DNS errors', () => {
    const err = normalizeError(new Error('ENOTFOUND api.example.com'))
    expect(err.code).toBe('CONNECTION_FAILED')
    expect(err.message).toContain('DNS')
  })

  it('classifies CORS errors', () => {
    const err = normalizeError(new Error('CORS request blocked'))
    expect(err.code).toBe('CONNECTION_FAILED')
    expect(err.message).toContain('CORS')
  })

  it('classifies 404 errors', () => {
    const err = normalizeError(new Error('404 Not Found'))
    expect(err.code).toBe('ENDPOINT_NOT_FOUND')
  })

  it('classifies connection refused', () => {
    const err = normalizeError(new Error('ECONNREFUSED'))
    expect(err.code).toBe('CONNECTION_FAILED')
    expect(err.message).toContain('refused')
  })

  it('classifies 500 errors', () => {
    const err = normalizeError(new Error('HTTP 500 internal server error'))
    expect(err.code).toBe('CONNECTION_FAILED')
    expect(err.message).toContain('Server error')
  })

  it('classifies TIMEOUT_EXCEEDED', () => {
    const err = normalizeError(new Error('TIMEOUT_EXCEEDED'))
    expect(err.code).toBe('CONNECTION_TIMED_OUT')
  })

  it('truncates messages over 100 chars for UNKNOWN', () => {
    const longMsg = 'x'.repeat(200)
    const err = normalizeError(new Error(longMsg))
    expect(err.code).toBe('UNKNOWN')
    expect(err.message.length).toBeLessThan(150)
  })
})

describe('resolveProviderManagerAdapter', () => {
  it('resolves openai.com', () => {
    const adapter = resolveProviderManagerAdapter('https://api.openai.com/v1')
    expect(adapter.id).toBe('openai')
    expect(adapter.isOpenAiCompatible).toBe(true)
  })

  it('resolves anthropic.com', () => {
    const adapter = resolveProviderManagerAdapter('https://api.anthropic.com')
    expect(adapter.id).toBe('anthropic')
    expect(adapter.isOpenAiCompatible).toBe(false)
  })

  it('resolves nvidia.com', () => {
    const adapter = resolveProviderManagerAdapter('https://integrate.api.nvidia.com/v1')
    expect(adapter.id).toBe('nvidia')
    expect(adapter.runtimeKey).toBe('Nvidia NIM')
  })

  it('resolves localhost as local', () => {
    const adapter = resolveProviderManagerAdapter('http://localhost:11434')
    expect(adapter.isLocal).toBe(true)
  })

  it('falls back to unknown for unrecognized URLs', () => {
    const adapter = resolveProviderManagerAdapter('https://custom.example.com/v1')
    expect(adapter.id).toBe('unknown')
    expect(adapter.isOpenAiCompatible).toBe(true)
  })
})

describe('safeDetectRuntime', () => {
  it('returns runtime info on success', async () => {
    vi.spyOn(await import('./provider-gateway'), 'detectRuntime').mockResolvedValue({
      runtime: 'OpenAI',
      isOpenAiCompatible: true,
      isLocal: false,
    } as any)

    const info = await safeDetectRuntime('https://api.openai.com/v1')
    expect(info).not.toBeNull()
    expect(info!.runtime).toBe('OpenAI')
  })

  it('returns null on detection failure', async () => {
    vi.spyOn(await import('./provider-gateway'), 'detectRuntime').mockRejectedValue(new Error('fetch failed'))

    const info = await safeDetectRuntime('https://invalid.example.com')
    expect(info).toBeNull()
  })
})

describe('safeValidateProvider', () => {
  it('throws on empty API key for non-local providers', async () => {
    await expect(safeValidateProvider('https://api.openai.com/v1', '')).rejects.toThrow('API key is required')
  })

  it('handles unknown provider validation gracefully', async () => {
    mockTauriFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await safeValidateProvider('https://unknown.example.com', 'sk-test')
    expect(result.success).toBe(false)
  })

  it('returns validation result on success', async () => {
    mockTauriFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'gpt-4' }] }),
      headers: new Headers(),
    } as Response)

    const result = await safeValidateProvider('https://api.openai.com/v1', 'sk-test-key-12345')
    expect(result.success).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('normalizes validation errors', async () => {
    mockTauriFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"error":"unauthorized"}',
      headers: new Headers(),
    } as Response)

    const result = await safeValidateProvider('https://api.openai.com/v1', 'sk-bad-key')
    expect(result.success).toBe(false)
    expect(result.error).toContain('401')
  })
})

describe('validateProvider with network error simulation', () => {
  beforeEach(() => {
    mockTauriFetch.mockReset()
  })

  it('handles network failure gracefully', async () => {
    mockTauriFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await validateProvider('https://integrate.api.nvidia.com/v1', 'nv-test-key')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('handles timeout gracefully', async () => {
    mockTauriFetch.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

    const result = await validateProvider('https://integrate.api.nvidia.com/v1', 'nv-test-key')
    expect(result.success).toBe(false)
    expect(result.error.toLowerCase()).toContain('time')
  })

  it('handles 401 from endpoint', async () => {
    mockTauriFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"error":{"message":"Invalid API key"}}',
      headers: new Headers(),
    } as Response)

    const result = await validateProvider('https://integrate.api.nvidia.com/v1', 'nv-bad-key')
    expect(result.success).toBe(false)
    expect(result.error).toContain('401')
  })

  it('handles 404 from endpoint', async () => {
    mockTauriFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '{"error":"Not found"}',
      headers: new Headers(),
    } as Response)

    const result = await validateProvider('https://integrate.api.nvidia.com/v1', 'nv-test-key')
    expect(result.success).toBe(false)
  })

  it('handles DNS failure style error', async () => {
    mockTauriFetch.mockRejectedValue(new TypeError('getaddrinfo ENOTFOUND integrate.api.nvidia.com'))

    const result = await validateProvider('https://integrate.api.nvidia.com/v1', 'nv-test-key')
    expect(result.success).toBe(false)
  })

  it('handles TLS certificate error', async () => {
    mockTauriFetch.mockRejectedValue(new Error('certificate has expired'))

    const result = await validateProvider('https://integrate.api.nvidia.com/v1', 'nv-test-key')
    expect(result.success).toBe(false)
  })

  it('handles connection refused error', async () => {
    mockTauriFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await validateProvider('https://integrate.api.nvidia.com/v1', 'nv-test-key')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})


