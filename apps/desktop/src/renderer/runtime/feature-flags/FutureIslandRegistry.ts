import { isFeatureEnabled } from '@/app/feature-flags'
import type { RuntimeFeatureFlag } from '@/app/feature-flags'

export type FutureIslandId = 'browser' | 'design' | 'device-control'

export type FutureIslandStatus = 'placeholder' | 'disabled' | 'enabled'

export interface FutureIslandModule {
  id: FutureIslandId
  label: string
  status: FutureIslandStatus
  route: string
  initialize?: () => Promise<void>
  shutdown?: () => Promise<void>
}

interface IslandDefinition {
  id: FutureIslandId
  label: string
  route: string
  enabledFlag: RuntimeFeatureFlag
}

const ISLAND_DEFINITIONS: IslandDefinition[] = [
  {
    id: 'browser',
    label: 'Browser Automation',
    route: '/future/browser',
    enabledFlag: 'browserIsland',
  },
  {
    id: 'design',
    label: 'Design Studio',
    route: '/future/design',
    enabledFlag: 'designIsland',
  },
  {
    id: 'device-control',
    label: 'Device Control',
    route: '/future/device-control',
    enabledFlag: 'deviceControlIsland',
  },
]

function resolveStatus(def: IslandDefinition): FutureIslandStatus {
  if (isFeatureEnabled(def.enabledFlag)) {
    return 'enabled'
  }
  return 'placeholder'
}

export class FutureIslandRegistry {
  private islands: Map<FutureIslandId, FutureIslandModule>

  constructor() {
    this.islands = new Map()
    for (const def of ISLAND_DEFINITIONS) {
      this.islands.set(def.id, {
        id: def.id,
        label: def.label,
        status: resolveStatus(def),
        route: def.route,
      })
    }
  }

  get(id: FutureIslandId): FutureIslandModule | undefined {
    return this.islands.get(id)
  }

  getAll(): FutureIslandModule[] {
    return Array.from(this.islands.values())
  }

  getEnabled(): FutureIslandModule[] {
    return this.getAll().filter((i) => i.status === 'enabled')
  }

  getPlaceholder(): FutureIslandModule[] {
    return this.getAll().filter((i) => i.status === 'placeholder')
  }

  getDisabled(): FutureIslandModule[] {
    return this.getAll().filter((i) => i.status === 'disabled')
  }

  isEnabled(id: FutureIslandId): boolean {
    return this.islands.get(id)?.status === 'enabled'
  }

  isPlaceholder(id: FutureIslandId): boolean {
    return this.islands.get(id)?.status === 'placeholder'
  }

  hasActiveRuntime(): boolean {
    return this.getAll().some((i) => i.status === 'enabled')
  }

  refresh(): void {
    for (const def of ISLAND_DEFINITIONS) {
      const existing = this.islands.get(def.id)
      if (existing) {
        existing.status = resolveStatus(def)
      }
    }
  }
}
