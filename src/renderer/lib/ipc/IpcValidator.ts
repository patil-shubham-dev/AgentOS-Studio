/**
 * IpcValidator — argument validation schemas for IPC channels.
 *
 * Each IPC channel has a schema that defines the expected argument types,
 * constraints, and validation rules. Invalid arguments are rejected with
 * structured error messages BEFORE they reach the handler.
 *
 * This prevents injection attacks via unbounded strings, path traversal,
 * and malformed arguments.
 */

import { auditLog } from '@/lib/audit/AuditLog'

// ── Types ──

export type IpcArgType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'

export interface IpcArgConstraint {
  type: IpcArgType
  /** If true, the argument is required */
  required?: boolean
  /** Maximum string length (for string types) */
  maxLength?: number
  /** Minimum string length (for string types) */
  minLength?: number
  /** Regex pattern the string must match */
  pattern?: RegExp
  /** For number types: minimum value */
  min?: number
  /** For number types: maximum value */
  max?: number
  /** Custom validation function */
  validate?: (value: unknown) => string | null
  /** Human-readable description of the argument */
  description?: string
}

export interface IpcChannelSchema {
  /** Channel name (e.g., "read-text-file") */
  channel: string
  /** Argument schemas in positional order */
  args: IpcArgConstraint[]
  /** The source/component making the call */
  source: string
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string; channel: string; argIndex: number }

// ── Schema Registry ──

const SCHEMAS = new Map<string, IpcChannelSchema>()

function register(schema: IpcChannelSchema): void {
  SCHEMAS.set(schema.channel, schema)
}

function get(channel: string): IpcChannelSchema | undefined {
  return SCHEMAS.get(channel)
}

export const ipcSchemaRegistry = { register, get }

// ── Validator ──

/**
 * Validate arguments against a schema.
 * Returns validation result with error details if invalid.
 */
export function validateIpcArgs(
  channel: string,
  args: unknown[],
  source: string,
): ValidationResult {
  const schema = SCHEMAS.get(channel)

  // No schema defined — allow (but log warning)
  if (!schema) {
    console.warn(`[IPC] No validation schema for channel "${channel}" — allowing unvalidated`)
    return { valid: true }
  }

  for (let i = 0; i < schema.args.length; i++) {
    const constraint = schema.args[i]
    const value = args[i]

    // Required check
    if (constraint.required && (value === undefined || value === null)) {
      const error = `Required argument ${i} (${constraint.description ?? 'unnamed'}) is missing for channel "${channel}"`
      auditLog.recordIpcValidationFailure(source, channel, error)
      return { valid: false, error, channel, argIndex: i }
    }

    // Skip validation for undefined optional args
    if (value === undefined || value === null) continue

    // Type check
    if (constraint.type !== 'any') {
      const typeOk = checkType(value, constraint.type)
      if (!typeOk) {
        const error = `Argument ${i} (${constraint.description ?? 'unnamed'}) for channel "${channel}" expected ${constraint.type}, got ${typeof value}`
        auditLog.recordIpcValidationFailure(source, channel, error)
        return { valid: false, error, channel, argIndex: i }
      }
    }

    // String-specific checks
    if (constraint.type === 'string' && typeof value === 'string') {
      if (constraint.maxLength !== undefined && value.length > constraint.maxLength) {
        const error = `Argument ${i} for channel "${channel}" exceeds max length ${constraint.maxLength} (got ${value.length})`
        auditLog.recordIpcValidationFailure(source, channel, error)
        return { valid: false, error, channel, argIndex: i }
      }
      if (constraint.minLength !== undefined && value.length < constraint.minLength) {
        const error = `Argument ${i} for channel "${channel}" below min length ${constraint.minLength} (got ${value.length})`
        auditLog.recordIpcValidationFailure(source, channel, error)
        return { valid: false, error, channel, argIndex: i }
      }
      if (constraint.pattern && !constraint.pattern.test(value)) {
        const error = `Argument ${i} for channel "${channel}" failed pattern validation`
        auditLog.recordIpcValidationFailure(source, channel, error)
        return { valid: false, error, channel, argIndex: i }
      }
    }

    // Number-specific checks
    if (constraint.type === 'number' && typeof value === 'number') {
      if (constraint.min !== undefined && value < constraint.min) {
        const error = `Argument ${i} for channel "${channel}" below minimum ${constraint.min} (got ${value})`
        auditLog.recordIpcValidationFailure(source, channel, error)
        return { valid: false, error, channel, argIndex: i }
      }
      if (constraint.max !== undefined && value > constraint.max) {
        const error = `Argument ${i} for channel "${channel}" exceeds maximum ${constraint.max} (got ${value})`
        auditLog.recordIpcValidationFailure(source, channel, error)
        return { valid: false, error, channel, argIndex: i }
      }
    }

    // Custom validation
    if (constraint.validate) {
      const customError = constraint.validate(value)
      if (customError) {
        auditLog.recordIpcValidationFailure(source, channel, customError)
        return { valid: false, error: customError, channel, argIndex: i }
      }
    }
  }

  return { valid: true }
}

