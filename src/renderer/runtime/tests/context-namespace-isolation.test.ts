import { describe, it, expect } from 'vitest'
import { defaultContext, type SectionDefinition } from '../prompting/registry/SectionDefinition'
import { DependencyResolver } from '../prompting/planner/DependencyResolver'
import { PromptCategory } from '../prompting/categories/PromptCategory'
import { Importance } from '../prompting/ast/PromptNode'
import type { ToolNamespace } from '../tools/core/AgentTool'

function makeSection(
  id: string,
  namespace?: ToolNamespace,
  when?: (ctx: any) => boolean,
): SectionDefinition {
  return {
    id,
    category: PromptCategory.CORE,
    importance: Importance.MEDIUM,
    priority: 50,
    namespace,
    when,
    compute: async () => `content-${id}`,
  }
}

const DEFAULT_CTX = defaultContext()

describe('defaultContext', () => {
  it('has namespaceFilter defaulting to ["coding"]', () => {
    expect(DEFAULT_CTX.namespaceFilter).toEqual(['coding'])
  })

  it('allows overriding namespaceFilter', () => {
    const ctx = defaultContext({ namespaceFilter: ['browser'] })
    expect(ctx.namespaceFilter).toEqual(['browser'])
  })

  it('allows empty namespaceFilter to disable filtering', () => {
    const ctx = defaultContext({ namespaceFilter: [] })
    expect(ctx.namespaceFilter).toEqual([])
  })
})

