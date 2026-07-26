interface EditEvent {
  filePath: string
  timestamp: number
  sessionId: string
}

interface CoOccurrence {
  fileA: string
  fileB: string
  count: number
}

interface Transition {
  fromFile: string
  toFile: string
  count: number
}

const MAX_EVENTS = 2000
const CO_OCCURRENCE_WINDOW_MS = 300000
const STORAGE_KEY = "aos-edit-prediction"
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const DECAY_FACTOR = 0.95

class EditPredictionStore {
  private events: EditEvent[] = []
  private coOccurrences = new Map<string, CoOccurrence>()
  private transitions = new Map<string, Transition>()

  constructor() {
    this.load()
  }

  recordEdit(filePath: string, sessionId: string): void {
    const now = Date.now()
    const lastEvent = this.events.length > 0 ? this.events[this.events.length - 1] : null

    this.events.push({ filePath, timestamp: now, sessionId })

    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS)
    }

    const recentInSession = this.events.filter(
      (e) => e.sessionId === sessionId && e.filePath !== filePath
        && (now - e.timestamp) < CO_OCCURRENCE_WINDOW_MS,
    )

    const seenPairs = new Set<string>()
    for (const other of recentInSession) {
      const [a, b] = [filePath, other.filePath].sort()
      const key = `${a}||${b}`
      if (!seenPairs.has(key)) {
        seenPairs.add(key)
        const existing = this.coOccurrences.get(key)
        if (existing) {
          existing.count++
        } else {
          this.coOccurrences.set(key, { fileA: a, fileB: b, count: 1 })
        }
      }
    }

    if (lastEvent && lastEvent.filePath !== filePath && lastEvent.sessionId === sessionId) {
      const transitionKey = `${lastEvent.filePath}||${filePath}`
      const existingTransition = this.transitions.get(transitionKey)
      if (existingTransition) {
        existingTransition.count++
      } else {
        this.transitions.set(transitionKey, {
          fromFile: lastEvent.filePath,
          toFile: filePath,
          count: 1,
        })
      }
    }

    this.prune()
    this.save()
  }

  getPredictions(filePath: string, limit = 3): Array<{ filePath: string; confidence: number }> {
    this.applyDecay()

    const transitionScores = new Map<string, number>()
    const totalTransitions = this.transitions.size

    for (const [, trans] of this.transitions) {
      if (trans.fromFile === filePath) {
        const score = trans.count / Math.max(totalTransitions, 1)
        transitionScores.set(trans.toFile, (transitionScores.get(trans.toFile) ?? 0) + score)
      }
    }

    const related: Array<{ filePath: string; totalCount: number }> = []
    for (const [, occ] of this.coOccurrences) {
      if (occ.fileA === filePath) {
        related.push({ filePath: occ.fileB, totalCount: occ.count })
      } else if (occ.fileB === filePath) {
        related.push({ filePath: occ.fileA, totalCount: occ.count })
      }
    }

    const coOccurrenceTotal = related.reduce((sum, r) => sum + r.totalCount, 0)

    const scored = new Map<string, number>()
    for (const r of related) {
      const coScore = coOccurrenceTotal > 0 ? r.totalCount / coOccurrenceTotal : 0
      const transScore = transitionScores.get(r.filePath) ?? 0
      const combined = (coScore * 0.4) + (transScore * 0.6)
      scored.set(r.filePath, combined)
    }

    for (const [path, score] of transitionScores) {
      if (!scored.has(path)) {
        scored.set(path, score * 0.6)
      }
    }

    const sorted = Array.from(scored.entries())
      .sort((a, b) => b[1] - a[1])

    return sorted.slice(0, limit).map(([filePath, score]) => ({
      filePath,
      confidence: Math.min(score, 1),
    }))
  }

  clear(): void {
    this.events = []
    this.coOccurrences.clear()
    this.transitions.clear()
    this.save()
  }

  private prune(): void {
    const cutoff = Date.now() - MAX_AGE_MS
    this.events = this.events.filter((e) => e.timestamp > cutoff)
  }

  private applyDecay(): void {
    const now = Date.now()
    let decayed = false
    for (const [, occ] of this.coOccurrences) {
      const age = now - (this.events.find(e => e.filePath === occ.fileA || e.filePath === occ.fileB)?.timestamp ?? now)
      if (age > 24 * 60 * 60 * 1000 && occ.count > 1) {
        occ.count = Math.max(1, Math.round(occ.count * DECAY_FACTOR))
        decayed = true
      }
    }
    if (decayed) this.save()
  }

  private save(): void {
    try {
      const data = {
        events: this.events.slice(-500),
        coOccurrences: Array.from(this.coOccurrences.entries()).slice(0, 2000),
        transitions: Array.from(this.transitions.entries()).slice(0, 2000),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // storage quota exceeded, silently skip
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as {
        events: EditEvent[]
        coOccurrences: [string, CoOccurrence][]
        transitions: [string, Transition][]
      }
      this.events = data.events ?? []
      this.coOccurrences = new Map(data.coOccurrences ?? [])
      this.transitions = new Map(data.transitions ?? [])
    } catch {
      this.events = []
      this.coOccurrences.clear()
      this.transitions.clear()
    }
  }
}

export const editPredictionStore = new EditPredictionStore()
export type { EditEvent, CoOccurrence, Transition }
