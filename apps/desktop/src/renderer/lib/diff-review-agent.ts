/**
 * diff-review-agent — sends diff text to the AI provider for code review
 * and parses structured results into ReviewComment objects.
 *
 * Uses ProviderGateway directly (text-in/text-out, no tools) so it works
 * with the first available provider without requiring a specific wired role.
 */

import { ProviderGateway } from "@/runtime/providers/ProviderGateway"
import { useDiffReviewStore, nextCommentId, type ReviewComment, type CommentSeverity, type CommentCategory } from "@/stores/diff-review-store"
import type { DiffFileEntry } from "@/stores/diff-store"

const REVIEW_SYSTEM_PROMPT = `You are a senior code reviewer. Review the provided file diffs carefully.

For each hunk, identify issues in these categories:
1. **bugs** — logic errors, edge cases, potential runtime errors
2. **style** — code style concerns, naming, readability, maintainability
3. **security** — vulnerabilities, injection risks, unsafe patterns, hardcoded secrets
4. **test** — missing test coverage, untested edge cases

Respond with a JSON object in this exact format — no markdown fences, no preamble:
{
  "reviews": [
    {
      "hunkIndex": 0,
      "comments": [
        {
          "lineNumber": 5,
          "severity": "warning",
          "category": "bug",
          "message": "Description of the issue"
        }
      ]
    }
  ]
}

Severity must be one of: "info", "warning", "error"
Category must be one of: "bug", "style", "security", "test"

If no issues are found in a hunk, include an empty comments array for it.
Only include the JSON object, nothing else.`

function buildReviewPrompt(files: DiffFileEntry[]): string {
  const parts: string[] = ["Review the following file diffs:\n"]

  for (const file of files) {
    parts.push(`--- ${file.path} ---`)
    parts.push(file.rawDiff)
    parts.push("")
  }

  return parts.join("\n")
}

function parseReviewResponse(
  content: string,
  filePath: string,
  fileHunkCount: number,
): ReviewComment[] {
  const now = Date.now()
  const result: ReviewComment[] = []

  let json = content.trim()

  // Strip markdown fences if the model wrapped the JSON
  if (json.startsWith("```")) {
    const firstNewline = json.indexOf("\n")
    if (firstNewline !== -1) {
      json = json.slice(firstNewline + 1)
    }
    const fenceEnd = json.lastIndexOf("```")
    if (fenceEnd !== -1) {
      json = json.slice(0, fenceEnd)
    }
    json = json.trim()
  }

  let parsed: { reviews?: Array<{ hunkIndex: number; comments: Array<{ lineNumber: number; severity: string; category: string; message: string }> }> }

  try {
    parsed = JSON.parse(json)
  } catch {
    console.warn("[diff-review-agent] Failed to parse AI review response:", content.slice(0, 200))
    return []
  }

  if (!parsed.reviews || !Array.isArray(parsed.reviews)) return []

  for (const review of parsed.reviews) {
    if (typeof review.hunkIndex !== "number" || review.hunkIndex < 0 || review.hunkIndex >= fileHunkCount) continue
    if (!Array.isArray(review.comments)) continue

    for (const c of review.comments) {
      const severity: CommentSeverity = ["info", "warning", "error"].includes(c.severity)
        ? (c.severity as CommentSeverity)
        : "info"
      const category: CommentCategory = ["bug", "style", "security", "test"].includes(c.category)
        ? (c.category as CommentCategory)
        : "info" as CommentCategory

      result.push({
        id: nextCommentId(),
        filePath,
        hunkIndex: review.hunkIndex,
        lineNumber: c.lineNumber,
        author: "ai",
        content: c.message,
        parentId: null,
        severity,
        category,
        createdAt: now++,
      })
    }
  }

  return result
}

export interface ReviewResult {
  comments: ReviewComment[]
  error: string | null
}

export async function reviewDiffWithAI(
  files: DiffFileEntry[],
  signal?: AbortSignal,
): Promise<ReviewResult> {
  const store = useDiffReviewStore.getState()
  store.setReviewInProgress(true)
  store.setReviewError(null)

  try {
    const gateway = ProviderGateway.getInstance()
    const prompt = buildReviewPrompt(files)
    const allComments: ReviewComment[] = []

    const stream = gateway.stream({
      systemPrompt: REVIEW_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      signal,
    })

    let content = ""
    for await (const event of stream) {
      if (event.type === "token") {
        content += event.text
      }
      if (event.type === "error") {
        throw new Error(event.userMessage)
      }
    }

    if (!content.trim()) {
      throw new Error("AI returned an empty response")
    }

    for (const file of files) {
      const fileComments = parseReviewResponse(content, file.path, file.hunks.length)
      allComments.push(...fileComments)
    }

    if (allComments.length > 0) {
      store.addComments(allComments)
    }

    store.setReviewInProgress(false)
    return { comments: allComments, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    store.setReviewError(message)
    store.setReviewInProgress(false)
    return { comments: [], error: message }
  }
}

export async function askAIAboutLine(
  filePath: string,
  hunkIndex: number,
  lineNumber: number,
  question: string,
  diffContext: string,
  signal?: AbortSignal,
): Promise<string> {
  const prompt = `I'm reviewing a code diff and have a question about line ${lineNumber} in hunk ${hunkIndex}.

Diff context:
${diffContext}

My question about line ${lineNumber}: ${question}

Please provide a helpful, concise answer about this line of code — explain what it does, whether there's an issue, and suggest improvements if relevant.`

  try {
    const gateway = ProviderGateway.getInstance()
    const stream = gateway.stream({
      systemPrompt: "You are a senior developer reviewing a code diff. Answer questions concisely and helpfully.",
      messages: [{ role: "user", content: prompt }],
      signal,
    })

    let content = ""
    for await (const event of stream) {
      if (event.type === "token") content += event.text
      if (event.type === "error") throw new Error(event.userMessage)
    }

    return content || "(AI did not respond)"
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}
