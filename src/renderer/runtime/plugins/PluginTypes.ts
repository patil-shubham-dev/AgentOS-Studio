/**
 * PluginTypes — type definitions for the AgenticOS plugin system.
 *
 * Plugins are self-contained modules that can:
 *   - Register new tools (via ToolRegistry)
 *   - Add MCP server configurations
 *   - Register UI components (React components injected into the dock)
 *   - Hook into lifecycle events (init, session start/end, tool execution)
 *   - Provide custom prompt sections
 */

import type { AgentTool } from "@/runtime/tools/core/AgentTool"
import type { ComponentType } from "react"

// ── Plugin Identity ──

export interface PluginManifest {
  /** Unique plugin identifier (e.g. "com.example.my-plugin") */
  id: string
  /** Human-readable name */
  name: string
  /** Semantic version */
  version: string
  /** Short description shown in plugin manager */
  description: string
  /** Author name or organization */
  author?: string
  /** Minimum AgenticOS version required */
  minAppVersion?: string
  /** URL for the plugin homepage or repo */
  homepage?: string
  /** License identifier (e.g. "MIT", "Apache-2.0") */
  license?: string
  /** Tags for categorization */
  tags?: string[]
  /** Entry point module path (relative to plugin directory) */
  entryPoint?: string
  /** Whether this plugin is bundled with the app */
  isBuiltin?: boolean
}

// ── Plugin Capabilities ──

export interface PluginToolRegistration {
  /** Tool instances to register */
  tools: AgentTool[]
}

export interface PluginMcpRegistration {
  /** MCP server configs to add */
  servers: Array<{
    name: string
    command: string
    args?: string[]
    env?: Record<string, string>
    enabled?: boolean
  }>
}

export interface PluginUiRegistration {
  /** Dock panel components keyed by panel ID */
  dockPanels?: Record<string, ComponentType<unknown>>
  /** Settings tab components keyed by tab ID */
  settingsTabs?: Record<string, ComponentType<unknown>>
  /** Add any React node to existing locations */
  injections?: Array<{
    location: "chat-header" | "nav-bottom" | "status-bar" | "toolbar"
    component: ComponentType<unknown>
    priority?: number
  }>
}

export interface PluginHookRegistration {
  /** Called after the plugin is loaded and registered */
  onInit?: () => Promise<void> | void
  /** Called when a session starts */
  onSessionStart?: (sessionId: string, input: string) => Promise<void> | void
  /** Called when a session ends */
  onSessionEnd?: (sessionId: string, status: string) => Promise<void> | void
  /** Called before a tool executes — return false to block */
  onBeforeTool?: (toolName: string, args: Record<string, unknown>) => boolean | Promise<boolean>
  /** Called after a tool completes */
  onAfterTool?: (toolName: string, args: Record<string, unknown>, result: unknown) => Promise<void> | void
}

// ── Full Plugin Definition ──

export interface Plugin {
  /** Plugin manifest (loaded from package.json or plugin.yaml) */
  manifest: PluginManifest
  /** Whether the plugin is enabled */
  enabled: boolean
  /** The directory path where the plugin is installed */
  directoryPath: string
  /** Timestamp when the plugin was loaded */
  loadedAt: number
  /** Timestamp when the plugin was last updated */
  updatedAt?: number

  /** Tool registrations */
  tools?: PluginToolRegistration
  /** MCP server registrations */
  mcpServers?: PluginMcpRegistration
  /** UI component registrations */
  ui?: PluginUiRegistration
  /** Lifecycle hook registrations */
  hooks?: PluginHookRegistration
}

// ── Plugin Store Types ──

export interface PluginStoreState {
  /** All discovered plugins keyed by ID */
  plugins: Map<string, Plugin>
  /** Currently loading state */
  isLoading: boolean
  /** Error message if plugin loading failed */
  error: string | null

  /** Actions */
  setPlugins: (plugins: Plugin[]) => void
  addPlugin: (plugin: Plugin) => void
  removePlugin: (id: string) => void
  togglePlugin: (id: string) => void
  updatePlugin: (id: string, updates: Partial<Plugin>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clear: () => void
}

// ── Plugin Discovery ──

export interface PluginDiscoveryResult {
  /** Successfully loaded plugins */
  loaded: Plugin[]
  /** Plugins that failed to load with error info */
  failed: Array<{ id: string; error: string }>
}
