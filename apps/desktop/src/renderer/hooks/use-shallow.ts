import { useRef } from 'react'

export function useShallow<T>(value: T): T {
  const ref = useRef(value)
  if (!shallowEqual(ref.current, value)) ref.current = value
  return ref.current
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false

  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)
  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false
  }
  return true
}
