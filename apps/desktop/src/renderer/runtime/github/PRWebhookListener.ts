import { createServer, type Server, IncomingMessage, ServerResponse } from 'http'
import { createHmac, timingSafeEqual } from 'crypto'
import { GitHubClient } from '@/lib/github/github-client'
import { reviewDiff } from '@/runtime/tools/implementations/github/ReviewChecker'
import { aggregateReviewResults } from '@/runtime/tools/implementations/github/ReviewAggregator'
import { PRReviewStore } from '@/runtime/tools/implementations/github/PRReviewStore'

export interface PRWebhookConfig {
  port: number
  secret: string
  githubToken: string
  autoApproveIfClean?: boolean
  autoRequestChangesOnIssues?: boolean
}

interface GitHubWebhookPayload {
  action?: string
  pull_request?: {
    number: number
    title: string
    html_url: string
    head: { sha: string; ref: string; repo?: { full_name?: string } }
    base: { sha: string; ref: string; repo?: { full_name?: string } }
    user?: { login: string }
  }
  repository?: { full_name: string; owner?: { login: string }; name: string }
}

export class PRWebhookListener {
  private server: Server | null = null
  private config: PRWebhookConfig | null = null
  private reviewedSHAs = new Set<string>()

  async start(config: PRWebhookConfig): Promise<void> {
    if (this.server) throw new Error('PRWebhookListener is already running')

    this.config = config
    GitHubClient.getInstance(config.githubToken)

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res))

      this.server.on('error', (err) => {
        this.server = null
        reject(err)
      })

      this.server.listen(config.port, () => {
        resolve()
      })
    })
  }

  stop(): void {
    this.server?.close()
    this.server = null
    this.config = null
  }

  isRunning(): boolean {
    return this.server !== null
  }

  resetReviewedSHAs(): void {
    this.reviewedSHAs.clear()
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const respond = (status: number, body: Record<string, unknown>) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    if (req.method !== 'POST') {
      respond(405, { error: 'Method not allowed' })
      return
    }

    if (req.url !== '/webhook/github') {
      respond(404, { error: 'Not found' })
      return
    }

    const config = this.config
    if (!config) {
      respond(503, { error: 'Listener not configured' })
      return
    }

    const body = await this.readBody(req)
    const signature = (req.headers['x-hub-signature-256'] as string) || ''

    if (!this.verifySignature(body, signature, config.secret)) {
      respond(401, { error: 'Invalid signature' })
      return
    }

    const event = req.headers['x-github-event'] as string
    let payload: GitHubWebhookPayload
    try {
      payload = JSON.parse(body)
    } catch {
      respond(400, { error: 'Invalid JSON' })
      return
    }

    if (event !== 'pull_request') {
      respond(200, { ok: true, skipped: `ignored event: ${event}` })
      return
    }

    if (payload.action !== 'opened' && payload.action !== 'synchronize') {
      respond(200, { ok: true, skipped: `ignored action: ${payload.action}` })
      return
    }

    const pr = payload.pull_request
    const repo = payload.repository
    if (!pr || !repo) {
      respond(400, { error: 'Missing pull_request or repository in payload' })
      return
    }

    const [owner, repoName] = repo.full_name.split('/')
    if (!owner || !repoName) {
      respond(400, { error: 'Invalid repository full_name' })
      return
    }

    const headSHA = pr.head.sha
    if (this.reviewedSHAs.has(headSHA)) {
      respond(200, { ok: true, skipped: 'already reviewed this SHA' })
      return
    }

    try {
      await this.runReview(owner, repoName, pr, config)
      this.reviewedSHAs.add(headSHA)
      respond(200, { ok: true })
    } catch (err) {
      respond(500, { error: `Review failed: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  private async runReview(
    owner: string,
    repo: string,
    pr: NonNullable<GitHubWebhookPayload['pull_request']>,
    config: PRWebhookConfig,
  ): Promise<void> {
    const client = GitHubClient.getInstance()

    const diffText = await client.getPullRequestDiff(owner, repo, pr.number)

    if (!diffText) {
      await client.createPullRequestReview(owner, repo, pr.number, {
        body: '🤖 Auto-review skipped: no diff available.',
        event: 'COMMENT',
      })
      return
    }

    const checkResult = reviewDiff(diffText)
    const passed = checkResult.passed
    const reviewBody = aggregateReviewResults(checkResult.results)

    const fullBody = [
      `## 🤖 Automated PR Review: #${pr.number} — ${pr.title}`,
      '',
      passed ? '✅ Automated checks passed.' : '⚠️ Automated checks found issues that should be addressed.',
      '',
      reviewBody,
      '',
      `_Triggered by webhook (${pr.head.ref} → ${pr.base.ref})_`,
      `_Commit: \`${pr.head.sha.slice(0, 7)}\`_`,
    ].join('\n')

    let event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' = 'COMMENT'
    if (passed && config.autoApproveIfClean) {
      event = 'APPROVE'
    } else if (!passed && config.autoRequestChangesOnIssues) {
      event = 'REQUEST_CHANGES'
    }

    await client.createPullRequestReview(owner, repo, pr.number, {
      body: fullBody,
      event,
    })

    PRReviewStore.getInstance().add({
      id: `${owner}/${repo}/pr/${pr.number}`,
      owner,
      repo,
      prNumber: pr.number,
      prTitle: pr.title || '',
      event,
      summary: `Webhook-triggered review: ${checkResult.summary}`,
      autoCheckPassed: passed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks).toString()))
      req.on('error', reject)
    })
  }

  private verifySignature(body: string, signature: string, secret: string): boolean {
    if (!signature) return false
    const expectedPrefix = 'sha256='
    if (!signature.startsWith(expectedPrefix)) return false

    const sig = signature.slice(expectedPrefix.length)
    const computed = createHmac('sha256', secret).update(body).digest('hex')

    if (sig.length !== computed.length) return false

    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(computed))
    } catch {
      return false
    }
  }
}
