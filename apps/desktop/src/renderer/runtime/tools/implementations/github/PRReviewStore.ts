export interface PRReviewRecord {
  id: string
  owner: string
  repo: string
  prNumber: number
  prTitle: string
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
  summary: string
  autoCheckPassed: boolean
  createdAt: string
  updatedAt: string
}

export class PRReviewStore {
  private static instance: PRReviewStore | null = null
  private reviews: Map<string, PRReviewRecord> = new Map()

  private constructor() {}

  static getInstance(): PRReviewStore {
    if (!PRReviewStore.instance) {
      PRReviewStore.instance = new PRReviewStore()
    }
    return PRReviewStore.instance
  }

  private key(owner: string, repo: string, prNumber: number): string {
    return `${owner}/${repo}/pr/${prNumber}`
  }

  add(review: PRReviewRecord): void {
    this.reviews.set(review.id, { ...review, updatedAt: new Date().toISOString() })
  }

  get(owner: string, repo: string, prNumber: number): PRReviewRecord | undefined {
    return this.reviews.get(this.key(owner, repo, prNumber))
  }

  list(limit = 20): PRReviewRecord[] {
    return Array.from(this.reviews.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
  }

  listByRepo(owner: string, repo: string, limit = 10): PRReviewRecord[] {
    return Array.from(this.reviews.values())
      .filter((r) => r.owner === owner && r.repo === repo)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
  }

  clear(): void {
    this.reviews.clear()
  }
}
