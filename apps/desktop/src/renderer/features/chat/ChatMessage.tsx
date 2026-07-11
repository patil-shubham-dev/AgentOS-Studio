import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Bot, User, Copy, Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  isStreaming?: boolean
  isError?: boolean
  toolCalls?: Array<{ name: string; args: string; result?: string }>
}

const ChatMessage = memo(function ChatMessage({ message }: { message: ChatMessageData }) {
  const [copied, setCopied] = useState(false)
  const [expandedTools, setExpandedTools] = useState(false)
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* noop */ }
  }

  return (
    <div className={cn(
      'group flex gap-3 px-4 py-3 transition-colors',
      isUser ? 'bg-white/[0.01]' : 'bg-transparent',
      message.isError && 'bg-red-500/[0.03]',
    )}>
      {/* Avatar */}
      <div className={cn(
        'flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-lg mt-0.5',
        isUser ? 'bg-blue-500/10' : isAssistant ? 'bg-emerald-500/10' : 'bg-white/5',
      )}>
        {isUser ? (
          <User className="h-3.5 w-3.5 text-blue-400" />
        ) : isAssistant ? (
          <Bot className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-white/20" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Role label */}
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-[11px] font-medium uppercase tracking-wider',
            isUser ? 'text-blue-400/60' : isAssistant ? 'text-emerald-400/60' : 'text-white/30',
          )}>
            {isUser ? 'You' : isAssistant ? 'Agent' : message.role}
          </span>
          {message.isStreaming && (
            <span className="flex items-center gap-1 text-[10px] text-white/30">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Streaming...
            </span>
          )}
          <span className="text-[10px] text-white/20">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {/* Message body */}
        <div className={cn(
          'prose prose-invert max-w-none text-sm leading-relaxed',
          'prose-code:before:content-none prose-code:after:content-none',
          message.isError && 'text-red-400',
        )}>
          {message.content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children }) => (
                  <pre className="bg-[#0d0d10] border border-white/5 rounded-lg p-3 overflow-x-auto text-xs">
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => {
                  const isInline = !className
                  return isInline ? (
                    <code className="bg-white/5 px-1 py-0.5 rounded text-[13px] font-mono" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className={className} {...props}>{children}</code>
                  )
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : message.isStreaming ? (
            <span className="inline-flex items-center gap-1 text-white/40">
              <span className="w-1.5 h-4 bg-emerald-400/60 rounded-sm animate-pulse" />
            </span>
          ) : null}
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setExpandedTools(!expandedTools)}
              className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/60 transition-colors"
            >
              {expandedTools ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {message.toolCalls.length} tool call(s)
            </button>
            {expandedTools && (
              <div className="mt-1 space-y-1">
                {message.toolCalls.map((tc, i) => (
                  <div key={i} className="bg-white/[0.02] border border-white/5 rounded-lg p-2 text-[11px] font-mono">
                    <span className="text-emerald-400/80">{tc.name}</span>
                    <span className="text-white/30">({tc.args.slice(0, 100)})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Copy button */}
        {message.content && !message.isStreaming && (
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60"
          >
            {copied ? (
              <><Check className="h-3 w-3" /> Copied</>
            ) : (
              <><Copy className="h-3 w-3" /> Copy</>
            )}
          </button>
        )}
      </div>
    </div>
  )
})

export default ChatMessage