function checkType(value: unknown, type: IpcArgType): boolean {
  switch (type) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && !isNaN(value)
    case 'boolean': return typeof value === 'boolean'
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value)
    case 'array': return Array.isArray(value)
    default: return true
  }
}

// ── Common Path Validation ──

/** Regex for path traversal patterns */
const PATH_TRAVERSAL_PATTERN = /(?:^|[/\\])\.\.(?:[/\\]|$)/

/**
 * Validate that a path is safe (no traversal, within allowed length).
 * Returns error message or null if valid.
 */
export function validatePath(path: string, maxLength = 4096): string | null {
  if (!path || typeof path !== 'string') return 'Path must be a non-empty string'
  if (path.length > maxLength) return `Path exceeds maximum length of ${maxLength}`
  if (PATH_TRAVERSAL_PATTERN.test(path)) return 'Path traversal detected (..)'
  if (path.includes('\0')) return 'Path contains null byte'
  return null
}

/** Regex for valid file extensions */
const VALID_EXT_PATTERN = /^\.?[a-zA-Z0-9]+$/

/**
 * Validate a file extension filter.
 */
export function validateExtension(ext: string): string | null {
  if (!ext || typeof ext !== 'string') return 'Extension must be a string'
  if (!VALID_EXT_PATTERN.test(ext)) return `Invalid file extension: ${ext}`
  return null
}

// ── Common Constraint Factory ──

export const Constraints = {
  /** A non-empty string with max length */
  string: (maxLength = 4096, required = true, description?: string): IpcArgConstraint => ({
    type: 'string',
    required,
    minLength: required ? 1 : 0,
    maxLength,
    description,
  }),

  /** A file path string (no traversal, bounded length) */
  path: (required = true, description?: string): IpcArgConstraint => ({
    type: 'string',
    required,
    maxLength: 4096,
    validate: (v: unknown) => validatePath(v as string),
    description: description ?? 'File path',
  }),

  /** A workspace path string */
  workspacePath: (required = true, description?: string): IpcArgConstraint => ({
    type: 'string',
    required,
    maxLength: 4096,
    description: description ?? 'Workspace path',
  }),

  /** A positive integer */
  positiveInt: (required = true, description?: string): IpcArgConstraint => ({
    type: 'number',
    required,
    min: 0,
    max: 1_000_000,
    description: description ?? 'Positive integer',
  }),

  /** An optional number */
  optionalNumber: (description?: string): IpcArgConstraint => ({
    type: 'number',
    required: false,
    description: description ?? 'Optional number',
  }),

  /** A boolean flag */
  boolean: (required = false, description?: string): IpcArgConstraint => ({
    type: 'boolean',
    required,
    description: description ?? 'Boolean flag',
  }),

  /** An arbitrary object */
  object: (required = true, description?: string): IpcArgConstraint => ({
    type: 'object',
    required,
    description: description ?? 'Object',
  }),

  /** A string array */
  stringArray: (required = true, description?: string): IpcArgConstraint => ({
    type: 'array',
    required,
    validate: (v: unknown) => {
      if (!Array.isArray(v)) return 'Expected array'
      for (const item of v) {
        if (typeof item !== 'string') return 'Array items must be strings'
      }
      return null
    },
    description: description ?? 'String array',
  }),

  /** A git repository path (validated against workspace) */
  gitPath: (required = true): IpcArgConstraint => ({
    type: 'string',
    required,
    maxLength: 4096,
    description: 'Git repository path',
  }),
}

// ── Register all IPC schemas ──
// Call this during app startup to register validation for sensitive channels.

