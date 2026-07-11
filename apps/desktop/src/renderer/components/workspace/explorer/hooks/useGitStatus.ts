import { useState, useEffect, useRef } from "react"
import { getGitStatus } from "@/lib/git"
import type { GitStatusEntry } from "@pierre/trees"
import { useWorkspaceStore } from "@/stores/workspace-store"

const POLL_INTERVAL = 30000
const CACHE_TTL = 30000

const cache = new Map<string, { data: GitStatusEntry[]; ts: number }>()

export function useGitStatus(rootPath: string | null): GitStatusEntry[] {
  const [status, setStatus] = useState<GitStatusEntry[]>([])
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!rootPath) {
      setStatus([])
      return
    }

    const cached = cache.get(rootPath)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setStatus(cached.data)
      return
    }

    const fetch = async () => {
      const result = await getGitStatus(rootPath)
      cache.set(rootPath, { data: result, ts: Date.now() })
      setStatus(result)
    }
    fetch()

    pollRef.current = setInterval(fetch, POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [rootPath, fileTree])

  return status
}
