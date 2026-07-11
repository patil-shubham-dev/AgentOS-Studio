import { EditDependencyGraph, type EditDependencyPlan } from "@/runtime/execution/EditDependencyGraph"

export interface EditValidation {
  allowed: boolean
  reason: string
  currentLayer: number
  blockedFile: string | null
  requiredLayer: number | null
  plan: EditDependencyPlan | null
}

export class EditExecutionController {
  private static instance: EditExecutionController
  private editDependency = new EditDependencyGraph()
  private currentPlan: EditDependencyPlan | null = null
  private currentLayerIndex = 0
  private committedLayers = new Set<number>()

  static getInstance(): EditExecutionController {
    if (!EditExecutionController.instance) {
      EditExecutionController.instance = new EditExecutionController()
    }
    return EditExecutionController.instance
  }

  beginEditCycle(files: string[]): EditDependencyPlan {
    const plan = this.editDependency.buildPlan(files)
    this.currentPlan = plan
    this.currentLayerIndex = 0
    this.committedLayers.clear()
    return plan
  }

  validate(files: string[]): EditValidation {
    const plan = this.editDependency.buildPlan(files)

    if (plan.hasCycle) {
      return {
        allowed: false,
        reason: `Circular dependency detected: ${plan.cyclePath.join(" → ")}. Resolve before editing.`,
        currentLayer: this.currentLayerIndex,
        blockedFile: null,
        requiredLayer: null,
        plan,
      }
    }

    const fileLayerMap = new Map<string, number>()
    for (const [depth, layer] of plan.layers.entries()) {
      for (const file of layer) {
        fileLayerMap.set(file, depth)
      }
    }

    for (const file of files) {
      const layer = fileLayerMap.get(file)
      if (layer === undefined) continue

      const node = plan.nodes.get(file)
      if (!node) continue

      for (const dep of node.dependsOn) {
        const depLayer = fileLayerMap.get(dep)
        if (depLayer !== undefined && depLayer > layer) {
          return {
            allowed: false,
            reason: `File "${file}" (layer ${layer}) depends on "${dep}" (layer ${depLayer}). Edit "${dep}" first.`,
            currentLayer: this.currentLayerIndex,
            blockedFile: file,
            requiredLayer: depLayer,
            plan,
          }
        }
      }
    }

    this.currentPlan = plan
    return {
      allowed: true,
      reason: "Edit order validated",
      currentLayer: this.currentLayerIndex,
      blockedFile: null,
      requiredLayer: null,
      plan,
    }
  }

  commitLayer(): void {
    this.committedLayers.add(this.currentLayerIndex)
    this.currentLayerIndex++
  }

  getCurrentLayer(): number {
    return this.currentLayerIndex
  }

  reset(): void {
    this.currentPlan = null
    this.currentLayerIndex = 0
    this.committedLayers.clear()
  }
}
