interface GlobalPreference {
  key: string
  value: string
  category: "convention" | "style" | "workflow" | "tool" | "general"
  confidence: number
  createdAt: number
  updatedAt: number
  source: string
}

interface GlobalMemory {
  version: number
  preferences: GlobalPreference[]
  updatedAt: number
}

const GLOBAL_MEMORY_FILENAME = "agentic-global-memory.json"
const CURRENT_VERSION = 1

export class GlobalMemoryStore {
  private static instance: GlobalMemoryStore
  private memory: GlobalMemory | null = null
  private ready: Promise<void>

  private constructor() {
    this.ready = this.initialize()
  }

  static getInstance(): GlobalMemoryStore {
    if (!GlobalMemoryStore.instance) {
      GlobalMemoryStore.instance = new GlobalMemoryStore()
    }
    return GlobalMemoryStore.instance
  }

  private async initialize(): Promise<void> {
    try {
      await this.load()
    } catch {
      this.memory = this.emptyMemory()
    }
  }

  private emptyMemory(): GlobalMemory {
    return { version: CURRENT_VERSION, preferences: [], updatedAt: Date.now() }
  }

  private async ensureReady(): Promise<void> {
    await this.ready
  }

  private async load(): Promise<void> {
    try {
      const mod = await import("@/lib/electron-api")
      const { readTextFile, BaseDirectory } = mod
      const data = await readTextFile(GLOBAL_MEMORY_FILENAME, { baseDir: BaseDirectory.AppData })
      this.memory = JSON.parse(data) as GlobalMemory
    } catch {
      this.memory = this.emptyMemory()
    }
  }

  private async save(): Promise<void> {
    if (!this.memory) return
    this.memory.updatedAt = Date.now()
    try {
      const mod = await import("@/lib/electron-api")
      const { writeTextFile, BaseDirectory, mkdir } = mod
      await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true })
      await writeTextFile(GLOBAL_MEMORY_FILENAME, JSON.stringify(this.memory, null, 2), { baseDir: BaseDirectory.AppData })
    } catch (err) {
      console.warn("[GlobalMemoryStore] Failed to persist:", err)
    }
  }

  async setPreference(
    key: string,
    value: string,
    category: GlobalPreference["category"] = "general",
    source = "user",
    confidence = 1.0,
  ): Promise<void> {
    await this.ensureReady()
    if (!this.memory) this.memory = this.emptyMemory()
    const existing = this.memory.preferences.find((p) => p.key === key)
    if (existing) {
      existing.value = value
      existing.category = category
      existing.confidence = confidence
      existing.source = source
      existing.updatedAt = Date.now()
    } else {
      this.memory.preferences.push({
        key,
        value,
        category,
        confidence,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source,
      })
    }
    await this.save()
  }

  async getPreference(key: string): Promise<GlobalPreference | undefined> {
    await this.ensureReady()
    return this.memory?.preferences.find((p) => p.key === key)
  }

  async getPreferencesByCategory(category: GlobalPreference["category"]): Promise<GlobalPreference[]> {
    await this.ensureReady()
    return (this.memory?.preferences ?? []).filter((p) => p.category === category)
  }

  async getAllPreferences(): Promise<GlobalPreference[]> {
    await this.ensureReady()
    return [...(this.memory?.preferences ?? [])]
  }

  async removePreference(key: string): Promise<void> {
    await this.ensureReady()
    if (!this.memory) return
    this.memory.preferences = this.memory.preferences.filter((p) => p.key !== key)
    await this.save()
  }

  async formatForPrompt(): Promise<string> {
    await this.ensureReady()
    const prefs = this.memory?.preferences ?? []
    if (prefs.length === 0) return ""
    const lines = prefs.map(
      (p) => `- ${p.key}: ${p.value} (${p.category}, confidence: ${Math.round(p.confidence * 100)}%)`,
    )
    return `## Global Preferences\n\nThese preferences apply across all workspaces:\n\n${lines.join("\n")}`
  }
}
