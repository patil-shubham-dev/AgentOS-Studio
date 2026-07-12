import { useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Editor, { type OnMount } from '@monaco-editor/react'
import { cn } from '@/lib/utils'
import { usePersonaStore } from '@/stores/persona-store'
import { personaLoader } from '@/lib/personas/PersonaLoader'
import { personaService } from '@/lib/personas/PersonaService'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { Persona } from '@/lib/personas/PersonaTypes'
import { useLeakTracker } from '@/performance/leak-detector'
import {
  Palette, Plus, Search, Sparkles, Trash2, X, Eye, EyeOff,
  AlertTriangle, FileText, User, Folder, Bookmark,
  Save, Edit3, Copy, CheckCircle2,
} from 'lucide-react'

// ── Helpers ──

const TAG_COLORS: Record<string, string> = {
  concise: 'text-blue-400 bg-blue-500/10',
  technical: 'text-cyan-400 bg-cyan-500/10',
  direct: 'text-green-400 bg-green-500/10',
  formal: 'text-purple-400 bg-purple-500/10',
  detailed: 'text-indigo-400 bg-indigo-500/10',
  thorough: 'text-violet-400 bg-violet-500/10',
  documentation: 'text-amber-400 bg-amber-500/10',
  educational: 'text-[var(--color-success-text)] bg-emerald-500/10',
  explanatory: 'text-teal-400 bg-teal-500/10',
  teaching: 'text-sky-400 bg-sky-500/10',
  learning: 'text-rose-400 bg-rose-500/10',
  minimal: 'text-zinc-400 bg-zinc-500/10',
  terse: 'text-neutral-400 bg-neutral-500/10',
  short: 'text-stone-400 bg-stone-500/10',
}

function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] ?? 'text-[var(--text-tertiary)] bg-[var(--border-subtle)]'
}

function SourceBadge({ source }: { source: Persona['source'] }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium',
      source === 'builtin' ? 'text-blue-400 bg-blue-500/10' :
      source === 'user' ? 'text-green-400 bg-green-500/10' :
      source === 'project' ? 'text-amber-400 bg-amber-500/10' :
      'text-[var(--text-tertiary)] bg-[var(--border-subtle)]',
    )}>
      {source === 'builtin' ? <Bookmark className="h-2.5 w-2.5" /> :
       source === 'user' ? <User className="h-2.5 w-2.5" /> :
       <Folder className="h-2.5 w-2.5" />}
      {source === 'builtin' ? 'Built-in' : source === 'user' ? 'User' : 'Project'}
    </span>
  )
}

// ── Persona Card ──

