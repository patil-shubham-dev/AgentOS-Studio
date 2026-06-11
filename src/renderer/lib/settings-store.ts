import { useAppStore } from "@/stores/app-store"
import { useToastStore } from "@/stores/toast-store"
import { loadConfig, saveConfig, type ConfigData } from "./persistence"
import { safeSetItem } from "./safe-storage"
import type { GatewayProvider, AgentRoleConfig, RoleMapping, LedgerEntry } from "@/types"

const LOG_PREFIX = "[SettingsStore]"

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, "[WARN]", ...args)
}

function serialize(): string {
  const s = useAppStore.getState()
  const config: ConfigData = {
    version: 1,
    providers: s.providers as unknown as Record<string, unknown>[],
    roleConfigs: s.roleConfigs as unknown as Record<string, unknown>[],
    roleMappings: s.roleMappings as unknown as Record<string, unknown>[],
    ledger: s.ledger as unknown as Record<string, unknown>[],
    mcpServers: s.mcpServers as unknown as Record<string, unknown>[],
  }
  return JSON.stringify(config, null, 2)
}

function deserialize(data: string) {
  const parsed = JSON.parse(data)
  const s = useAppStore.getState()

  if (parsed.providers) {
    for (const p of parsed.providers) {
      s.addProvider(p as GatewayProvider)
    }
  }
  if (parsed.roleConfigs) {
    for (const r of parsed.roleConfigs) {
      s.upsertRoleConfig(r as AgentRoleConfig)
    }
  }
  if (parsed.roleMappings) {
    for (const r of parsed.roleMappings) {
      s.setRoleMapping(r as RoleMapping)
    }
  }
  if (parsed.ledger) {
    for (const l of parsed.ledger) {
      s.addLedgerEntry(l as LedgerEntry)
    }
  }
  if (parsed.mcpServers && Array.isArray(parsed.mcpServers)) {
    useAppStore.setState({ mcpServers: parsed.mcpServers })
  }

  return parsed
}

export async function persistSettings() {
  try {
    const data = serialize()
    const parsed = JSON.parse(data) as ConfigData
    const saved = await saveConfig(parsed)
    if (!saved) {
      warn("Config save returned false, falling back to direct localStorage")
      safeSetItem("settings.json", data)
    }
  } catch (err) {
    console.error("[SettingsStore] Failed to persist settings:", err)
    useToastStore.getState().addToast("Failed to save settings. Some configuration may be lost on reload.", "error", 5000)
    try {
      const data = serialize()
      safeSetItem("settings.json", data)
    } catch {
      // ignore double-failure
    }
  }
}

export async function loadSettings() {
  try {
    const result = await loadConfig(true)

    if (result.migrated && result.migrationResult) {
      log(`Migration applied: ${result.migrationResult.log?.fromVersion} → ${result.migrationResult.log?.toVersion}`)
      for (const action of result.migrationResult.log?.actions || []) {
        log(`  ${action.type}: ${action.description}`)
      }
    }

    const raw = JSON.stringify(result.config)
    if (raw) {
      deserialize(raw)
      const mcpCount = result.config.mcpServers?.length || 0
      log(`Settings loaded: ${result.config.providers?.length || 0} providers, ${result.config.roleConfigs?.length || 0} roles, ${mcpCount} MCP servers`)
    }
  } catch (err) {
    console.error("[SettingsStore] Failed to load settings:", err)
    useToastStore.getState().addToast("Failed to load settings. Default configuration will be used.", "error", 5000)
  }
}
