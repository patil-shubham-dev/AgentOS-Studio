import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'

export type ValidationResult = { valid: true } | { valid: false; error: string; code: number }

interface SchemaField {
  type?: string
  description?: string
  minimum?: number
  maximum?: number
  pattern?: string
  enum?: string[]
  required?: boolean
}

export class ToolValidator {
  validate(tool: AgentTool, input: unknown, _ctx: ToolContext): ValidationResult {
    const schema = tool.inputSchema as Record<string, unknown> | undefined
    if (!schema || Object.keys(schema).length === 0) return { valid: true }

    if (typeof input !== 'object' || input === null) {
      return { valid: false, error: 'Input must be an object', code: 400 }
    }

    const inputRecord = input as Record<string, unknown>

    const properties = (schema.properties as Record<string, unknown> | undefined)
      ?? schema
    const requiredFields = Array.isArray(schema.required)
      ? (schema.required as string[])
      : null

    for (const [key, fieldDef] of Object.entries(properties)) {
      if (requiredFields === null && (key === 'type' || key === 'properties' || key === 'required')) {
        continue
      }

      const field = typeof fieldDef === 'object' && fieldDef !== null
        ? fieldDef as SchemaField
        : { type: String(fieldDef) }

      if (requiredFields !== null && requiredFields.includes(key)) {
        if (inputRecord[key] === undefined) {
          return { valid: false, error: `Missing required field: "${key}"`, code: 422 }
        }
      }

      const val = inputRecord[key]
      if (val === undefined) continue

      if (field.type === 'string' && typeof val !== 'string') {
        return { valid: false, error: `Field "${key}" must be a string`, code: 422 }
      }
      if (field.type === 'number') {
        if (typeof val !== 'number') {
          return { valid: false, error: `Field "${key}" must be a number`, code: 422 }
        }
        if (field.minimum !== undefined && val < field.minimum) {
          return { valid: false, error: `Field "${key}" must be >= ${field.minimum}`, code: 422 }
        }
        if (field.maximum !== undefined && val > field.maximum) {
          return { valid: false, error: `Field "${key}" must be <= ${field.maximum}`, code: 422 }
        }
      }
      if (field.type === 'boolean' && typeof val !== 'boolean') {
        return { valid: false, error: `Field "${key}" must be a boolean`, code: 422 }
      }
      if (field.type === 'array' && !Array.isArray(val)) {
        return { valid: false, error: `Field "${key}" must be an array`, code: 422 }
      }

      if (field.type === 'string' && typeof val === 'string') {
        if (field.pattern) {
          try {
            if (!new RegExp(field.pattern).test(val)) {
              return { valid: false, error: `Field "${key}" does not match required pattern`, code: 422 }
            }
          } catch {
            /* invalid regex in schema — skip */
          }
        }
        if (field.enum && !field.enum.includes(val)) {
          return { valid: false, error: `Field "${key}" must be one of: ${field.enum.join(', ')}`, code: 422 }
        }
      }
    }

    return { valid: true }
  }

  validateRequiredFields(tool: AgentTool, input: unknown): ValidationResult {
    const schema = tool.inputSchema as Record<string, unknown> | undefined
    if (!schema) return { valid: true }

    const inputRecord = input as Record<string, unknown>
    const requiredFields = Array.isArray(schema.required)
      ? (schema.required as string[])
      : null

    if (requiredFields) {
      for (const key of requiredFields) {
        if (inputRecord[key] === undefined) {
          return { valid: false, error: `Missing required field: "${key}"`, code: 422 }
        }
      }
    } else {
      // Fallback for flat schemas without top-level required array
      const properties = schema.properties as Record<string, unknown> | undefined
        ?? schema
      for (const [key, fieldDef] of Object.entries(properties)) {
        if (key === 'type' || key === 'properties' || key === 'required') continue
        const field = typeof fieldDef === 'object' && fieldDef !== null
          ? fieldDef as SchemaField
          : { type: String(fieldDef) }
        if (field.required !== false && inputRecord[key] === undefined) {
          return { valid: false, error: `Missing required field: "${key}"`, code: 422 }
        }
      }
    }

    return { valid: true }
  }
}
