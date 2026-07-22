import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useScheduledTaskStore } from "@/stores/scheduler/scheduled-task-store"
import { TASK_TEMPLATES } from "@/lib/scheduler/task-templates"
import { getHumanReadable } from "@/lib/scheduler/cron-parser"
import type { ScheduledTask, TaskAction, TaskStatus } from "@/lib/scheduler/scheduled-task-types"
import {
  Code2, Package, Shield, BrainCircuit, BarChart3,
  Clock, Plus, Trash2, Play, ToggleLeft, ToggleRight, X, Check,
  CalendarClock,
} from "lucide-react"

const ACTION_ICONS: Record<string, typeof Code2> = {
  code_review: Code2,
  dependency_audit: Package,
  security_scan: Shield,
  memory_consolidation: BrainCircuit,
  performance_report: BarChart3,
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return `Yesterday at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function formatNextRun(isoString: string | undefined): string {
  if (!isoString) return "—"
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMs < 0) return "Overdue"
  if (diffHr < 1) return "In less than an hour"
  if (diffHr < 24) return `In ${diffHr}h`
  if (diffDay === 1) return "Tomorrow"
  if (diffDay < 7) return `In ${diffDay}d`
  return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function StatusBadge({ status }: { status?: TaskStatus }) {
  const config: Record<TaskStatus, { label: string; classes: string; animate?: boolean }> = {
    idle: { label: "Idle", classes: "bg-white/5 text-white/40 border-white/5" },
    running: { label: "Running", classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", animate: true },
    completed: { label: "Completed", classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    failed: { label: "Failed", classes: "bg-red-500/10 text-red-400 border-red-500/20" },
    skipped: { label: "Skipped", classes: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  }
  const c = status ? config[status] : config.idle
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", c.classes)}>
      {c.animate && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      )}
      {!c.animate && status === "completed" && <Check className="h-3 w-3" />}
      {!c.animate && status === "failed" && <X className="h-3 w-3" />}
      {c.label}
    </span>
  )
}

interface TaskFormProps {
  initial?: Partial<ScheduledTask>
  onSave: (data: {
    name: string
    description: string
    action: TaskAction
    cronExpression: string
    enabled: boolean
    config: Record<string, unknown>
  }) => void
  onCancel: () => void
}

function TaskForm({ initial, onSave, onCancel }: TaskFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [action, setAction] = useState<TaskAction>(initial?.action ?? "code_review")
  const [cronExpression, setCronExpression] = useState(initial?.cronExpression ?? "0 9 * * 1-5")
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)

  const cronPreview = getHumanReadable(cronExpression)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ name, description, action, cronExpression, enabled, config: {} })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Task name"
            required
            className="w-full h-9 rounded-xl border border-white/5 bg-white/[0.03] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/10"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Action Type</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as TaskAction)}
            className="w-full h-9 rounded-xl border border-white/5 bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-white/10 appearance-none"
          >
            {TASK_TEMPLATES.map((t) => (
              <option key={t.action} value={t.action} className="bg-gray-900 text-white">{t.name}</option>
            ))}
            <option value="custom_prompt" className="bg-gray-900 text-white">Custom Prompt</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this task do?"
          className="w-full h-9 rounded-xl border border-white/5 bg-white/[0.03] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/10"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Cron Expression</label>
        <div className="flex items-center gap-3">
          <input
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            placeholder="0 9 * * 1-5"
            className="flex-1 h-9 rounded-xl border border-white/5 bg-white/[0.03] px-3 text-sm font-mono text-white outline-none placeholder:text-white/20 focus:border-white/10"
          />
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Clock className="h-3.5 w-3.5" />
            <span>{cronPreview}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-white/20 bg-white/5"
          />
          <span className="text-sm text-white/60">Enabled</span>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/5 px-4 py-1.5 text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.03] transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-blue-500/20 border border-blue-500/30 px-4 py-1.5 text-xs text-blue-300 hover:bg-blue-500/30 transition-all"
          >
            Save Task
          </button>
        </div>
      </div>
    </form>
  )
}

export function ScheduledTasksTab() {
  const tasks = useScheduledTaskStore((s) => s.tasks)
  const addTask = useScheduledTaskStore((s) => s.addTask)
  const removeTask = useScheduledTaskStore((s) => s.removeTask)
  const updateTask = useScheduledTaskStore((s) => s.updateTask)
  const toggleTask = useScheduledTaskStore((s) => s.toggleTask)
  const runNow = useScheduledTaskStore((s) => s.runNow)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TASK_TEMPLATES[number] | null>(null)

  const handleAddFromTemplate = useCallback((template: typeof TASK_TEMPLATES[number]) => {
    addTask({
      name: template.name,
      description: template.description,
      action: template.action,
      cronExpression: template.defaultCron,
      enabled: true,
      config: {},
    })
  }, [addTask])

  const handleCustomSave = useCallback((data: {
    name: string
    description: string
    action: TaskAction
    cronExpression: string
    enabled: boolean
    config: Record<string, unknown>
  }) => {
    if (editingId) {
      updateTask(editingId, data)
    } else {
      addTask(data)
    }
    setShowForm(false)
    setEditingId(null)
    setSelectedTemplate(null)
  }, [addTask, updateTask, editingId])

  const templateActions = TASK_TEMPLATES.filter((t) => !tasks.some((tk) => tk.action === t.action))

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-white tracking-tight">Scheduled Tasks</h2>
        <p className="text-sm text-white/40">Automate recurring AI tasks like daily code review, weekly audit, and monthly security scan</p>
      </div>

      {/* Template cards */}
      {templateActions.length > 0 && (
        <div className="space-y-3">
          <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Quick Add</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templateActions.map((template) => {
              const Icon = ACTION_ICONS[template.action] || Clock
              return (
                <motion.button
                  key={template.action}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAddFromTemplate(template)}
                  className="text-left rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 hover:bg-white/[0.05] transition-all group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <Icon className="h-4 w-4 text-blue-400" />
                    </div>
                    <span className="text-sm font-medium text-white">{template.name}</span>
                  </div>
                  <p className="text-xs text-white/40 line-clamp-2 mb-2">{template.description}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                    <Clock className="h-3 w-3" />
                    <span>{getHumanReadable(template.defaultCron)}</span>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* Custom task button */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">
          {tasks.length > 0 ? `Tasks (${tasks.length})` : "Tasks"}
        </span>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setSelectedTemplate(null) }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-500/20 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          New Task
        </button>
      </div>

      {/* Inline form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <TaskForm
              initial={editingId ? tasks.find((t) => t.id === editingId) : selectedTemplate ? {
                name: selectedTemplate.name,
                description: selectedTemplate.description,
                action: selectedTemplate.action,
                cronExpression: selectedTemplate.defaultCron,
              } : undefined}
              onSave={handleCustomSave}
              onCancel={() => { setShowForm(false); setEditingId(null); setSelectedTemplate(null) }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task list */}
      <div className="rounded-2xl border border-white/5 overflow-hidden">
        {tasks.length === 0 ? (
          <div className="text-center py-16 px-6">
            <CalendarClock className="h-10 w-10 text-white/10 mx-auto mb-4" />
            <p className="text-sm text-white/30 max-w-xs mx-auto">
              No scheduled tasks. Create your first task to automate recurring work.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            <AnimatePresence mode="popLayout">
              {tasks.map((task) => {
                const Icon = ACTION_ICONS[task.action] || Clock
                return (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className={cn(
                      "flex items-center justify-center h-9 w-9 rounded-xl border",
                      task.enabled ? "bg-blue-500/10 border-blue-500/20" : "bg-white/[0.02] border-white/5",
                    )}>
                      <Icon className={cn("h-4 w-4", task.enabled ? "text-blue-400" : "text-white/20")} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn("text-sm font-medium", task.enabled ? "text-white" : "text-white/30")}>
                          {task.name}
                        </span>
                        <StatusBadge status={task.lastRunStatus} />
                      </div>
                      <p className="text-xs text-white/40 truncate">{task.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/30">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {getHumanReadable(task.cronExpression)}
                        </span>
                        {task.lastRunAt && (
                          <span>Last: {formatRelativeTime(task.lastRunAt)}</span>
                        )}
                        {task.nextRunAt && (
                          <span>Next: {formatNextRun(task.nextRunAt)}</span>
                        )}
                        <span>{task.runCount} run{task.runCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => runNow(task.id)}
                        disabled={task.lastRunStatus === "running"}
                        title="Run Now"
                        className="rounded-lg p-2 text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all disabled:opacity-30"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(task.id)
                          setShowForm(true)
                          setSelectedTemplate(null)
                        }}
                        title="Edit"
                        className="rounded-lg p-2 text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleTask(task.id)}
                        title={task.enabled ? "Disable" : "Enable"}
                        className={cn(
                          "rounded-lg p-2 transition-all",
                          task.enabled ? "text-emerald-400/60 hover:text-emerald-400" : "text-white/20 hover:text-white/40",
                        )}
                      >
                        {task.enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => removeTask(task.id)}
                        title="Delete"
                        className="rounded-lg p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
