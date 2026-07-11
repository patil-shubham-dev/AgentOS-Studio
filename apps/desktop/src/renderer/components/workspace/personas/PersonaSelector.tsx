import { useState, useRef, useEffect, useMemo } from 'react'
import { usePersonaStore } from '@/stores/persona-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { personaLoader } from '@/lib/personas/PersonaLoader'
import { cn } from '@/lib/utils'
import {
  Palette, ChevronDown, Sparkles, BookOpen, MessageSquare,
  Zap, LayoutList, UserCircle, Loader2,
} from 'lucide-react'

const STYLE_ICONS: Record<string, typeof Sparkles> = {
  'none': Palette,
  'concise-explorer': Zap,
  'formal-reviewer': BookOpen,
  'teacher': MessageSquare,
  'minimal': LayoutList,
}

const TAG_COLORS: Record<string, string> = {
  concise: 'text-blue-400 bg-blue-500/10',
  technical: 'text-cyan-400 bg-cyan-500/10',
  direct: 'text-green-400 bg-green-500/10',
  formal: 'text-purple-400 bg-purple-500/10',
  detailed: 'text-indigo-400 bg-indigo-500/10',
  thorough: 'text-violet-400 bg-violet-500/10',
  documentation: 'text-amber-400 bg-amber-500/10',
  educational: 'text-emerald-400 bg-emerald-500/10',
  explanatory: 'text-teal-400 bg-teal-500/10',
  teaching: 'text-sky-400 bg-sky-500/10',
  learning: 'text-rose-400 bg-rose-500/10',
  minimal: 'text-zinc-400 bg-zinc-500/10',
  terse: 'text-neutral-400 bg-neutral-500/10',
  short: 'text-stone-400 bg-stone-500/10',
}

function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] ?? 'text-white/40 bg-white/[0.04]'
}

function getPersonaIcon(id: string): typeof Sparkles {
  return STYLE_ICONS[id] ?? UserCircle
}

export function PersonaSelector() {
  const { availablePersonas, activePersona, setActivePersonaById, loading, setAvailablePersonas } = usePersonaStore()
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Load personas from filesystem on mount and when rootPath changes
  useEffect(() => {
    personaLoader.load(rootPath).then((personas) => {
      setAvailablePersonas(personas)
    }).catch((err) => {
      console.warn('[PersonaSelector] Failed to load personas:', err)
    })
  }, [rootPath, setAvailablePersonas])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const activeIcon = getPersonaIcon(activePersona.id)
  const isActive = activePersona.id !== 'none'

  // Categorize personas
  const { builtins, custom } = useMemo(() => {
    const builtins: typeof availablePersonas = []
    const custom: typeof availablePersonas = []
    for (const p of availablePersonas) {
      if (p.id === 'none') continue
      if (p.source === 'builtin') builtins.push(p)
      else custom.push(p)
    }
    return { builtins, custom }
  }, [availablePersonas])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-all',
          isActive
            ? 'text-purple-400 border-purple-500/20 bg-purple-500/8 hover:bg-purple-500/12'
            : 'text-white/30 border-white/[0.06] hover:text-white/50 hover:bg-white/[0.03]',
        )}
      >
        <Palette className="h-2.5 w-2.5" />
        <span className="max-w-[60px] truncate">{activePersona.name}</span>
        <ChevronDown className={cn('h-2.5 w-2.5 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-white/[0.08] bg-[#0f0f10] shadow-xl shadow-black/40 overflow-hidden z-50 max-h-[60vh] overflow-y-auto">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-[10px] text-white/30">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading personas...
            </div>
          )}

          {!loading && (
            <>
              {/* No Style (always first) */}
              <button
                onClick={() => {
                  setActivePersonaById('none')
                  setOpen(false)
                }}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-[10px] font-medium text-left transition-colors border-b border-white/[0.04]',
                  activePersona.id === 'none'
                    ? 'text-blue-400 bg-blue-500/10'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]',
                )}
              >
                <Palette className="h-3 w-3 shrink-0" />
                <span>No Style</span>
              </button>

              {/* Built-in personas */}
              {builtins.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[8px] font-semibold text-white/20 uppercase tracking-wider">
                    Built-in
                  </div>
                  {builtins.map((persona) => {
                    const Icon = getPersonaIcon(persona.id)
                    return (
                      <button
                        key={persona.id}
                        onClick={() => {
                          setActivePersonaById(persona.id)
                          setOpen(false)
                        }}
                        className={cn(
                          'flex items-start gap-2 w-full px-3 py-1.5 text-left transition-colors',
                          activePersona.id === persona.id
                            ? 'bg-purple-500/10'
                            : 'hover:bg-white/[0.04]',
                        )}
                      >
                        <Icon className={cn(
                          'h-3 w-3 mt-0.5 shrink-0',
                          activePersona.id === persona.id ? 'text-purple-400' : 'text-white/30',
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            'text-[10px] font-medium',
                            activePersona.id === persona.id ? 'text-purple-300' : 'text-white/70',
                          )}>
                            {persona.name}
                          </div>
                          <p className="text-[8px] text-white/30 line-clamp-1 mt-0.5">
                            {persona.description}
                          </p>
                          {persona.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {persona.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className={cn(
                                    'px-1 rounded text-[7px] font-medium',
                                    getTagColor(tag),
                                  )}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Custom personas (user/project) */}
              {custom.length > 0 && (
                <div className="py-1 border-t border-white/[0.04]">
                  <div className="px-3 py-1 text-[8px] font-semibold text-white/20 uppercase tracking-wider">
                    Custom
                  </div>
                  {custom.map((persona) => {
                    const Icon = getPersonaIcon(persona.id)
                    return (
                      <button
                        key={persona.id}
                        onClick={() => {
                          setActivePersonaById(persona.id)
                          setOpen(false)
                        }}
                        className={cn(
                          'flex items-start gap-2 w-full px-3 py-1.5 text-left transition-colors',
                          activePersona.id === persona.id
                            ? 'bg-purple-500/10'
                            : 'hover:bg-white/[0.04]',
                        )}
                      >
                        <Icon className={cn(
                          'h-3 w-3 mt-0.5 shrink-0',
                          activePersona.id === persona.id ? 'text-purple-400' : 'text-white/30',
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            'text-[10px] font-medium',
                            activePersona.id === persona.id ? 'text-purple-300' : 'text-white/70',
                          )}>
                            {persona.name}
                          </div>
                          <p className="text-[8px] text-white/30 line-clamp-1 mt-0.5">
                            {persona.description}
                          </p>
                          <span className={cn(
                            'text-[7px] font-medium',
                            persona.source === 'project' ? 'text-blue-400' : 'text-green-400',
                          )}>
                            {persona.source === 'project' ? 'Project' : 'User'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Empty state */}
              {builtins.length === 0 && custom.length === 0 && (
                <div className="px-3 py-4 text-center text-[10px] text-white/20">
                  <Sparkles className="h-4 w-4 mx-auto mb-1.5 text-white/15" />
                  <p>No personas available</p>
                  <p className="text-[8px] mt-1">Add .agentic/presets/*.md files</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
