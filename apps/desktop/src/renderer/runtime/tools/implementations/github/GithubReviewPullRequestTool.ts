import { buildTool, ToolCapabilities, type AgentTool, type ToolContext, type ToolResult } from '../../core'
import { GitHubClient } from '@/lib/github/github-client'
import { reviewDiff, type ReviewCheckResult } from './ReviewChecker'
import { PRReviewStore } from './PRReviewStore'

function getClient(ctx: ToolContext): GitHubClient {
  const token = ctx.env?.GITHUB_API_TOKEN || process.env.GITHUB_API_TOKEN
  return GitHubClient.getInstance(token)
}

export const GithubReviewPullRequestTool: AgentTool = buildTool({
  name: 'github_review_pull_request',
  description: 'Review a pull request: fetches the diff, runs automated static analysis (secrets, code quality), and posts a review with comments. Set event=APPROVE to approve, REQUEST_CHANGES to request changes, or COMMENT for a neutral review.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner (user or organization)' },
      repo: { type: 'string', description: 'Repository name' },
      pull_number: { type: 'number', description: 'Pull request number to review' },
      event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'], description: 'Review event type (default: COMMENT)' },
      body: { type: 'string', description: 'Optional custom review body text. If omitted, an auto-generated summary is used.' },
      skip_auto_check: { type: 'boolean', description: 'Skip automated static analysis checks (default: false)' },
    },
    required: ['owner', 'repo', 'pull_number'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.NETWORK],
  permissions: async () => ({ behavior: 'ask', reason: 'Post a review on a GitHub pull request' }),
  getActivityDescription: (input) => {
    const owner = (input as Record<string, unknown>)?.owner
    const repo = (input as Record<string, unknown>)?.repo
    const num = (input as Record<string, unknown>)?.pull_number
    return owner && repo ? `Reviewing PR #${num} in ${owner}/${repo}` : 'Reviewing GitHub pull request'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const owner = String(input.owner ?? '')
    const repo = String(input.repo ?? '')
    const prNumber = Number(input.pull_number)
    const event = (input.event as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT') || 'COMMENT'
    const customBody = input.body as string | undefined
    const skipAutoCheck = Boolean(input.skip_auto_check)

    if (!owner || !repo) return { data: null, error: 'owner and repo are required', isError: true }
    if (!prNumber) return { data: null, error: 'pull_number is required', isError: true }

    try {
      const client = getClient(ctx)

      const pr = await client.getPullRequest(owner, repo, prNumber)

      const diffText = await client.getPullRequestDiff(owner, repo, prNumber)

      let autoCheckSummary = ''
      let autoCheckPassed = true

      if (!skipAutoCheck && diffText) {
        const checkResult = reviewDiff(diffText)
        autoCheckPassed = checkResult.passed
        autoCheckSummary = checkResult.summary

        if (checkResult.results.length > 0) {
          const grouped = new Map<string, ReviewCheckResult[]>()
          for (const r of checkResult.results) {
            if (!grouped.has(r.rule)) grouped.set(r.rule, [])
            grouped.get(r.rule)!.push(r)
          }

          autoCheckSummary += '\n\n## Automated Check Details\n'
          for (const [rule, items] of grouped) {
            const sev = items[0].severity
            const icon = sev === 'error' ? '🔴' : sev === 'warning' ? '🟡' : '🔵'
            autoCheckSummary += `\n${icon} **${rule}** (${items.length} occurrence(s)):\n`
            for (const item of items.slice(0, 5)) {
              autoCheckSummary += `  - ${item.file}:${item.line} — ${item.message}\n`
            }
            if (items.length > 5) {
              autoCheckSummary += `  - ... and ${items.length - 5} more\n`
            }
          }
        }
      }

      const body = customBody || [
        `## 🤖 Automated PR Review: #${prNumber} — ${pr.title}`,
        '',
        autoCheckPassed ? '✅ Automated checks passed.' : '⚠️ Automated checks found issues.',
        '',
        autoCheckSummary,
        '',
        `_Reviewed by AgenticOS_`,
      ].join('\n')

      const review = await client.createPullRequestReview(owner, repo, prNumber, {
        body,
        event,
      })

      PRReviewStore.getInstance().add({
        id: `${owner}/${repo}/pr/${prNumber}`,
        owner,
        repo,
        prNumber,
        prTitle: pr.title || '',
        event,
        summary: autoCheckSummary.slice(0, 500),
        autoCheckPassed,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const resultParts = [
        `✅ Review submitted for PR #${prNumber}: ${pr.title}`,
        `Event: ${event}`,
        `Review ID: ${review.id}`,
        '',
        autoCheckSummary || 'No automated checks were run.',
        '',
        `🔗 ${pr.html_url}/reviews`,
      ]

      return { data: resultParts.join('\n') }
    } catch (e) {
      return { data: null, error: `GitHub review PR failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
