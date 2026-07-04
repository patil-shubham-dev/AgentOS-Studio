import { describe, it, expect, beforeEach } from 'vitest'
import { ToolRegistry } from '../tools/registry/ToolRegistry'
import { ToolPoolAssembler } from '../tools/registry/ToolPoolAssembler'
import { buildTool, type AgentTool, type ToolNamespace, type ToolPhase } from '../tools/core/AgentTool'

function makeTool(
  name: string,
  namespace: ToolNamespace,
  phase: ToolPhase = 'core',
): AgentTool {
  return buildTool({
    name,
    description: `Tool ${name}`,
    namespace,
    phase,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ data: null }),
  })
}

// Expected namespace assignments — matches the actual tool implementations
const TOOL_NAMESPACE_MANIFEST: Record<string, { namespace: ToolNamespace; phase: ToolPhase }> = {
  read_file: { namespace: 'coding', phase: 'core' },
  write_file: { namespace: 'coding', phase: 'core' },
  edit_file: { namespace: 'coding', phase: 'core' },
  glob_files: { namespace: 'coding', phase: 'core' },
  grep_files: { namespace: 'coding', phase: 'core' },
  search_content: { namespace: 'coding', phase: 'core' },
  run_command: { namespace: 'coding', phase: 'core' },
  web_search: { namespace: 'coding', phase: 'core' },
  web_fetch: { namespace: 'coding', phase: 'core' },
  query_codebase: { namespace: 'coding', phase: 'core' },
  query_graph: { namespace: 'coding', phase: 'core' },
  delegate_subtask: { namespace: 'coding', phase: 'advanced' },
  run_skill: { namespace: 'coding', phase: 'advanced' },
  launch_browser: { namespace: 'browser', phase: 'future' },
  browser_navigate: { namespace: 'browser', phase: 'future' },
  browser_screenshot: { namespace: 'browser', phase: 'future' },
  browser_click: { namespace: 'browser', phase: 'future' },
  browser_fill: { namespace: 'browser', phase: 'future' },
  browser_execute_js: { namespace: 'browser', phase: 'future' },
  browser_get_title: { namespace: 'browser', phase: 'future' },
  browser_get_text: { namespace: 'browser', phase: 'future' },
  browser_wait: { namespace: 'browser', phase: 'future' },
  browser_close: { namespace: 'browser', phase: 'future' },
  browser_get_url: { namespace: 'browser', phase: 'future' },
  browser_press_key: { namespace: 'browser', phase: 'future' },
  browser_reload: { namespace: 'browser', phase: 'future' },
  browser_new_tab: { namespace: 'browser', phase: 'future' },
  browser_list_tabs: { namespace: 'browser', phase: 'future' },
  design_create_artifact: { namespace: 'design', phase: 'future' },
  design_add_version: { namespace: 'design', phase: 'future' },
  design_generate_preview: { namespace: 'design', phase: 'future' },
}

const CODING_CORE_NAMES = Object.entries(TOOL_NAMESPACE_MANIFEST)
  .filter(([, v]) => v.namespace === 'coding' && v.phase === 'core')
  .map(([k]) => k)

const CODING_ADVANCED_NAMES = Object.entries(TOOL_NAMESPACE_MANIFEST)
  .filter(([, v]) => v.namespace === 'coding' && v.phase === 'advanced')
  .map(([k]) => k)

const BROWSER_TOOL_NAMES = Object.entries(TOOL_NAMESPACE_MANIFEST)
  .filter(([, v]) => v.namespace === 'browser')
  .map(([k]) => k)

const DESIGN_TOOL_NAMES = Object.entries(TOOL_NAMESPACE_MANIFEST)
  .filter(([, v]) => v.namespace === 'design')
  .map(([k]) => k)

const DEVICE_TOOL_NAMES = Object.entries(TOOL_NAMESPACE_MANIFEST)
  .filter(([, v]) => v.namespace === 'device')
  .map(([k]) => k)

