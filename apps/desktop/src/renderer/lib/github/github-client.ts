export interface GitHubUser {
  login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string | null
  url: string
  html_url: string
  followers_url: string
  following_url: string
  gists_url: string
  starred_url: string
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  events_url: string
  received_events_url: string
  type: string
  site_admin: boolean
  name: string | null
  company: string | null
  blog: string | null
  location: string | null
  email: string | null
  hireable: boolean | null
  bio: string | null
  twitter_username: string | null
  public_repos: number
  public_gists: number
  followers: number
  following: number
  created_at: string
  updated_at: string
}

export interface GitHubLabel {
  id: number
  node_id: string
  url: string
  name: string
  description: string | null
  color: string
  default: boolean
}

export interface GitHubMilestone {
  url: string
  html_url: string
  labels_url: string
  id: number
  node_id: string
  number: number
  state: string
  title: string
  description: string
  creator: GitHubUser
  open_issues: number
  closed_issues: number
  created_at: string
  updated_at: string
  closed_at: string | null
  due_on: string | null
}

export interface GitHubPullRequestRef {
  label: string
  ref: string
  sha: string
  user: GitHubUser
  repo: GitHubRepository | null
}

export interface GitHubIssue {
  id: number
  node_id: string
  url: string
  repository_url: string
  labels_url: string
  comments_url: string
  events_url: string
  html_url: string
  number: number
  state: string
  state_reason?: string | null
  title: string
  body: string | null
  user: GitHubUser | null
  labels: (GitHubLabel | string)[]
  assignee: GitHubUser | null
  assignees: GitHubUser[]
  milestone: GitHubMilestone | null
  locked: boolean
  active_lock_reason: string | null
  comments: number
  pull_request?: {
    url: string
    html_url: string
    diff_url: string
    patch_url: string
    merged_at: string | null
  }
  closed_at: string | null
  created_at: string
  updated_at: string
  closed_by: GitHubUser | null
  author_association: string
  body_text?: string | null
  body_html?: string | null
  timeline_url?: string
  repository?: GitHubRepository
  performed_via_github_app?: boolean | null
  draft?: boolean
}

export interface GitHubPullRequest {
  id: number
  node_id: string
  url: string
  html_url: string
  diff_url: string
  patch_url: string
  issue_url: string
  commits_url: string
  review_comments_url: string
  review_comment_url: string
  comments_url: string
  statuses_url: string
  number: number
  state: string
  locked: boolean
  title: string
  user: GitHubUser
  body: string | null
  labels: GitHubLabel[]
  milestone: GitHubMilestone | null
  active_lock_reason: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  merged_at: string | null
  merge_commit_sha: string | null
  assignee: GitHubUser | null
  assignees: GitHubUser[]
  requested_reviewers: GitHubUser[]
  requested_teams: { id: number; slug: string }[]
  head: GitHubPullRequestRef
  base: GitHubPullRequestRef
  _links: Record<string, { href: string }>
  author_association: string
  auto_merge: unknown | null
  draft: boolean
  merged: boolean
  mergeable: boolean | null
  rebaseable: boolean | null
  mergeable_state: string
  merged_by: GitHubUser | null
  comments: number
  review_comments: number
  maintainer_can_modify: boolean
  commits: number
  additions: number
  deletions: number
  changed_files: number
}

