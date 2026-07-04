import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
  createdAt: number
  updatedAt: number
}

interface TodoSession {
  items: TodoItem[]
  title: string
}

let currentSession: TodoSession = { items: [], title: '' }

export const TodoWriteTool: AgentTool = buildTool({
  name: 'todowrite',
  aliases: ['todo', 'tasklist', 'plan'],
  description: 'Create and maintain a structured task list. Use this to plan multi-step work, track progress, and organize complex tasks. Tracks status (pending/in_progress/completed/cancelled) and priority.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title for the task list' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Description of the task' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: 'Current status' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priority level' },
          },
          required: ['content'],
        },
        description: 'List of tasks to track',
      },
      action: {
        type: 'string',
        enum: ['create', 'update', 'complete', 'cancel', 'list'],
        description: 'Action to perform on the task list',
      },
      item_id: { type: 'string', description: 'Item ID to update (for update/complete/cancel actions)' },
      update: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        description: 'Fields to update on the specified item',
      },
    },
    required: ['action'],
  },
  promptCategory: 'core',
  promptPriority: 85,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.TASK_MANAGEMENT],
  getActivityDescription: (input) => {
    const action = (input as any)?.action
    if (action === 'create') return 'Creating task list'
    if (action === 'update') return 'Updating task'
    if (action === 'complete') return 'Completing task'
    if (action === 'cancel') return 'Cancelling task'
    return 'Managing tasks'
  },
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(input.action ?? '')
    const title = input.title as string | undefined
    const items = input.items as Array<{ content: string; status?: string; priority?: string }> | undefined
    const itemId = input.item_id as string | undefined
    const update = input.update as { status?: string; priority?: string } | undefined

    switch (action) {
      case 'create': {
        if (!items || items.length === 0) {
          return { data: null, error: 'items array is required for create action', isError: true }
        }
        const now = Date.now()
        const todoItems: TodoItem[] = items.map((item) => ({
          id: crypto.randomUUID?.() ?? `todo_${now}_${Math.random().toString(36).slice(2, 8)}`,
          content: item.content,
          status: (item.status as TodoItem['status']) ?? 'pending',
          priority: (item.priority as TodoItem['priority']) ?? 'medium',
          createdAt: now,
          updatedAt: now,
        }))
        currentSession = {
          items: [...currentSession.items, ...todoItems],
          title: title ?? currentSession.title,
        }

        let resultText = `## ${title || 'Task List'}\n\n`
        for (const item of todoItems) {
          const statusIcon = item.status === 'completed' ? '[x]' : item.status === 'in_progress' ? '[*]' : item.status === 'cancelled' ? '[-]' : '[ ]'
          const priorityLabel = item.priority === 'high' ? '!!' : item.priority === 'medium' ? '!' : ''
          resultText += `${statusIcon} ${priorityLabel} ${item.content} (id: ${item.id.slice(0, 8)})\n`
        }

        return {
          data: { items: todoItems, session: currentSession },
          meta: { type: 'todo_list', items: todoItems, session: currentSession },
          newMessages: [{ role: 'user', content: resultText }],
        }
      }

      case 'update': {
        if (!itemId) return { data: null, error: 'item_id is required for update action', isError: true }
        const idx = currentSession.items.findIndex((i) => i.id === itemId || i.id.startsWith(itemId))
        if (idx === -1) return { data: null, error: `Item with id "${itemId}" not found`, isError: true }

        if (update?.status) currentSession.items[idx].status = update.status as TodoItem['status']
        if (update?.priority) currentSession.items[idx].priority = update.priority as TodoItem['priority']
        currentSession.items[idx].updatedAt = Date.now()

        return {
          data: { item: currentSession.items[idx], session: currentSession },
          meta: { type: 'todo_update', item: currentSession.items[idx] },
        }
      }

      case 'complete': {
        if (!itemId) {
          const now = Date.now()
          currentSession.items = currentSession.items.map((i) =>
            i.status === 'in_progress' ? { ...i, status: 'completed' as const, updatedAt: now } : i,
          )
        } else {
          const idx = currentSession.items.findIndex((i) => i.id === itemId || i.id.startsWith(itemId))
          if (idx === -1) return { data: null, error: `Item with id "${itemId}" not found`, isError: true }
          currentSession.items[idx].status = 'completed'
          currentSession.items[idx].updatedAt = Date.now()
        }
        return {
          data: { session: currentSession },
          meta: { type: 'todo_complete', session: currentSession },
        }
      }

      case 'cancel': {
        if (!itemId) return { data: null, error: 'item_id is required for cancel action', isError: true }
        const idx = currentSession.items.findIndex((i) => i.id === itemId || i.id.startsWith(itemId))
        if (idx === -1) return { data: null, error: `Item with id "${itemId}" not found`, isError: true }
        currentSession.items[idx].status = 'cancelled'
        currentSession.items[idx].updatedAt = Date.now()
        return {
          data: { item: currentSession.items[idx], session: currentSession },
          meta: { type: 'todo_cancel', session: currentSession },
        }
      }

      case 'list': {
        const pending = currentSession.items.filter(i => i.status === 'pending').length
        const inProgress = currentSession.items.filter(i => i.status === 'in_progress').length
        const completed = currentSession.items.filter(i => i.status === 'completed').length
        const cancelled = currentSession.items.filter(i => i.status === 'cancelled').length

        let resultText = `## ${currentSession.title || 'Task List'}\n\n`
        resultText += `**Summary:** ${pending} pending, ${inProgress} in progress, ${completed} completed, ${cancelled} cancelled\n\n`
        for (const item of currentSession.items) {
          const statusIcon = item.status === 'completed' ? '[x]' : item.status === 'in_progress' ? '[*]' : item.status === 'cancelled' ? '[-]' : '[ ]'
          const priorityLabel = item.priority === 'high' ? '!!' : item.priority === 'medium' ? '!' : ''
          resultText += `${statusIcon} ${priorityLabel} ${item.content} (id: ${item.id.slice(0, 8)})\n`
        }

        return {
          data: { session: currentSession, counts: { pending, inProgress, completed, cancelled } },
          meta: { type: 'todo_list', session: currentSession },
        }
      }

      default:
        return { data: null, error: `Unknown action: ${action}. Use: create, update, complete, cancel, list`, isError: true }
    }
  },
})
