export type StartupPhase = 'booting' | 'ready' | 'error'
export type ServiceStatus = 'pending' | 'loading' | 'ready' | 'failed' | 'skipped'

export interface ServiceState {
  name: string
  status: ServiceStatus
  error?: string
  duration?: number
  updatedAt: number
}

type Listener = () => void

let _phase: StartupPhase = 'booting'
let _phaseError: string | null = null
let _services: ServiceState[] = []
let _listeners: Listener[] = []

function notify() {
  _listeners.forEach(l => l())
}

export const StartupStore = {
  getPhase: (): StartupPhase => _phase,
  getError: (): string | null => _phaseError,

  setPhase(phase: StartupPhase, error?: string) {
    _phase = phase
    _phaseError = error ?? null
    notify()
  },

  getServices: (): ServiceState[] => _services,

  updateService(name: string, status: ServiceStatus, error?: string, duration?: number) {
    const now = Date.now()
    const existing = _services.find(s => s.name === name)
    if (existing) {
      existing.status = status
      existing.updatedAt = now
      if (error !== undefined) existing.error = error
      if (duration !== undefined) existing.duration = duration
    } else {
      _services.push({ name, status, error, duration, updatedAt: now })
    }
    notify()
  },

  getFailedServices(): ServiceState[] {
    return _services.filter(s => s.status === 'failed')
  },

  getLoadingServices(): ServiceState[] {
    return _services.filter(s => s.status === 'loading')
  },

  getReadyServices(): ServiceState[] {
    return _services.filter(s => s.status === 'ready')
  },

  subscribe(listener: Listener): () => void {
    _listeners.push(listener)
    return () => {
      _listeners = _listeners.filter(l => l !== listener)
    }
  },

  reset() {
    _phase = 'booting'
    _phaseError = null
    _services = []
  }
}
