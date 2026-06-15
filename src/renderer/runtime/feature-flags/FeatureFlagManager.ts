export type FeatureFlag =
  | "goalLoop"
  | "verification"
  | "multiAgent"
  | "browserContinuity"
  | "observability"
  | "autoMemory"
  | "contextCache"
  | "legacyRuntime"

export class FeatureFlagManager {
  private static instance: FeatureFlagManager
  private flags = new Map<FeatureFlag, boolean>()

  private readonly defaults: Record<FeatureFlag, boolean> = {
    goalLoop: true,
    verification: true,
    multiAgent: true,
    browserContinuity: true,
    observability: true,
    autoMemory: true,
    contextCache: true,
    legacyRuntime: false,
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
}
