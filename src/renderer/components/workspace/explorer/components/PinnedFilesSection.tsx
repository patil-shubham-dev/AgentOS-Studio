import { useCallback } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { Pin, X } from "lucide-react"

interface PinnedFilesSectionProps {
  rootPath: string | null
  onOpenPath: (path: string) => void
}

export function PinnedFilesSection({ rootPath, onOpenPath }: PinnedFilesSectionProps) {
  const pinned = useWorkspaceStore((s) => s.pinnedFiles)
  const togglePinFile = useWorkspaceStore((s) => s.togglePinFile)

  const handleUnpin = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    togglePinFile(path)
  }, [togglePinFile])

  if (!pinned || pinned.length === 0) return null

  return (
    <div className="border-b border-white/[0.04]">
      <SectionHeader label="Pinned" count={pinned.length} />
      <div className="py-0.5">
        {pinned.map((path: string) => {
          const name = path.split("/").pop() || path
          const ext = name.includes(".") ? name.substring(name.lastIndexOf(".")) : ""
          return (
            <div
              key={path}
              onClick={() => {
                const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + path : path
                onOpenPath(abs)
              }}
              className="flex items-center gap-1.5 px-3 py-0.5 cursor-pointer text-[11px] text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors group"
            >
              <Pin className="h-2.5 w-2.5 shrink-0 text-white/20 group-hover:text-white/40 transition-colors" />
              <FileIcon ext={ext} />
              <span className="truncate flex-1">{name}</span>
              <button onClick={(e) => handleUnpin(e, path)} className="p-0.5 rounded text-white/0 hover:text-white/50 group-hover:text-white/30 transition-all">
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function RecentFilesSection({ rootPath, onOpenPath }: { rootPath: string | null; onOpenPath: (path: string) => void }) {
  const recentlyOpened = useWorkspaceStore((s) => s.recentlyOpened)

  if (!recentlyOpened || recentlyOpened.length === 0) return null

  return (
    <div className="border-b border-white/[0.04]">
      <SectionHeader label="Recent" count={recentlyOpened.length} />
      <div className="py-0.5">
        {recentlyOpened.map((p: { path: string; timestamp: number }) => {
          const name = p.path.split("/").pop() || p.path
          const ext = name.includes(".") ? name.substring(name.lastIndexOf(".")) : ""
          return (
            <div
              key={p.path + p.timestamp}
              onClick={() => {
                const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + p.path : p.path
                onOpenPath(abs)
              }}
              className="flex items-center gap-1.5 px-3 py-0.5 cursor-pointer text-[11px] text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <FileIcon ext={ext} />
              <span className="truncate flex-1">{name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function OpenEditorsSection({ rootPath, onOpenPath }: { rootPath: string | null; onOpenPath: (path: string) => void }) {
  const openFiles = useWorkspaceStore((s) => s.openFiles)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const closeFile = useWorkspaceStore((s) => s.closeFile)

  if (!openFiles || openFiles.length === 0) return null

  return (
    <div className="border-b border-white/[0.04]">
      <SectionHeader label="Open Editors" count={openFiles.length} />
      <div className="py-0.5">
        {openFiles.map((p) => {
          const ext = p.name.includes(".") ? p.name.substring(p.name.lastIndexOf(".")) : ""
          const isActive = p.path === activeFilePath
          return (
            <div
              key={p.path}
              onClick={() => {
                const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + p.path : p.path
                onOpenPath(abs)
              }}
              className={`flex items-center gap-1.5 px-3 py-0.5 cursor-pointer text-[11px] transition-colors group ${
                isActive
                  ? "text-white bg-blue-500/10 border-l-[2px] border-blue-400"
                  : "text-white/60 hover:text-white hover:bg-white/[0.04] border-l-[2px] border-transparent"
              }`}
            >
              <FileIcon ext={ext} />
              <span className="truncate flex-1">{p.name}</span>
              {p.isDirty && <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" title="Unsaved changes" />}
              <button
                onClick={(e) => { e.stopPropagation(); closeFile(p.path) }}
                className="p-0.5 rounded text-white/0 hover:text-white/50 group-hover:text-white/30 transition-all ml-auto"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 select-none">
      <span className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.06em]">{label}</span>
      <span className="text-[9px] text-white/15 font-mono">{count}</span>
    </div>
  )
}

const ICON_MAP: Record<string, string> = {
  ts: "🟦", tsx: "⚛️", js: "🟨", jsx: "⚛️", json: "{ }", md: "📝",
  css: "🎨", scss: "🎨", html: "🌐", py: "🐍", rs: "🦀", go: "🔵",
  vue: "💚", svelte: "🧡", yaml: "📋", yml: "📋", toml: "📋",
  lock: "🔒", gitignore: "🙈", env: "🔑", svg: "🖼️", png: "🖼️",
  jpg: "🖼️", jpeg: "🖼️", ico: "🖼️",
}

function FileIcon({ ext }: { ext: string }) {
  const key = ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase()
  const icon = ICON_MAP[key]
  if (icon) return <span className="shrink-0 text-[10px] leading-none">{icon}</span>
  return <span className="shrink-0 text-[10px] leading-none text-white/30">📄</span>
}
