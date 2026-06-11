import { normalizeRole as registryNormalize, isRuntimeRole as registryIsRuntimeRole, getAllRuntimeRoles } from "@/runtime/runtime-role-registry"
import type { RuntimeRole } from "@/types"

export function normalizeRole(input: string): RuntimeRole | null {
  return registryNormalize(input)
}

export function isRuntimeRole(value: string): value is RuntimeRole {
  return registryIsRuntimeRole(value)
}

export { getAllRuntimeRoles as getRuntimeRoles }
