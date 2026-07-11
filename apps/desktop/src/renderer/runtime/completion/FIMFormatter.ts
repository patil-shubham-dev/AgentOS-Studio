export type FIMModel = "deepseek-coder" | "codellama" | "starcoder" | "starcoder2" | "codegemma" | "qwen-coder"

export interface FIMRequest {
  prefix: string
  suffix: string
  language: string
  filePath: string
}

export interface FIMResult {
  prompt: string
  modelFormat: FIMModel
}

const MODEL_FORMATS: Record<FIMModel, { prefix: string; suffix: string; middle: string }> = {
  "deepseek-coder": {
    prefix: "<｜｜▁pad▁｜｜>",
    suffix: "<｜｜place_holder_mm_span_0440｜｜>",
    middle: "�",
  },
  "codellama": {
    prefix: "<PRE>",
    suffix: "<SUF>",
    middle: "<MID>",
  },
  "starcoder": {
    prefix: "<fim_prefix>",
    suffix: "<fim_suffix>",
    middle: "<fim_middle>",
  },
  "starcoder2": {
    prefix: "<fim_prefix>",
    suffix: "<fim_suffix>",
    middle: "<fim_middle>",
  },
  "codegemma": {
    prefix: "<|fim_prefix|>",
    suffix: "<|fim_suffix|>",
    middle: "<|fim_middle|>",
  },
  "qwen-coder": {
    prefix: "<fim_prefix>",
    suffix: "<fim_suffix>",
    middle: "<fim_middle>",
  },
}

export function detectFIMModel(modelId: string): FIMModel | null {
  const id = modelId.toLowerCase()
  if (id.includes("deepseek")) return "deepseek-coder"
  if (id.includes("codellama") || id.includes("llama")) return "codellama"
  if (id.includes("starcoder2")) return "starcoder2"
  if (id.includes("starcoder")) return "starcoder"
  if (id.includes("codegemma")) return "codegemma"
  if (id.includes("qwen") && (id.includes("coder") || id.includes("code"))) return "qwen-coder"
  return null
}

export function getFIMModelName(modelId: string): FIMModel {
  return detectFIMModel(modelId) ?? "starcoder"
}

export function formatFIMPrompt(request: FIMRequest, format: FIMModel): string {
  const fmt = MODEL_FORMATS[format]
  if (!fmt) return request.prefix

  const prefix = truncatePrefix(request.prefix, 4000)
  const suffix = truncateSuffix(request.suffix, 2000)

  return `${fmt.prefix}${prefix}${fmt.suffix}${suffix}${fmt.middle}`
}

export function parseFIMCompletion(raw: string, format: FIMModel): string {
  const fmt = MODEL_FORMATS[format]
  const eosMarkers = [
    "<|endoftext|>", "<|eos|>", "</s>", "<EOS>",
    "<|im_end|>", "<|end|>", "<|END|>",
  ]

  let cleaned = raw
  for (const marker of eosMarkers) {
    const idx = cleaned.indexOf(marker)
    if (idx >= 0) cleaned = cleaned.substring(0, idx)
  }

  // Remove any remaining special tokens
  cleaned = cleaned.replace(/<\|?fim_\w+\|?>/g, "").trim()

  return cleaned
}

export function formatStandardPrompt(request: FIMRequest): string {
  return [
    `You are a code completion engine. Complete the code at cursor position.`,
    `Return ONLY the completion text with no explanation.`,
    ``,
    `Language: ${request.language}`,
    `File: ${request.filePath}`,
    ``,
    `Code before cursor:`,
    `\`\`\`${request.language}`,
    truncatePrefix(request.prefix, 3000),
    `\`\`\``,
    ``,
    request.suffix ? `Code after cursor:\n\`\`\`${request.language}\n${truncateSuffix(request.suffix, 1000)}\n\`\`\`\n` : "",
    `Completion:`,
  ].filter(Boolean).join("\n")
}

function truncatePrefix(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return "..." + text.slice(-maxChars)
}

function truncateSuffix(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + "..."
}
