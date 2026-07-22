import { resolveByBaseUrl } from "@agentic-os/providers"

export const CURRENT_CONFIG_VERSION = 1

export interface MigrationAction {
  type: "provider_id_normalized" | "role_ref_repaired" | "model_reconciled" | "api_key_migrated" | "orphan_detected" | "config_upgraded"
  description: string
  details: Record<string, unknown>
}

export interface MigrationLogEntry {
  fromVersion: number
  toVersion: number
  timestamp: string
  actions: MigrationAction[]
  errors: string[]
}

export interface MigrationResult {
  migrated: boolean
  log: MigrationLogEntry | null
  config: Record<string, unknown> | null
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 64) || "provider"
}

export function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export function generateStableProviderId(
  provider: { id?: string; name: string; baseUrl?: string },
  existingIds: string[],
): string {
  if (provider.id && !isUUID(provider.id)) {
    return provider.id
  }

  if (provider.baseUrl) {
    const registry = resolveByBaseUrl(provider.baseUrl)
    if (registry && !existingIds.includes(registry.id)) {
      return registry.id
    }
  }

  let slug = slugify(provider.name)
  if (!slug) slug = "provider"

  if (existingIds.includes(slug)) {
    let counter = 1
    while (existingIds.includes(`${slug}-${counter}`)) {
      counter++
    }
    slug = `${slug}-${counter}`
  }

  return slug
}

export function createDefaultConfig(): Record<string, unknown> {
  return {
    version: CURRENT_CONFIG_VERSION,
    providers: [],
    roleConfigs: [],
    roleMappings: [],
    ledger: [],
    mcpServers: [],
    migratedAt: new Date().toISOString(),
  }
}

const MIGRATION_LOGGER_PREFIX = "[Migration]"

function logMigration(...args: unknown[]) {
  console.log(MIGRATION_LOGGER_PREFIX, ...args)
}

function warnMigration(...args: unknown[]) {
  console.warn(MIGRATION_LOGGER_PREFIX, "[WARN]", ...args)
}

function errorMigration(...args: unknown[]) {
  console.error(MIGRATION_LOGGER_PREFIX, "[ERROR]", ...args)
}

function migrateV0ToV1(raw: Record<string, unknown>): {
  config: Record<string, unknown>
  actions: MigrationAction[]
  errors: string[]
} {
  const actions: MigrationAction[] = []
  const errors: string[] = []

  logMigration("Running v0 → v1 migration")

  const config = { ...raw }
  const providerIdMap = new Map<string, string>()
  const existingIds: string[] = []

  const providers = (config.providers as Array<Record<string, unknown>>) || []
  const roleConfigs = (config.roleConfigs as Array<Record<string, unknown>>) || []

  // Phase 1: Normalize all provider IDs
  for (const p of providers) {
    const oldId = (p.id as string) || ""
    const stableId = generateStableProviderId(p as any, existingIds)

    if (oldId !== stableId) {
      providerIdMap.set(oldId, stableId)
      p.id = stableId
      actions.push({
        type: "provider_id_normalized",
        description: `Provider "${p.name}": ${oldId.slice(0, 8)}… → ${stableId}`,
        details: { oldId, newId: stableId, providerName: p.name as string },
      })
      logMigration(`  Normalized provider "${p.name}": ${oldId.slice(0, 8)}… → ${stableId}`)
    }
    existingIds.push(stableId)
  }

  // Phase 2: Repair role configs that reference old provider IDs
  for (const r of roleConfigs) {
    const oldRef = (r.providerId as string) || ""
    if (oldRef && providerIdMap.has(oldRef)) {
      const newRef = providerIdMap.get(oldRef)!
      r.providerId = newRef
      actions.push({
        type: "role_ref_repaired",
        description: `Role "${r.name}": provider reference repaired`,
        details: { roleId: r.id as string, roleName: r.name as string, oldProviderId: oldRef, newProviderId: newRef },
      })
      logMigration(`  Repaired role "${r.name}": provider ref ${oldRef.slice(0, 8)}… → ${newRef}`)
    }

    // Detect orphaned references (providerId set but no matching provider exists)
    if ((r.providerId as string) && !existingIds.includes(r.providerId as string)) {
      const providerExists = providers.some((p) => p.id === r.providerId)
      if (!providerExists) {
        actions.push({
          type: "orphan_detected",
          description: `Role "${r.name}" references missing provider "${r.providerId}"`,
          details: { roleId: r.id as string, roleName: r.name as string, providerId: r.providerId as string },
        })
        warnMigration(`  Orphan detected: role "${r.name}" → provider "${r.providerId}" not found`)
      }
    }
  }

  // Phase 3: Detect unresolved provider references (non-existent model IDs)
  for (const r of roleConfigs) {
    if (!r.providerId || !r.model) continue
    const provider = providers.find((p) => p.id === r.providerId)
    if (provider) {
      const models = (provider.models as Array<Record<string, unknown>>) || []
      const modelExists = models.some((m) => m.id === r.model)
      if (!modelExists && r.model) {
        actions.push({
          type: "model_reconciled",
          description: `Role "${r.name}": model "${r.model}" not found on provider "${provider.name}"`,
          details: {
            roleId: r.id as string,
            roleName: r.name as string,
            providerId: r.providerId as string,
            modelId: r.model as string,
          },
        })
        warnMigration(`  Stale model: role "${r.name}" → model "${r.model}" not on provider "${(provider.name as string) || r.providerId}"`)
      }
    }
  }

  // Phase 4: Check legacy apiKey format (no change needed, but log for audit)
  for (const p of providers) {
    const key = (p.apiKey as string) || ""
    if (key && key.length > 0) {
      actions.push({
        type: "api_key_migrated",
        description: `Provider "${p.name}": apiKey preserved (${key.slice(0, 4)}…${key.slice(-4)})`,
        details: { providerId: p.id as string, providerName: p.name as string, keyLength: key.length },
      })
    }
  }

  config.version = 1
  config.migratedAt = new Date().toISOString()

  logMigration(`v0 → v1 complete: ${actions.length} actions, ${errors.length} errors`)
  return { config, actions, errors }
}

export function runMigrations(raw: Record<string, unknown>): MigrationResult {
  const version = (raw.version as number) || 0
  const errors: string[] = []
  let allActions: MigrationAction[] = []
  let config = { ...raw }

  if (version >= CURRENT_CONFIG_VERSION) {
    logMigration(`Config already at version ${version}, no migration needed`)
    return {
      migrated: false,
      log: null,
      config: null,
    }
  }

  logMigration(`Migration required: ${version} → ${CURRENT_CONFIG_VERSION}`)

  try {
    if (version < 1) {
      const result = migrateV0ToV1(config)
      config = result.config
      allActions = [...allActions, ...result.actions]
      errors.push(...result.errors)
    }

    config.version = CURRENT_CONFIG_VERSION

    return {
      migrated: allActions.length > 0,
      log: {
        fromVersion: version,
        toVersion: CURRENT_CONFIG_VERSION,
        timestamp: new Date().toISOString(),
        actions: allActions,
        errors,
      },
      config,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errorMigration("Migration failed:", msg)
    errors.push(msg)
    return {
      migrated: false,
      log: {
        fromVersion: version,
        toVersion: CURRENT_CONFIG_VERSION,
        timestamp: new Date().toISOString(),
        actions: allActions,
        errors,
      },
      config: raw,
    }
  }
}
