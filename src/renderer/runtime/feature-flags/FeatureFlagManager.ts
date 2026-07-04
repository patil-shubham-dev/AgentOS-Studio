export type FeatureFlag =
  | "verification"
  | "multiAgent"
  | "browserContinuity"
  | "observability"
  | "autoMemory"
  | "contextCache"
  | "unifiedExecutor"
  | "showInternalAgentLabels"
  | "codingCore"
  | "browserIsland"
  | "designIsland"
  | "deviceControlIsland"
  | "browserToolsInCoding"
  | "designToolsInCoding"
  | "deviceToolsInCoding"
  | "browserContextInCoding"
  | "designContextInCoding"
  | "deviceContextInCoding"
  | "advancedAgents"
  | "longTermMemory"
  | "plugins"
  | "mcp"
  | "astGraph"
  | "liveGraphEngine"
  | "configWatcher"
  | "sessionMemory"
  | "skills"
  | "reliabilitySuite"

export class FeatureFlagManager {
  private static instance: FeatureFlagManager
  private flags = new Map<FeatureFlag, boolean>()

  private readonly defaults: Record<FeatureFlag, boolean> = {
    verification: true,
    multiAgent: true,
    browserContinuity: true,
    observability: true,
    autoMemory: true,
    contextCache: true,
    unifiedExecutor: false,
    showInternalAgentLabels: false,
    codingCore: true,
    browserIsland: false,
    designIsland: false,
    deviceControlIsland: false,
    browserToolsInCoding: false,
    designToolsInCoding: false,
    deviceToolsInCoding: false,
    browserContextInCoding: false,
    designContextInCoding: false,
    deviceContextInCoding: false,
    advancedAgents: false,
    longTermMemory: false,
    plugins: false,
    mcp: false,
    astGraph: false,
    liveGraphEngine: false,
    configWatcher: true,
    sessionMemory: true,
    skills: true,
    reliabilitySuite: true,
  }

  static getInstance(): FeatureFlagManager {
    if (!FeatureFlagManager.instance) {
      FeatureFlagManager.instance = new FeatureFlagManager()
    }
    return FeatureFlagManager.instance
  }

  private constructor() {
    for (const [key, value] of Object.entries(this.defaults)) {
      this.flags.set(key as FeatureFlag, value)
    }
  }

  isEnabled(flag: FeatureFlag): boolean {
    return this.flags.get(flag) ?? false
  }

  setEnabled(flag: FeatureFlag, enabled: boolean): void {
    this.flags.set(flag, enabled)
  }

  getAllFlags(): Record<FeatureFlag, boolean> {
    const result = {} as Record<FeatureFlag, boolean>
    for (const [key, value] of this.flags) {
      result[key] = value
    }
    return result
  }

  resetAll(): void {
    for (const [key, value] of Object.entries(this.defaults)) {
      this.flags.set(key as FeatureFlag, value)
    }
  }

  static isFeatureFlagEnabled(flag: FeatureFlag): boolean {
    return FeatureFlagManager.getInstance().isEnabled(flag)
  }
}