describe('Tool Namespace Manifest', () => {
  it('all coding tools are correctly identified', () => {
    expect(CODING_CORE_NAMES.length).toBeGreaterThan(0)
    expect(CODING_CORE_NAMES).toContain('read_file')
    expect(CODING_CORE_NAMES).toContain('run_command')
    expect(CODING_CORE_NAMES).toContain('glob_files')
  })

  it('advanced coding tools are separately identified', () => {
    expect(CODING_ADVANCED_NAMES).toContain('delegate_subtask')
    expect(CODING_ADVANCED_NAMES).toContain('run_skill')
  })

  it('browser tools have browser namespace and future phase', () => {
    expect(BROWSER_TOOL_NAMES.length).toBeGreaterThan(0)
    for (const name of BROWSER_TOOL_NAMES) {
      expect(TOOL_NAMESPACE_MANIFEST[name].phase).toBe('future')
    }
    expect(BROWSER_TOOL_NAMES).toContain('launch_browser')
    expect(BROWSER_TOOL_NAMES).toContain('browser_navigate')
    expect(BROWSER_TOOL_NAMES).toContain('browser_screenshot')
    expect(BROWSER_TOOL_NAMES).toContain('browser_click')
    expect(BROWSER_TOOL_NAMES).toContain('browser_fill')
    expect(BROWSER_TOOL_NAMES).toContain('browser_close')
    expect(BROWSER_TOOL_NAMES).toContain('browser_execute_js')
  })

  it('design tools have design namespace and future phase', () => {
    expect(DESIGN_TOOL_NAMES).toContain('design_create_artifact')
    expect(DESIGN_TOOL_NAMES).toContain('design_add_version')
    expect(DESIGN_TOOL_NAMES).toContain('design_generate_preview')
    for (const name of DESIGN_TOOL_NAMES) {
      expect(TOOL_NAMESPACE_MANIFEST[name].phase).toBe('future')
    }
  })

  it('device tools have device namespace and future phase (when added)', () => {
    // Currently no device tools are registered
    expect(DEVICE_TOOL_NAMES).toHaveLength(0)
  })

  it('every tool has a valid namespace', () => {
    const valid = ['coding', 'browser', 'design', 'device', 'plugin', 'mcp']
    for (const entry of Object.values(TOOL_NAMESPACE_MANIFEST)) {
      expect(valid).toContain(entry.namespace)
    }
  })

  it('every tool has a valid phase', () => {
    const valid = ['core', 'advanced', 'future']
    for (const entry of Object.values(TOOL_NAMESPACE_MANIFEST)) {
      expect(valid).toContain(entry.phase)
    }
  })
})