export interface GitHubRepository {
  id: number
  node_id: string
  name: string
  full_name: string
  owner: GitHubUser
  private: boolean
  html_url: string
  description: string | null
  fork: boolean
  url: string
  archive_url: string
  assignees_url: string
  blobs_url: string
  branches_url: string
  collaborators_url: string
  comments_url: string
  commits_url: string
  compare_url: string
  contents_url: string
  contributors_url: string
  deployments_url: string
  downloads_url: string
  events_url: string
  forks_url: string
  git_commits_url: string
  git_refs_url: string
  git_tags_url: string
  git_url: string
  issue_comment_url: string
  issue_events_url: string
  issues_url: string
  keys_url: string
  labels_url: string
  languages_url: string
  merges_url: string
  milestones_url: string
  notifications_url: string
  pulls_url: string
  releases_url: string
  ssh_url: string
  stargazers_url: string
  statuses_url: string
  subscribers_url: string
  subscription_url: string
  tags_url: string
  teams_url: string
  trees_url: string
  clone_url: string
  mirror_url: string | null
  hooks_url: string
  svn_url: string
  homepage: string | null
  language: string | null
  forks_count: number
  stargazers_count: number
  watchers_count: number
  size: number
  default_branch: string
  open_issues_count: number
  is_template: boolean
  topics: string[]
  has_issues: boolean
  has_projects: boolean
  has_wiki: boolean
  has_pages: boolean
  has_downloads: boolean
  has_discussions: boolean
  archived: boolean
  disabled: boolean
  visibility: string
  pushed_at: string
  created_at: string
  updated_at: string
  allow_rebase_merge: boolean
  allow_squash_merge: boolean
  allow_auto_merge: boolean
  delete_branch_on_merge: boolean
  allow_merge_commit: boolean
  allow_forking: boolean
  web_commit_signoff_required: boolean
  license: { key: string; name: string; spdx_id: string; url: string | null; node_id: string } | null
  forks: number
  open_issues: number
  watchers: number
  default_branch: string
  temp_clone_token: string | null
  network_count: number
  subscribers_count: number
}

export interface GitHubComment {
  id: number
  node_id: string
  url: string
  html_url: string
  body: string
  body_text?: string
  body_html?: string
  user: GitHubUser
  created_at: string
  updated_at: string
  issue_url: string
  author_association: string
  performed_via_github_app: boolean | null
  reactions?: {
    url: string
    total_count: number
    "+1": number
    "-1": number
    laugh: number
    hooray: number
    confused: number
    heart: number
    rocket: number
    eyes: number
  }
}

export interface GitHubSearchResult<T> {
  total_count: number
  incomplete_results: boolean
  items: T[]
}

export interface GitHubFileContent {
  type: string
  encoding: string
  size: number
  name: string
  path: string
  content: string
  sha: string
  url: string
  git_url: string
  html_url: string
  download_url: string | null
  _links: { git: string; html: string; self: string }
}

export interface GitHubRateLimit {
  resources: {
    core: { limit: number; remaining: number; reset: number; used: number }
    search: { limit: number; remaining: number; reset: number; used: number }
    graphql: { limit: number; remaining: number; reset: number; used: number }
    integration_manifest: { limit: number; remaining: number; reset: number; used: number }
    source_import: { limit: number; remaining: number; reset: number; used: number }
    code_search: { limit: number; remaining: number; reset: number; used: number }
  }
  rate: { limit: number; remaining: number; reset: number; used: number }
}

export interface ListIssuesParams {
  state?: 'open' | 'closed' | 'all'
  labels?: string
  assignee?: string
  milestone?: string | number
  sort?: 'created' | 'updated' | 'comments'
  direction?: 'asc' | 'desc'
  since?: string
  per_page?: number
  page?: number
}

export interface CreateIssueParams {
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
  milestone?: number
}

export interface UpdateIssueParams {
  title?: string
  body?: string
  state?: 'open' | 'closed'
  state_reason?: 'completed' | 'not_planned' | 'reopened'
  labels?: string[]
  assignees?: string[]
  milestone?: number | null
}

export interface ListPullRequestsParams {
  state?: 'open' | 'closed' | 'all'
  head?: string
  base?: string
  sort?: 'created' | 'updated' | 'popularity' | 'long-running'
  direction?: 'asc' | 'desc'
  per_page?: number
  page?: number
}

export interface CreatePullRequestParams {
  title: string
  head: string
  base: string
  body?: string
  draft?: boolean
  maintainer_can_modify?: boolean
}

export interface SearchIssuesParams {
  sort?: 'comments' | 'reactions' | 'reactions-+1' | 'reactions--1' | 'reactions-smile' | 'reactions-thinking_face' | 'reactions-heart' | 'reactions-tada' | 'interactions' | 'created' | 'updated'
  order?: 'desc' | 'asc'
  per_page?: number
  page?: number
}

export interface SearchCodeParams {
  sort?: 'indexed'
  order?: 'desc' | 'asc'
  per_page?: number
  page?: number
}

export interface MergePullRequestResponse {
  sha: string
  merged: boolean
  message: string
}

export class GitHubError extends Error {
  status: number
  responseBody: string

  constructor(message: string, status: number, responseBody: string) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
    this.responseBody = responseBody
  }
}

