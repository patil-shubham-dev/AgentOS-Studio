import { describe, it, expect } from 'vitest'
import {
  isFeatureEnabled,
  getDefaultFlags,
  getDisabledFutureIslandFlags,
} from '@/app/feature-flags'
import { FutureIslandRegistry } from '@/runtime/feature-flags/FutureIslandRegistry'
import type { FutureIslandId } from '@/runtime/feature-flags/FutureIslandRegistry'

describe('isFeatureEnabled', () => {
  it('has codingCore enabled by default', () => {
    expect(isFeatureEnabled('codingCore')).toBe(true)
  })

  it('has browserIsland disabled by default', () => {
    expect(isFeatureEnabled('browserIsland')).toBe(false)
  })

  it('has designIsland disabled by default', () => {
    expect(isFeatureEnabled('designIsland')).toBe(false)
  })

  it('has deviceControlIsland disabled by default', () => {
    expect(isFeatureEnabled('deviceControlIsland')).toBe(false)
  })

  it('has browserToolsInCoding disabled by default', () => {
    expect(isFeatureEnabled('browserToolsInCoding')).toBe(false)
  })

  it('has designToolsInCoding disabled by default', () => {
    expect(isFeatureEnabled('designToolsInCoding')).toBe(false)
  })

  it('has deviceToolsInCoding disabled by default', () => {
    expect(isFeatureEnabled('deviceToolsInCoding')).toBe(false)
  })

  it('has browserContextInCoding disabled by default', () => {
    expect(isFeatureEnabled('browserContextInCoding')).toBe(false)
  })

  it('has designContextInCoding disabled by default', () => {
    expect(isFeatureEnabled('designContextInCoding')).toBe(false)
  })

  it('has deviceContextInCoding disabled by default', () => {
    expect(isFeatureEnabled('deviceContextInCoding')).toBe(false)
  })

  it('has advancedAgents disabled by default', () => {
    expect(isFeatureEnabled('advancedAgents')).toBe(false)
  })

  it('has longTermMemory disabled by default', () => {
    expect(isFeatureEnabled('longTermMemory')).toBe(false)
  })

  it('has plugins disabled by default', () => {
    expect(isFeatureEnabled('plugins')).toBe(false)
  })

  it('has mcp disabled by default', () => {
    expect(isFeatureEnabled('mcp')).toBe(false)
  })

  it('isFeatureEnabled returns correct values', () => {
    expect(isFeatureEnabled('codingCore')).toBe(true)
    expect(isFeatureEnabled('browserIsland')).toBe(false)
    expect(isFeatureEnabled('designIsland')).toBe(false)
    expect(isFeatureEnabled('deviceControlIsland')).toBe(false)
  })

  it('getDefaultFlags returns a copy with same values', () => {
    const flags = getDefaultFlags()
    expect(flags.codingCore).toBe(true)
    expect(flags.browserIsland).toBe(false)
    expect(flags.designIsland).toBe(false)
    expect(flags.deviceControlIsland).toBe(false)
    expect(flags.browserToolsInCoding).toBe(false)
    expect(flags.designToolsInCoding).toBe(false)
    expect(flags.deviceToolsInCoding).toBe(false)
    expect(flags.browserContextInCoding).toBe(false)
    expect(flags.designContextInCoding).toBe(false)
    expect(flags.deviceContextInCoding).toBe(false)
  })

  it('getDisabledFutureIslandFlags keeps codingCore true', () => {
    const flags = getDisabledFutureIslandFlags()
    expect(flags.codingCore).toBe(true)
  })

  it('getDisabledFutureIslandFlags explicitly disables all future island flags', () => {
    const flags = getDisabledFutureIslandFlags()
    expect(flags.browserIsland).toBe(false)
    expect(flags.designIsland).toBe(false)
    expect(flags.deviceControlIsland).toBe(false)
    expect(flags.browserToolsInCoding).toBe(false)
    expect(flags.designToolsInCoding).toBe(false)
    expect(flags.deviceToolsInCoding).toBe(false)
    expect(flags.browserContextInCoding).toBe(false)
    expect(flags.designContextInCoding).toBe(false)
    expect(flags.deviceContextInCoding).toBe(false)
  })
})

describe('FutureIslandRegistry', () => {
  it('returns all three islands', () => {
    const registry = new FutureIslandRegistry()
    const all = registry.getAll()
    expect(all).toHaveLength(3)
    const ids = all.map((i) => i.id).sort()
    expect(ids).toEqual(['browser', 'design', 'device-control'])
  })

  it('defaults all islands to placeholder status', () => {
    const registry = new FutureIslandRegistry()
    for (const island of registry.getAll()) {
      expect(island.status).toBe('placeholder')
    }
  })

  it('returns undefined for unknown island id', () => {
    const registry = new FutureIslandRegistry()
    expect(registry.get('unknown' as FutureIslandId)).toBeUndefined()
  })

  it('getEnabled returns empty array by default', () => {
    const registry = new FutureIslandRegistry()
    expect(registry.getEnabled()).toHaveLength(0)
  })

  it('getPlaceholder returns all three islands by default', () => {
    const registry = new FutureIslandRegistry()
    expect(registry.getPlaceholder()).toHaveLength(3)
  })

  it('getDisabled returns empty array by default (no disabled island)', () => {
    const registry = new FutureIslandRegistry()
    expect(registry.getDisabled()).toHaveLength(0)
  })

  it('isEnabled returns false for all islands by default', () => {
    const registry = new FutureIslandRegistry()
    expect(registry.isEnabled('browser')).toBe(false)
    expect(registry.isEnabled('design')).toBe(false)
    expect(registry.isEnabled('device-control')).toBe(false)
  })

  it('isPlaceholder returns true for all islands by default', () => {
    const registry = new FutureIslandRegistry()
    expect(registry.isPlaceholder('browser')).toBe(true)
    expect(registry.isPlaceholder('design')).toBe(true)
    expect(registry.isPlaceholder('device-control')).toBe(true)
  })

  it('hasActiveRuntime returns false by default', () => {
    const registry = new FutureIslandRegistry()
    expect(registry.hasActiveRuntime()).toBe(false)
  })

  it('each island has a route and label', () => {
    const registry = new FutureIslandRegistry()
    const browser = registry.get('browser')!
    expect(browser.label).toBe('Browser Automation')
    expect(browser.route).toBe('/future/browser')

    const design = registry.get('design')!
    expect(design.label).toBe('Design Studio')
    expect(design.route).toBe('/future/design')

    const device = registry.get('device-control')!
    expect(device.label).toBe('Device Control')
    expect(device.route).toBe('/future/device-control')
  })
})