describe('ToolPoolAssembler Namespace Filtering', () => {
  let registry: ToolRegistry
  let assembler: ToolPoolAssembler

  function registerFromManifest(names: string[]): void {
    for (const n of names) {
      const def = TOOL_NAMESPACE_MANIFEST[n]
      registry.register(makeTool(n, def.namespace, def.phase))
    }
  }

  beforeEach(() => {
    registry = new ToolRegistry()
    registerFromManifest(Object.keys(TOOL_NAMESPACE_MANIFEST))
    assembler = new ToolPoolAssembler(registry)
  })

  describe('default assemble excludes future island tools', () => {
    it('returns only coding namespace tools by default', () => {
      const tools = assembler.assemble()
      const nonCoding = tools.filter((t) => t.namespace !== 'coding')
      expect(nonCoding).toHaveLength(0)
    })

    it('excludes all browser tools from default assembly', () => {
      const tools = assembler.assemble()
      const names = new Set(tools.map((t) => t.name))
      for (const browserTool of BROWSER_TOOL_NAMES) {
        expect(names.has(browserTool)).toBe(false)
      }
    })

    it('excludes all design tools from default assembly', () => {
      const tools = assembler.assemble()
      const names = new Set(tools.map((t) => t.name))
      for (const designTool of DESIGN_TOOL_NAMES) {
        expect(names.has(designTool)).toBe(false)
      }
    })

    it('excludes device tools from default assembly', () => {
      const tools = assembler.assemble()
      expect(tools.filter((t) => t.namespace === 'device')).toHaveLength(0)
    })

    it('includes coding namespace tools in default assembly', () => {
      const tools = assembler.assemble()
      const codingTools = tools.filter((t) => t.namespace === 'coding')
      expect(codingTools.length).toBeGreaterThan(0)
      expect(tools.length).toBe(codingTools.length)
    })
  })

  describe('assembleForRole excludes future island tools', () => {
    it('excludes browser tools for coder role', () => {
      const tools = assembler.assembleForRole('coder')
      expect(tools.filter((t) => t.namespace === 'browser')).toHaveLength(0)
    })

    it('excludes design tools for manager role', () => {
      const tools = assembler.assembleForRole('manager')
      expect(tools.filter((t) => t.namespace === 'design')).toHaveLength(0)
    })

    it('excludes future island tools for superadmin role', () => {
      const tools = assembler.assembleForRole('superadmin')
      expect(tools.filter((t) => t.namespace !== 'coding')).toHaveLength(0)
    })

    it('excludes device tools for all known roles', () => {
      for (const role of ['coder', 'manager', 'research', 'qa', 'memory']) {
        const tools = assembler.assembleForRole(role)
        expect(tools.filter((t) => t.namespace === 'device')).toHaveLength(0)
      }
    })

    it('excludes browser/design/device from every standard role', () => {
      for (const role of ['coder', 'manager', 'research', 'qa', 'memory', 'design', 'browser']) {
        const tools = assembler.assembleForRole(role)
        const futureToolNames = tools
          .filter((t) => t.namespace !== 'coding')
          .map((t) => t.name)
        expect(futureToolNames, `Role "${role}" should have 0 future island tools`).toHaveLength(0)
      }
    })
  })

  describe('explicit namespace filter overrides', () => {
    it('can include browser tools when explicitly requested', () => {
      const tools = assembler.assemble({ namespaceFilter: ['browser'] })
      const browserTools = tools.filter((t) => t.namespace === 'browser')
      expect(browserTools.length).toBeGreaterThan(0)
      expect(browserTools.every((t) => BROWSER_TOOL_NAMES.includes(t.name))).toBe(true)
    })

    it('can include design tools when explicitly requested', () => {
      const tools = assembler.assemble({ namespaceFilter: ['design'] })
      const designTools = tools.filter((t) => t.namespace === 'design')
      expect(designTools.length).toBeGreaterThan(0)
      expect(designTools.every((t) => DESIGN_TOOL_NAMES.includes(t.name))).toBe(true)
    })

    it('can include all namespaces when filter is expanded', () => {
      const coding = assembler.assemble({ namespaceFilter: ['coding'] })
      const all = assembler.assemble({ namespaceFilter: ['coding', 'browser', 'design', 'device'] })
      expect(all.length).toBeGreaterThan(coding.length)
    })

    it('returns empty array when filter matches no registered tools', () => {
      const tools = assembler.assemble({ namespaceFilter: ['device'] })
      expect(tools).toHaveLength(0)
    })

    it('allows passing namespaceFilter: undefined to disable filtering', () => {
      const tools = assembler.assemble({ namespaceFilter: undefined })
      // When undefined, the default namespaceFilter is skipped (no filtering)
      expect(tools.length).toBeGreaterThan(assembler.assemble().length)
    })

    it('allows empty namespaceFilter array to include everything', () => {
      const tools = assembler.assemble({ namespaceFilter: [] })
      expect(tools.length).toBeGreaterThan(assembler.assemble().length)
    })
  })

  describe('provider tool schema safety', () => {
    it('no future island tools appear in assembled tool list sent to provider', () => {
      const tools = assembler.assemble()
      const futureIslandNames = new Set([
        ...BROWSER_TOOL_NAMES,
        ...DESIGN_TOOL_NAMES,
        ...DEVICE_TOOL_NAMES,
      ])
      for (const tool of tools) {
        expect(futureIslandNames.has(tool.name)).toBe(false)
      }
    })

    it('all assembled tools can be converted to provider ToolDef format', () => {
      const tools = assembler.assemble()
      for (const tool of tools) {
        const toolDef = {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }
        expect(toolDef.function.name).toBeTruthy()
        expect(toolDef.function.description).toBeTruthy()
        expect(toolDef.function.parameters).toBeTruthy()
      }
    })

    it('no duplicate tool names after namespace filter', () => {
      const tools = assembler.assemble()
      const names = tools.map((t) => t.name)
      const unique = new Set(names)
      expect(names.length).toBe(unique.size)
    })
  })

  describe('default namespace filter preserves backward compatibility', () => {
    it('assemble without options still works', () => {
      const tools = assembler.assemble()
      expect(tools.length).toBeGreaterThan(0)
    })

    it('assembleForRole without options still works', () => {
      const tools = assembler.assembleForRole('coder')
      expect(tools.length).toBeGreaterThan(0)
    })

    it('calling assemble with only mode still filters namespaces', () => {
      const tools = assembler.assemble({ mode: 'default' })
      expect(tools.filter((t) => t.namespace !== 'coding')).toHaveLength(0)
    })
  })
})