describe('DependencyResolver namespace filtering', () => {
  const resolver = new DependencyResolver()

  const codingSection = makeSection('coding-section')
  const browserSection = makeSection('browser-section', 'browser')
  const designSection = makeSection('design-section', 'design')
  const deviceSection = makeSection('device-section', 'device')
  const explicitCodingSection = makeSection('explicit-coding', 'coding')

  const allSections = [
    codingSection,
    browserSection,
    designSection,
    deviceSection,
    explicitCodingSection,
  ]

  describe('default namespaceFilter excludes future island sections', () => {
    it('includes coding sections (with or without explicit namespace)', () => {
      const result = resolver.resolve(allSections, defaultContext())
      const ids = result.order.map((s) => s.id)
      expect(ids).toContain('coding-section')
      expect(ids).toContain('explicit-coding')
    })

    it('excludes browser sections by default', () => {
      const result = resolver.resolve(allSections, defaultContext())
      const ids = result.order.map((s) => s.id)
      expect(ids).not.toContain('browser-section')
    })

    it('excludes design sections by default', () => {
      const result = resolver.resolve(allSections, defaultContext())
      const ids = result.order.map((s) => s.id)
      expect(ids).not.toContain('design-section')
    })

    it('excludes device sections by default', () => {
      const result = resolver.resolve(allSections, defaultContext())
      const ids = result.order.map((s) => s.id)
      expect(ids).not.toContain('device-section')
    })

    it('reports namespace-filtered sections in skipped list', () => {
      const result = resolver.resolve(allSections, defaultContext())
      expect(result.skipped).toContain('browser-section')
      expect(result.skipped).toContain('design-section')
      expect(result.skipped).toContain('device-section')
    })

    it('does not report included sections in skipped list', () => {
      const result = resolver.resolve(allSections, defaultContext())
      expect(result.skipped).not.toContain('coding-section')
      expect(result.skipped).not.toContain('explicit-coding')
    })
  })

  describe('empty namespaceFilter includes everything', () => {
    it('includes browser sections when filter is empty', () => {
      const ctx = defaultContext({ namespaceFilter: [] })
      const result = resolver.resolve(allSections, ctx)
      const ids = result.order.map((s) => s.id)
      expect(ids).toContain('browser-section')
      expect(ids).toContain('design-section')
      expect(ids).toContain('device-section')
    })

    it('reports no namespace-filtered sections in skipped list', () => {
      const ctx = defaultContext({ namespaceFilter: [] })
      const result = resolver.resolve(allSections, ctx)
      const futureIds = ['browser-section', 'design-section', 'device-section']
      for (const id of futureIds) {
        expect(result.skipped).not.toContain(id)
      }
    })
  })

  describe('explicit namespace filter overrides', () => {
    it('can include only browser sections', () => {
      const ctx = defaultContext({ namespaceFilter: ['browser'] })
      const result = resolver.resolve(allSections, ctx)
      const ids = result.order.map((s) => s.id)
      expect(ids).toContain('browser-section')
      expect(ids).not.toContain('coding-section')
      expect(ids).not.toContain('design-section')
      expect(ids).not.toContain('device-section')
    })

    it('can include browser and design together', () => {
      const ctx = defaultContext({ namespaceFilter: ['browser', 'design'] })
      const result = resolver.resolve(allSections, ctx)
      const ids = result.order.map((s) => s.id)
      expect(ids).toContain('browser-section')
      expect(ids).toContain('design-section')
      expect(ids).not.toContain('device-section')
    })

    it('can include all namespaces', () => {
      const ctx = defaultContext({
        namespaceFilter: ['coding', 'browser', 'design', 'device'],
      })
      const result = resolver.resolve(allSections, ctx)
      expect(result.order.length).toBe(allSections.length)
    })

    it('returns only filtered sections when namespace matches a subset', () => {
      const sections = [codingSection, browserSection, designSection]
      const ctx = defaultContext({ namespaceFilter: ['design'] })
      const result = resolver.resolve(sections, ctx)
      expect(result.order).toHaveLength(1)
      expect(result.order[0].id).toBe('design-section')
    })
  })

  describe('when predicate still works alongside namespace filter', () => {
    const conditionalSection = makeSection('conditional', 'coding', (ctx) => ctx.hasTools)
    const futureConditional = makeSection('future-conditional', 'browser', (ctx) => ctx.hasBrowser)

    const mixed = [codingSection, browserSection, conditionalSection, futureConditional]

    it('excludes future-conditional section via namespace filter before when check', () => {
      const ctx = defaultContext({ hasBrowser: true })
      const result = resolver.resolve(mixed, ctx)
      // hasBrowser is true, but namespace filter ['coding'] excludes it first
      expect(result.order.map((s) => s.id)).not.toContain('future-conditional')
      expect(result.skipped).toContain('future-conditional')
    })

    it('includes future-conditional section when namespace filter allows browser', () => {
      const ctx = defaultContext({ namespaceFilter: ['coding', 'browser'], hasBrowser: true })
      const result = resolver.resolve(mixed, ctx)
      // namespace filter allows browser, then when check passes (hasBrowser: true)
      expect(result.order.map((s) => s.id)).toContain('future-conditional')
    })

    it('skips section when when predicate fails despite namespace filter', () => {
      const ctx = defaultContext({ namespaceFilter: ['coding', 'browser'], hasBrowser: false })
      const result = resolver.resolve(mixed, ctx)
      // namespace filter allows browser, but when check fails (hasBrowser: false)
      expect(result.order.map((s) => s.id)).not.toContain('future-conditional')
      expect(result.skipped).toContain('future-conditional')
    })
  })

  describe('backward compatibility', () => {
    it('resolver works without namespaceFilter on context', () => {
      const ctx = { ...defaultContext(), namespaceFilter: undefined }
      const result = resolver.resolve(allSections, ctx)
      // undefined namespaceFilter means no filtering — all sections pass
      expect(result.order.length).toBe(allSections.length)
    })

    it('sections without namespace default to coding and pass default filter', () => {
      const sections = [makeSection('no-namespace')]
      const result = resolver.resolve(sections, defaultContext())
      expect(result.order.map((s) => s.id)).toContain('no-namespace')
    })

    it('warnings still propagate correctly', () => {
      const sectionA = makeSection('section-a')
      const sectionB: SectionDefinition = {
        ...makeSection('section-b'),
        dependsOn: ['section-non-existent'],
      }
      const warnings = resolver.validateDependencies([sectionA, sectionB])
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0]).toContain('section-b')
    })
  })
})