function PersonaCard({
  persona,
  isActive,
  onActivate,
  onEdit,
  onDelete,
  onClone,
  canDelete,
}: {
  persona: Persona
  isActive: boolean
  onActivate: () => void
  onEdit: () => void
  onDelete: () => void
  onClone: () => void
  canDelete: boolean
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative rounded-2xl border transition-all duration-200 overflow-hidden',
        isActive
          ? 'border-purple-500/30 bg-gradient-to-br from-purple-500/8 to-pink-500/5 shadow-[0_0_30px_rgba(168,85,247,0.08)]'
          : 'border-[var(--border-subtle)] bg-gradient-to-br from-[var(--surface-elevated)] to-[var(--surface-elevated)] hover:border-[var(--border-default)]',
      )}
    >
      {/* Top accent bar */}
      <div className={cn(
        'absolute top-0 left-0 right-0 h-1 bg-gradient-to-r',
        persona.source === 'builtin' ? 'from-blue-500/40 to-cyan-500/20' :
        persona.source === 'user' ? 'from-green-500/40 to-emerald-500/20' :
        'from-amber-500/40 to-orange-500/20',
      )} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn(
            'flex items-center justify-center h-10 w-10 rounded-xl border shrink-0',
            isActive ? 'border-purple-500/30 bg-purple-500/10' : 'border-[var(--border-default)] bg-[var(--border-subtle)]',
          )}>
            <Palette className={cn('h-4 w-4', isActive ? 'text-purple-400' : 'text-[var(--text-tertiary)]')} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{persona.name}</h3>
              <SourceBadge source={persona.source} />
              {isActive && (
                <span className="flex items-center gap-1 text-[9px] font-medium text-purple-400">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 line-clamp-2">{persona.description}</p>
          </div>
        </div>

        {/* Tags */}
        {persona.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {persona.tags.map((tag) => (
              <span key={tag} className={cn('px-1.5 py-0.5 rounded text-[8px] font-medium', getTagColor(tag))}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Instruction preview */}
        <div className="mt-2 rounded-lg bg-[var(--border-subtle)] border border-[var(--border-subtle)] p-2 max-h-20 overflow-y-auto">
          <p className="text-[9px] text-[var(--text-quaternary)] leading-relaxed line-clamp-3">
            {persona.instruction || 'No instruction text'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-[var(--border-subtle)]">
          <button
            onClick={onActivate}
            className={cn(
              'flex items-center gap-1 flex-1 justify-center px-2 py-1.5 rounded-lg text-[9px] font-medium transition-all',
              isActive
                ? 'bg-purple-500/10 text-purple-400'
                : 'bg-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-strong)]',
            )}
          >
            {isActive ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
            {isActive ? 'Active' : 'Activate'}
          </button>
          <div className="w-px h-4 bg-[var(--border-subtle)]" />
          <button
            onClick={onEdit}
            className="rounded-lg p-1.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all"
            title="Edit"
          >
            <Edit3 className="h-3 w-3" />
          </button>
          <button
            onClick={onClone}
            className="rounded-lg p-1.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all"
            title="Duplicate as custom"
          >
            <Copy className="h-3 w-3" />
          </button>
          {canDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg p-1.5 text-[var(--text-quaternary)] hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Persona Editor Modal ──

function PersonaEditorModal({
  persona,
  onSave,
  onClose,
}: {
  persona: { name: string; description: string; tags: string[]; instruction: string } | null
  onSave: (data: { name: string; description: string; tags: string[]; instruction: string }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(persona?.name ?? '')
  const [description, setDescription] = useState(persona?.description ?? '')
  const [tagsInput, setTagsInput] = useState(persona?.tags.join(', ') ?? '')
  const [instruction, setInstruction] = useState(persona?.instruction ?? '')
  const [showPreview, setShowPreview] = useState(false)

  const handleSave = useCallback(() => {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    onSave({ name: name.trim() || 'Unnamed Persona', description: description.trim(), tags, instruction: instruction.trim() })
  }, [name, description, tagsInput, instruction, onSave])

  const handleEditorMount: OnMount = (editor, monaco) => {
    monaco.editor.defineTheme('persona-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: '818cf8' },
        { token: 'string', foreground: '34d399' },
        { token: 'number', foreground: 'fbbf24' },
      ],
      colors: {
        'editor.background': '#0a0a0b00',
        'editor.foreground': '#e5e7eb',
        'editor.lineHighlightBackground': '#ffffff08',
        'editorCursor.foreground': '#60a5fa',
        'editor.selectionBackground': '#3b82f640',
        'editorLineNumber.foreground': '#ffffff20',
        'editorLineNumber.activeForeground': '#ffffff40',
        'editorIndentGuide.background': '#ffffff08',
        'editorIndentGuide.activeBackground': '#ffffff15',
      },
    })
    monaco.editor.setTheme('persona-dark')
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleSave, onClose])

  const characterCount = instruction.length
  const lineCount = instruction.split('\n').length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-3xl rounded-2xl border border-[var(--border-default)] bg-[#0f0f10] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-default)]">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-500/10">
            <Palette className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">Edit Persona</span>
          <div className="flex-1" />
          <button
            onClick={() => setShowPreview((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-all',
              showPreview ? 'bg-blue-500/10 text-blue-400' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)]',
            )}
          >
            {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            Preview
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 rounded-lg bg-purple-500/15 border border-purple-500/25 px-3 py-1 text-[10px] font-medium text-purple-400 hover:bg-purple-500/25 transition-all"
          >
            <Save className="h-3 w-3" />
            Save
          </button>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Persona"
              className="w-full h-9 rounded-lg border border-[var(--border-default)] bg-[var(--border-subtle)] px-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this style"
              className="w-full h-9 rounded-lg border border-[var(--border-default)] bg-[var(--border-subtle)] px-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">
              Tags <span className="text-[var(--text-quaternary)]">(comma-separated)</span>
            </label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="concise, technical, direct"
              className="w-full h-9 rounded-lg border border-[var(--border-default)] bg-[var(--border-subtle)] px-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>

          {/* Tags preview */}
          {tagsInput.trim() && (
            <div className="flex flex-wrap gap-1">
              {tagsInput.split(',').map((t, i) => {
                const tag = t.trim().toLowerCase()
                return tag ? (
                  <span key={`${tag}-${i}`} className={cn('px-1.5 py-0.5 rounded text-[8px] font-medium', getTagColor(tag))}>
                    {tag}
                  </span>
                ) : null
              })}
            </div>
          )}

          {/* Instruction editor or preview */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-medium text-[var(--text-tertiary)]">Instruction Text</label>
              <span className="text-[8px] text-[var(--text-quaternary)] font-mono">
                {characterCount.toLocaleString()} chars · {lineCount} lines
              </span>
            </div>
            <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
              {showPreview ? (
                <div className="h-[300px] overflow-y-auto p-3 bg-black/20">
                  <h3 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Communication Style</h3>
                  <pre className="text-xs text-[var(--text-tertiary)] font-sans leading-relaxed whitespace-pre-wrap">
                    {instruction || 'No instruction text defined.'}
                  </pre>
                </div>
              ) : (
                <Editor
                  height="300px"
                  defaultLanguage="markdown"
                  theme="persona-dark"
                  value={instruction}
                  onChange={(v) => setInstruction(v ?? '')}
                  onMount={handleEditorMount}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    wrappingStrategy: 'advanced',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    lineHeight: 18,
                    padding: { top: 8 },
                    renderWhitespace: 'selection',
                    tabSize: 2,
                    automaticLayout: true,
                    suggestOnTriggerCharacters: false,
                    quickSuggestions: false,
                    folding: true,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Confirm Delete Dialog ──

function ConfirmDeleteDialog({
  personaName,
  onConfirm,
  onCancel,
}: {
  personaName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl border border-[var(--border-default)] bg-[#0f0f10] shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Delete Persona</h3>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          Are you sure you want to delete <span className="text-red-400 font-medium">{personaName}</span>? The file will be permanently removed from disk.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-2 text-[10px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-default)] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-500/15 border border-red-500/25 px-3 py-2 text-[10px] font-medium text-red-400 hover:bg-red-500/25 transition-all"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── New Persona Template ──

const NEW_PERSONA_TEMPLATE = {
  name: '',
  description: '',
  tags: [] as string[],
  instruction: `You communicate in a distinctive style:

- Describe your communication approach here
- Use bullet points for clarity
- Keep the instructions specific and actionable`,
}

// ── Personas Page ──

export function PersonasPage() {
  useLeakTracker('PersonasPage')

  const { availablePersonas, activePersona, setActivePersonaById, setAvailablePersonas } = usePersonaStore()
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingPersona, setEditingPersona] = useState<{
    name: string
    description: string
    tags: string[]
    instruction: string
  } | null>(null)
  const [editingOriginal, setEditingOriginal] = useState<Persona | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Persona | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Load personas
  useEffect(() => {
    personaLoader.load(rootPath).then((personas) => {
      startTransition(() => setAvailablePersonas(personas))
    }).catch((err) => console.error("Persona loading failed:", err))
  }, [rootPath, setAvailablePersonas])

  // Filter
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return availablePersonas
    const q = searchQuery.toLowerCase()
    return availablePersonas.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)) ||
      p.instruction.toLowerCase().includes(q),
    )
  }, [availablePersonas, searchQuery])

  // Stats
  const stats = useMemo(() => {
    const builtins = availablePersonas.filter((p) => p.source === 'builtin')
    const custom = availablePersonas.filter((p) => p.source !== 'builtin')
    return { total: availablePersonas.length, builtins: builtins.length, custom: custom.length }
  }, [availablePersonas])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Actions
  const handleActivate = useCallback((id: string) => {
    setActivePersonaById(id)
    setToast({ message: `Activated persona`, type: 'success' })
  }, [setActivePersonaById])

  const handleEdit = useCallback((persona: Persona) => {
    setEditingPersona({
      name: persona.name,
      description: persona.description,
      tags: [...persona.tags],
      instruction: persona.instruction,
    })
    setEditingOriginal(persona)
  }, [])

  const handleSaveEdit = useCallback(async (data: {
    name: string
    description: string
    tags: string[]
    instruction: string
  }) => {
    try {
      if (editingOriginal) {
        // Update existing persona
        const updated: Persona = {
          ...editingOriginal,
          name: data.name,
          description: data.description,
          tags: data.tags,
          instruction: data.instruction,
        }
        const saved = await personaService.update(updated)
        if (saved) {
          // Refresh list
          const personas = await personaLoader.load(rootPath)
          personaLoader.invalidateCache()
          setAvailablePersonas(personas)
          // If the edited persona was active, re-activate to pick up changes
          if (activePersona.id === editingOriginal.id) {
            setActivePersonaById(data.name ? personaService.toFilename(data.name).replace(/\.md$/i, '') : editingOriginal.id)
          }
          setToast({ message: `Updated "${data.name}"`, type: 'success' })
        } else {
          setToast({ message: 'Failed to save — filesystem write error', type: 'error' })
        }
      } else {
        // Create new persona
        const created = await personaService.create(data.name, data.description, data.tags, data.instruction)
        if (created) {
          personaLoader.invalidateCache()
          const personas = await personaLoader.load(rootPath)
          setAvailablePersonas(personas)
          setToast({ message: `Created "${data.name}"`, type: 'success' })
        } else {
          setToast({ message: 'Failed to create — filesystem write error', type: 'error' })
        }
      }
    } catch (err) {
      setToast({ message: `Error: ${err instanceof Error ? err.message : String(err)}`, type: 'error' })
    }
    setEditingPersona(null)
    setEditingOriginal(null)
  }, [editingOriginal, rootPath, setAvailablePersonas, activePersona.id, setActivePersonaById])

  const handleClone = useCallback((persona: Persona) => {
    setEditingPersona({
      name: `${persona.name} (Copy)`,
      description: persona.description,
      tags: [...persona.tags],
      instruction: persona.instruction,
    })
    setEditingOriginal(null) // null = create mode
  }, [])

  const handleNew = useCallback(() => {
    setEditingPersona({ ...NEW_PERSONA_TEMPLATE, name: '' })
    setEditingOriginal(null)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    try {
      const deleted = await personaService.delete(deleteTarget)
      if (deleted) {
        personaLoader.invalidateCache()
        const personas = await personaLoader.load(rootPath)
        setAvailablePersonas(personas)
        // If deleted persona was active, reset to No Style
        if (activePersona.id === deleteTarget.id) {
          setActivePersonaById('none')
        }
        setToast({ message: `Deleted "${deleteTarget.name}"`, type: 'success' })
      } else {
        setToast({ message: 'Failed to delete — filesystem error', type: 'error' })
      }
    } catch (err) {
      setToast({ message: `Error: ${err instanceof Error ? err.message : String(err)}`, type: 'error' })
    }
    setDeleteTarget(null)
  }, [deleteTarget, rootPath, setAvailablePersonas, activePersona.id, setActivePersonaById])

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-app)]">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-[var(--border-default)] shadow-lg">
              <Palette className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Personas</h1>
              <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                Output style presets — define how agents communicate their responses
              </p>
            </div>
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 px-4 py-2 text-xs font-medium text-[var(--text-primary)] shadow-lg shadow-purple-600/20 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Persona
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: Palette, color: 'text-purple-400' },
            { label: 'Built-in', value: stats.builtins, icon: Bookmark, color: 'text-blue-400' },
            { label: 'Custom', value: stats.custom, icon: User, color: 'text-green-400' },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-br from-[var(--surface-elevated)] to-[var(--surface-elevated)] p-4">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</span>
                  <Icon className={cn('h-4 w-4', stat.color)} />
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">{stat.label}</p>
              </div>
            )
          })}
        </div>

        {/* ── Active persona indicator ── */}
        {activePersona.id !== 'none' && (
          <div className="rounded-2xl border border-purple-500/15 bg-gradient-to-br from-purple-500/5 to-pink-500/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <Palette className="h-4 w-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{activePersona.name}</span>
                  <SourceBadge source={activePersona.source} />
                  <span className="text-[9px] text-purple-400 font-medium">Active</span>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 truncate">{activePersona.description}</p>
              </div>
              <button
                onClick={() => setActivePersonaById('none')}
                className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-[9px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-default)] transition-all"
              >
                Deactivate
              </button>
            </div>
          </div>
        )}

        {/* ── Search ── */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-quaternary)]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search personas by name, description, tag, or instruction..."
            className="w-full h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--border-subtle)] pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)] focus:border-[var(--border-default)] focus:bg-[var(--border-default)] transition-all"
          />
        </div>

        {/* ── Persona Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((persona) => (
              persona.id === 'none' ? null : (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  isActive={activePersona.id === persona.id}
                  onActivate={() => handleActivate(persona.id)}
                  onEdit={() => handleEdit(persona)}
                  onDelete={() => setDeleteTarget(persona)}
                  onClone={() => handleClone(persona)}
                  canDelete={persona.source === 'user'}
                />
              )
            ))}
          </AnimatePresence>
        </div>

        {/* ── Empty state ── */}
        {filtered.length <= 1 && (
          <div className="text-center py-12">
            <Palette className="h-10 w-10 text-[var(--text-quaternary)] mx-auto mb-3" />
            <h3 className="text-base font-semibold text-[var(--text-secondary)] mb-1">
              {searchQuery ? 'No matching personas' : 'No personas yet'}
            </h3>
            <p className="text-xs text-[var(--text-quaternary)] max-w-md mx-auto">
              {searchQuery
                ? 'Try a different search query.'
                : 'Personas define how agents communicate. Create your first one to get started or place .md files in .agentic/presets/'}
            </p>
          </div>
        )}

        {/* ── Info footer ── */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--border-subtle)] p-4">
          <div className="flex items-start gap-3">
            <FileText className="h-4 w-4 text-[var(--text-quaternary)] mt-0.5 shrink-0" />
            <div className="text-[11px] text-[var(--text-quaternary)] leading-relaxed">
              <p className="font-medium text-[var(--text-tertiary)] mb-1">How Personas Work</p>
              <p>Personas are stored as Markdown files in <code className="text-blue-400">~/.agentic/presets/*.md</code> (user-level) or <code className="text-amber-400">&lt;project&gt;/.agentic/presets/*.md</code> (project-level).</p>
              <p className="mt-1">Each file uses YAML frontmatter to define metadata (name, description, tags) and the body becomes the instruction text injected into system prompts.</p>
              <p className="mt-1">Project personas override user personas with the same filename. Built-in personas are always available.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Editor Modal ── */}
      <AnimatePresence>
        {editingPersona !== null && (
          <PersonaEditorModal
            persona={editingPersona}
            onSave={handleSaveEdit}
            onClose={() => { setEditingPersona(null); setEditingOriginal(null) }}
          />
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation ── */}
      <AnimatePresence>
        {deleteTarget !== null && (
          <ConfirmDeleteDialog
            personaName={deleteTarget.name}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={cn(
              'fixed bottom-6 right-6 flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-xl z-[100]',
              toast.type === 'success' ? 'bg-green-500/15 border border-green-500/25 text-green-400' : 'bg-red-500/15 border border-red-500/25 text-red-400',
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span className="text-[11px] font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default PersonasPage
