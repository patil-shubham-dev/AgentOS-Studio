export interface Session {
  id: string
  startTime: number
  lastActivity: number
  messages: number
  tokensUsed: number
  toolCalls: number
  metadata: Record<string, unknown>
}

export class SessionManager {
  private static instance: SessionManager
  private sessions: Map<string, Session> = new Map()
  private currentSessionId: string | null = null
  private sessionListeners: Array<(session: Session) => void> = []

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  createSession(metadata?: Record<string, unknown>): Session {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const session: Session = {
      id, startTime: Date.now(), lastActivity: Date.now(),
      messages: 0, tokensUsed: 0, toolCalls: 0, metadata: metadata || {},
    }
    this.sessions.set(id, session)
    this.currentSessionId = id
    for (const l of this.sessionListeners) l(session)
    return session
  }

  getCurrentSession(): Session | undefined {
    if (!this.currentSessionId) return undefined
    return this.sessions.get(this.currentSessionId)
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  recordActivity(): void {
    const session = this.getCurrentSession()
    if (session) session.lastActivity = Date.now()
  }

  recordMessage(): void {
    const session = this.getCurrentSession()
    if (session) { session.messages++; session.lastActivity = Date.now() }
  }

  recordTokenUsage(tokens: number): void {
    const session = this.getCurrentSession()
    if (session) { session.tokensUsed += tokens; session.lastActivity = Date.now() }
  }

  recordToolCall(): void {
    const session = this.getCurrentSession()
    if (session) { session.toolCalls++; session.lastActivity = Date.now() }
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values())
  }

  onSessionCreated(listener: (session: Session) => void): () => void {
    this.sessionListeners.push(listener)
    return () => { this.sessionListeners = this.sessionListeners.filter(l => l !== listener) }
  }

  getSessionDuration(): number {
    const session = this.getCurrentSession()
    if (!session) return 0
    return Date.now() - session.startTime
  }

  getInactiveTime(): number {
    const session = this.getCurrentSession()
    if (!session) return 0
    return Date.now() - session.lastActivity
  }
}
