import { create } from 'zustand'
import type { Persona } from '@/lib/personas/PersonaTypes'
import { NO_STYLE_PERSONA } from '@/lib/personas/PersonaTypes'

const PERSIST_KEY = 'agentic-active-persona'

function loadPersistedPersonaId(): string {
  try {
    return localStorage.getItem(PERSIST_KEY) ?? 'none'
  } catch {
    return 'none'
  }
}

function persistPersonaId(id: string): void {
  try {
    localStorage.setItem(PERSIST_KEY, id)
  } catch {
    // localStorage may not be available
  }
}

interface PersonaStoreState {
  /** All available personas (loaded from filesystem) */
  availablePersonas: Persona[]
  /** Currently active persona */
  activePersona: Persona
  /** Whether personas are still being loaded */
  loading: boolean

  setAvailablePersonas: (personas: Persona[]) => void
  setActivePersona: (persona: Persona) => void
  setActivePersonaById: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const usePersonaStore = create<PersonaStoreState>((set, get) => ({
  availablePersonas: [],
  activePersona: NO_STYLE_PERSONA,
  loading: true,

  setAvailablePersonas: (personas) =>
    set({
      availablePersonas: personas,
      loading: false,
      // Re-activate persisted persona if available in the new list
      activePersona: (() => {
        const persistedId = loadPersistedPersonaId()
        if (persistedId !== 'none') {
          const found = personas.find((p) => p.id === persistedId)
          if (found) return found
        }
        return get().activePersona
      })(),
    }),

  setActivePersona: (persona) => {
    persistPersonaId(persona.id)
    set({ activePersona: persona })
  },

  setActivePersonaById: (id) => {
    const persona = get().availablePersonas.find((p) => p.id === id) ?? NO_STYLE_PERSONA
    persistPersonaId(persona.id)
    set({ activePersona: persona })
  },

  setLoading: (loading) => set({ loading }),
}))
