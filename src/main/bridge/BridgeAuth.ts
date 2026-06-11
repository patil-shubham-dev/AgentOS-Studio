import { randomBytes, createHmac, timingSafeEqual } from 'crypto'

export interface BridgeToken {
  clientId: string
  role: 'vscode' | 'slack' | 'web' | 'cli'
  issuedAt: number
  expiresAt: number
  permissions: string[]
}

export class BridgeAuth {
  private secret: string
  private tokens = new Map<string, BridgeToken>()
  private readonly TOKEN_TTL_MS = 24 * 60 * 60 * 1000
  private readonly apiKeys = new Map<string, { clientId: string; role: BridgeToken['role'] }>()

  constructor() {
    this.secret = randomBytes(32).toString('hex')
  }

  generateToken(clientId: string, role: BridgeToken['role']): string {
    const now = Date.now()
    const token: BridgeToken = {
      clientId,
      role,
      issuedAt: now,
      expiresAt: now + this.TOKEN_TTL_MS,
      permissions: this.getPermissionsForRole(role),
    }
    const raw = `${token.clientId}:${token.role}:${token.issuedAt}:${token.expiresAt}`
    const sig = createHmac('sha256', this.secret).update(raw).digest('hex')
    const id = `${raw}:${sig}`
    this.tokens.set(id, token)
    return id
  }

  validateToken(tokenStr: string): BridgeToken | null {
    const parts = tokenStr.split(':')
    if (parts.length < 5) return null

    const sig = parts.pop()!
    const raw = parts.join(':')
    const expectedSig = createHmac('sha256', this.secret).update(raw).digest('hex')

    try {
      const match = timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
      if (!match) return null
    } catch {
      return null
    }

    const token = this.tokens.get(tokenStr)
    if (!token) return null
    if (Date.now() > token.expiresAt) {
      this.tokens.delete(tokenStr)
      return null
    }

    return token
  }

  registerApiKey(apiKey: string, clientId: string, role: BridgeToken['role']): void {
    this.apiKeys.set(apiKey, { clientId, role })
  }

  validateApiKey(apiKey: string): BridgeToken | null {
    const entry = this.apiKeys.get(apiKey)
    if (!entry) return null
    return this.generateToken(entry.clientId, entry.role)
  }

  revokeToken(tokenStr: string): void {
    this.tokens.delete(tokenStr)
  }

  private getPermissionsForRole(role: BridgeToken['role']): string[] {
    switch (role) {
      case 'vscode':
        return ['workspace:read', 'workspace:write', 'agent:execute', 'agent:query']
      case 'slack':
        return ['agent:execute', 'agent:query']
      case 'web':
        return ['agent:query']
      case 'cli':
        return ['workspace:read', 'agent:execute', 'agent:query']
    }
  }
}
