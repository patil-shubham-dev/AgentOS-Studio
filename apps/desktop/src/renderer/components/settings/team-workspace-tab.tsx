import { useState } from "react"
import { motion } from "framer-motion"
import { useTeamWorkspaceStore, type TeamMember, type SharedSkill, type SharedRule } from "@/stores/workspace/team-workspace-store"
import { Button } from "@agentic-os/ui"
import { Plus, Trash2, Users, BookOpen, Shield, Share2, Globe, CheckCircle2, XCircle } from "lucide-react"

export function TeamWorkspaceTab() {
  const { workspaces, activeWorkspaceId, addWorkspace, removeWorkspace, setActiveWorkspace, addSkill, removeSkill, addRule, removeRule, addMember, removeMember, toggleSync } = useTeamWorkspaceStore()
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [showNewForm, setShowNewForm] = useState(false)

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Team Workspaces</h2>
          <p className="text-sm text-muted-foreground">Share skills, rules, and configuration across your team.</p>
        </div>
        <Button onClick={() => setShowNewForm(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Workspace
        </Button>
      </div>

      {showNewForm && (
        <motion.div
          className="rounded-lg border p-4"
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
        >
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
              placeholder="Workspace name..."
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newWorkspaceName.trim()) {
                  addWorkspace(newWorkspaceName.trim())
                  setNewWorkspaceName("")
                  setShowNewForm(false)
                }
              }}
            />
            <Button onClick={() => {
              if (newWorkspaceName.trim()) {
                addWorkspace(newWorkspaceName.trim())
                setNewWorkspaceName("")
                setShowNewForm(false)
              }
            }}>Create</Button>
            <Button variant="outline" onClick={() => setShowNewForm(false)}>Cancel</Button>
          </div>
        </motion.div>
      )}

      {workspaces.length === 0 && (
        <motion.div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Globe className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No workspaces yet. Create one to start sharing with your team.</p>
        </motion.div>
      )}

      <div className="flex flex-1 gap-4 min-h-0">
        <div className="w-56 shrink-0 space-y-1">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => setActiveWorkspace(ws.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                ws.id === activeWorkspaceId ? "bg-blue-500/10 text-blue-400" : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              <Users className="h-4 w-4" />
              <span className="flex-1 truncate">{ws.name}</span>
              <span className="text-[10px] text-muted-foreground">{ws.members.length}</span>
            </button>
          ))}
        </div>

        {activeWorkspaceId && <ActiveWorkspace workspaceId={activeWorkspaceId} />}
      </div>
    </div>
  )
}

