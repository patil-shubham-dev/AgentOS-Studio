export type ErrorCategory =
  | "provider"
  | "network"
  | "workspace"
  | "verification"
  | "build"
  | "test"
  | "agent"
  | "execution"
  | "installer"
  | "permission"
  | "ipc"
  | "unknown"

export interface StructuredError {
  code: string
  category: ErrorCategory
  problem: string
  cause: string
  impact: string
  fix: string
  recovery: "automatic" | "manual" | "none"
  recoverable: boolean
  documentationUrl?: string
  retryable: boolean
  source: string
  timestamp: number
}

const ERROR_REGISTRY: Record<string, Omit<StructuredError, "source" | "timestamp">> = {
  "PROVIDER_API_KEY_MISSING": {
    code: "PROVIDER_API_KEY_MISSING",
    category: "provider",
    problem: "No API key configured for the selected provider",
    cause: "Provider configuration is missing required API key",
    impact: "Cannot connect to AI provider. Tasks requiring AI will fail.",
    fix: "Go to Settings → Providers and add your API key for the selected provider",
    recovery: "manual",
    recoverable: true,
    documentationUrl: "/docs/provider-setup",
    retryable: false,
  },
  "PROVIDER_API_KEY_INVALID": {
    code: "PROVIDER_API_KEY_INVALID",
    category: "provider",
    problem: "API key was rejected by the provider",
    cause: "The API key is incorrect, expired, or doesn't have access to the requested model",
    impact: "Authentication failed. Provider will not process requests.",
    fix: "Verify your API key in Settings → Providers. Check your provider dashboard for key status.",
    recovery: "manual",
    recoverable: true,
    documentationUrl: "/docs/provider-troubleshooting",
    retryable: false,
  },
  "PROVIDER_TIMEOUT": {
    code: "PROVIDER_TIMEOUT",
    category: "provider",
    problem: "Provider did not respond within the timeout period",
    cause: "Provider may be overloaded, or the requested model is slow to respond",
    impact: "Execution was interrupted. Partial results may be lost.",
    fix: "Try again later. Consider switching to a faster model in Settings.",
    recovery: "manual",
    recoverable: true,
    retryable: true,
  },
  "PROVIDER_RATE_LIMITED": {
    code: "PROVIDER_RATE_LIMITED",
    category: "provider",
    problem: "Provider rate limit exceeded",
    cause: "Too many requests sent in a short period",
    impact: "Requests are being throttled. Wait before trying again.",
    fix: "Wait 30-60 seconds and retry. Consider reducing concurrent task count.",
    recovery: "automatic",
    recoverable: true,
    retryable: true,
  },
  "NETWORK_OFFLINE": {
    code: "NETWORK_OFFLINE",
    category: "network",
    problem: "No network connection available",
    cause: "Your device is offline or the provider endpoint is unreachable",
    impact: "Cannot communicate with AI providers or fetch remote resources.",
    fix: "Check your internet connection and try again.",
    recovery: "manual",
    recoverable: true,
    retryable: true,
  },
  "NETWORK_DNS_FAILURE": {
    code: "NETWORK_DNS_FAILURE",
    category: "network",
    problem: "Provider domain could not be resolved",
    cause: "DNS lookup failed for the provider URL",
    impact: "Cannot connect to provider. Network or DNS configuration issue.",
    fix: "Check your DNS settings and provider URL in Settings → Providers.",
    recovery: "manual",
    recoverable: true,
    retryable: true,
  },
  "WORKSPACE_FILE_NOT_FOUND": {
    code: "WORKSPACE_FILE_NOT_FOUND",
    category: "workspace",
    problem: "File not found in workspace",
    cause: "The requested file does not exist at the specified path",
    impact: "Operation cannot proceed on the missing file.",
    fix: "Verify the file path exists. Files may have been moved or deleted.",
    recovery: "manual",
    recoverable: true,
    retryable: false,
  },
  "WORKSPACE_PERMISSION_DENIED": {
    code: "WORKSPACE_PERMISSION_DENIED",
    category: "permission",
    problem: "Permission denied when accessing file",
    cause: "The application does not have read/write permission for this file",
    impact: "Cannot read or modify the file.",
    fix: "Check file permissions. Move the project to a location where AgenticOS has access.",
    recovery: "manual",
    recoverable: true,
    retryable: false,
  },
  "AGENT_NO_ROLE_CONFIGURED": {
    code: "AGENT_NO_ROLE_CONFIGURED",
    category: "agent",
    problem: "No agents configured for execution",
    cause: "Runtime has no wired roles or agents",
    impact: "Cannot execute tasks. No agent is available to process requests.",
    fix: "Go to Settings → Roles and wire at least one agent role.",
    recovery: "manual",
    recoverable: true,
    retryable: false,
  },
  "AGENT_ROLE_NOT_WIRED": {
    code: "AGENT_ROLE_NOT_WIRED",
    category: "agent",
    problem: "Requested role is not wired to any agent",
    cause: "The role required for this task has no configured agent",
    impact: "Task cannot proceed with the requested role.",
    fix: `Configure the role in Settings → Roles.`,
    recovery: "manual",
    recoverable: true,
    retryable: false,
  },
  "EXECUTION_CIRCUIT_BREAKER_OPEN": {
    code: "EXECUTION_CIRCUIT_BREAKER_OPEN",
    category: "execution",
    problem: "Execution circuit breaker is open due to repeated failures",
    cause: "Multiple execution failures have triggered the safety circuit",
    impact: "New executions are blocked until the circuit resets.",
    fix: "Wait 30 seconds for automatic reset, or restart the application.",
    recovery: "automatic",
    recoverable: true,
    retryable: true,
  },
  "EXECUTION_CONCURRENT_NOT_ALLOWED": {
    code: "EXECUTION_CONCURRENT_NOT_ALLOWED",
    category: "execution",
    problem: "An execution is already in progress",
    cause: "AgenticOS does not support concurrent execution by default",
    impact: "New execution request was rejected.",
    fix: "Wait for the current execution to complete before starting a new one.",
    recovery: "manual",
    recoverable: true,
    retryable: true,
  },
  "INSTALLER_CORRUPT": {
    code: "INSTALLER_CORRUPT",
    category: "installer",
    problem: "Installation files appear corrupted",
    cause: "The installer download may have been interrupted or corrupted",
    impact: "Cannot install or verify integrity.",
    fix: "Download the installer again from the official source.",
    recovery: "manual",
    recoverable: true,
    retryable: true,
  },
  "IPC_DISCONNECTED": {
    code: "IPC_DISCONNECTED",
    category: "ipc",
    problem: "Internal communication channel disconnected",
    cause: "The renderer process lost connection to the main process",
    impact: "File system and system operations will not work.",
    fix: "Restart the application to restore the connection.",
    recovery: "manual",
    recoverable: true,
    retryable: true,
  },
}

