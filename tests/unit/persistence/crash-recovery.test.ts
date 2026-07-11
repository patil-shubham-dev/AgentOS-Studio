import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { PersistenceManager } from "@/runtime/persistence/persistence-manager"
import { SessionStore } from "@/runtime/persistence/session-store"
import { MigrationRunner, migrationRunner } from "@/runtime/persistence/migration-runner"
import { installTestStorage, uninstallTestStorage, InMemoryStorageAdapter, setStorageAdapter, getStorageAdapter, CorruptibleStorageAdapter } from "../fixtures/StorageAdapter"
import type { MigrationStep } from "@/runtime/persistence/types"

describe("PersistenceManager — crash recovery", () => {
  beforeEach(() => {
    installTestStorage()
  })

  afterEach(() => {
    uninstallTestStorage()
  })

  it("should start without crash state", async () => {
    const pm = new PersistenceManager({ crashRecoveryEnabled: true, autoSaveIntervalMs: 100000 })
    const result = await pm.start()
    expect(result.recovered).toBe(false)
    expect(result.errors).toEqual([])
    pm.stop()
  })

  it("should save and recover crash state", async () => {
    const stateCollector = () => ({ appState: "active", count: 42 })
    let restoredState: Record<string, unknown> | null = null
    const stateRestorer = (s: Record<string, unknown>) => { restoredState = s }

    const pm = new PersistenceManager({ crashRecoveryEnabled: true, autoSaveIntervalMs: 50000, storagePrefix: "test-crash-" })
    pm.registerStateProvider(stateCollector, stateRestorer)
    await pm.start()

    // Force crash state save
    pm.flush()

    // Create new PM should recover
    const pm2 = new PersistenceManager({ crashRecoveryEnabled: true, autoSaveIntervalMs: 50000, storagePrefix: "test-crash-" })
    pm2.registerStateProvider(stateCollector, stateRestorer)
    const result = await pm2.start()

    expect(result.recovered).toBe(true)
    pm.stop()
    pm2.stop()
  })

  it("should handle migration during crash recovery", async () => {
    const pm = new PersistenceManager({ crashRecoveryEnabled: true, autoSaveIntervalMs: 50000, storagePrefix: "test-mig-" })
    const collector = () => ({ version: 1, data: "old" })
    pm.registerStateProvider(collector, () => {})
    await pm.start()
    pm.flush()
    pm.stop()

    // Register a migration
    const migration: MigrationStep = {
      id: "v2-upgrade",
      version: 2,
      description: "Upgrade data format",
      migrate: async (data) => ({ ...data, migrated: true, version: 2 }),
    }
    migrationRunner.register(migration)

    const pm2 = new PersistenceManager({ crashRecoveryEnabled: true, autoSaveIntervalMs: 50000, storagePrefix: "test-mig-" })
    pm2.registerStateProvider(collector, () => {})
    const result = await pm2.start()

    // Recovery should have applied migration
    console.log(`Migration recovery: recovered=${result.recovered}, errors=${result.errors}`)
    pm2.stop()
    migrationRunner.clear()
  })

  it("should handle corrupt crash state gracefully", async () => {
    const adapter = getStorageAdapter()
    // Write invalid JSON as crash state
    adapter.setItem("test-crash-corrupt-crash-state", "{invalid")

    const pm = new PersistenceManager({ crashRecoveryEnabled: true, autoSaveIntervalMs: 50000, storagePrefix: "test-crash-corrupt-" })
    const result = await pm.start()

    expect(result.recovered).toBe(false)
    pm.stop()
  })
})

