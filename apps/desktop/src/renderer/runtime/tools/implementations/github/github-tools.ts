import { buildTool, ToolCapabilities, type AgentTool, type ToolContext, type ToolResult } from '../../core'
import { GitHubClient } from '@/lib/github/github-client'
import { reviewDiff } from './ReviewChecker'
import { PRReviewStore } from './PRReviewStore'

function getClient(ctx: ToolContext): GitHubClient {
  const token = ctx.env?.GITHUB_API_TOKEN || process.env.GITHUB_API_TOKEN
  return GitHubClient.getInstance(token)
}

function formatIssue(issue: Record<string, unknown>): string {
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((l: unknown) => (typeof l === 'string' ? l : (l as Record<string, string>).name || '')).join(', ')
    : ''
  const assignees = Array.isArray(issue.assignees)
    ? issue.assignees.map((a: unknown) => (a as Record<string, string>).login || '').filter(Boolean).join(', ')
    : ''
  return [
    `## #${issue.number}: ${issue.title}`,
    `State: ${issue.state}`,
    issue.state_reason ? `Reason: ${issue.state_reason}` : null,
    labels ? `Labels: ${labels}` : null,
    assignees ? `Assignees: ${assignees}` : null,
    `Created: ${issue.created_at}`,
    `Updated: ${issue.updated_at}`,
    issue.body ? `\nBody:\n${(issue.body as string).slice(0, 2000)}` : null,
  ].filter(Boolean).join('\n')
}

function formatPullRequest(pr: Record<string, unknown>): string {
  const labels = Array.isArray(pr.labels)
    ? pr.labels.map((l: unknown) => (typeof l === 'string' ? l : (l as Record<string, string>).name || '')).join(', ')
    : ''
  return [
    `## #${pr.number}: ${pr.title}`,
    `State: ${pr.state}`,
    pr.draft ? '⚠️ Draft' : null,
    `Head: ${(pr.head as Record<string, string>)?.label || ''}`,
    `Base: ${(pr.base as Record<string, string>)?.label || ''}`,
    pr.merged ? '✅ Merged' : null,
    labels ? `Labels: ${labels}` : null,
    `Created: ${pr.created_at}`,
    `Updated: ${pr.updated_at}`,
    pr.body ? `\nBody:\n${(pr.body as string).slice(0, 2000)}` : null,
  ].filter(Boolean).join('\n')
}

function formatRepository(repo: Record<string, unknown>): string {
  return [
    `# ${repo.full_name}`,
    repo.description ? `${repo.description}` : null,
    `🌐 ${repo.html_url}`,
    `Visibility: ${repo.private ? 'Private' : 'Public'}`,
    `Default Branch: ${repo.default_branch}`,
    `Language: ${repo.language || 'N/A'}`,
    `Stars: ${repo.stargazers_count}  |  Forks: ${repo.forks_count}  |  Issues: ${repo.open_issues_count}`,
    repo.topics ? `Topics: ${(repo.topics as string[]).join(', ')}` : null,
    repo.license ? `License: ${(repo.license as Record<string, string>).name}` : null,
    `Created: ${repo.created_at}  |  Updated: ${repo.pushed_at}`,
  ].filter(Boolean).join('\n')
}

