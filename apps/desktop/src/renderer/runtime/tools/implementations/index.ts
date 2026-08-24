import { ReadFileTool } from './ReadFileTool'
import { WriteFileTool } from './WriteFileTool'
import { EditFileTool } from './EditFileTool'
import { GlobTool } from './GlobTool'
import { GrepTool } from './GrepTool'
import { SearchContentTool } from './SearchContentTool'
import { BashTool } from './BashTool'
import { WebSearchTool } from './WebSearchTool'
import { WebFetchTool } from './WebFetchTool'
import { RunSkillTool } from './SkillTool'
import { QueryCodebaseTool } from './QueryCodebaseTool'
import { QueryGraphTool } from './QueryGraphTool'
import { SavePreferenceTool } from '@/core/tools/SavePreferenceTool'
import { QuestionTool } from './QuestionTool'
import { TodoWriteTool } from './TodoWriteTool'
import { RenameTool } from './RenameTool'
import { CodeExplainTool } from './CodeExplainTool'
import { GitCommitTool } from './GitCommitTool'
import { CodeCompletionTool } from './CodeCompletionTool'
import {
  GithubListIssuesTool,
  GithubCreateIssueTool,
  GithubCloseIssueTool,
  GithubListPullRequestsTool,
  GithubCreatePullRequestTool,
  GithubMergePullRequestTool,
  GithubSearchIssuesTool,
  GithubSearchRepoTool,
} from './github/github-tools'
import { GithubReviewPullRequestTool } from './github/GithubReviewPullRequestTool'
import { MemoryInfoTool } from './MemoryInfoTool'
import { SaveLearningTool } from './SaveLearningTool'

export const CODING_TOOLS = [
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  GlobTool,
  GrepTool,
  SearchContentTool,
  BashTool,
  WebSearchTool,
  WebFetchTool,
  RunSkillTool,
  QueryCodebaseTool,
  QueryGraphTool,
  SavePreferenceTool,
  QuestionTool,
  TodoWriteTool,
  RenameTool,
  CodeExplainTool,
  GitCommitTool,
  CodeCompletionTool,
  GithubListIssuesTool,
  GithubCreateIssueTool,
  GithubCloseIssueTool,
  GithubListPullRequestsTool,
  GithubCreatePullRequestTool,
  GithubMergePullRequestTool,
  GithubSearchIssuesTool,
  GithubSearchRepoTool,
  GithubReviewPullRequestTool,
  MemoryInfoTool,
  SaveLearningTool,
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
  RunSkillTool,
  QueryCodebaseTool,
  QueryGraphTool,
  SavePreferenceTool,
  QuestionTool,
  TodoWriteTool,
  RenameTool,
  CodeExplainTool,
  GitCommitTool,
  CodeCompletionTool,
  GithubListIssuesTool,
  GithubCreateIssueTool,
  GithubCloseIssueTool,
  GithubListPullRequestsTool,
  GithubCreatePullRequestTool,
  GithubMergePullRequestTool,
  GithubSearchIssuesTool,
  GithubSearchRepoTool,
  GithubReviewPullRequestTool,
  MemoryInfoTool,
  SaveLearningTool,
}
