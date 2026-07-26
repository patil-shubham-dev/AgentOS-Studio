import { describe, it, expect } from 'vitest'
import {
  resolveByBaseUrl,
  getRegistryEntry,
  getAllPresets,
  getPopularPresets,
  getCustomPresets,
  createProvider,
  createDefaultProviders,
  providerReducer,
} from './provider-registry'
import type { ProviderModel } from '@agentic-os/shared'

describe('provider-registry', () => {
  describe('resolveByBaseUrl', () => {
    it('resolves OpenAI API URL', () => {
      const result = resolveByBaseUrl('https://api.openai.com/v1')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('OpenAI')
      expect(result!.isOpenAiCompatible).toBe(true)
    })

    it('resolves Anthropic API URL', () => {
      const result = resolveByBaseUrl('https://api.anthropic.com')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Anthropic')
      expect(result!.isOpenAiCompatible).toBe(false)
    })

    it('resolves Ollama local URL', () => {
      const result = resolveByBaseUrl('http://localhost:11434')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Ollama')
      expect(result!.isLocal).toBe(true)
    })

    it('returns null for unknown URL', () => {
      const result = resolveByBaseUrl('https://unknown-provider.example.com')
      expect(result).toBeNull()
    })

    it('matches with trailing slashes normalized', () => {
      const result = resolveByBaseUrl('https://api.openai.com/v1/')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('OpenAI')
    })

    it('matches Google Gemini with full URL path', () => {
      const result = resolveByBaseUrl('https://generativelanguage.googleapis.com/v1beta')
      expect(result).not.toBeNull()
      expect(result!.name).toContain('Gemini')
    })

    it('matches OpenRouter', () => {
      const result = resolveByBaseUrl('https://openrouter.ai/api')
      expect(result).not.toBeNull()
      expect(result!.name).toContain('OpenRouter')
    })

    it('falls back to hostname-based matching for openai.com', () => {
      const result = resolveByBaseUrl('https://api.openai.com')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('OpenAI')
    })
  })

  describe('getRegistryEntry', () => {
    it('returns entry for known provider id', () => {
      const entry = getRegistryEntry('openai')
      expect(entry).not.toBeUndefined()
      expect(entry!.name).toBe('OpenAI')
      expect(entry!.runtimeKey).toBe('OpenAI')
    })

    it('returns entry for ollama', () => {
      const entry = getRegistryEntry('ollama')
      expect(entry).not.toBeUndefined()
      expect(entry!.isLocal).toBe(true)
    })

    it('returns undefined for unknown provider id', () => {
      const entry = getRegistryEntry('nonexistent')
      expect(entry).toBeUndefined()
    })

    it('keys are case-sensitive (lowercase)', () => {
      const entry = getRegistryEntry('OpenAI')
      expect(entry).toBeUndefined()
    })
  })

  describe('getAllPresets', () => {
    it('returns all provider presets', () => {
      const presets = getAllPresets()
      expect(presets).toBeInstanceOf(Array)
      expect(presets.length).toBeGreaterThan(0)
    })

    it('each preset has required fields', () => {
      const presets = getAllPresets()
      for (const preset of presets) {
        expect(preset.id).toBeDefined()
        expect(preset.name).toBeDefined()
        expect(preset.baseUrl).toBeDefined()
        expect(typeof preset.isLocal).toBe('boolean')
        expect(typeof preset.isOpenAiCompatible).toBe('boolean')
      }
    })

    it('returns unique presets', () => {
      const presets = getAllPresets()
      const ids = presets.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('getPopularPresets', () => {
    it('returns a subset of all presets', () => {
      const popular = getPopularPresets()
      const all = getAllPresets()
      expect(popular.length).toBeLessThanOrEqual(all.length)
      expect(popular.length).toBeGreaterThan(0)
    })

    it('includes OpenAI and Anthropic', () => {
      const popular = getPopularPresets()
      const names = popular.map((p) => p.name)
      expect(names).toContain('OpenAI')
      expect(names).toContain('Anthropic')
    })
  })

  describe('getCustomPresets', () => {
    it('returns presets with isCustom=true', () => {
      const custom = getCustomPresets()
      for (const p of custom) {
        expect(p.isCustom).toBe(true)
      }
    })

    it('non-custom presets are not included in custom', () => {
      const custom = getCustomPresets()
      const popular = getPopularPresets()
      const customIds = custom.map((p) => p.id)
      for (const pop of popular) {
        expect(customIds).not.toContain(pop.id)
      }
    })
  })

  describe('createDefaultProviders', () => {
    it('returns default provider templates', () => {
      const defaults = createDefaultProviders()
      expect(defaults.length).toBe(3) // OpenAI, Anthropic, Gemini
    })

    it('each default has name and baseUrl', () => {
      const defaults = createDefaultProviders()
      for (const p of defaults) {
        expect(p.name).toBeDefined()
        expect(p.baseUrl).toBeDefined()
        expect(p.apiKey).toBe('')
      }
    })
  })

  describe('createProvider', () => {
    it('creates a provider with the given details', () => {
      const provider = createProvider('My Custom', 'http://localhost:8000/v1', 'sk-key')
      expect(provider.name).toBe('My Custom')
      expect(provider.baseUrl).toBe('http://localhost:8000/v1')
      expect(provider.apiKey).toBe('sk-key')
    })

    it('generates an id', () => {
      const provider = createProvider('Test', 'http://localhost:8000/v1', '')
      expect(provider.id).toBeDefined()
      expect(typeof provider.id).toBe('string')
    })

    it('sets initial fields correctly', () => {
      const provider = createProvider('Test', 'http://localhost:8000/v1', '')
      expect(provider.runtime).toBeNull()
      expect(provider.isLocal).toBe(false)
      expect(provider.models).toEqual([])
    })
  })

  describe('providerReducer', () => {
    it('handles ADD_PROVIDER', () => {
      const provider = createProvider('Test', 'http://localhost:8000/v1', '')
      const state = providerReducer([], { type: 'ADD_PROVIDER', payload: provider })
      expect(state).toHaveLength(1)
      expect(state[0].name).toBe('Test')
    })

    it('handles REMOVE_PROVIDER', () => {
      const p1 = createProvider('P1', 'http://localhost:8000/v1', '')
      const p2 = createProvider('P2', 'http://localhost:8000/v1', '')
      const withP1 = providerReducer([], { type: 'ADD_PROVIDER', payload: p1 })
      const withBoth = providerReducer(withP1, { type: 'ADD_PROVIDER', payload: p2 })
      const state = providerReducer(withBoth, { type: 'REMOVE_PROVIDER', payload: p1.id })
      expect(state).toHaveLength(1)
      expect(state[0].id).toBe(p2.id)
    })

    it('handles UPDATE_PROVIDER', () => {
      const provider = createProvider('Old', 'http://localhost:8000/v1', '')
      const withProvider = providerReducer([], { type: 'ADD_PROVIDER', payload: provider })
      const state = providerReducer(withProvider, {
        type: 'UPDATE_PROVIDER',
        payload: { id: provider.id, name: 'Updated' },
      })
      expect(state[0].name).toBe('Updated')
    })

    it('handles SET_MODELS', () => {
      const provider = createProvider('Test', 'http://localhost:8000/v1', '')
      const models: ProviderModel[] = [
        { id: 'gpt-4', name: 'gpt-4', supportsTools: true, supportsVision: false, supportsStreaming: true },
      ]
      const withProvider = providerReducer([], { type: 'ADD_PROVIDER', payload: provider })
      const state = providerReducer(withProvider, {
        type: 'SET_MODELS',
        payload: { providerId: provider.id, models },
      })
      expect(state[0].models).toHaveLength(1)
      expect(state[0].models[0].id).toBe('gpt-4')
    })
  })
})
