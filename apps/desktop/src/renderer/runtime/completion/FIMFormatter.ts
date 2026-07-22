export interface FIMRequest {
  prefix: string
  suffix: string
  language: string
  filePath: string
  maxLines: number
}

export interface FIMResponse {
  text: string
  finishReason: "stop" | "length" | "error"
  latencyMs: number
}

export interface FIMProviderConfig {
  type: "openai-compatible" | "anthropic" | "custom"
  baseUrl: string
  apiKey: string
  model: string
}

export const FIM_LANGUAGE_MAP: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  rust: "Rust",
  go: "Go",
  java: "Java",
  cpp: "C++",
  c: "C",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  scala: "Scala",
  shell: "Shell",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  yaml: "YAML",
  markdown: "Markdown",
}

export function buildFIMBody(
  request: FIMRequest,
  config: FIMProviderConfig,
): Record<string, unknown> {
  const { prefix, suffix, language, maxLines } = request

  const truncatedPrefix = prefix.length > 3000 ? prefix.slice(-3000) : prefix
  const truncatedSuffix = suffix.length > 1500 ? suffix.slice(0, 1500) : suffix

  switch (config.type) {
    case "openai-compatible":
      return buildOpenAIFIMBody(truncatedPrefix, truncatedSuffix, config.model, language, maxLines)
    case "anthropic":
      return buildAnthropicFIMBody(truncatedPrefix, truncatedSuffix, config.model, maxLines)
    case "custom":
      return buildOpenAIFIMBody(truncatedPrefix, truncatedSuffix, config.model, language, maxLines)
  }
}

function buildOpenAIFIMBody(
  prefix: string,
  suffix: string,
  model: string,
  language: string,
  maxLines: number,
): Record<string, unknown> {
  const maxTokens = Math.min(maxLines * 30, 512)
  return {
    model,
    prompt: `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`,
    suffix: "",
    max_tokens: maxTokens,
    temperature: 0.1,
    stop: ["<fim_end>", "<|endoftext|>", "\\n\\n\\n"],
    stream: false,
  }
}

function buildAnthropicFIMBody(
  prefix: string,
  suffix: string,
  model: string,
  maxLines: number,
): Record<string, unknown> {
  const maxTokens = Math.min(maxLines * 30, 512)
  return {
    model,
    max_tokens: maxTokens,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a code completion engine. Complete the code at the cursor position.
The cursor is between PREFIX and SUFFIX.
Only output the completion text, no explanation.

PREFIX:
\`\`\`
${prefix.slice(-2000)}
\`\`\`

SUFFIX:
\`\`\`
${suffix.slice(0, 1000)}
\`\`\`

Complete the code at the cursor:`,
          },
        ],
      },
    ],
  }
}

export function parseFIMResponse(
  raw: string,
  config: FIMProviderConfig,
): string {
  switch (config.type) {
    case "openai-compatible":
      return parseOpenAIResponse(raw)
    case "anthropic":
      return parseAnthropicResponse(raw)
    case "custom":
      return parseOpenAIResponse(raw)
  }
}

function parseOpenAIResponse(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    const text = parsed.choices?.[0]?.text ?? parsed.choices?.[0]?.message?.content ?? ""
    return text
      .replace(/<fim_end>/g, "")
      .replace(/<\|endoftext\|>/g, "")
      .trim()
  } catch {
    return raw
      .replace(/<fim_end>/g, "")
      .replace(/<\|endoftext\|>/g, "")
      .trim()
  }
}

function parseAnthropicResponse(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return parsed.content?.[0]?.text ?? ""
      .replace(/<fim_end>/g, "")
      .trim()
  } catch {
    return raw.trim()
  }
}

export function truncatePrefix(prefix: string, maxChars: number = 3000): string {
  if (prefix.length <= maxChars) return prefix
  return "..." + prefix.slice(-(maxChars - 3))
}

export function truncateSuffix(suffix: string, maxChars: number = 1500): string {
  if (suffix.length <= maxChars) return suffix
  return suffix.slice(0, maxChars - 3) + "..."
}
