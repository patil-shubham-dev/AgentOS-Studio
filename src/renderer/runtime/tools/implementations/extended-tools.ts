import { DesignCreateArtifactTool, DesignAddVersionTool, DesignGeneratePreviewTool } from './DesignTools'
import {
  LaunchBrowserTool, BrowserNavigateTool, BrowserScreenshotTool,
  BrowserClickTool, BrowserFillTool, BrowserExecuteJsTool,
  BrowserGetTitleTool, BrowserGetTextTool, BrowserWaitTool,
  BrowserCloseTool, BrowserGetUrlTool, BrowserPressKeyTool,
  BrowserReloadTool, BrowserNewTabTool, BrowserListTabsTool,
} from './BrowserTools'
import { CODING_TOOLS } from './index'
export { CODING_TOOLS }

export const DESIGN_TOOLS = [
  DesignCreateArtifactTool,
  DesignAddVersionTool,
  DesignGeneratePreviewTool,
]

export const BROWSER_TOOLS = [
  LaunchBrowserTool,
  BrowserNavigateTool,
  BrowserScreenshotTool,
  BrowserClickTool,
  BrowserFillTool,
  BrowserExecuteJsTool,
  BrowserGetTitleTool,
  BrowserGetTextTool,
  BrowserWaitTool,
  BrowserCloseTool,
  BrowserGetUrlTool,
  BrowserPressKeyTool,
  BrowserReloadTool,
  BrowserNewTabTool,
  BrowserListTabsTool,
]

export const ALL_BUILTIN_TOOLS = [
  ...CODING_TOOLS,
  ...DESIGN_TOOLS,
  ...BROWSER_TOOLS,
]
