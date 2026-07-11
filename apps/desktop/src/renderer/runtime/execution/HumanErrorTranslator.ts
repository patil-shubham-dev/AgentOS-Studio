export interface HumanReadableError {
  problem: string
  cause: string
  suggestedFix: string
  recoveryAction: string
}

const KNOWN_PATTERNS: Array<{
  test: (msg: string) => boolean
  translate: (msg: string) => HumanReadableError
}> = [
  {
    test: (m) => m.includes("Cannot read properties of undefined") || m.includes("Cannot destructure"),
    translate: (m) => ({
      problem: "The application encountered incomplete or missing data.",
      cause: "A module or component returned undefined instead of the expected data structure.",
      suggestedFix: m.includes("workspace") || m.includes("store")
        ? "Reload the current workspace to re-initialize data."
        : "Restart the affected panel or page.",
      recoveryAction: "Try reloading the workspace (Ctrl+Shift+R) or reopening the project.",
    }),
  },
  {
    test: (m) => m.includes("is not a function") || m.includes("is not defined"),
    translate: (m) => ({
      problem: "A module failed to load correctly.",
      cause: "A JavaScript module or dependency could not be resolved at runtime.",
      suggestedFix: "Restart the application to reload all modules.",
      recoveryAction: "Press Ctrl+R to reload the application window.",
    }),
  },
  {
    test: (m) => m.includes("NetworkError") || m.includes("network") || m.includes("fetch") || m.includes("Failed to fetch") || m.includes("ECONNREFUSED") || m.includes("ENOTFOUND"),
    translate: (m) => ({
      problem: "Unable to connect to an external service.",
      cause: m.includes("provider") || m.includes("API")
        ? "The AI provider API endpoint is unreachable."
        : "A network request failed, possibly due to connectivity issues.",
      suggestedFix: m.includes("provider")
        ? "Check your API provider configuration in Settings."
        : "Check your internet connection and firewall settings.",
      recoveryAction: "Verify your network connection and try again. If using a proxy, check proxy configuration.",
    }),
  },
  {
    test: (m) => m.includes("timeout") || m.includes("Timeout") || m.includes("timed out"),
    translate: (m) => ({
      problem: "An operation took too long and was cancelled.",
      cause: m.includes("provider") || m.includes("AI") || m.includes("model")
        ? "The AI model took too long to respond."
        : m.includes("tool") || m.includes("command")
        ? "A tool or command execution exceeded its time limit."
        : "A system operation exceeded its expected duration.",
      suggestedFix: m.includes("provider")
        ? "Try a simpler request or a different model."
        : "The operation may be too complex — try breaking it into smaller steps.",
      recoveryAction: "The operation has been cancelled. You can retry with a simpler request.",
    }),
  },
  {
    test: (m) => m.includes("rate limit") || m.includes("RateLimit") || m.includes("429") || m.includes("too many requests"),
    translate: (m) => ({
      problem: "Too many requests were sent in a short period.",
      cause: "The API provider's rate limit has been reached.",
      suggestedFix: "Wait a moment before sending another request.",
      recoveryAction: "The system will automatically retry after a brief pause. No action needed.",
    }),
  },
  {
    test: (m) => m.includes("unauthorized") || m.includes("Unauthorized") || m.includes("401") || m.includes("403") || m.includes("API key") || m.includes("api key") || m.includes("authentication"),
    translate: (m) => ({
      problem: "Authentication failed for an external service.",
      cause: "The API key or credentials are missing, invalid, or expired.",
      suggestedFix: "Update your API key in Settings > Providers.",
      recoveryAction: "Go to Settings, select the affected provider, and enter a valid API key.",
    }),
  },
  {
    test: (m) => m.includes("disk") || m.includes("Disk") || m.includes("ENOSPC") || m.includes("no space"),
    translate: (m) => ({
      problem: "Insufficient disk space for the operation.",
      cause: "The system drive or workspace directory is out of storage space.",
      suggestedFix: "Free up disk space by removing temporary files or unused projects.",
      recoveryAction: "Delete temporary files and try again. Workspace may need to be moved to a drive with more space.",
    }),
  },
  {
    test: (m) => m.includes("permission") || m.includes("Permission") || m.includes("EACCES") || m.includes("EPERM") || m.includes("access denied"),
    translate: (m) => ({
      problem: "The application does not have permission to access a file or directory.",
      cause: "File system permissions prevent access to the requested path.",
      suggestedFix: "Ensure the workspace directory has read/write permissions.",
      recoveryAction: "Restart the application with appropriate permissions or move the workspace to an accessible location.",
    }),
  },
  {
    test: (m) => m.includes("syntax") || m.includes("Syntax") || m.includes("parse") || m.includes("Parse"),
    translate: (m) => ({
      problem: "A file contains invalid syntax.",
      cause: m.includes("JSON") || m.includes("json")
        ? "A configuration file has invalid JSON formatting."
        : "A source file contains a syntax error that prevents processing.",
      suggestedFix: m.includes("JSON") || m.includes("json")
        ? "Check the configuration file for missing commas, brackets, or quotes."
        : "Review the file for syntax errors and fix them before retrying.",
      recoveryAction: "Fix the syntax error in the affected file and save it.",
    }),
  },
  {
    test: (m) => m.includes("ENOENT") || m.includes("not found") || m.includes("No such file") || m.includes("does not exist"),
    translate: (m) => ({
      problem: "A required file or directory was not found.",
      cause: m.includes("config") || m.includes("configuration")
        ? "A configuration file referenced by the system is missing."
        : "The application tried to access a file that does not exist at the given path.",
      suggestedFix: "Check that the file path is correct and the file has not been moved or deleted.",
      recoveryAction: "Verify the file exists at the expected location, or recreate it if necessary.",
    }),
  },
  {
    test: (m) => m.includes("EISDIR") || m.includes("is a directory") || m.includes("expected file"),
    translate: (m) => ({
      problem: "The operation expected a file but received a directory.",
      cause: "A path points to a directory instead of a file.",
      suggestedFix: "Specify a file path instead of a directory path.",
      recoveryAction: "Update the path to point to a file, not a directory.",
    }),
  },
  {
    test: (m) => m.includes("out of memory") || m.includes("heap") || m.includes("allocation failed") || m.includes("JavaScript heap"),
    translate: (m) => ({
      problem: "The application ran out of memory.",
      cause: "The operation required more memory than is available.",
      suggestedFix: "Close other programs or increase the memory limit.",
      recoveryAction: "Restart the application and retry with a simpler task.",
    }),
  },
  {
    test: (m) => m.includes("EADDRINUSE") || m.includes("port") && (m.includes("in use") || m.includes("occupied")),
    translate: (m) => ({
      problem: "The required network port is already in use.",
      cause: "Another application is using the same port number.",
      suggestedFix: "Close the other application using the port, or configure a different port.",
      recoveryAction: "Stop the conflicting application or change the port in Settings.",
    }),
  },
  {
    test: (m) => m.includes("SSL") || m.includes("TLS") || m.includes("certificate") || m.includes("CERT_") || m.includes("self signed"),
    translate: (m) => ({
      problem: "A secure connection could not be established due to an SSL/TLS issue.",
      cause: "The remote server's SSL certificate is invalid, expired, or self-signed.",
      suggestedFix: "Check your system date and time. If using a self-signed certificate, add it to trusted certificates.",
      recoveryAction: "Verify the server URL and try again. You may need to update your CA certificates.",
    }),
  },
  {
    test: (m) => m.includes("CORS") || m.includes("cross-origin"),
    translate: (m) => ({
      problem: "A cross-origin request was blocked by the browser.",
      cause: "The application tried to access a resource from a different origin that does not allow it.",
      suggestedFix: "Ensure the remote server includes the appropriate CORS headers.",
      recoveryAction: "The request will not work with the current server configuration. Try a different endpoint or proxy.",
    }),
  },
  {
    test: (m) => m.includes("WebSocket") || m.includes("websocket") || m.includes("ws://") || m.includes("wss://"),
    translate: (m) => ({
      problem: "A WebSocket connection failed or was interrupted.",
      cause: "The real-time connection to the server was lost or could not be established.",
      suggestedFix: "Check your network connection and ensure the WebSocket server is running.",
      recoveryAction: "The application will automatically attempt to reconnect. If the issue persists, reload the window.",
    }),
  },
  {
    test: (m) => m.includes("read") && (m.includes("file") || m.includes("stream")) && (m.includes("failed") || m.includes("error") || m.includes("could not")),
    translate: (m) => ({
      problem: "A file could not be read.",
      cause: "The file may be locked by another process, corrupted, or have restricted permissions.",
      suggestedFix: "Close other applications that may be using the file and check file permissions.",
      recoveryAction: "Try opening the file manually to verify it is accessible.",
    }),
  },
  {
    test: (m) => m.includes("write") && (m.includes("file") || m.includes("stream")) && (m.includes("failed") || m.includes("error") || m.includes("could not")),
    translate: (m) => ({
      problem: "A file could not be written to disk.",
      cause: "The disk may be full, the file may be read-only, or permissions may be insufficient.",
      suggestedFix: "Check disk space, file permissions, and ensure the file is not open in another program.",
      recoveryAction: "Free up disk space or change file permissions and try again.",
    }),
  },
  {
    test: (m) => m.includes("TypeScript") || m.includes("TS") && m.includes("error") || m.includes("type") && (m.includes("not assignable") || m.includes("is not")),
    translate: (m) => ({
      problem: "A TypeScript type error was detected.",
      cause: "The code contains a type mismatch that prevents compilation.",
      suggestedFix: "Review the type definitions and ensure all types match their expected interfaces.",
      recoveryAction: "Run `npm run typecheck` to see all type errors and fix them one by one.",
    }),
  },
  {
    test: (m) => m.includes("lint") || m.includes("eslint") || m.includes("prettier") || m.includes("linting"),
    translate: (m) => ({
      problem: "A linting error was detected in the code.",
      cause: "The code does not conform to the project's style or quality rules.",
      suggestedFix: "Run the linter to see specific rule violations and fix them.",
      recoveryAction: "Run `npm run lint` to see all linting errors, or use --fix to auto-correct where possible.",
    }),
  },
  {
    test: (m) => m.includes("test") && (m.includes("fail") || m.includes("error")) || m.includes("assertion") || m.includes("expected") && m.includes("to equal"),
    translate: (m) => ({
      problem: "A test assertion failed.",
      cause: "The actual output did not match the expected output in the test.",
      suggestedFix: "Review the test to understand what is being asserted and fix the implementation or update the test.",
      recoveryAction: "Run the failing test in isolation to debug: `npx vitest run <test-file>`.",
    }),
  },
  {
    test: (m) => m.includes("kill") || m.includes("SIGTERM") || m.includes("SIGKILL") || m.includes("process") && m.includes("exit"),
    translate: (m) => ({
      problem: "A process was terminated unexpectedly.",
      cause: m.includes("timeout")
        ? "The process exceeded its time limit and was killed."
        : "An external process was terminated, possibly due to a system or resource issue.",
      suggestedFix: "Ensure the system has sufficient resources and try again.",
      recoveryAction: "Restart the operation. If the issue persists, check system resource usage.",
    }),
  },
  {
    test: (m) => m.includes("invalid") && (m.includes("argument") || m.includes("parameter") || m.includes("option")),
    translate: (m) => ({
      problem: "An invalid argument was provided to a function or command.",
      cause: "The application received a parameter with an unexpected value or type.",
      suggestedFix: "Check the arguments being passed and ensure they match the expected format.",
      recoveryAction: "Review the command or function call and correct the invalid argument.",
    }),
  },
  {
    test: (m) => m.includes("circular") && (m.includes("dependency") || m.includes("import")),
    translate: (m) => ({
      problem: "A circular dependency was detected between modules.",
      cause: "Two or more modules import each other, creating an infinite loop.",
      suggestedFix: "Refactor the modules to remove the circular dependency by extracting shared code.",
      recoveryAction: "Identify the circular chain and break it by introducing a shared dependency or restructuring imports.",
    }),
  },
  {
    test: (m) => m.includes("token") && (m.includes("limit") || m.includes("exceeded") || m.includes("too long")) || m.includes("context length") || m.includes("max_tokens"),
    translate: (m) => ({
      problem: "The request exceeded the maximum allowed token or context length.",
      cause: "The input or output is too large for the model's context window.",
      suggestedFix: "Reduce the size of the input or request a shorter response.",
      recoveryAction: "Break the task into smaller parts or use a model with a larger context window.",
    }),
  },
  {
    test: (m) => m.includes("model") && (m.includes("not found") || m.includes("unavailable") || m.includes("does not support") || m.includes("not supported")),
    translate: (m) => ({
      problem: "The requested AI model is not available or supported.",
      cause: "The model name may be incorrect, or the provider does not offer this model.",
      suggestedFix: "Check the model name in Settings and ensure it is supported by your provider.",
      recoveryAction: "Select a different model from the dropdown or update the model name in settings.",
    }),
  },
  {
    test: (m) => m.includes("YAML") || m.includes("yaml") || (m.includes("indentation") && m.includes("mapping")),
    translate: (m) => ({
      problem: "A YAML file contains invalid formatting.",
      cause: "The YAML file has incorrect indentation or structure.",
      suggestedFix: "Check for consistent indentation (spaces vs tabs) and valid YAML syntax.",
      recoveryAction: "Use a YAML linter to identify and fix the formatting issue.",
    }),
  },
  {
    test: (m) => m.includes("command not found") || m.includes("is not recognized") || m.includes("not a command"),
    translate: (m) => ({
      problem: "A shell command was not found on the system.",
      cause: "The required command-line tool is not installed or not in the system PATH.",
      suggestedFix: "Install the required tool or add its location to your system PATH.",
      recoveryAction: "Install the missing tool and restart the application.",
    }),
  },
  {
    test: (m) => m.includes("exit code") || m.includes("exited with") || m.includes("non-zero exit"),
    translate: (m) => ({
      problem: "A command exited with a non-zero status code.",
      cause: "The command encountered an error during execution.",
      suggestedFix: "Review the command output for specific error messages.",
      recoveryAction: "Check the command output above for details on what went wrong.",
    }),
  },
  {
    test: (m) => m.includes("GraphQL") || m.includes("graphql"),
    translate: (m) => ({
      problem: "A GraphQL query failed.",
      cause: "The query was malformed or the server returned an error.",
      suggestedFix: "Check the query syntax and ensure all required fields are requested.",
      recoveryAction: "Review the GraphQL endpoint and query for correctness.",
    }),
  },
  {
    test: (m) => m.includes("cache") || m.includes("Cache") && (m.includes("miss") || m.includes("invalid") || m.includes("corrupt") || m.includes("stale")),
    translate: (m) => ({
      problem: "A cache operation failed or returned stale data.",
      cause: "The cache may be corrupted, outdated, or the wrong key was used.",
      suggestedFix: "Clear the application cache and retry the operation.",
      recoveryAction: "Clear the cache from Settings > Advanced > Clear Cache, then retry.",
    }),
  },
  {
    test: (m) => m.includes("git") && (m.includes("not a git") || m.includes("not in a git") || m.includes("fatal") || m.includes("merge conflict") || m.includes("detached")),
    translate: (m) => ({
      problem: "A Git operation encountered an error.",
      cause: m.includes("merge conflict")
        ? "There are conflicting changes that need to be resolved."
        : m.includes("not a git")
        ? "The current directory is not a Git repository."
        : "A Git command failed due to repository state issues.",
      suggestedFix: m.includes("merge conflict")
        ? "Resolve the merge conflicts manually, then commit."
        : "Ensure the project is a valid Git repository with no unresolved issues.",
      recoveryAction: m.includes("merge conflict")
        ? "Use a merge tool to resolve conflicts, then stage and commit."
        : "Run `git status` to check the repository state.",
    }),
  },
  {
    test: (m) => m.includes("concurrent") || m.includes("race condition") || m.includes("deadlock") || m.includes("locked"),
    translate: (m) => ({
      problem: "A concurrency conflict occurred.",
      cause: "Two operations tried to access the same resource simultaneously.",
      suggestedFix: "Wait for the current operation to complete before retrying.",
      recoveryAction: "The system will retry automatically. If the issue persists, try again in a moment.",
    }),
  },
]

export class HumanErrorTranslator {
  static translate(error: Error | string): HumanReadableError {
    const msg = typeof error === "string" ? error : error.message
    for (const pattern of KNOWN_PATTERNS) {
      if (pattern.test(msg)) {
        return pattern.translate(msg)
      }
    }
    return {
      problem: msg.length > 120 ? msg.slice(0, 120) + "..." : msg,
      cause: "An unexpected error occurred during the operation.",
      suggestedFix: "Restart the current operation or reload the application.",
      recoveryAction: "If the issue persists, report it to support with the error details.",
    }
  }

  static isRecognized(error: Error | string): boolean {
    const msg = typeof error === "string" ? error : error.message
    return KNOWN_PATTERNS.some((p) => p.test(msg))
  }
}
