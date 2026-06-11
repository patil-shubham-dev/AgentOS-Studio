import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'

export type ValidationResult = { valid: true } | { valid: false; error: string; code: number }

export class ToolValidator {
  validate(tool: AgentTool, input: unknown, ctx: ToolContext): ValidationResult {
    const schema = tool.inputSchema
    if (!schema || Object.keys(schema).length === 0) return { valid: true }

    if (typeof input !== 'object' || input === null) {
      return { valid: false, error: 'Input must be an object', code: 400 }
    }

    const inputRecord = input as Record<string, unknown>

    for (const [key, expectedType] of Object.entries(schema)) {
      if (typeof expectedType === 'string') {
        const val = inputRecord[key]
        if (val === undefined) continue
        if (expectedType === 'string' && typeof val !== 'string') {
          return { valid: false, error: `Field "${key}" must be a string`, code: 422 }
        }
        if (expectedType === 'number' && typeof val !== 'number') {
          return { valid: false, error: `Field "${key}" must be a number`, code: 422 }
        }
        if (expectedType === 'boolean' && typeof val !== 'boolean') {
          return { valid: false, error: `Field "${key}" must be a boolean`, code: 422 }
        }
        if (expectedType === 'array' && !Array.isArray(val)) {
          return { valid: false, error: `Field "${key}" must be an array`, code: 422 }
        }
      }
    }

    return { valid: true }
  }

  validateRequiredFields(tool: AgentTool, input: unknown): ValidationResult {
    const schema = tool.inputSchema
    if (!schema) return { valid: true }
    const inputRecord = input as Record<string, unknown>

    for (const [key] of Object.entries(schema)) {
      if (inputRecord[key] === undefined) {
        return { valid: false, error: `Missing required field: "${key}"`, code: 422 }
      }
    }

    return { valid: true }
  }
}