export class GitHubRateLimitError extends GitHubError {
  resetAt: number

  constructor(message: string, resetAt: number) {
    super(message, 429, message)
    this.name = 'GitHubRateLimitError'
    this.resetAt = resetAt
  }
}

export class GitHubNotFoundError extends GitHubError {
  constructor(path: string) {
    super(`Resource not found: ${path}`, 404, '')
    this.name = 'GitHubNotFoundError'
  }
}

export class GitHubValidationError extends GitHubError {
  errors: Array<{ resource: string; code: string; field: string; message?: string }>

  constructor(message: string, responseBody: string, errors: Array<{ resource: string; code: string; field: string; message?: string }>) {
    super(message, 422, responseBody)
    this.name = 'GitHubValidationError'
    this.errors = errors
  }
}

export class GitHubClient {
  private static instance: GitHubClient | null = null
  private token: string
  private baseUrl = 'https://api.github.com'

  private constructor(token?: string) {
    this.token = token || process.env.GITHUB_API_TOKEN || ''
  }

  static getInstance(token?: string): GitHubClient {
    if (!GitHubClient.instance || token) {
      GitHubClient.instance = new GitHubClient(token)
    }
    return GitHubClient.instance
  }

  setToken(token: string): void {
    this.token = token
  }

  isAuthenticated(): boolean {
    return this.token.length > 0
  }

  async getRateLimit(): Promise<GitHubRateLimit> {
    return this.request<GitHubRateLimit>('GET', '/rate_limit')
  }

