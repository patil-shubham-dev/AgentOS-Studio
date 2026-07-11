import type { MigrationStep } from "./types"

export class MigrationRunner {
  private migrations: MigrationStep[] = []

  register(migration: MigrationStep): void {
    if (this.migrations.some((m) => m.id === migration.id)) {
      return
    }
    this.migrations.push(migration)
    this.migrations.sort((a, b) => a.version - b.version)
  }

  registerMany(migrations: MigrationStep[]): void {
    for (const m of migrations) {
      this.register(m)
    }
  }

  async run(
    data: Record<string, unknown>,
    currentVersion: number,
  ): Promise<{
    data: Record<string, unknown>
    version: number
    applied: string[]
    errors: string[]
  }> {
    let version = currentVersion
    const applied: string[] = []
    const errors: string[] = []

    for (const migration of this.migrations) {
      if (migration.version <= version) continue
      try {
        data = await migration.migrate(data)
        version = migration.version
        applied.push(migration.id)
      } catch (err) {
        errors.push(`${migration.id}: ${err}`)
      }
    }

    return { data, version, applied, errors }
  }

  hasPendingMigrations(currentVersion: number): boolean {
    return this.migrations.some((m) => m.version > currentVersion)
  }

  getPendingMigrations(currentVersion: number): MigrationStep[] {
    return this.migrations.filter((m) => m.version > currentVersion)
  }

  clear(): void {
    this.migrations.length = 0
  }
}

const STORAGE_KEY_PREFIX = "agentic-migration-"

export function getStoredSchemaVersion(storagePrefix: string): number {
  try {
    const raw = localStorage.getItem(`${storagePrefix}${STORAGE_KEY_PREFIX}version`)
    return raw ? parseInt(raw, 10) || 0 : 0
  } catch {
    return 0
  }
}

export function setStoredSchemaVersion(storagePrefix: string, version: number): void {
  try {
    localStorage.setItem(`${storagePrefix}${STORAGE_KEY_PREFIX}version`, String(version))
  } catch {
    // storage may be full
  }
}

export const migrationRunner = new MigrationRunner()
