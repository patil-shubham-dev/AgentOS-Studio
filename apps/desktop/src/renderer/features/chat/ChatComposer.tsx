import { useRef, useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { SendHorizontal, Loader2, Square, Paperclip, AtSign } from 'lucide-react'

interface ChatComposerProps {
  onSend: (message: string) => void
  onCancel?: () => void
  disabled?: boolean
  isProcessing?: boolean
  placeholder?: string
  className?: string
}

export function ChatComposer({
  onSend,
  onCancel,
  disabled,
  isProcessing,
  placeholder = 'Ask me anything...',
  className,
}: ChatComposerProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mentionOpen, setMentionOpen] = useState(false)

  useEffect(() => {
    if (!isProcessing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isProcessing])

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = '0'
      const scrollHeight = el.scrollHeight
      el.style.height = `${Math.min(scrollHeight, 200)}px`
    }
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || disabled || isProcessing) return
    onSend(trimmed)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, disabled, isProcessing, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      if (e.key === '@') {
        setMentionOpen(true)
      }
    },
    [handleSend],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value)
      adjustHeight()
      const val = e.target.value
      if (val.includes('@')) {
        setMentionOpen(true)
      } else {
        setMentionOpen(false)
      }
    },
    [adjustHeight],
  )

  const handleMentionSelect = useCallback((type: string) => {
    const el = textareaRef.current
    if (el) {
      const cursorPos = el.selectionStart
      const text = input
      const before = text.slice(0, cursorPos)
      const after = text.slice(cursorPos)
      const atIndex = before.lastIndexOf('@')
      if (atIndex >= 0) {
        const newText = before.slice(0, atIndex) + type + after
        setInput(newText)
        setMentionOpen(false)
        el.focus()
      }
    }
  }, [input])

  return (
    <div className={cn('border-t border-white/[0.06] bg-[#0a0a0c] px-3 py-2.5', className)}>
      {/* Mention popup */}
      {mentionOpen && (
        <div className="absolute bottom-full left-3 mb-1 w-48 bg-[#1a1a1f] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          {['file', 'folder', 'symbol', 'problem'].map((type) => (
            <button
              key={type}
              onClick={() => handleMentionSelect(type)}
              className="w-full px-3 py-1.5 text-left text-xs text-white/70 hover:bg-white/5 hover:text-white transition-colors"
            >
              @{type}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attach button */}
        <button
          type="button"
          className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
          title="Attach context"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full bg-transparent text-sm text-white/90 placeholder-white/20 resize-none',
              'outline-none py-2.5 leading-relaxed min-h-[40px] max-h-[200px]',
              'scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent',
              'selection:bg-blue-500/30',
              disabled && 'opacity-40 cursor-not-allowed',
            )}
          />
        </div>

        {/* Send / Cancel button */}
        <button
          type="button"
          onClick={isProcessing ? onCancel : handleSend}
          disabled={!isProcessing && (!input.trim() || disabled)}
          className={cn(
            'flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-lg transition-all',
            isProcessing
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : input.trim() && !disabled
                ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                : 'bg-white/5 text-white/20',
          )}
          title={isProcessing ? 'Cancel' : 'Send'}
        >
          {isProcessing ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <SendHorizontal className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Bottom hint */}
      <div className="flex items-center justify-between mt-1.5 px-0.5">
        <span className="text-[10px] text-white/15">
          Use @ to reference files, symbols, or problems
        </span>
        <span className="text-[10px] text-white/15">
          Enter to send · Shift+Enter for new line
        </span>
      </div>
    </div>
  )
}