export const GithubListIssuesTool: AgentTool = buildTool({
  name: 'github_list_issues',
  description: 'List issues in a GitHub repository with optional filters (state, labels, assignee, milestone, sort, direction)',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner (user or organization)' },
      repo: { type: 'string', description: 'Repository name' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter (default: open)' },
      labels: { type: 'string', description: 'Comma-separated list of label names' },
      assignee: { type: 'string', description: 'Username to filter by assignee' },
      milestone: { type: 'string', description: 'Milestone number or title' },
      sort: { type: 'string', enum: ['created', 'updated', 'comments'], description: 'Sort field (default: created)' },
      direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (default: desc)' },
      per_page: { type: 'number', description: 'Results per page (max 100, default: 30)' },
      page: { type: 'number', description: 'Page number' },
    },
    required: ['owner', 'repo'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.NETWORK],
  getActivityDescription: (input) => {
    const owner = (input as Record<string, unknown>)?.owner
    const repo = (input as Record<string, unknown>)?.repo
    return owner && repo ? `Listing issues for ${owner}/${repo}` : 'Listing GitHub issues'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const owner = String(input.owner ?? '')
    const repo = String(input.repo ?? '')
    if (!owner || !repo) return { data: null, error: 'owner and repo are required', isError: true }
    try {
      const client = getClient(ctx)
      const issues = await client.listIssues(owner, repo, {
        state: input.state as 'open' | 'closed' | 'all' | undefined,
        labels: input.labels as string | undefined,
        assignee: input.assignee as string | undefined,
        milestone: input.milestone as string | undefined,
        sort: input.sort as 'created' | 'updated' | 'comments' | undefined,
        direction: input.direction as 'asc' | 'desc' | undefined,
        per_page: input.per_page as number | undefined,
        page: input.page as number | undefined,
      })
      if (issues.length === 0) {
        return { data: `No issues found for ${owner}/${repo}.` }
      }
      const header = `# Issues for ${owner}/${repo} (${issues.length})\n\n`
      const body = issues.map((i) => formatIssue(i as unknown as Record<string, unknown>)).join('\n---\n')
      return { data: header + body }
    } catch (e) {
      return { data: null, error: `GitHub list issues failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})

export const GithubCreateIssueTool: AgentTool = buildTool({
  name: 'github_create_issue',
  description: 'Create a new issue in a GitHub repository',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      title: { type: 'string', description: 'Issue title' },
      body: { type: 'string', description: 'Issue body content' },
      labels: { type: 'array', items: { type: 'string' }, description: 'Labels to apply' },
      assignees: { type: 'array', items: { type: 'string' }, description: 'Usernames to assign' },
      milestone: { type: 'number', description: 'Milestone number' },
    },
    required: ['owner', 'repo', 'title'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.NETWORK],
  permissions: async () => ({ behavior: 'ask', reason: 'Create a new GitHub issue' }),
  getActivityDescription: (input) => {
    const owner = (input as Record<string, unknown>)?.owner
    const repo = (input as Record<string, unknown>)?.repo
    const title = (input as Record<string, unknown>)?.title
    const t = title ? `"${String(title).slice(0, 60)}"` : ''
    return owner && repo ? `Creating issue ${t} in ${owner}/${repo}` : 'Creating GitHub issue'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const owner = String(input.owner ?? '')
    const repo = String(input.repo ?? '')
    const title = String(input.title ?? '')
    if (!owner || !repo) return { data: null, error: 'owner and repo are required', isError: true }
    if (!title) return { data: null, error: 'title is required', isError: true }
    try {
      const client = getClient(ctx)
      const issue = await client.createIssue(owner, repo, {
        title,
        body: input.body as string | undefined,
        labels: input.labels as string[] | undefined,
        assignees: input.assignees as string[] | undefined,
        milestone: input.milestone as number | undefined,
      })
      return { data: `✅ Issue created successfully!\n\n${formatIssue(issue as unknown as Record<string, unknown>)}\n\n🔗 ${issue.html_url}` }
    } catch (e) {
      return { data: null, error: `GitHub create issue failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})

export const GithubCloseIssueTool: AgentTool = buildTool({
  name: 'github_close_issue',
  description: 'Close an issue in a GitHub repository',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      issue_number: { type: 'number', description: 'Issue number to close' },
    },
    required: ['owner', 'repo', 'issue_number'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.NETWORK],
  permissions: async () => ({ behavior: 'ask', reason: 'Close a GitHub issue' }),
  getActivityDescription: (input) => {
    const owner = (input as Record<string, unknown>)?.owner
    const repo = (input as Record<string, unknown>)?.repo
    const num = (input as Record<string, unknown>)?.issue_number
    return owner && repo ? `Closing issue #${num} in ${owner}/${repo}` : 'Closing GitHub issue'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const owner = String(input.owner ?? '')
    const repo = String(input.repo ?? '')
    const issueNumber = Number(input.issue_number)
    if (!owner || !repo) return { data: null, error: 'owner and repo are required', isError: true }
    if (!issueNumber) return { data: null, error: 'issue_number is required', isError: true }
    try {
      const client = getClient(ctx)
      const issue = await client.closeIssue(owner, repo, issueNumber)
      return { data: `✅ Issue #${issueNumber} closed successfully!\n\n${formatIssue(issue as unknown as Record<string, unknown>)}\n\n🔗 ${issue.html_url}` }
    } catch (e) {
      return { data: null, error: `GitHub close issue failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})

export const GithubListPullRequestsTool: AgentTool = buildTool({
  name: 'github_list_pull_requests',
  description: 'List pull requests in a GitHub repository',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'PR state filter (default: open)' },
      sort: { type: 'string', enum: ['created', 'updated', 'popularity', 'long-running'], description: 'Sort field' },
      direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
      per_page: { type: 'number', description: 'Results per page (max 100, default: 30)' },
      page: { type: 'number', description: 'Page number' },
    },
    required: ['owner', 'repo'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.NETWORK],
  getActivityDescription: (input) => {
    const owner = (input as Record<string, unknown>)?.owner
    const repo = (input as Record<string, unknown>)?.repo
    return owner && repo ? `Listing pull requests for ${owner}/${repo}` : 'Listing GitHub pull requests'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const owner = String(input.owner ?? '')
    const repo = String(input.repo ?? '')
    if (!owner || !repo) return { data: null, error: 'owner and repo are required', isError: true }
    try {
      const client = getClient(ctx)
      const prs = await client.listPullRequests(owner, repo, {
        state: input.state as 'open' | 'closed' | 'all' | undefined,
        sort: input.sort as 'created' | 'updated' | 'popularity' | 'long-running' | undefined,
        direction: input.direction as 'asc' | 'desc' | undefined,
        per_page: input.per_page as number | undefined,
        page: input.page as number | undefined,
      })
      if (prs.length === 0) {
        return { data: `No pull requests found for ${owner}/${repo}.` }
      }
      const header = `# Pull Requests for ${owner}/${repo} (${prs.length})\n\n`
      const body = prs.map((pr) => formatPullRequest(pr as unknown as Record<string, unknown>)).join('\n---\n')
      return { data: header + body }
    } catch (e) {
      return { data: null, error: `GitHub list PRs failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})

export const GithubCreatePullRequestTool: AgentTool = buildTool({
  name: 'github_create_pull_request',
  description: 'Create a pull request in a GitHub repository',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      title: { type: 'string', description: 'Pull request title' },
      head: { type: 'string', description: 'Branch name containing changes' },
      base: { type: 'string', description: 'Branch name to merge into' },
      body: { type: 'string', description: 'Pull request body content' },
      draft: { type: 'boolean', description: 'Create as draft PR' },
    },
    required: ['owner', 'repo', 'title', 'head', 'base'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.NETWORK],
  permissions: async () => ({ behavior: 'ask', reason: 'Create a new GitHub pull request' }),
  getActivityDescription: (input) => {
    const owner = (input as Record<string, unknown>)?.owner
    const repo = (input as Record<string, unknown>)?.repo
    const title = (input as Record<string, unknown>)?.title
    const t = title ? `"${String(title).slice(0, 60)}"` : ''
    return owner && repo ? `Creating PR ${t} in ${owner}/${repo}` : 'Creating GitHub pull request'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const owner = String(input.owner ?? '')
    const repo = String(input.repo ?? '')
    const title = String(input.title ?? '')
    const head = String(input.head ?? '')
    const base = String(input.base ?? '')
    if (!owner || !repo) return { data: null, error: 'owner and repo are required', isError: true }
    if (!title) return { data: null, error: 'title is required', isError: true }
    if (!head) return { data: null, error: 'head branch is required', isError: true }
    if (!base) return { data: null, error: 'base branch is required', isError: true }
    try {
      const client = getClient(ctx)
      const pr = await client.createPullRequest(owner, repo, {
        title,
        head,
        base,
        body: input.body as string | undefined,
        draft: input.draft as boolean | undefined,
      })

      let selfReviewMsg = ''
      try {
        const diffText = await client.getPullRequestDiff(owner, repo, pr.number)
        if (diffText) {
          const checkResult = reviewDiff(diffText)
          if (!checkResult.passed) {
            selfReviewMsg = `\n\n---\n### 🤖 Self-Review\n${checkResult.summary}\n\nIssues found:\n`
            for (const r of checkResult.results.slice(0, 10)) {
              selfReviewMsg += `- [${r.severity}] ${r.file}:${r.line} — ${r.message}\n`
            }
            if (checkResult.results.length > 10) {
              selfReviewMsg += `- ... and ${checkResult.results.length - 10} more\n`
            }

            await client.createPullRequestReview(owner, repo, pr.number, {
              body: selfReviewMsg,
              event: 'COMMENT',
            })
            selfReviewMsg += '\n\n_A self-review comment has been posted._'

            PRReviewStore.getInstance().add({
              id: `${owner}/${repo}/pr/${pr.number}`,
              owner,
              repo,
              prNumber: pr.number,
              prTitle: pr.title || '',
              event: 'COMMENT',
              summary: checkResult.summary,
              autoCheckPassed: checkResult.passed,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          } else {
            selfReviewMsg = '\n\n✅ **Self-review**: No issues detected.'
          }
        }
      } catch {
        selfReviewMsg = '\n\n⚠️ Self-review skipped (could not fetch diff).'
      }

      return { data: `✅ Pull request created successfully!\n\n${formatPullRequest(pr as unknown as Record<string, unknown>)}\n\n🔗 ${pr.html_url}${selfReviewMsg}` }
    } catch (e) {
      return { data: null, error: `GitHub create PR failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})

export const GithubMergePullRequestTool: AgentTool = buildTool({
  name: 'github_merge_pull_request',
  description: 'Merge a pull request in a GitHub repository',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      pull_number: { type: 'number', description: 'Pull request number to merge' },
      merge_method: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Merge method (default: merge)' },
    },
    required: ['owner', 'repo', 'pull_number'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.NETWORK],
  permissions: async () => ({ behavior: 'ask', reason: 'Merge a GitHub pull request' }),
  getActivityDescription: (input) => {
    const owner = (input as Record<string, unknown>)?.owner
    const repo = (input as Record<string, unknown>)?.repo
    const num = (input as Record<string, unknown>)?.pull_number
    return owner && repo ? `Merging PR #${num} in ${owner}/${repo}` : 'Merging GitHub pull request'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const owner = String(input.owner ?? '')
    const repo = String(input.repo ?? '')
    const prNumber = Number(input.pull_number)
    const mergeMethod = input.merge_method as 'merge' | 'squash' | 'rebase' | undefined
    if (!owner || !repo) return { data: null, error: 'owner and repo are required', isError: true }
    if (!prNumber) return { data: null, error: 'pull_number is required', isError: true }
    try {
      const client = getClient(ctx)
      const result = await client.mergePullRequest(owner, repo, prNumber, mergeMethod)
      return { data: `✅ Pull request #${prNumber} merged!\nSHA: ${result.sha}\nMessage: ${result.message}` }
    } catch (e) {
      return { data: null, error: `GitHub merge PR failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})

export const GithubSearchIssuesTool: AgentTool = buildTool({
  name: 'github_search_issues',
  description: 'Search for issues and pull requests using GitHub search syntax',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (supports GitHub search qualifiers like is:issue, is:pr, label:, author:, etc.)' },
      sort: { type: 'string', enum: ['comments', 'reactions', 'interactions', 'created', 'updated'], description: 'Sort field' },
      order: { type: 'string', enum: ['desc', 'asc'], description: 'Sort order (default: desc)' },
      per_page: { type: 'number', description: 'Results per page (max 100, default: 30)' },
      page: { type: 'number', description: 'Page number' },
    },
    required: ['query'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.NETWORK],
  getActivityDescription: (input) => {
    const q = (input as Record<string, unknown>)?.query
    return q ? `Searching GitHub issues for "${String(q).slice(0, 60)}"` : 'Searching GitHub issues'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const query = String(input.query ?? '')
    if (!query) return { data: null, error: 'query is required', isError: true }
    try {
      const client = getClient(ctx)
      const result = await client.searchIssues(query, {
        sort: input.sort as 'comments' | 'reactions' | 'interactions' | 'created' | 'updated' | undefined,
        order: input.order as 'desc' | 'asc' | undefined,
        per_page: input.per_page as number | undefined,
        page: input.page as number | undefined,
      })
      if (result.total_count === 0) {
        return { data: 'No results found for your search query.' }
      }
      const header = `# Search Results (${result.total_count} total)\n\n`
      const body = result.items.map((item) => formatIssue(item as unknown as Record<string, unknown>)).join('\n---\n')
      return { data: header + body }
    } catch (e) {
      return { data: null, error: `GitHub search issues failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})

export const GithubSearchRepoTool: AgentTool = buildTool({
  name: 'github_search_repo',
  description: 'Get detailed information about a GitHub repository',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
    },
    required: ['owner', 'repo'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.NETWORK],
  getActivityDescription: (input) => {
    const owner = (input as Record<string, unknown>)?.owner
    const repo = (input as Record<string, unknown>)?.repo
    return owner && repo ? `Getting repository info for ${owner}/${repo}` : 'Getting GitHub repository info'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const owner = String(input.owner ?? '')
    const repo = String(input.repo ?? '')
    if (!owner || !repo) return { data: null, error: 'owner and repo are required', isError: true }
    try {
      const client = getClient(ctx)
      const repository = await client.getRepository(owner, repo)
      return { data: formatRepository(repository as unknown as Record<string, unknown>) }
    } catch (e) {
      return { data: null, error: `GitHub search repo failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