function ActiveWorkspace({ workspaceId }: { workspaceId: string }) {
  const ws = useTeamWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId))
  const { addSkill, removeSkill, addRule, removeRule, addMember, removeMember, toggleSync } = useTeamWorkspaceStore()
  const [tab, setTab] = useState<"members" | "skills" | "rules">("members")

  if (!ws) return null

  return (
    <div className="flex flex-1 flex-col gap-4 min-h-0">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-foreground">{ws.name}</h3>
          {ws.description && <p className="text-xs text-muted-foreground">{ws.description}</p>}
        </div>
        <button
          onClick={() => toggleSync(ws.id)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
            ws.syncEnabled ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-muted-foreground"
          }`}
        >
          <Share2 className="h-3 w-3" />
          {ws.syncEnabled ? "Syncing" : "Sync Off"}
        </button>
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {(["members", "skills", "rules"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
              tab === t ? "border-blue-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "members" ? `Members (${ws.members.length})` : t === "skills" ? `Skills (${ws.sharedSkills.length})` : `Rules (${ws.sharedRules.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {tab === "members" && <MembersSection workspaceId={ws.id} members={ws.members} onAdd={addMember} onRemove={removeMember} />}
        {tab === "skills" && <SkillsSection workspaceId={ws.id} skills={ws.sharedSkills} onAdd={addSkill} onRemove={removeSkill} />}
        {tab === "rules" && <RulesSection workspaceId={ws.id} rules={ws.sharedRules} onAdd={addRule} onRemove={removeRule} />}
      </div>
    </div>
  )
}

function MembersSection({ workspaceId, members, onAdd, onRemove }: {
  workspaceId: string
  members: TeamMember[]
  onAdd: (wsId: string, m: Omit<TeamMember, "joinedAt">) => void
  onRemove: (wsId: string, id: string) => void
}) {
  const [name, setName] = useState("")
  const [role, setRole] = useState<TeamMember["role"]>("viewer")

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border bg-transparent px-2.5 py-1.5 text-xs outline-none"
          placeholder="Member name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
          value={role}
          onChange={(e) => setRole(e.target.value as TeamMember["role"])}
        >
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          onClick={() => {
            if (name.trim()) {
              onAdd(workspaceId, { id: `mem_${Date.now()}`, name: name.trim(), role })
              setName("")
            }
          }}
          className="rounded-md bg-blue-500/20 px-2.5 py-1.5 text-xs text-blue-400 transition-colors hover:bg-blue-500/30"
        >
          Add
        </button>
      </div>

      {members.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">No members yet.</p>
      )}

      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-2 rounded-md border bg-white/[0.02] px-3 py-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 text-xs text-foreground">{m.name}</span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">{m.role}</span>
          <button onClick={() => onRemove(workspaceId, m.id)} className="rounded p-1 text-muted-foreground hover:text-red-400">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

function SkillsSection({ workspaceId, skills, onAdd, onRemove }: {
  workspaceId: string
  skills: SharedSkill[]
  onAdd: (wsId: string, s: Omit<SharedSkill, "id" | "version" | "updatedAt">) => void
  onRemove: (wsId: string, id: string) => void
}) {
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")

  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-white/[0.02] p-3">
        <div className="mb-2 flex gap-2">
          <input
            className="flex-1 rounded-md border bg-transparent px-2.5 py-1.5 text-xs outline-none"
            placeholder="Skill name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <textarea
          className="w-full rounded-md border bg-transparent px-2.5 py-1.5 text-xs outline-none resize-none"
          rows={3}
          placeholder="Skill prompt..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          onClick={() => {
            if (name.trim() && prompt.trim()) {
              onAdd(workspaceId, { name: name.trim(), description: "", prompt: prompt.trim(), author: "shared", tags: [] })
              setName("")
              setPrompt("")
            }
          }}
          className="mt-2 rounded-md bg-blue-500/20 px-2.5 py-1.5 text-xs text-blue-400 transition-colors hover:bg-blue-500/30"
        >
          Add Skill
        </button>
      </div>

      {skills.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">No shared skills yet.</p>
      )}

      {skills.map((s) => (
        <div key={s.id} className="flex items-start gap-2 rounded-md border bg-white/[0.02] px-3 py-2">
          <BookOpen className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">{s.name}</span>
              <span className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-muted-foreground">v{s.version}</span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{s.prompt}</p>
          </div>
          <button onClick={() => onRemove(workspaceId, s.id)} className="rounded p-1 text-muted-foreground hover:text-red-400">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

function RulesSection({ workspaceId, rules, onAdd, onRemove }: {
  workspaceId: string
  rules: SharedRule[]
  onAdd: (wsId: string, r: Omit<SharedRule, "id">) => void
  onRemove: (wsId: string, id: string) => void
}) {
  const [pattern, setPattern] = useState("")
  const [rule, setRule] = useState("")

  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-white/[0.02] p-3">
        <input
          className="mb-2 w-full rounded-md border bg-transparent px-2.5 py-1.5 text-xs outline-none"
          placeholder="File pattern (e.g., *.tsx)"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
        <textarea
          className="w-full rounded-md border bg-transparent px-2.5 py-1.5 text-xs outline-none resize-none"
          rows={2}
          placeholder="Rule description..."
          value={rule}
          onChange={(e) => setRule(e.target.value)}
        />
        <button
          onClick={() => {
            if (pattern.trim() && rule.trim()) {
              onAdd(workspaceId, { pattern: pattern.trim(), rule: rule.trim(), priority: 0, enabled: true })
              setPattern("")
              setRule("")
            }
          }}
          className="mt-2 rounded-md bg-blue-500/20 px-2.5 py-1.5 text-xs text-blue-400 transition-colors hover:bg-blue-500/30"
        >
          Add Rule
        </button>
      </div>

      {rules.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">No shared rules yet.</p>
      )}

      {rules.map((r) => (
        <div key={r.id} className="flex items-start gap-2 rounded-md border bg-white/[0.02] px-3 py-2">
          <Shield className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-foreground">{r.pattern}</span>
            <p className="text-[11px] text-muted-foreground">{r.rule}</p>
          </div>
          <button onClick={() => onRemove(workspaceId, r.id)} className="rounded p-1 text-muted-foreground hover:text-red-400">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
