import type { ProviderRequest, ProviderResponse, StreamChunk } from './ProviderRuntime'

const MOCK_RESPONSES: Array<{ pattern: RegExp; response: string }> = [
  {
    pattern: /\b(?:hello|hi|hey)\b/i,
    response: "Hello! I'm your AI coding assistant. I can help you read files, edit code, search your codebase, and run commands. What are you working on?",
  },
  {
    pattern: /explain|what.*this|how.*work|understand/i,
    response: "I'd be happy to explain! I can analyze your code, look at file structures, search for patterns, and give you detailed explanations. Feel free to share a specific file or area you'd like me to look at.",
  },
  {
    pattern: /refactor|improve|clean|optimize/i,
    response: "I can help refactor your code. I'll analyze the current implementation, identify areas for improvement, and suggest clean, readable changes. What specific file or function would you like me to look at?",
  },
  {
    pattern: /test|testing|unit|integration/i,
    response: "I can help write tests for your code. I'll generate test cases that cover the main functionality, edge cases, and error scenarios. Would you like me to create tests for a specific file or module?",
  },
  {
    pattern: /fix|bug|error|issue|broken/i,
    response: "Let me help you debug this issue. I'll examine the code for common bugs like null reference errors, type mismatches, race conditions, and logic errors. Can you show me the specific file or error message?",
  },
  {
    pattern: /search|find|locate|where/i,
    response: "I can search your codebase for files, symbols, and patterns. I'll use grep for content search, glob for file patterns, and codebase queries for symbol definitions. What are you looking for?",
  },
]

const FALLBACK_RESPONSE = "I understand your request. As a mock provider running in development mode, I can simulate responses to help you test the workflow. To get real AI responses, configure a provider in Settings and add an API key.\n\nIn the meantime, here's what I can help you with:\n\n- **Read and search files** in your workspace\n- **Edit code** with tracked changes\n- **Run commands** through the terminal\n- **Browse documentation** via web search\n\nTry asking me to explain some code or search for a specific file."

export function generateMockResponse(userMessage: string): string {
  for (const entry of MOCK_RESPONSES) {
    if (entry.pattern.test(userMessage)) {
      return entry.response
    }
  }
  return FALLBACK_RESPONSE
}

export class MockProviderRuntime {
  private defaultModel = 'mock-model'

  setDefaultModel(model: string): void {
    this.defaultModel = model
  }

  hasApiKey(): boolean {
    return true
  }

  getModel(): string {
    return this.defaultModel
  }

  getBaseUrl(): string | null {
    return null
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = performance.now()
    const lastUserMsg = [...request.messages].reverse().find(m => m.role === 'user')
    const content = generateMockResponse(lastUserMsg?.content ?? '')
    const tokensOut = content.length / 4
    await new Promise(r => setTimeout(r, 50))
    return {
      content,
      model: this.defaultModel,
      tokensIn: request.messages.reduce((sum, m) => sum + m.content.length / 4, 0),
      tokensOut: Math.ceil(tokensOut),
      duration: Math.round(performance.now() - startTime),
    }
  }

  async *stream(request: ProviderRequest): AsyncGenerator<StreamChunk> {
    const lastUserMsg = [...request.messages].reverse().find(m => m.role === 'user')
    const fullText = generateMockResponse(lastUserMsg?.content ?? '')

    const words = fullText.split(/(\s+)/)
    for (const word of words) {
      yield { type: 'token', text: word }
      await new Promise(r => setTimeout(r, 5))
    }
    yield { type: 'done', fullText }
  }
}
