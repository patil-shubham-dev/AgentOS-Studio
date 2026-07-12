import { useRef, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import ChatMessage, { type ChatMessageData } from './ChatMessage'
import { cn } from '@/lib/utils'

interface ChatTimelineProps {
  messages: ChatMessageData[]
  className?: string
  onLoadMore?: () => void
  hasMore?: boolean
}

export function ChatTimeline({ messages, className, onLoadMore, hasMore }: ChatTimelineProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const lastMessageRef = useRef<string | null>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  })

  useEffect(() => {
    if (messages.length > 0 && parentRef.current) {
      const last = messages[messages.length - 1]
      if (last.id !== lastMessageRef.current) {
        lastMessageRef.current = last.id
        const scrollEl = parentRef.current
        requestAnimationFrame(() => {
          scrollEl.scrollTop = scrollEl.scrollHeight
        })
      }
    }
  }, [messages])

  const handleScroll = useCallback(() => {
    const el = parentRef.current
    if (!el || !onLoadMore || !hasMore) return
    if (el.scrollTop < 100) {
      onLoadMore()
    }
  }, [onLoadMore, hasMore])

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className={cn('overflow-y-auto h-full', className)}
    >
      {hasMore && (
        <div className="flex justify-center py-3">
          <button
            onClick={onLoadMore}
            className="text-[11px] text-blue-400/60 hover:text-blue-400 transition-colors"
          >
            Load more
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/10 mb-3">
            <svg className="h-6 w-6 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-tertiary)] max-w-xs">
            Ask me anything about your codebase. I can read, write, edit files, run commands, search the web, and more.
          </p>
        </div>
      ) : (
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const message = messages[virtualItem.index]
            if (!message) return null
            return (
              <div
                key={message.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <ChatMessage message={message} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
