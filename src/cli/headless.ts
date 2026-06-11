/**
 * Headless CLI mode — run the agent engine without Electron GUI.
 * Output uses NDJSON structured I/O format.
 *
 * Usage:
 *   node dist/cli/headless.js --print "Write a fibonacci function"
 *   echo "Hello" | node dist/cli/headless.js --stdin
 *   node dist/cli/headless.js --file prompt.txt --json
 *
 * Flags:
 *   --print, -p <text>     Run a single prompt and exit
 *   --stdin                Read prompt from stdin (one line, or until EOF)
 *   --file, -f <path>      Read prompt from file
 *   --json, -j             Output NDJSON structured I/O (default: human-readable)
 *   --model, -m <name>     Model to use
 *   --provider, -P <id>    Provider ID
 *   --cwd <path>           Working directory (default: current dir)
 *   --timeout <ms>         Timeout in milliseconds (default: 120000)
 *   --mode <fast|full>     Execution mode (default: fast)
 *   --help, -h             Show help
 */

import { createStructuredReader, writeStructuredOutput, writeError, writeText, writeDone, writeToolStart, writeToolResult, writeThinking } from './structuredIO'
import type { StructuredInputEvent } from './structuredIO'

interface CLIOptions {
  print?: string
  stdin?: boolean
  file?: string
  json?: boolean
  model?: string
  provider?: string
  cwd?: string
  timeout?: number
  mode?: "fast" | "full"
  help?: boolean
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2)
  const opts: CLIOptions = {}

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--print": case "-p": opts.print = args[++i]; break
      case "--stdin": opts.stdin = true; break
      case "--file": case "-f": opts.file = args[++i]; break
      case "--json": case "-j": opts.json = true; break
      case "--model": case "-m": opts.model = args[++i]; break
      case "--provider": case "-P": opts.provider = args[++i]; break
      case "--cwd": opts.cwd = args[++i]; break
      case "--timeout": opts.timeout = parseInt(args[++i], 10) || 120000; break
      case "--mode": opts.mode = args[++i] as "fast" | "full"; break
      case "--help": case "-h": opts.help = true; break
    }
  }

  return opts
}

function showHelp(): void {
  console.log(`
AgenticOS — Headless CLI

Usage:
  agentic --print "Write a fibonacci function"
  echo "Hello" | agentic --stdin
  agentic --file prompt.txt --json

Flags:
  --print, -p <text>     Run a single prompt and exit
  --stdin                Read prompt from stdin
  --file, -f <path>      Read prompt from file
  --json, -j             Output NDJSON structured I/O
  --model, -m <name>     Model to use
  --provider, -P <id>    Provider ID
  --cwd <path>           Working directory
  --timeout <ms>         Timeout (default: 120000)
  --mode <fast|full>     Execution mode (default: fast)
  --help, -h             Show this help
`)
}

async function getPrompt(opts: CLIOptions): Promise<string | null> {
  if (opts.print) return opts.print
  if (opts.file) {
    const fs = await import('fs')
    try {
      return fs.readFileSync(opts.file, 'utf-8').trim()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (opts.json) writeError(`Failed to read file: ${msg}`)
      else console.error(`Error: Failed to read file: ${msg}`)
      return null
    }
  }
  if (opts.stdin) {
    return new Promise((resolve) => {
      let input = ""
      const stdin = process.stdin
      stdin.setEncoding('utf-8')
      stdin.on('data', (chunk: string) => { input += chunk })
      stdin.on('end', () => resolve(input.trim() || null))
      if (stdin.isTTY) {
        resolve(null)
      }
    })
  }
  return null
}

