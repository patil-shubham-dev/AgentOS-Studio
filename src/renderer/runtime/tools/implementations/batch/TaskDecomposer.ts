export interface Subtask {
  id: string
  name: string
  description: string
  dependencies: string[]
  estimatedComplexity: 'low' | 'medium' | 'high'
}

export interface DecompositionResult {
  taskName: string
  subtasks: Subtask[]
  parallelGroups: Subtask[][]
  warnings: string[]
}

export function decomposeTask(taskDescription: string): DecompositionResult {
  const warnings: string[] = []
  const subtasks: Subtask[] = []
  let taskName = 'Unnamed Task'

  const nameMatch = taskDescription.match(/^#\s+(.+)/m)
  if (nameMatch) {
    taskName = nameMatch[1].trim()
  }

  const lines = taskDescription.split('\n')
  let currentSubtask: Partial<Subtask> | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    const subtaskMatch = line.match(/^[-*]\s*\[?\s*(?:Subtask|Step|Task)\s*(?:\d*)\s*:?\s*\]?\s*(.+)/i)
    if (subtaskMatch) {
      if (currentSubtask && currentSubtask.name && currentSubtask.description) {
        subtasks.push({
          id: currentSubtask.id || `task-${subtasks.length + 1}`,
          name: currentSubtask.name,
          description: currentSubtask.description,
          dependencies: currentSubtask.dependencies || [],
          estimatedComplexity: currentSubtask.estimatedComplexity || 'medium',
        })
      }
      currentSubtask = {
        id: `task-${subtasks.length + 1}`,
        name: subtaskMatch[1].trim().slice(0, 80),
        description: subtaskMatch[1].trim(),
        dependencies: [],
        estimatedComplexity: 'medium',
      }
      continue
    }

    if (currentSubtask) {
      const depMatch = line.match(/depends\s+on\s*:?\s*(.+)/i)
      if (depMatch) {
        currentSubtask.dependencies = depMatch[1].split(/[,;]/).map((d) => d.trim()).filter(Boolean)
        continue
      }

      const complexityMatch = line.match(/complexity\s*:?\s*(low|medium|high)/i)
      if (complexityMatch) {
        currentSubtask.estimatedComplexity = complexityMatch[1].toLowerCase() as 'low' | 'medium' | 'high'
        continue
      }

      if (line.startsWith('-') || line.startsWith('*')) {
        const detail = line.replace(/^[-*]\s*/, '')
        if (!currentSubtask.description.includes(detail)) {
          currentSubtask.description += `\n- ${detail}`
        }
      }
    }
  }

  if (currentSubtask && currentSubtask.name && currentSubtask.description) {
    subtasks.push({
      id: currentSubtask.id || `task-${subtasks.length + 1}`,
      name: currentSubtask.name,
      description: currentSubtask.description,
      dependencies: currentSubtask.dependencies || [],
      estimatedComplexity: currentSubtask.estimatedComplexity || 'medium',
    })
  }

  if (subtasks.length === 0) {
    subtasks.push({
      id: 'task-1',
      name: taskName,
      description: taskDescription,
      dependencies: [],
      estimatedComplexity: 'high',
    })
    warnings.push('Could not identify subtasks; treating the entire task as a single unit.')
  }

  if (subtasks.length > 10) {
    warnings.push(`Large number of subtasks (${subtasks.length}). Consider grouping related items.`)
  }

  const parallelGroups = computeParallelGroups(subtasks)

  return { taskName, subtasks, parallelGroups, warnings }
}

function computeParallelGroups(subtasks: Subtask[]): Subtask[][] {
  const groups: Subtask[][] = []
  const remaining = new Set(subtasks.map((s) => s.id))
  const completed = new Set<string>()

  while (remaining.size > 0) {
    const ready: Subtask[] = []
    for (const s of subtasks) {
      if (!remaining.has(s.id)) continue
      const depsMet = s.dependencies.every((d) => completed.has(d))
      if (depsMet) {
        ready.push(s)
      }
    }
    if (ready.length === 0) {
      ready.push(subtasks.find((s) => remaining.has(s.id))!)
    }
    groups.push(ready)
    for (const s of ready) {
      remaining.delete(s.id)
      completed.add(s.id)
    }
  }

  return groups
}