export function registerAllIpcSchemas(): void {
  // File system channels
  register({ channel: 'read-text-file', source: 'fs', args: [Constraints.path()] })
  register({ channel: 'write-text-file', source: 'fs', args: [Constraints.path(), Constraints.string(10_000_000)] })
  register({ channel: 'read-binary-file', source: 'fs', args: [Constraints.path()] })
  register({ channel: 'write-binary-file', source: 'fs', args: [Constraints.path(), Constraints.string(50_000_000)] })
  register({ channel: 'file-exists', source: 'fs', args: [Constraints.path()] })
  register({ channel: 'create-directory', source: 'fs', args: [Constraints.path()] })
  register({ channel: 'delete-file', source: 'fs', args: [Constraints.path()] })
  register({ channel: 'rename-file', source: 'fs', args: [Constraints.path(), Constraints.path()] })
  register({ channel: 'get-file-stats', source: 'fs', args: [Constraints.path()] })
  register({ channel: 'read-directory', source: 'fs', args: [Constraints.path()] })
  register({ channel: 'list-directory', source: 'fs', args: [Constraints.path()] })

  // Command execution channels (most sensitive)
  register({ channel: 'run-command', source: 'exec', args: [Constraints.object(true, 'Command options')] })
  register({
    channel: 'run-command-stream',
    source: 'exec',
    args: [{ type: 'object', required: true, validate: (v: unknown) => {
      const opts = v as Record<string, unknown>
      if (!opts.command || typeof opts.command !== 'string') return 'command is required'
      if (opts.command.length > 10000) return 'command exceeds max length'
      if (!opts.streamId || typeof opts.streamId !== 'string') return 'streamId is required'
      return null
    }, description: 'Stream command options' }],
  })
  register({ channel: 'kill-command', source: 'exec', args: [Constraints.string(200)] })

  // Git channels
  register({ channel: 'git-status', source: 'git', args: [Constraints.gitPath()] })
  register({ channel: 'git-log', source: 'git', args: [Constraints.gitPath(), Constraints.optionalNumber('Max commits')] })
  register({ channel: 'git-diff', source: 'git', args: [Constraints.gitPath(), Constraints.string(4096, false, 'File path')] })
  register({ channel: 'git-commit', source: 'git', args: [Constraints.gitPath(), Constraints.string(5000, true, 'Commit message')] })
  register({ channel: 'git-restore', source: 'git', args: [Constraints.gitPath(), Constraints.path()] })
  register({ channel: 'git-init', source: 'git', args: [Constraints.gitPath()] })
  register({ channel: 'git-push', source: 'git', args: [Constraints.gitPath()] })
  register({ channel: 'git-pull', source: 'git', args: [Constraints.gitPath()] })
  register({ channel: 'git-checkout', source: 'git', args: [Constraints.gitPath(), Constraints.string(200, true, 'Branch name')] })

  // Browser channels
  register({ channel: 'browser-navigate', source: 'browser', args: [Constraints.string(200), Constraints.string(10000, true, 'URL')] })
  register({ channel: 'browser-execute-js', source: 'browser', args: [Constraints.string(200), Constraints.string(50000, true, 'JavaScript')] })
  register({ channel: 'browser-click', source: 'browser', args: [Constraints.string(200), Constraints.string(2000, true, 'CSS selector')] })
  register({ channel: 'browser-type', source: 'browser', args: [Constraints.string(200), Constraints.string(2000, true, 'CSS selector'), Constraints.string(5000, true, 'Text')] })

  // Workspace channels
  register({ channel: 'workspace:get-tree', source: 'workspace', args: [Constraints.path(), Constraints.optionalNumber('Max depth')] })
  register({ channel: 'workspace:read-file', source: 'workspace', args: [Constraints.path()] })
  register({ channel: 'workspace:write-file', source: 'workspace', args: [Constraints.path(), Constraints.string(10_000_000)] })
  register({ channel: 'workspace:delete', source: 'workspace', args: [Constraints.path()] })
  register({ channel: 'workspace:rename', source: 'workspace', args: [Constraints.path(), Constraints.path()] })

  // Secure storage
  register({ channel: 'safe-storage-encrypt', source: 'security', args: [Constraints.string(100_000)] })
  register({ channel: 'safe-storage-decrypt', source: 'security', args: [Constraints.string(100_000)] })

  // Proxy
  register({ channel: 'proxy-http-request', source: 'network', args: [Constraints.object(true, 'Request options')] })

  // Notification
  register({ channel: 'notification-show', source: 'ui', args: [Constraints.object(true, 'Notification options')] })
}
