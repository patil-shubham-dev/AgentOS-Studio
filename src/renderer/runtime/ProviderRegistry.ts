import type { ProviderInstance, ProviderType, RuntimeRole, RoleAssignment, ModelCapabilities } from "./ProviderInstance"
import { createRoleAssignment } from "./ProviderInstance"

export class ProviderRegistry {
  private instances = new Map<string, ProviderInstance>()
  private assignments = new Map<RuntimeRole, RoleAssignment>()

  register(instance: ProviderInstance): void {
    this.instances.set(instance.instanceId, instance)
  }

  registerMultiple(instances: ProviderInstance[]): void {
    for (const inst of instances) {
      this.instances.set(inst.instanceId, inst)
    }
  }

  get(instanceId: string): ProviderInstance | undefined {
    return this.instances.get(instanceId)
  }

  getByProviderType(type: ProviderType): ProviderInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.providerType === type)
  }

  getByModel(model: string): ProviderInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.model === model)
  }

  getAll(): ProviderInstance[] {
    return Array.from(this.instances.values())
  }

  unregister(instanceId: string): void {
    this.instances.delete(instanceId)
    for (const [role, assignment] of this.assignments) {
      if (assignment.providerInstanceId === instanceId) {
        this.assignments.delete(role)
      }
    }
  }

  assignRole(role: RuntimeRole, instanceId: string): boolean {
    const instance = this.instances.get(instanceId)
    if (!instance) return false
    this.assignments.set(role, createRoleAssignment(role, instance))
    return true
  }

  unassignRole(role: RuntimeRole): void {
    this.assignments.delete(role)
  }

  getAssignment(role: RuntimeRole): RoleAssignment | undefined {
    return this.assignments.get(role)
  }

  getAllAssignments(): RoleAssignment[] {
    return Array.from(this.assignments.values())
  }

  getValidAssignments(): RoleAssignment[] {
    return this.getAllAssignments().filter((a) => a.isValid)
  }

  getUnassignedRoles(): RuntimeRole[] {
    const allRoles: RuntimeRole[] = ["manager", "coder", "vision", "research", "runtime", "design", "qa", "browser", "memory", "fast-inference"]
    return allRoles.filter((r) => !this.assignments.has(r))
  }

  getInvalidAssignments(): RoleAssignment[] {
    return this.getAllAssignments().filter((a) => !a.isValid)
  }

  findCompatibleInstances(role: RuntimeRole): ProviderInstance[] {
    return this.getAll().filter((inst) => {
      return !createRoleAssignment(role, inst).validationErrors.length
    })
  }

  findBestInstance(role: RuntimeRole): ProviderInstance | null {
    const compatible = this.findCompatibleInstances(role)
    if (compatible.length === 0) return null
    compatible.sort((a, b) => b.capabilities.maxContext - a.capabilities.maxContext)
    return compatible[0]
  }

  autoAssign(role: RuntimeRole): boolean {
    const existing = this.getAssignment(role)
    if (existing?.isValid) return true

    const best = this.findBestInstance(role)
    if (!best) return false

    return this.assignRole(role, best.instanceId)
  }

  autoAssignAll(): { assigned: number; failed: number } {
    const allRoles: RuntimeRole[] = ["manager", "coder", "vision", "research", "runtime", "design", "qa", "browser", "memory", "fast-inference"]
    let assigned = 0
    let failed = 0

    for (const role of allRoles) {
      if (this.autoAssign(role)) {
        assigned++
      } else {
        failed++
      }
    }

    return { assigned, failed }
  }

  clear(): void {
    this.instances.clear()
    this.assignments.clear()
  }

  getSummary(): {
    providers: number
    rolesAssigned: number
    rolesUnassigned: number
    validAssignments: number
    invalidAssignments: number
  } {
    const allRoles: RuntimeRole[] = ["manager", "coder", "vision", "research", "runtime", "design", "qa", "browser", "memory", "fast-inference"]
    return {
      providers: this.instances.size,
      rolesAssigned: this.assignments.size,
      rolesUnassigned: allRoles.length - this.assignments.size,
      validAssignments: this.getValidAssignments().length,
      invalidAssignments: this.getInvalidAssignments().length,
    }
  }
}
