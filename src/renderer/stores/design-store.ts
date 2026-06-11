import { create } from "zustand"
import type { DesignTokens, ComponentDefinition, DesignArtifact, DesignArtifactVersion } from "@/types"

interface ApplyToCodeState {
  isApplying: boolean
  targetPath: string | null
  progress: string
  result: "idle" | "success" | "error"
  errorMessage: string | null
}

interface DesignStore {
  // Tokens
  tokens: DesignTokens
  mode: "coding" | "design"
  setTokens: (tokens: DesignTokens) => void
  updateToken: <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => void
  setMode: (mode: "coding" | "design") => void
  selectedComponent: ComponentDefinition | null
  setSelectedComponent: (comp: ComponentDefinition | null) => void

  // Artifacts
  artifacts: DesignArtifact[]
  currentArtifactId: string | null
  setCurrentArtifact: (id: string | null) => void
  addArtifact: (artifact: Omit<DesignArtifact, "id" | "createdAt" | "updatedAt" | "versions" | "currentVersion">) => string
  updateArtifact: (id: string, updates: Partial<DesignArtifact>) => void
  removeArtifact: (id: string) => void
  addVersion: (artifactId: string, version: Omit<DesignArtifactVersion, "version" | "timestamp">) => void
  setCurrentVersion: (artifactId: string, version: number) => void

  // Helpers
  currentArtifact: () => DesignArtifact | null
  currentVersionData: () => DesignArtifactVersion | null

  // Apply-to-code
  applyToCode: ApplyToCodeState
  setApplyToCode: (state: Partial<ApplyToCodeState>) => void
  resetApplyToCode: () => void
}

const defaultTokens: DesignTokens = {
  primaryColor: "#0f0f0f",
  backgroundColor: "#ffffff",
  foregroundColor: "#0a0a0a",
  fontSize: "16px",
  fontFamily: "system-ui, -apple-system, sans-serif",
  borderRadius: "0.5rem",
  spacing: "1rem",
}

const defaultApplyState: ApplyToCodeState = {
  isApplying: false,
  targetPath: null,
  progress: "",
  result: "idle",
  errorMessage: null,
}

export const useDesignStore = create<DesignStore>((set, get) => ({
  tokens: defaultTokens,
  mode: "coding",
  setTokens: (tokens) => set({ tokens }),
  updateToken: (key, value) =>
    set((s) => ({ tokens: { ...s.tokens, [key]: value } })),
  setMode: (mode) => set({ mode }),
  selectedComponent: null,
  setSelectedComponent: (comp) => set({ selectedComponent: comp }),

  // Artifacts
  artifacts: [],
  currentArtifactId: null,
  setCurrentArtifact: (id) => set({ currentArtifactId: id }),

  addArtifact: (data) => {
    const id = `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    const artifact: DesignArtifact = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now,
      versions: [],
      currentVersion: 0,
    }
    set((s) => ({ artifacts: [...s.artifacts, artifact], currentArtifactId: id }))
    return id
  },

  updateArtifact: (id, updates) =>
    set((s) => ({
      artifacts: s.artifacts.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
      ),
    })),

  removeArtifact: (id) =>
    set((s) => ({
      artifacts: s.artifacts.filter((a) => a.id !== id),
      currentArtifactId: s.currentArtifactId === id ? null : s.currentArtifactId,
    })),

  addVersion: (artifactId, data) => {
    const state = get()
    const artifact = state.artifacts.find((a) => a.id === artifactId)
    if (!artifact) return

    const nextVersion = artifact.versions.length + 1
    const version: DesignArtifactVersion = {
      version: nextVersion,
      ...data,
      timestamp: Date.now(),
    }

    set((s) => ({
      artifacts: s.artifacts.map((a) =>
        a.id === artifactId
          ? {
              ...a,
              versions: [...a.versions, version],
              currentVersion: nextVersion,
              updatedAt: Date.now(),
            }
          : a
      ),
    }))
  },

  setCurrentVersion: (artifactId, version) =>
    set((s) => ({
      artifacts: s.artifacts.map((a) =>
        a.id === artifactId ? { ...a, currentVersion: version } : a
      ),
    })),

  currentArtifact: () => {
    const state = get()
    return state.artifacts.find((a) => a.id === state.currentArtifactId) ?? null
  },

  currentVersionData: () => {
    const state = get()
    const artifact = state.artifacts.find((a) => a.id === state.currentArtifactId)
    if (!artifact) return null
    return artifact.versions.find((v) => v.version === artifact.currentVersion) ?? null
  },

  // Apply-to-code
  applyToCode: defaultApplyState,
  setApplyToCode: (partial) =>
    set((s) => ({
      applyToCode: { ...s.applyToCode, ...partial },
    })),
  resetApplyToCode: () => set({ applyToCode: defaultApplyState }),
}))
