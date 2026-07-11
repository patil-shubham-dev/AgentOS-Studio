import { useEffect, useRef } from "react"

const LOG_PREFIX = "[LeakDetector]"
const enabled = import.meta.env.DEV

interface ComponentLifetime {
  mounts: number
  unmounts: number
  active: number
  peak: number
}

const lifetimeMap = new Map<string, ComponentLifetime>()

export function trackLifetime(name: string): { current: number; peak: number } {
  if (!enabled) return { current: 0, peak: 0 }
  let entry = lifetimeMap.get(name)
  if (!entry) {
    entry = { mounts: 0, unmounts: 0, active: 0, peak: 0 }
    lifetimeMap.set(name, entry)
  }
  return { current: entry.active, peak: entry.peak }
}

function increment(name: string): void {
  if (!enabled) return
  let entry = lifetimeMap.get(name)
  if (!entry) {
    entry = { mounts: 0, unmounts: 0, active: 0, peak: 0 }
    lifetimeMap.set(name, entry)
  }
  entry.mounts++
  entry.active++
  if (entry.active > entry.peak) entry.peak = entry.active
}

function decrement(name: string): void {
  if (!enabled) return
  const entry = lifetimeMap.get(name)
  if (entry) {
    entry.unmounts++
    entry.active--
    if (entry.active < 0) {
      console.warn(`${LOG_PREFIX} NEGATIVE ACTIVE COUNT for "${name}" — possible double-unmount`)
      entry.active = 0
    }
  }
}

export function useLeakTracker(name: string): void {
  const nameRef = useRef(name)
  nameRef.current = name

  useEffect(() => {
    if (!enabled) return
    increment(nameRef.current)
    if (import.meta.env.DEV) {
      const entry = lifetimeMap.get(nameRef.current)
      if (entry && entry.mounts > 5) {
        console.warn(`${LOG_PREFIX} HIGH MOUNT COUNT: "${nameRef.current}" mounted ${entry.mounts}x`)
      }
    }
    return () => {
      if (!enabled) return
      decrement(nameRef.current)
    }
  }, [])
}

export function getLifetimeStats(): Map<string, ComponentLifetime> {
  return lifetimeMap
}

export function getActiveComponentCount(): number {
  let total = 0
  for (const [, entry] of lifetimeMap) {
    total += entry.active
  }
  return total
}

export function getTotalMounts(): number {
  let total = 0
  for (const [, entry] of lifetimeMap) {
    total += entry.mounts
  }
  return total
}

export function getTotalUnmounts(): number {
  let total = 0
  for (const [, entry] of lifetimeMap) {
    total += entry.unmounts
  }
  return total
}

export function assertStableLifetime(): string[] {
  const issues: string[] = []
  for (const [name, entry] of lifetimeMap) {
    if (Math.abs(entry.mounts - entry.unmounts) > 2) {
      issues.push(`${name}: mounts=${entry.mounts} unmounts=${entry.unmounts} active=${entry.active} peak=${entry.peak}`)
    }
    if (entry.active > 10) {
      issues.push(`${name}: HIGH ACTIVE COUNT (${entry.active})`)
    }
  }
  return issues
}

export function resetLifetimeTracking(): void {
  lifetimeMap.clear()
}
