export type ApprovalRequest = {
  id: string
  toolName: string
  input: unknown
  context: { role: string; mode: string }
  status: 'pending' | 'approved' | 'denied'
  createdAt: number
  resolvedAt?: number
  reason?: string
}

export type ApprovalCallback = (request: ApprovalRequest) => Promise<boolean>

export class ApprovalManager {
  private requests: Map<string, ApprovalRequest> = new Map()
  private pendingCallbacks: Map<string, ApprovalCallback> = new Map()
  private autoApprove: boolean = false

  setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled
  }

  registerCallback(id: string, callback: ApprovalCallback): void {
    this.pendingCallbacks.set(id, callback)
  }

  unregisterCallback(id: string): void {
    this.pendingCallbacks.delete(id)
  }

  async requestApproval(toolName: string, input: unknown, ctx: { role: string; mode: string }): Promise<{ approved: boolean; reason?: string }> {
    if (this.autoApprove) return { approved: true, reason: 'Auto-approved' }

    const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const request: ApprovalRequest = {
      id, toolName, input, context: ctx,
      status: 'pending', createdAt: Date.now(),
    }

    this.requests.set(id, request)

    for (const [, callback] of this.pendingCallbacks) {
      try {
        const approved = await callback(request)
        request.status = approved ? 'approved' : 'denied'
        request.resolvedAt = Date.now()
        return { approved, reason: approved ? undefined : 'Denied by approval callback' }
      } catch {
        continue
      }
    }

    request.status = 'denied'
    request.resolvedAt = Date.now()
    request.reason = 'No approval callbacks registered'
    return { approved: false, reason: 'No approval callbacks registered' }
  }

  resolve(id: string, approved: boolean, reason?: string): boolean {
    const request = this.requests.get(id)
    if (!request || request.status !== 'pending') return false
    request.status = approved ? 'approved' : 'denied'
    request.resolvedAt = Date.now()
    request.reason = reason
    return true
  }

  getPending(): ApprovalRequest[] {
    return [...this.requests.values()].filter(r => r.status === 'pending')
  }

  getHistory(): ApprovalRequest[] {
    return [...this.requests.values()]
  }

  clear(): void {
    this.requests.clear()
  }
}
