/**
 * PluginRegistry — manages the lifecycle of all loaded plugins.
 *
 * Provides:
 *   - Register/unregister plugins
 *   - Toggle enable/disable
 *   - Query by capability
 *   - Event hooks dispatch
 *   - Integration with ToolRegistry, MCPRegistry, and UI store
 */

import { EventBus } from "@/runtime/EventBus"
import type { LifecycleHookRegistry } from "@/runtime/lifecycle"
import type { LifecycleStage, LifecycleContext } from "@/runtime/lifecycle"
import type {
  Plugin,
  PluginManifest,
  PluginStoreState,
  PluginUiRegistration,
  PluginHookRegistration,
} from "./PluginTypes"
import type { AgentTool } from "@/runtime/tools/core/AgentTool"

export class PluginRegistry {
  private plugins = new Map<string, Plugin>()
  private listeners = new Map<string, Set<() => void>>()
  private lifecycleHooks: LifecycleHookRegistry | null = null

  connectLifecycleRegistry(registry: LifecycleHookRegistry): void {
    this.lifecycleHooks = registry
  }

  // ── Registration ──

  register(plugin: Plugin): void {
    const existing = this.plugins.get(plugin.manifest.id)
    if (existing) {
      console.warn(`[PluginRegistry] Overwriting plugin: ${plugin.manifest.id}`)
    }
    this.plugins.set(plugin.manifest.id, plugin)
    this.notifyListeners()

    EventBus.getInstance().emit({
      type: "PLUGIN_REGISTERED",
      pluginId: plugin.manifest.id,
      pluginName: plugin.manifest.name,
      timestamp: Date.now(),
    } as any)
  }

  unregister(id: string): boolean {
    const removed = this.plugins.delete(id)
    if (removed) {
      this.notifyListeners()
      EventBus.getInstance().emit({
        type: "PLUGIN_UNREGISTERED",
        pluginId: id,
        timestamp: Date.now(),
      } as any)
    }
    return removed
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id)
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  getEnabled(): Plugin[] {
    return this.getAll().filter((p) => p.enabled)
  }

  size(): number {
    return this.plugins.size
  }

  // ── Enable/Disable ──

  setEnabled(id: string, enabled: boolean): boolean {
    const plugin = this.plugins.get(id)
    if (!plugin) return false
    plugin.enabled = enabled
    this.notifyListeners()

    EventBus.getInstance().emit({
      type: enabled ? "PLUGIN_ENABLED" : "PLUGIN_DISABLED",
      pluginId: id,
      pluginName: plugin.manifest.name,
      timestamp: Date.now(),
    } as any)
    return true
  }

  isEnabled(id: string): boolean {
    return this.plugins.get(id)?.enabled ?? false
  }

  // ── Query by Capability ──

  getPluginsWithTools(): Plugin[] {
    return this.getEnabled().filter((p) => p.tools && p.tools.tools.length > 0)
  }

  getPluginsWithMcpServers(): Plugin[] {
    return this.getEnabled().filter((p) => p.mcpServers && p.mcpServers.servers.length > 0)
  }

  getPluginsWithUi(): Plugin[] {
    return this.getEnabled().filter((p) => p.ui && this.hasUiRegistrations(p.ui))
  }

  getPluginsWithHooks(): Plugin[] {
    return this.getEnabled().filter((p) => p.hooks)
  }

  getAllTools(): AgentTool[] {
    const tools: AgentTool[] = []
    for (const plugin of this.getEnabled()) {
      if (plugin.tools) {
        tools.push(...plugin.tools.tools)
      }
    }
    return tools
  }

  // ── Hook Dispatch ──

  async dispatchOnInit(): Promise<void> {
    for (const plugin of this.getPluginsWithHooks()) {
      if (plugin.hooks?.onInit) {
        try {
          await plugin.hooks.onInit()
        } catch (err) {
          console.error(`[PluginRegistry] onInit failed for ${plugin.manifest.id}:`, err)
        }
      }
    }
    await this.lifecycleHooks?.dispatchAll('init', {})
  }

  async dispatchOnSessionStart(sessionId: string, input: string): Promise<void> {
    for (const plugin of this.getPluginsWithHooks()) {
      if (plugin.hooks?.onSessionStart) {
        try {
          await plugin.hooks.onSessionStart(sessionId, input)
        } catch (err) {
          console.error(`[PluginRegistry] onSessionStart failed for ${plugin.manifest.id}:`, err)
        }
      }
    }
    await this.lifecycleHooks?.dispatchAll('sessionStart', { sessionId, input })
  }

  async dispatchOnSessionEnd(sessionId: string, status: string): Promise<void> {
    for (const plugin of this.getPluginsWithHooks()) {
      if (plugin.hooks?.onSessionEnd) {
        try {
          await plugin.hooks.onSessionEnd(sessionId, status)
        } catch (err) {
          console.error(`[PluginRegistry] onSessionEnd failed for ${plugin.manifest.id}:`, err)
        }
      }
    }
    await this.lifecycleHooks?.dispatchAll('sessionEnd', { sessionId, status })
  }

  async dispatchOnBeforeTool(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    for (const plugin of this.getPluginsWithHooks()) {
      if (plugin.hooks?.onBeforeTool) {
        try {
          const allow = await plugin.hooks.onBeforeTool(toolName, args)
          if (!allow) return false
        } catch (err) {
          console.error(`[PluginRegistry] onBeforeTool failed for ${plugin.manifest.id}:`, err)
        }
      }
    }
    const lifecycleResult = await this.lifecycleHooks?.dispatch('preToolUse', { toolName, toolArgs: args })
    if (lifecycleResult && !lifecycleResult.proceed) return false
    return true
  }

  async dispatchOnAfterTool(toolName: string, args: Record<string, unknown>, result: unknown): Promise<void> {
    for (const plugin of this.getPluginsWithHooks()) {
      if (plugin.hooks?.onAfterTool) {
        try {
          await plugin.hooks.onAfterTool(toolName, args, result)
        } catch (err) {
          console.error(`[PluginRegistry] onAfterTool failed for ${plugin.manifest.id}:`, err)
        }
      }
    }
    await this.lifecycleHooks?.dispatchAll('postToolUse', { toolName, toolArgs: args, toolResult: result })
  }

  // ── Listeners ──

  private listenerCounter = 0

  onUpdate(callback: () => void): () => void {
    const id = `plugin_listener_${this.listenerCounter++}`
    this.listeners.set(id, new Set([callback]))
    return () => this.listeners.get(id)?.delete(callback)
  }

  // ── Private ──

  private notifyListeners(): void {
    for (const [, callbacks] of this.listeners) {
      for (const cb of callbacks) {
        try {
          cb()
        } catch (err) {
          console.error("[PluginRegistry] Listener error:", err)
        }
      }
    }
  }

  private hasUiRegistrations(ui: PluginUiRegistration): boolean {
    return (
      (ui.dockPanels && Object.keys(ui.dockPanels).length > 0) ||
      (ui.settingsTabs && Object.keys(ui.settingsTabs).length > 0) ||
      (ui.injections && ui.injections.length > 0)
    )
  }

  /** Convert to serializable state for the store */
  toStoreState(): PluginStoreState["plugins"] extends Map<string, infer P> ? P[] : never {
    return Array.from(this.plugins.values()) as any
  }
}

/** Singleton instance */
export const pluginRegistry = new PluginRegistry()