async function executeHeadless(prompt: string, opts: CLIOptions): Promise<void> {
  const isJson = opts.json ?? false

  try {
    if (!isJson) {
      console.log(`\x1b[36m╭─ AgenticOS — Headless Mode\x1b[0m`)
      console.log(`\x1b[36m│\x1b[0m Prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}`)
      console.log(`\x1b[36m│\x1b[0m Mode: ${opts.mode ?? 'fast'}`)
      if (opts.model) console.log(`\x1b[36m│\x1b[0m Model: ${opts.model}`)
      console.log(`\x1b[36m╰────────────────────────────────\x1b[0m`)
    }

    const startTime = Date.now()

    const { ProviderTransport } = await import('@agentic-os/providers')
    const transport = new ProviderTransport({
      getApiKey: (providerId?: string) => {
        if (!providerId) return process.env.AGENTIC_API_KEY || ''
        return process.env.AGENTIC_API_KEY || ''
      },
    })

    const model = opts.model || process.env.AGENTIC_MODEL || 'gpt-4o'
    const providerId = opts.provider || process.env.AGENTIC_PROVIDER || 'openai'
    const baseUrl = process.env.AGENTIC_API_URL || 'https://api.openai.com/v1'
    const apiKey = process.env.AGENTIC_API_KEY || ''

    if (!apiKey && !isJson) {
      console.warn(`\x1b[33m⚠ No API key set. Set AGENTIC_API_KEY env var.\x1b[0m`)
    }

    const messages = [
      { role: "system" as const, content: "You are AgenticOS, an AI coding assistant. Respond helpfully and concisely." },
      { role: "user" as const, content: prompt },
    ]

    if (isJson) {
      writeThinking("Processing...")
    }

    let content = ""

    if (opts.mode === "full") {
      const result = await transport.chatCompletion(
        { baseUrl, apiKey, runtime: null, providerId, providerName: providerId },
        { model, messages, maxTokens: 4096, signal: undefined },
      )
      content = result.content

      if (isJson) {
        writeText(content)
        writeDone("stop")
      } else {
        console.log(`\n${content}\n`)
      }
    } else {
      let completed = false
      const streamPromise = transport.streamChatCompletion(
        { baseUrl, apiKey, runtime: null, providerId, providerName: providerId },
        { model, messages, maxTokens: 4096, signal: undefined },
        {
          onToken: (token: string) => {
            content += token
            if (isJson) {
              writeText(token)
            } else {
              process.stdout.write(token)
            }
          },
          onToolCallBegin: () => {},
          onToolCallDelta: () => {},
          onToolCallEnd: () => {},
          onFinish: () => { completed = true },
          onError: (error) => {
            if (isJson) writeError(error.message)
            else console.error(`\nError: ${error.message}`)
          },
          onDone: () => {
            if (isJson) {
              writeDone("stop")
            } else {
              const duration = ((Date.now() - startTime) / 1000).toFixed(1)
              console.log(`\n\x1b[90m╌ Duration: ${duration}s\x1b[0m`)
            }
          },
        },
      )

      await streamPromise
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (isJson) {
      writeError(msg)
    } else {
      console.error(`\x1b[31mError: ${msg}\x1b[0m`)
      process.exit(1)
    }
  }
}

async function interactiveHeadless(): Promise<void> {
  const reader = createStructuredReader()
  const { ProviderTransport } = await import('@agentic-os/providers')
  const transport = new ProviderTransport({
    getApiKey: () => process.env.AGENTIC_API_KEY || '',
  })

  const model = process.env.AGENTIC_MODEL || 'gpt-4o'
  const providerId = process.env.AGENTIC_PROVIDER || 'openai'
  const baseUrl = process.env.AGENTIC_API_URL || 'https://api.openai.com/v1'
  const apiKey = process.env.AGENTIC_API_KEY || ''

  writeMetadata("mode", "interactive")
  writeMetadata("model", model)

  try {
    while (true) {
      const event = await reader.readInput()
      if (!event) break

      switch (event.type) {
        case "message": {
          const messages = [
            { role: "system" as const, content: "You are AgenticOS, an AI coding assistant." },
            { role: "user" as const, content: event.content },
          ]

          let content = ""
          await transport.streamChatCompletion(
            { baseUrl, apiKey, runtime: null, providerId, providerName: providerId },
            { model, messages, maxTokens: 4096 },
            {
              onToken: (token: string) => { content += token; writeText(token) },
              onToolCallBegin: () => {},
              onToolCallDelta: () => {},
              onToolCallEnd: () => {},
              onFinish: () => {},
              onError: (error) => writeError(error.message),
              onDone: () => writeDone("stop"),
            },
          )
          break
        }

        case "cancel": {
          writeDone("cancelled")
          break
        }

        case "config": {
          writeMetadata(`config_set:${event.key}`, event.value)
          break
        }

        case "stdin": {
          // stdin data ignored in interactive mode
          break
        }
      }
    }
  } finally {
    reader.close()
  }
}

async function main(): Promise<void> {
  const opts = parseArgs()

  if (opts.help) {
    showHelp()
    process.exit(0)
  }

  const prompt = await getPrompt(opts)
  if (prompt) {
    await executeHeadless(prompt, opts)
  } else if (opts.stdin) {
    // Interactive structured I/O mode
    await interactiveHeadless()
  } else {
    if (opts.json) {
      writeError("No input provided. Use --print, --file, or --stdin")
    } else {
      console.error("No input provided. Use --print, --file, or --stdin")
      console.error("Try: agentic --print \"Your prompt here\"")
    }
    process.exit(1)
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  writeError(msg)
  process.exit(1)
})