export function getStructuredError(code: string, source: string): StructuredError {
  const entry = ERROR_REGISTRY[code]
  if (entry) {
    return { ...entry, source, timestamp: Date.now() }
  }
  return {
    code: "UNKNOWN",
    category: "unknown",
    problem: `An unexpected error occurred: ${code}`,
    cause: "No specific cause information available",
    impact: "Operation could not complete",
    fix: "Check the execution logs for details. If the issue persists, restart the application.",
    recovery: "manual",
    recoverable: false,
    documentationUrl: undefined,
    retryable: false,
    source,
    timestamp: Date.now(),
  }
}

export function matchErrorToCode(errorMessage: string): string {
  const msg = errorMessage.toLowerCase()
  if (msg.includes("api key") || msg.includes("api_key")) return "PROVIDER_API_KEY_MISSING"
  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("403") || msg.includes("forbidden")) return "PROVIDER_API_KEY_INVALID"
  if (msg.includes("timeout") || msg.includes("timed out")) return "PROVIDER_TIMEOUT"
  if (msg.includes("429") || msg.includes("rate limit")) return "PROVIDER_RATE_LIMITED"
  if (msg.includes("enotfound") || msg.includes("dns") || msg.includes("getaddrinfo")) return "NETWORK_DNS_FAILURE"
  if (msg.includes("econnrefused") || msg.includes("fetch failed") || msg.includes("network")) return "NETWORK_OFFLINE"
  if (msg.includes("enoent") || msg.includes("not found")) return "WORKSPACE_FILE_NOT_FOUND"
  if (msg.includes("eacces") || msg.includes("permission denied") || msg.includes("eperm")) return "WORKSPACE_PERMISSION_DENIED"
  if (msg.includes("not wired") || msg.includes("no agents")) return "AGENT_ROLE_NOT_WIRED"
  if (msg.includes("circuit breaker") || msg.includes("not allowed")) return "EXECUTION_CIRCUIT_BREAKER_OPEN"
  if (msg.includes("already in progress")) return "EXECUTION_CONCURRENT_NOT_ALLOWED"
  return "UNKNOWN"
}

export function formatErrorForUser(err: StructuredError): string {
  return `${err.problem}\n\nCause: ${err.cause}\n\nFix: ${err.fix}`
}