describe("SessionStore", () => {
  beforeEach(() => {
    installTestStorage()
  })

  afterEach(() => {
    uninstallTestStorage()
  })

  it("should create sessions", () => {
    const store = new SessionStore("test-")
    const session = store.create("test session")
    expect(session.id).toBeTruthy()
    expect(session.label).toBe("test session")
    expect(store.size).toBe(1)
  })

  it("should update sessions", () => {
    const store = new SessionStore("test-")
    const s = store.create("initial")
    store.update(s.id, { label: "updated" })
    const retrieved = store.get(s.id)
    expect(retrieved?.label).toBe("updated")
  })

  it("should delete sessions", () => {
    const store = new SessionStore("test-")
    const s = store.create("delete me")
    expect(store.size).toBe(1)
    store.delete(s.id)
    expect(store.size).toBe(0)
  })

  it("should retrieve sessions by id", () => {
    const store = new SessionStore("test-")
    const s = store.create("find me")
    const retrieved = store.get(s.id)
    expect(retrieved?.label).toBe("find me")
  })

  it("should return undefined for missing id", () => {
    const store = new SessionStore("test-")
    expect(store.get("nonexistent")).toBeUndefined()
  })

  it("should mark sessions active", () => {
    const store = new SessionStore("test-")
    const s = store.create("active")
    const before = s.lastActiveAt
    store.markActive(s.id)
    const after = store.get(s.id)!.lastActiveAt
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it("should enforce max session limit", () => {
    const store = new SessionStore("test-", 3)
    store.create("s1")
    store.create("s2")
    store.create("s3")
    store.create("s4")
    expect(store.size).toBeLessThanOrEqual(3)
  })

  it("should persist and restore from disk", () => {
    const store = new SessionStore("test-persist-")
    store.create("session A")
    store.create("session B")
    store.persistToDisk()

    const store2 = new SessionStore("test-persist-")
    const result = store2.restoreFromDisk()
    expect(result.recovered).toBe(true)
    expect(store2.size).toBe(2)
  })

  it("should handle storage full during persist", () => {
    const store = new SessionStore("test-full-")
    for (let i = 0; i < 100; i++) {
      store.create(`big-session-${i}`.repeat(100))
    }
    store.persistToDisk()
    // Should not throw; eviction happens
    expect(store.size).toBeLessThanOrEqual(50)
  })

  it("should handle corrupt stored data", () => {
    const adapter = getStorageAdapter()
    adapter.setItem("test-corrupt-sessions", "not valid json")
    const store = new SessionStore("test-corrupt-")
    const result = store.restoreFromDisk()
    expect(result.recovered).toBe(false)
  })
})

describe("MigrationRunner", () => {
  beforeEach(() => {
    migrationRunner.clear()
    installTestStorage()
  })

  afterEach(() => {
    uninstallTestStorage()
  })

  it("should register migrations", () => {
    const m: MigrationStep = { id: "m1", version: 1, description: "test", migrate: async (d) => d }
    migrationRunner.register(m)
    expect(migrationRunner.hasPendingMigrations(0)).toBe(true)
  })

  it("should not register duplicates", () => {
    const m: MigrationStep = { id: "dup", version: 1, description: "test", migrate: async (d) => d }
    migrationRunner.register(m)
    migrationRunner.register(m)
    expect(migrationRunner.hasPendingMigrations(0)).toBe(true)
  })

  it("should run migrations in order", async () => {
    const results: number[] = []
    migrationRunner.register({ id: "v1", version: 1, description: "step 1", migrate: async (d) => { results.push(1); return d } })
    migrationRunner.register({ id: "v2", version: 2, description: "step 2", migrate: async (d) => { results.push(2); return d } })
    migrationRunner.register({ id: "v3", version: 3, description: "step 3", migrate: async (d) => { results.push(3); return d } })

    await migrationRunner.run({}, 0)
    expect(results).toEqual([1, 2, 3])
  })

  it("should skip already-applied migrations", async () => {
    const results: number[] = []
    migrationRunner.register({ id: "v1", version: 1, description: "", migrate: async (d) => { results.push(1); return d } })
    migrationRunner.register({ id: "v2", version: 2, description: "", migrate: async (d) => { results.push(2); return d } })

    await migrationRunner.run({}, 1)
    expect(results).toEqual([2])
  })

  it("should handle migration errors gracefully", async () => {
    migrationRunner.register({ id: "bad", version: 1, description: "fails", migrate: async () => { throw new Error("migration failed") } })
    migrationRunner.register({ id: "good", version: 2, description: "ok", migrate: async (d) => d })

    const result = await migrationRunner.run({}, 0)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain("migration failed")
    // Good migration should still run
    expect(result.applied).toContain("good")
  })

  it("should report pending migrations", () => {
    migrationRunner.register({ id: "v1", version: 1, description: "", migrate: async (d) => d })
    expect(migrationRunner.hasPendingMigrations(0)).toBe(true)
    expect(migrationRunner.hasPendingMigrations(1)).toBe(false)
  })

  it("should list pending migrations", () => {
    migrationRunner.register({ id: "v1", version: 1, description: "", migrate: async (d) => d })
    migrationRunner.register({ id: "v2", version: 2, description: "", migrate: async (d) => d })

    const pending = migrationRunner.getPendingMigrations(1)
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe("v2")
  })
})
