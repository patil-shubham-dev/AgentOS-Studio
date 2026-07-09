import { EventBus } from "@/runtime/EventBus"
import type { SessionCompletedEvent } from "@/runtime/RuntimeTypes"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"

const CORRECTION_PATTERNS = [
  /\bno[,.]?\s+(that'?s|this is)\s+(wrong|incorrect|not right|not what I)\b/i,
  /\bno[,.]?\s+it should be\b/i,
  /\b(that'?s|this is)\s+(wrong|incorrect|not right)\b/i,
  /\bactually[,.]?\s+it'?s\b/i,
  /\bactually[,.]?\s+I\s+meant?\b/i,
  /\brevert\s+that\b/i,
  /\bundo\s+that\b/i,
  /\bgo\s+back\b/i,
  /\b(i\s+meant|i\s+meant to say)\s+.+,\s+not\b/i,
  /\bnot\s+.+,\s+(but\s+)?(rather|instead|actually)\b/i,
  /\b(don'?t|stop|quit)\s+(do|going)\b/i,
  /\bthat'?s?\s+not\s+(what\s+I|correct|right)\b/i,
  /^(nevermind|never mind|forget it|ignore that|disregard)/i,
]

const CORRECTION_PATTERNS_LENIENCE = 3

export class CorrectionCapture {
  private static instance: CorrectionCapture
  private subscribed = false
  private unsubscribe: (() => void) | null = null

  static getInstance(): CorrectionCapture {
    if (!CorrectionCapture.instance) {
      CorrectionCapture.instance = new CorrectionCapture()
    }
    return CorrectionCapture.instance
  }

  startListening(): () => void {
    if (this.subscribed) {
      return this.unsubscribe ?? (() => {})
    }

    this.subscribed = true
    this.unsubscribe = EventBus.getInstance().on<SessionCompletedEvent>(
      "SESSION_COMPLETED",
      async (event) => {
        try {
          await this.processSession(event)
        } catch (err) {
          console.warn("[CorrectionCapture] processing failed (non-fatal):", err)
        }
      },
    )

    return this.unsubscribe
  }

  stopListening(): void {
    this.unsubscribe?.()
    this.subscribed = false
    this.unsubscribe = null
  }

  private async processSession(event: SessionCompletedEvent): Promise<void> {
    const userInput = event.input
    if (!userInput || userInput.length < 10) return

    const matches = CORRECTION_PATTERNS.filter((p) => p.test(userInput))
    if (matches.length === 0) return

    const arch = MemoryArchitecture.getInstance()
    if (!arch.isInitialized()) return

    const correction = this.extractCorrection(userInput)
    if (!correction) return

    const tags: string[] = ["user-correction"]
    if (matches.some((p) => /\b(revert|undo|go back|nevermind)\b/i.test(userInput))) {
      tags.push("rejection")
    } else {
      tags.push("correction")
    }

    await arch.storeManualMemory({
      content: correction,
      tags,
      category: "preference",
      source: "user",
    })

    console.log(`[CorrectionCapture] stored correction: "${correction.slice(0, 120)}"`)
  }

  private extractCorrection(input: string): string | null {
    let cleaned = input

    const prefixes = [
      /^(nevermind|never mind|forget it|ignore that|disregard)\s*/i,
      /^(no[,.]?\s*)+/i,
      /^(actually[,.]?\s*)+/i,
    ]
    for (const p of prefixes) {
      cleaned = cleaned.replace(p, "").trim()
    }

    if (cleaned.length < CORRECTION_PATTERNS_LENIENCE) return null

    // Clean up conversational framing to keep the correction signal
    const fillers = [
      /\b(that'?s|this is|it'?s)\s+(wrong|incorrect|not right),?\s*/gi,
      /\bno[,.]?\s+that'?s?\s+(wrong|incorrect|not right|not what I),?\s*/gi,
      /\b(actually|I mean|I meant)\s*,?\s*/gi,
      /\bnot\s+(what\s+I\s+)?(said|meant|wanted),?\s*/gi,
    ]
    for (const f of fillers) {
      cleaned = cleaned.replace(f, "").trim()
    }

    const redundant = /\b(revert|undo)\s+that\s*/gi
    cleaned = cleaned.replace(redundant, "Reverted: ").trim()

    return cleaned.length >= CORRECTION_PATTERNS_LENIENCE ? cleaned : null
  }
}

export const correctionCapture = CorrectionCapture.getInstance()
