/**
 * PluginLoader — discovers and loads plugins from disk.
 *
 * Plugin discovery paths:
 *   1. Built-in: src/renderer/runtime/plugins/builtin/ (bundled with app)
 *   2. User: ~/.agentic/plugins/ (user-installed)
 *   3. Project: <root>/.agentic/plugins/ (project-scoped)
 *
 * Each plugin directory must contain a manifest (package.json or plugin.yaml)
 * and an entry point module. The loader reads the manifest, imports the module,
 * and constructs a Plugin object for the PluginRegistry.
 */

import { isTauri } from "@/runtime/environment"
import type { Plugin, PluginDiscoveryResult, PluginManifest } from "./PluginTypes"
import type { AgentTool } from "@/runtime/tools/core/AgentTool"
import { usePluginStore } from "@/stores/plugin-store"

// ── Built-in Plugins ──
// These are shipped with the app and defined inline (no filesystem scan needed).

const BUILTIN_PLUGINS: PluginManifest[] = [
  {
    id: "agenticos.builtin.workspace",
    name: "Workspace Essentials",
    version: "1.0.0",
    description: "Core workspace tools and UI enhancements",
    author: "AgenticOS",
    isBuiltin: true,
    tags: ["core", "workspace"],
  },
  {
    id: "agenticos.builtin.browser",
    name: "Browser Automation",
    version: "1.0.0",
    description: "Browser automation tools with live viewport",
    author: "AgenticOS",
    isBuiltin: true,
    tags: ["core", "browser"],
  },
  {
    id: "agenticos.builtin.planning",
    name: "Plan Mode",
    version: "1.0.0",
    description: "Plan generation and comparison tools",
    author: "AgenticOS",
    isBuiltin: true,
    tags: ["core", "planning"],
  },
]

// ── PluginLoader ──

export class PluginLoader {
  private loaded = false

  /**
   * Load all plugins from all discovery paths.
   */
  async loadAll(workspaceRoot?: string): Promise<PluginDiscoveryResult> {
    const result: PluginDiscoveryResult = { loaded: [], failed: [] }

    // 1. Load built-in plugins
    this.loadBuiltins(result)

    // 2. Load user plugins from ~/.agentic/plugins/
    if (isTauri()) {
      try {
        const userPlugins = await this.loadFromDirectory(this.getUserPluginsDir())
        result.loaded.push(...userPlugins.loaded)
        result.failed.push(...userPlugins.failed)
      } catch (err) {
        console.warn("[PluginLoader] User plugins load failed:", err)
      }
    }

    // 3. Load project plugins
    if (workspaceRoot) {
      try {
        const projectPlugins = await this.loadFromDirectory(
          `${workspaceRoot}/.agentic/plugins`,
        )
        result.loaded.push(...projectPlugins.loaded)
        result.failed.push(...projectPlugins.failed)
      } catch (err) {
        console.warn("[PluginLoader] Project plugins load failed:", err)
      }
    }

    // Update the plugin store
    const store = usePluginStore.getState()
    store.setPlugins(result.loaded)
    if (result.failed.length > 0) {
      store.setError(
        `${result.failed.length} plugin(s) failed to load: ${result.failed.map((f) => f.id).join(", ")}`,
      )
    }

    this.loaded = true
    return result
  }

  /**
   * Discover a single plugin from a directory by reading its manifest.
   */
  async discoverPlugin(pluginDir: string): Promise<Plugin | null> {
    try {
      // Try package.json first
      let manifest: PluginManifest | null = null

      if (isTauri()) {
        const fs = await import("@/lib/electron-api")

        // Read package.json
        try {
          const pkgContent = await fs.readTextFile(`${pluginDir}/package.json`)
          const pkg = JSON.parse(pkgContent)
          manifest = this.parsePackageJson(pkg, pluginDir)
        } catch {
          // Try plugin.yaml
          try {
            const yamlContent = await fs.readTextFile(`${pluginDir}/plugin.yaml`)
            manifest = this.parseYamlManifest(yamlContent, pluginDir)
          } catch {
            return null
          }
        }
      }

      if (!manifest) return null

      return {
        manifest,
        enabled: true,
        directoryPath: pluginDir,
        loadedAt: Date.now(),
      }
    } catch (err) {
      console.warn(`[PluginLoader] Failed to discover plugin at ${pluginDir}:`, err)
      return null
    }
  }

  /**
   * Check if plugins have been loaded.
   */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Reset the loaded state (for testing or re-loading).
   */
  reset(): void {
    this.loaded = false
  }

  // ── Private ──

  private loadBuiltins(result: PluginDiscoveryResult): void {
    for (const manifest of BUILTIN_PLUGINS) {
      result.loaded.push({
        manifest,
        enabled: true,
        directoryPath: "builtin",
        loadedAt: Date.now(),
      })
    }
  }

  private async loadFromDirectory(dir: string): Promise<PluginDiscoveryResult> {
    const result: PluginDiscoveryResult = { loaded: [], failed: [] }

    try {
      const fs = await import("@/lib/electron-api")
      let entries: Array<{ name: string; isDir: boolean }>

      try {
        entries = await fs.readDir(dir)
      } catch {
        return result // Directory doesn't exist — not an error
      }

      const pluginDirs = entries.filter((e) => e.isDir)

      for (const entry of pluginDirs) {
        try {
          const pluginDir = `${dir}/${entry.name}`
          const plugin = await this.discoverPlugin(pluginDir)
          if (plugin) {
            result.loaded.push(plugin)
          } else {
            result.failed.push({ id: entry.name, error: "No valid manifest found" })
          }
        } catch (err) {
          result.failed.push({
            id: entry.name,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    } catch (err) {
      console.warn(`[PluginLoader] Failed to scan directory ${dir}:`, err)
    }

    return result
  }

  private parsePackageJson(pkg: Record<string, unknown>, dir: string): PluginManifest {
    return {
      id: (pkg.name as string) ?? `plugin_${dir.replace(/[^a-zA-Z0-9]/g, "_")}`,
      name: (pkg.displayName as string) ?? (pkg.name as string) ?? "Unnamed Plugin",
      version: (pkg.version as string) ?? "0.0.0",
      description: (pkg.description as string) ?? "",
      author: pkg.author as string,
      minAppVersion: (pkg as any).agenticos?.minAppVersion,
      homepage: pkg.homepage as string,
      license: pkg.license as string,
      tags: ((pkg as any).keywords as string[]) ?? [],
      entryPoint: (pkg.main as string) ?? "index.js",
    }
  }

  private parseYamlManifest(_content: string, dir: string): PluginManifest {
    // Simple YAML-like parser for the minimal fields we need
    const lines = _content.split("\n")
    const fields: Record<string, string> = {}
    for (const line of lines) {
      const match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/)
      if (match) {
        fields[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
      }
    }

    return {
      id: fields.id ?? `plugin_${dir.replace(/[^a-zA-Z0-9]/g, "_")}`,
      name: fields.name ?? "Unnamed Plugin",
      version: fields.version ?? "0.0.0",
      description: fields.description ?? "",
      author: fields.author,
      entryPoint: fields.entry ?? "index.js",
      tags: fields.tags ? fields.tags.split(",").map((t) => t.trim()) : [],
    }
  }

  private getUserPluginsDir(): string {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "~"
    return `${home}/.agentic/plugins`
  }
}

/** Singleton instance */
export const pluginLoader = new PluginLoader()
