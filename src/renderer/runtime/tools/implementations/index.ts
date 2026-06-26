import { ReadFileTool } from './ReadFileTool'
import { WriteFileTool } from './WriteFileTool'
import { EditFileTool } from './EditFileTool'
import { GlobTool } from './GlobTool'
import { GrepTool } from './GrepTool'
import { SearchContentTool } from './SearchContentTool'
import { BashTool } from './BashTool'
import { WebSearchTool } from './WebSearchTool'
import { WebFetchTool } from './WebFetchTool'
import { DelegateSubtaskTool } from './DelegateTool'
import { RunSkillTool } from './SkillTool'
import { QueryCodebaseTool } from './QueryCodebaseTool'
import { QueryGraphTool } from './QueryGraphTool'
import { DesignCreateArtifactTool, DesignAddVersionTool, DesignGeneratePreviewTool } from './DesignTools'
import {
  LaunchBrowserTool, BrowserNavigateTool, BrowserScreenshotTool,
  BrowserClickTool, BrowserFillTool, BrowserExecuteJsTool,
  BrowserGetTitleTool, BrowserGetTextTool, BrowserWaitTool,
  BrowserCloseTool, BrowserGetUrlTool, BrowserPressKeyTool,
  BrowserReloadTool, BrowserNewTabTool, BrowserListTabsTool,
} from './BrowserTools'

export const ALL_BUILTIN_TOOLS = [
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  GlobTool,
  GrepTool,
  SearchContentTool,
  BashTool,
  WebSearchTool,
  WebFetchTool,
  DelegateSubtaskTool,
  RunSkillTool,
  QueryCodebaseTool,
  QueryGraphTool,
  DesignCreateArtifactTool,
  DesignAddVersionTool,
  DesignGeneratePreviewTool,
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

export {
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  GlobTool,
  GrepTool,
  SearchContentTool,
  BashTool,
  WebSearchTool,
  WebFetchTool,
  DelegateSubtaskTool,
  RunSkillTool,
  QueryCodebaseTool,
  QueryGraphTool,
  DesignCreateArtifactTool,
  DesignAddVersionTool,
  DesignGeneratePreviewTool,
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
}
