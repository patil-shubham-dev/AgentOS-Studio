import { AgentTask } from './AgentTask'
import { LocalAgentTask, type LocalAgentTaskConfig } from './LocalAgentTask'
import { LocalShellTask, type LocalShellTaskConfig } from './LocalShellTask'
import { TaskOutputManager } from './TaskOutputManager'

type TaskConstructor = new (id: string, config: any) => AgentTask

export class TaskRegistry {
  private static constructors = new Map<string, TaskConstructor>()

  static register(type: string, ctor: TaskConstructor): void {
    this.constructors.set(type, ctor)
  }

  static create(type: 'agent' | 'local_agent', config: LocalAgentTaskConfig): AgentTask
  static create(type: 'shell' | 'local_shell', config: LocalShellTaskConfig): AgentTask
  static create(type: string, config: unknown): AgentTask {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    switch (type) {
      case 'agent':
      case 'local_agent':
        return new LocalAgentTask(id, config as LocalAgentTaskConfig)
      case 'shell':
      case 'local_shell':
        return new LocalShellTask(id, config as LocalShellTaskConfig)
      default: {
        const ctor = this.constructors.get(type)
        if (!ctor) throw new Error(`Unknown task type: ${type}`)
        return new ctor(id, config)
      }
    }
  }
}

export function initializeTaskSystem(): void {
  const outputManager = TaskOutputManager.getInstance()
  outputManager.initialize().catch(() => {})
}
