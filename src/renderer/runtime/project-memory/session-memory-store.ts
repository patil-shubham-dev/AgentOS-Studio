/**
 * Session Memory Store — zustand store for structured session memory.
 * Adapted from Claude Code's session memory template with sections for
 * title, current state, task spec, files, workflow, errors, learnings, results, worklog.
 */

import { create } from "zustand"
import { createEmptySessionMemory, type SessionMemory } from "./memory-types"

interface SessionMemoryStore {
  sessions: Map<string, SessionMemory>
  activeSessionId: string | null

  // Session management
  createSession: (sessionId: string) => void
  setActiveSession: (sessionId: string) => void
  closeSession: (sessionId: string) => void

  // Field updaters
  updateTitle: (title: string) => void
  updateCurrentState: (state: string) => void
  updateTaskSpec: (spec: string) => void
  updateFiles: (files: string) => void
  updateWorkflow: (workflow: string) => void
  addError: (error: string) => void
  addLearning: (learning: string) => void
  updateKeyResults: (results: string) => void
  addWorklogEntry: (entry: string) => void

  // Serialization
  getActiveSessionMemory: () => SessionMemory | null
  toPromptBlock: () => string
}

export const useSessionMemoryStore = create<SessionMemoryStore>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,

  createSession: (sessionId) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      newSessions.set(sessionId, createEmptySessionMemory(sessionId))
      return { sessions: newSessions, activeSessionId: sessionId }
    })
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
  },

  closeSession: (sessionId) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      newSessions.delete(sessionId)
      const newActive = state.activeSessionId === sessionId ? null : state.activeSessionId
      return { sessions: newSessions, activeSessionId: newActive }
    })
  },

  updateTitle: (title) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions.get(activeSessionId)
    if (!session) return
    const updated = { ...session, title, updatedAt: Date.now() }
    const newSessions = new Map(sessions)
    newSessions.set(activeSessionId, updated)
    set({ sessions: newSessions })
  },

  updateCurrentState: (currentState) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions.get(activeSessionId)
    if (!session) return
    const updated = { ...session, currentState, updatedAt: Date.now() }
    const newSessions = new Map(sessions)
    newSessions.set(activeSessionId, updated)
    set({ sessions: newSessions })
  },

  updateTaskSpec: (taskSpecification) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions.get(activeSessionId)
    if (!session) return
    const updated = { ...session, taskSpecification, updatedAt: Date.now() }
    const newSessions = new Map(sessions)
    newSessions.set(activeSessionId, updated)
    set({ sessions: newSessions })
  },

  updateFiles: (filesAndFunctions) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions.get(activeSessionId)
    if (!session) return
    const updated = { ...session, filesAndFunctions, updatedAt: Date.now() }
    const newSessions = new Map(sessions)
    newSessions.set(activeSessionId, updated)
    set({ sessions: newSessions })
  },

  updateWorkflow: (workflow) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions.get(activeSessionId)
    if (!session) return
    const updated = { ...session, workflow, updatedAt: Date.now() }
    const newSessions = new Map(sessions)
    newSessions.set(activeSessionId, updated)
    set({ sessions: newSessions })
  },

  addError: (error) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions.get(activeSessionId)
    if (!session) return
    const errors = session.errorsAndCorrections
      ? `${session.errorsAndCorrections}\n- ${error}`
      : `- ${error}`
    const updated = { ...session, errorsAndCorrections: errors, updatedAt: Date.now() }
    const newSessions = new Map(sessions)
    newSessions.set(activeSessionId, updated)
    set({ sessions: newSessions })
  },

  addLearning: (learning) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions.get(activeSessionId)
    if (!session) return
    const learnings = session.learnings
      ? `${session.learnings}\n- ${learning}`
      : `- ${learning}`
    const updated = { ...session, learnings, updatedAt: Date.now() }
    const newSessions = new Map(sessions)
    newSessions.set(activeSessionId, updated)
    set({ sessions: newSessions })
  },

  updateKeyResults: (keyResults) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions.get(activeSessionId)
    if (!session) return
    const updated = { ...session, keyResults, updatedAt: Date.now() }
    const newSessions = new Map(sessions)
    newSessions.set(activeSessionId, updated)
    set({ sessions: newSessions })
  },

  addWorklogEntry: (entry) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions.get(activeSessionId)
    if (!session) return
    const timestamp = new Date().toISOString().slice(11, 19)
    const worklog = session.worklog
      ? `${session.worklog}\n[${timestamp}] ${entry}`
      : `[${timestamp}] ${entry}`
    const updated = { ...session, worklog, updatedAt: Date.now() }
    const newSessions = new Map(sessions)
    newSessions.set(activeSessionId, updated)
    set({ sessions: newSessions })
  },

  getActiveSessionMemory: () => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return null
    return sessions.get(activeSessionId) ?? null
  },

  toPromptBlock: () => {
    const session = get().getActiveSessionMemory()
    if (!session || !session.title) return ""

    const sections: string[] = []
    if (session.title) sections.push(`# Session: ${session.title}`)
    if (session.currentState && session.currentState !== "Initializing...") sections.push(`\n## Current State\n${session.currentState}`)
    if (session.taskSpecification) sections.push(`\n## Task\n${session.taskSpecification}`)
    if (session.filesAndFunctions) sections.push(`\n## Files\n${session.filesAndFunctions}`)
    if (session.worklog) sections.push(`\n## Progress\n${session.worklog}`)
    if (session.errorsAndCorrections) sections.push(`\n## Errors\n${session.errorsAndCorrections}`)
    if (session.learnings) sections.push(`\n## Learnings\n${session.learnings}`)

    return sections.join("\n")
  },
}))
