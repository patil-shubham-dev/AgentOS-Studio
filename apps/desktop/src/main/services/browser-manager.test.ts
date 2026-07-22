import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}))

const { isAllowedBrowserUrl } = await import('./browser-manager')

describe('browser-manager URL policy', () => {
  it.each([
    'https://example.com',
    'http://localhost:5173',
  ])('allows web URL %s', (url) => {
    expect(isAllowedBrowserUrl(url)).toBe(true)
  })

  it.each([
    'file:///C:/Users/91808/.ssh/id_ed25519',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'about:blank',
    'not a url',
  ])('blocks non-web URL %s', (url) => {
    expect(isAllowedBrowserUrl(url)).toBe(false)
  })
})