  private async request<T>(method: string, path: string, body?: unknown, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      })
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const remaining = response.headers.get('x-ratelimit-remaining')
    if (remaining && parseInt(remaining, 10) === 0) {
      const reset = parseInt(response.headers.get('x-ratelimit-reset') || '0', 10)
      throw new GitHubRateLimitError(
        `GitHub API rate limit exhausted. Resets at ${new Date(reset * 1000).toISOString()}`,
        reset,
      )
    }

    if (!response.ok) {
      const responseBody = await response.text()
      let parsed: { message?: string; errors?: Array<{ resource: string; code: string; field: string; message?: string }> } = {}
      try {
        parsed = JSON.parse(responseBody)
      } catch {
        // ignore parse errors on error responses
      }

      switch (response.status) {
        case 401:
          throw new GitHubError('Authentication failed. Check your GitHub token.', 401, responseBody)
        case 403:
          throw new GitHubError(`Access forbidden: ${parsed.message || 'Resource access denied'}`, 403, responseBody)
        case 404:
          throw new GitHubNotFoundError(path)
        case 422:
          throw new GitHubValidationError(
            parsed.message || 'Validation failed',
            responseBody,
            parsed.errors || [],
          )
        default:
          throw new GitHubError(
            `GitHub API error (${response.status}): ${parsed.message || responseBody}`,
            response.status,
            responseBody,
          )
      }
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T
    }

    return response.json() as Promise<T>
  }

  async listIssues(owner: string, repo: string, params?: ListIssuesParams): Promise<GitHubIssue[]> {
    return this.request<GitHubIssue[]>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, undefined, params as Record<string, string | number | undefined>)
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`)
  }

  async createIssue(owner: string, repo: string, params: CreateIssueParams): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, params)
  }

  async updateIssue(owner: string, repo: string, issueNumber: number, params: UpdateIssueParams): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('PATCH', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`, params)
  }

  async closeIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    return this.updateIssue(owner, repo, issueNumber, { state: 'closed' })
  }

  async listPullRequests(owner: string, repo: string, params?: ListPullRequestsParams): Promise<GitHubPullRequest[]> {
    return this.request<GitHubPullRequest[]>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, undefined, params as Record<string, string | number | undefined>)
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`)
  }

  async createPullRequest(owner: string, repo: string, params: CreatePullRequestParams): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, params)
  }

  async mergePullRequest(owner: string, repo: string, prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase'): Promise<MergePullRequestResponse> {
    return this.request<MergePullRequestResponse>('PUT', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/merge`, mergeMethod ? { merge_method: mergeMethod } : undefined)
  }

  async listRepositories(owner: string, type?: 'all' | 'owner' | 'member'): Promise<GitHubRepository[]> {
    return this.request<GitHubRepository[]>('GET', `/users/${encodeURIComponent(owner)}/repos`, undefined, type ? { type } as Record<string, string> : undefined)
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return this.request<GitHubRepository>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)
  }

  async searchCode(query: string, params?: SearchCodeParams): Promise<GitHubSearchResult<{ name: string; path: string; sha: string; url: string; git_url: string; html_url: string; repository: GitHubRepository }>> {
    const searchParams = { q: query, ...params } as Record<string, string | number | undefined>
    return this.request('GET', '/search/code', undefined, searchParams)
  }

  async searchIssues(query: string, params?: SearchIssuesParams): Promise<GitHubSearchResult<GitHubIssue>> {
    const searchParams = { q: query, ...params } as Record<string, string | number | undefined>
    return this.request<GitHubSearchResult<GitHubIssue>>('GET', '/search/issues', undefined, searchParams)
  }

  async getFileContents(owner: string, repo: string, path: string, ref?: string): Promise<GitHubFileContent> {
    const params: Record<string, string | number | undefined> = {}
    if (ref) params['ref'] = ref
    return this.request<GitHubFileContent>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`, undefined, params)
  }

  async createComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GitHubComment> {
    return this.request<GitHubComment>('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`, { body })
  }

  async listComments(owner: string, repo: string, issueNumber: number): Promise<GitHubComment[]> {
    return this.request<GitHubComment[]>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`)
  }

  async getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    const url = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3.diff',
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    const response = await fetch(url, { headers })
    if (!response.ok) {
      throw new GitHubError(`Failed to fetch PR diff: ${response.statusText}`, response.status, await response.text())
    }
    return response.text()
  }

  async compareBranches(owner: string, repo: string, base: string, head: string): Promise<{ diff: string; status: string; ahead_by: number; behind_by: number; total_commits: number; files: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number }> }> {
    const url = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3.diff',
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    const diffResponse = await fetch(url, { headers })
    if (!diffResponse.ok) {
      throw new GitHubError(`Failed to compare branches: ${diffResponse.statusText}`, diffResponse.status, await diffResponse.text())
    }
    const diff = await diffResponse.text()

    const metaHeaders: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    }
    if (this.token) {
      metaHeaders['Authorization'] = `Bearer ${this.token}`
    }
    const metaResponse = await fetch(url, { headers: metaHeaders })
    if (!metaResponse.ok) {
      throw new GitHubError(`Failed to fetch compare metadata: ${metaResponse.statusText}`, metaResponse.status, await metaResponse.text())
    }
    const meta = await metaResponse.json() as { status: string; ahead_by: number; behind_by: number; total_commits: number; files: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number }> }

    return { diff, ...meta }
  }

  async getPullRequestCommits(owner: string, repo: string, prNumber: number): Promise<Array<{ sha: string; message: string; author: { name: string; date: string } }>> {
    return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/commits`)
  }

  async getCombinedStatus(owner: string, repo: string, ref: string): Promise<{ state: string; statuses: Array<{ context: string; state: string; description: string; target_url: string; created_at: string }>; total_count: number }> {
    return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/status`)
  }

  async getCheckRuns(owner: string, repo: string, ref: string): Promise<{ total_count: number; check_runs: Array<{ name: string; status: string; conclusion: string | null; app: { name: string }; started_at: string; completed_at: string | null }> }> {
    return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/check-runs`)
  }

  async getCurrentUser(): Promise<GitHubUser> {
    return this.request<GitHubUser>('GET', '/user')
  }

  async listUserRepos(type?: 'all' | 'owner' | 'member'): Promise<GitHubRepository[]> {
    return this.request<GitHubRepository[]>('GET', '/user/repos', undefined, type ? { type } as Record<string, string> : undefined)
  }

  async createPullRequestReview(owner: string, repo: string, prNumber: number, params: { body: string; event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; comments?: Array<{ path: string; position: number; body: string }> }): Promise<{ id: number; state: string }> {
    return this.request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/reviews`, params)
  }

  async listPullRequestReviewComments(owner: string, repo: string, prNumber: number): Promise<Array<{ id: number; path: string; body: string; position: number; user: GitHubUser; created_at: string }>> {
    return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/comments`)
  }

  async listPullRequestReviewers(owner: string, repo: string, prNumber: number): Promise<{ users: GitHubUser[] }> {
    return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/requested_reviewers`)
  }
}
