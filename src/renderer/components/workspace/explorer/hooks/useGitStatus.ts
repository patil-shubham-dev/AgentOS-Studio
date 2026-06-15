import { useState, useEffect, useRef } from "react"
import type { GitStatusEntry } from "@pierre/trees"
import { getGitStatus } from "@/lib/git"
import { useWorkspaceStore } from "@/stores/workspace-store"

const REFRESH_INTERVAL_MS = 30_000

interface CacheEntry {
  entries: GitStatusEntry[]
  timestamp: number
}

const statusCache = new Map<string, CacheEntry>()

export function useGitStatus(rootPath: string | null): {
  gitStatus: readonly GitStatusEntry[] | undefined
} {
  const [gitStatus, setGitStatus] = useState<readonly GitStatusEntry[]>([])
  const rootRef = useRef(rootPath)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    rootRef.current = rootPath

    if (!rootPath) {
      setGitStatus([])
      return
    }

    const fetch = async () => {
      if (!rootRef.current || !mountedRef.current) return

      const cached = statusCache.get(rootRef.current)
      if (cached && Date.now() - cached.timestamp < REFRESH_INTERVAL_MS) {
        if (mountedRef.current) setGitStatus(cached.entries)
        return
      }

      try {
        const entries = await getGitStatus(rootRef.current)
        statusCache.set(rootRef.current, { entries, timestamp: Date.now() })
        if (mountedRef.current) setGitStatus(entries)
      } catch {
        if (mountedRef.current) setGitStatus([])
      }
    }

    fetch()

    const intervalId = setInterval(fetch, REFRESH_INTERVAL_MS)

    const unsub = useWorkspaceStore.subscribe((s) => s.fileTree, () => {
      if (rootRef.current) {
        statusCache.delete(rootRef.current)
      }
    })

    return () => {
      mountedRef.current = false
      clearInterval(intervalId)
      unsub()
    }
  }, [rootPath])

  return { gitStatus }
}
