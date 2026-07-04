/**
 * @file feature-flags.ts
 * @description Re-exports the canonical feature flag API from the runtime layer.
 *
 * IMPORTANT: Do NOT add frozen/static flag snapshots here.
 * All flag reads must go through FeatureFlagManager so they are always live.
 * This ensures test resets, runtime overrides, and user settings work correctly.
 */

import { FeatureFlagManager, type FeatureFlag } from "@/runtime/feature-flags/FeatureFlagManager"

// Re-export the type for consumers who import from this module
export type { FeatureFlag }

export type RuntimeFeatureFlag = Extract<
  FeatureFlag,
  | "codingCore"
  | "browserIsland"
  | "designIsland"
  | "deviceControlIsland"
  | "browserToolsInCoding"
  | "designToolsInCoding"
  | "deviceToolsInCoding"
  | "browserContextInCoding"
  | "designContextInCoding"
  | "deviceContextInCoding"
  | "advancedAgents"
  | "longTermMemory"
  | "plugins"
  | "mcp"
>

/**
 * Read a feature flag. Always live — never a frozen snapshot.
 * This is the canonical way to check any feature flag in renderer code.
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FeatureFlagManager.getInstance().isEnabled(flag)
}

/**
 * @deprecated Use isFeatureEnabled() directly. This exists only for
 * backwards compatibility with older callers during migration.
 */
export function getDefaultFlags(): Record<RuntimeFeatureFlag, boolean> {
  const mgr = FeatureFlagManager.getInstance()
  return {
    codingCore: mgr.isEnabled("codingCore"),
    browserIsland: mgr.isEnabled("browserIsland"),
    designIsland: mgr.isEnabled("designIsland"),
    deviceControlIsland: mgr.isEnabled("deviceControlIsland"),
    browserToolsInCoding: mgr.isEnabled("browserToolsInCoding"),
    designToolsInCoding: mgr.isEnabled("designToolsInCoding"),
    deviceToolsInCoding: mgr.isEnabled("deviceToolsInCoding"),
    browserContextInCoding: mgr.isEnabled("browserContextInCoding"),
    designContextInCoding: mgr.isEnabled("designContextInCoding"),
    deviceContextInCoding: mgr.isEnabled("deviceContextInCoding"),
    advancedAgents: mgr.isEnabled("advancedAgents"),
    longTermMemory: mgr.isEnabled("longTermMemory"),
    plugins: mgr.isEnabled("plugins"),
    mcp: mgr.isEnabled("mcp"),
  }
}

/**
 * @deprecated Use isFeatureEnabled() directly.
 */
export function getDisabledFutureIslandFlags(): Record<RuntimeFeatureFlag, boolean> {
  return {
    ...getDefaultFlags(),
    browserIsland: false,
    designIsland: false,
    deviceControlIsland: false,
    browserToolsInCoding: false,
    designToolsInCoding: false,
    deviceToolsInCoding: false,
    browserContextInCoding: false,
    designContextInCoding: false,
    deviceContextInCoding: false,
  }
}
