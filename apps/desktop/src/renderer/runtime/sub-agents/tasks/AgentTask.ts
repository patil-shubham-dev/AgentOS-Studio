export type TaskStatus = 'created' | 'queued' | 'running' | 'completed' | 'failed' | 'killed'

export interface TaskMetadata {
  id: string
  type: string
  status: TaskStatus
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
  progress: TaskProgress
}

export interface TaskProgress {
  toolUseCount: number
  tokenCount: number
  recentActivities: string[]
}

export abstract class AgentTask {
  readonly id: string
  readonly type: string
  protected _status: TaskStatus = 'created'
  protected _progress: TaskProgress = { toolUseCount: 0, tokenCount: 0, recentActivities: [] }
  protected _error?: string
  protected _createdAt = Date.now()
  protected _startedAt?: number
  protected _completedAt?: number

  constructor(id: string, type: string) {
    this.id = id
    this.type = type
  }

  get status(): TaskStatus { return this._status }
  get progress(): TaskProgress { return this._progress }
  get error(): string | undefined { return this._error }

  get metadata(): TaskMetadata {
    return {
      id: this.id,
      type: this.type,
      status: this._status,
      createdAt: this._createdAt,
      startedAt: this._startedAt,
      completedAt: this._completedAt,
      error: this._error,
      progress: { ...this._progress },
    }
  }

  protected setStatus(status: TaskStatus): void {
    this._status = status
    if (status === 'running') this._startedAt = Date.now()
    if (status === 'completed' || status === 'failed' || status === 'killed') this._completedAt = Date.now()
  }

  protected addActivity(activity: string): void {
    this._progress.recentActivities.push(activity)
    if (this._progress.recentActivities.length > 50) this._progress.recentActivities.shift()
  }

  abstract run(): Promise<TaskMetadata>
  kill(): void {
    if (this._status === 'running') {
      this.setStatus('killed')
    }
  }
}
