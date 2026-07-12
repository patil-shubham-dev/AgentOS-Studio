import { useState, useEffect } from "react"
import { StartupTiming } from "@/lib/startup-timing"

export interface LoadTimingEntry {
  time: number
  elapsed: number
  duration: number
}

export interface LoadTimingsSnapshot {
  [markerName: string]: LoadTimingEntry
}

export function useLoadTimings(): LoadTimingsSnapshot {
  const [timings, setTimings] = useState<LoadTimingsSnapshot>(() =>
    StartupTiming.getAll(),
  )

  useEffect(() => {
    const update = () => setTimings(StartupTiming.getAll())
    update()
    const id = setInterval(update, 1000)
    const stop = setTimeout(() => clearInterval(id), 30_000)
    return () => {
      clearInterval(id)
      clearTimeout(stop)
    }
  }, [])

  return timings
}
