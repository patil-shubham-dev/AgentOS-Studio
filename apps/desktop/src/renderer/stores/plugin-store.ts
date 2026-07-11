/**
 * PluginStore — Zustand store for plugin state management.
 * Mirrors the PluginRegistry state into a React-reactive store for UI components.
 */

import { create } from "zustand"
import type { Plugin, PluginStoreState } from "@/runtime/plugins/PluginTypes"
import { pluginRegistry } from "@/runtime/plugins/PluginRegistry"

export const usePluginStore = create<PluginStoreState>((set) => ({
  plugins: new Map(),
  isLoading: false,
  error: null,

  setPlugins: (plugins) =>
    set({
      plugins: new Map(plugins.map((p) => [p.manifest.id, p])),
      isLoading: false,
      error: null,
    }),

  addPlugin: (plugin) =>
    set((state) => {
      const newMap = new Map(state.plugins)
      newMap.set(plugin.manifest.id, plugin)
      return { plugins: newMap }
    }),

  removePlugin: (id) =>
    set((state) => {
      const newMap = new Map(state.plugins)
      newMap.delete(id)
      return { plugins: newMap }
    }),

  togglePlugin: (id) =>
    set((state) => {
      const plugin = state.plugins.get(id)
      if (!plugin) return state
      const enabled = !plugin.enabled
      pluginRegistry.setEnabled(id, enabled)
      const newMap = new Map(state.plugins)
      newMap.set(id, { ...plugin, enabled })
      return { plugins: newMap }
    }),

  updatePlugin: (id, updates) =>
    set((state) => {
      const plugin = state.plugins.get(id)
      if (!plugin) return state
      const newMap = new Map(state.plugins)
      newMap.set(id, { ...plugin, ...updates })
      return { plugins: newMap }
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  clear: () => set({ plugins: new Map(), isLoading: false, error: null }),
}))
