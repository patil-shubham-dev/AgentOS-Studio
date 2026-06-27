import type { AgentStore, OrchestrationStep, AgentAssignment } from "@/stores/agent-store"

export type WorkspacePanel = "code" | "browser" | "design" | "preview"

export type TabInteractionEvent =
  | { type: "TAB_CLICK"; panel: WorkspacePanel; timestamp: number }
  | { type: "AUTO_ROUTE"; from: WorkspacePanel; to: WorkspacePanel; reason: string }
  | { type: "ROUTE_BLOCKED_BY_USER"; from: WorkspacePanel; to: WorkspacePanel; reason: string }
  | { type: "ROUTING_RESOLUTION"; userPanel: WorkspacePanel | null; runtimePanel: WorkspacePanel | null; resolved: WorkspacePanel }

export interface PanelState {
  userTab: WorkspacePanel | null
  userTimestamp: number
  runtimeTab: WorkspacePanel | null
  resolvedTab: WorkspacePanel
  open: boolean
}

export class DisposableRegistry {
  private _fns: (() => void)[] = []

  add(fn: () => void): void {
    this._fns.push(fn)
  }

  addTimeout(id: ReturnType<typeof setTimeout>): void {
    this._fns.push(() => clearTimeout(id))
  }

  addEventListener(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options)
    this._fns.push(() => target.removeEventListener(type, handler, options))
  }

  clear(): void {
    for (const fn of this._fns) fn()
    this._fns = []
  }
}

export class WorkspacePanelController {
  readonly MANUAL_OVERRIDE_WINDOW = 5000

  private _state: PanelState
  private _disposables = new DisposableRegistry()
  private _diagnostics: TabInteractionEvent[] = []
  private _maxDiagnostics = 50

  private _onResolvedPanelChange: ((panel: WorkspacePanel) => void) | null = null
  private _onOpenChange: ((open: boolean) => void) | null = null

  constructor(initialPanel: WorkspacePanel, initialOpen: boolean) {
    this._state = {
      userTab: null,
      userTimestamp: 0,
      runtimeTab: null,
      resolvedTab: initialPanel,
      open: initialOpen,
    }
  }

  get state(): PanelState {
    return { ...this._state }
  }

  get diagnostics(): readonly TabInteractionEvent[] {
    return [...this._diagnostics]
  }

  get disposables(): DisposableRegistry {
    return this._disposables
  }

  /**
   * Sync the controller's open state to match React state when the user
   * toggles the panel via keyboard shortcut or toggle button (which bypass
   * the controller). This prevents the controller's internal open state
   * from desyncing from the actual UI state.
   */
  syncOpenState(open: boolean): void {
    this._state.open = open
  }

  setResolvedPanelChangeHandler(handler: ((panel: WorkspacePanel) => void) | null): void {
    this._onResolvedPanelChange = handler
  }

  setOpenChangeHandler(handler: ((open: boolean) => void) | null): void {
    this._onOpenChange = handler
  }

  handleManualTabClick(panel: WorkspacePanel): void {
    this._state.userTab = panel
    this._state.userTimestamp = Date.now()
    this._state.resolvedTab = panel
    this._state.open = true
    this._emit({ type: "TAB_CLICK", panel, timestamp: this._state.userTimestamp })
    this._onResolvedPanelChange?.(panel)
    this._onOpenChange?.(true)
  }

  updateRuntimeState(agentState: AgentStore): void {
    const now = Date.now()
    const recentlyManual = now - this._state.userTimestamp < this.MANUAL_OVERRIDE_WINDOW
    const runtimeTab = this._computeRuntimePanel(agentState)

    this._state.runtimeTab = runtimeTab

    let resolved: WorkspacePanel
    let didOverride = false

    if (runtimeTab && recentlyManual && this._state.userTab && runtimeTab !== this._state.userTab) {
      resolved = this._state.userTab
      this._emit({ type: "ROUTE_BLOCKED_BY_USER", from: this._state.resolvedTab, to: runtimeTab, reason: `manual override window (${this.MANUAL_OVERRIDE_WINDOW}ms)` })
      didOverride = true
    } else if (runtimeTab) {
      resolved = runtimeTab
      if (runtimeTab !== this._state.resolvedTab) {
        this._emit({ type: "AUTO_ROUTE", from: this._state.resolvedTab, to: runtimeTab, reason: this._reasonText(runtimeTab, agentState) })
      }
    } else {
      resolved = this._state.userTab ?? this._state.resolvedTab
    }

    if (resolved !== this._state.resolvedTab) {
      this._state.resolvedTab = resolved
      // Never auto-open or auto-close the panel — open state is user-controlled only
      this._onResolvedPanelChange?.(resolved)
    }

    this._emit({ type: "ROUTING_RESOLUTION", userPanel: this._state.userTab, runtimePanel: runtimeTab, resolved })
  }

  clearDiagnostics(): void {
    this._diagnostics = []
  }

  destroy(): void {
    this._disposables.clear()
    this._onResolvedPanelChange = null
    this._onOpenChange = null
    this._diagnostics = []
  }

  private _computeRuntimePanel(agentState: AgentStore): WorkspacePanel | null {
    const browserStep = agentState.orchestrationSteps.find(
      (s: OrchestrationStep) => s.agent === "browser" && s.status === "running",
    )
    const browserAssignment = agentState.agentAssignments.find(
      (a: AgentAssignment) => a.role === "browser" && a.status === "active",
    )
    if (browserStep || browserAssignment) return "browser"

    const designStep = agentState.orchestrationSteps.find(
      (s: OrchestrationStep) => s.agent === "design" && s.status === "running",
    )
    const designAssignment = agentState.agentAssignments.find(
      (a: AgentAssignment) => a.role === "design" && a.status === "active",
    )
    if (designStep || designAssignment) return "design"

    const codingStep = agentState.orchestrationSteps.find(
      (s: OrchestrationStep) => s.agent === "coder" && s.status === "running",
    )
    if (codingStep) return "code"

    return null
  }

  private _reasonText(panel: WorkspacePanel, agentState: AgentStore): string {
    switch (panel) {
      case "browser": return "browser agent running"
      case "design": return "design agent running"
      case "code": return "coder agent running"
      default: return ""
    }
  }

  private _emit(event: TabInteractionEvent): void {
    this._diagnostics.push(event)
    if (this._diagnostics.length > this._maxDiagnostics) {
      this._diagnostics.shift()
    }
    if (import.meta.env.DEV) {
      console.debug("[WorkspacePanelController]", event.type, event)
    }
  }
}
