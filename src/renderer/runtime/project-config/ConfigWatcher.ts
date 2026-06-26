/**
 * ConfigWatcher
 *
 * Watches AGENTIC.md files in the project root for changes and
 * invalidates the ConfigLoader cache so the next execution picks up
 * the new configuration.
 *
 * Uses the workspace file-watching infrastructure (startWatching / onFileChange)
 * rather than raw filesystem watchers to keep the architecture simple
 * and consistent with the existing codebase patterns.
 */

import { configLoader } from "./ConfigLoader"
import { onFileChange } from "@/lib/workspace"

export type ConfigChangeListener = (source: "managed" | "user" | "project" | "local" | "path-rules", filePath: string) => void

export class ConfigWatcher {
  private rootPath: string | null = null
  private unlisten: (() => void) | null = null
  private listeners = new Set<ConfigChangeListener>()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Start watching config files in the given project root.
   * Registers a file-change callback that detects AGENTIC.md modifications.
   */
  async start(rootPath: string): Promise<void> {
    this.stop()
    this.rootPath = rootPath

    try {
      this.unlisten = await onFileChange((event) => {
        // Only care about AGENTIC.md files and .agentic/ directory changes
        const path = event.path?.replace(/\\/g, "/") ?? ""

        const isConfigFile = (
          path.endsWith("AGENTIC.md") ||
          path.endsWith("AGENTIC.local.md") ||
          path.includes(".agentic/rules/") ||
          path.includes(".agentic/AGENTIC.md") ||
          path.includes(".agentic/AGENTIC.local.md")
        )

        if (!isConfigFile) return

        // Debounce: configuration changes often come in batches (save triggers multiple events)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null
          this.handleConfigChange(path)
        }, 500)
      })
    } catch {
      console.warn("[ConfigWatcher] Failed to register file watcher — config hot-reload disabled")
    }
  }

  /**
   * Stop watching and clean up.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.unlisten) {
      this.unlisten()
      this.unlisten = null
    }
    this.rootPath = null
  }

  /**
   * Register a listener for config changes.
   * Returns an unsubscribe function.
   */
  onChange(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Whether the watcher is currently active.
   */
  get isWatching(): boolean {
    return this.rootPath !== null && this.unlisten !== null
  }

  /**
   * Get the currently watched root path.
   */
  get watchedPath(): string | null {
    return this.rootPath
  }

  // ── Private ──

  private handleConfigChange(filePath: string): void {
    // Invalidate the config cache so the next load() re-reads from disk
    configLoader.invalidateCache()

    // Determine the change source from the file path
    const normalizedPath = filePath.replace(/\\/g, "/")
    let source: ConfigFile["source"] = "project"

    if (normalizedPath.endsWith("AGENTIC.local.md")) {
      source = "local"
    } else if (normalizedPath.includes(".agentic/rules/")) {
      source = "path-rules"
    } else if (normalizedPath.includes("global/AGENTIC.md")) {
      source = "managed"
    } else if (normalizedPath.includes("user/AGENTIC.md")) {
      source = "user"
    }

    // Notify all listeners
    console.log(`[ConfigWatcher] Config change detected: ${normalizedPath} (source=${source})`)
    for (const listener of this.listeners) {
      try {
        listener(source, normalizedPath)
      } catch (err) {
        console.error("[ConfigWatcher] Listener error:", err)
      }
    }
  }
}

/** Singleton instance */
export const configWatcher = new ConfigWatcher()
