import { useCallback, useRef, useState } from 'react'
import { useAgentStore } from '@/stores/agent-store'
import { useWorkspaceRuntime } from '@/runtime/workspace-runtime'
import { useTimelineStore } from '@/components/workspace/timeline/timeline-store'
import { ExecutionSessionManager } from '@/runtime/sessions/ExecutionSessionManager'
import { ChatTimeline } from './ChatTimeline'
import { ChatComposer } from './ChatComposer'
import type { ChatMessageData } from './ChatMessage'
import { referenceParser } from '@/lib/context-references/ReferenceParser'
import { referenceResolver } from '@/lib/context-references/ReferenceResolver'
import { cn } from '@/lib/utils'
import { Bot, Loader2, WifiOff } from 'lucide-react'

const executionSessionManager = ExecutionSessionManager.getInstance()

export function ChatSession() {
  const activeRole = useAgentStore((s) => s.activeRole)
  const conversations = useAgentStore((s) => s.conversations)
  const isProcessing = useAgentStore((s) => s.isProcessing)
  const addMessage = useAgentStore((s) => s.addMessage)
  const setProcessing = useAgentStore((s) => s.setProcessing)
  const setAgentStatus = useAgentStore((s) => s.setAgentStatus)

  const rootPath = useWorkspaceRuntime((s) => s.rootPath)
  const wiredAgents = useWorkspaceRuntime((s) => s.wiredAgents)

  const sendingRef = useRef(false)
  const correlationIdsRef = useRef(new Set<string>())

  const currentMessages = conversations[activeRole]?.messages ?? []

  const chatMessages: ChatMessageData[] = currentMessages.map((m, i) => ({
    id: `${m.role}_${i}_${m.timestamp ?? Date.now()}`,
    role: m.role as 'user' | 'assistant' | 'system' | 'tool',
    content: typeof m.content === 'string' ? m.content : '',
    timestamp: m.timestamp ?? Date.now(),
    isStreaming: false,
  }))

  const isWired = wiredAgents.some((a) => a.runtimeRole === activeRole || a.roleId === activeRole)
  const hasProvider = wiredAgents.length > 0

  const handleSend = useCallback(async (input: string) => {
    if (!input.trim() || sendingRef.current || isProcessing) return

    sendingRef.current = true
    const userInput = input.trim()
    const ts = Date.now()
    const correlationId = useTimelineStore.getState().generateId()

    if (correlationIdsRef.current.has(correlationId)) {
      sendingRef.current = false
      return
    }
    correlationIdsRef.current.add(correlationId)

    addMessage(activeRole, { role: 'user', content: userInput, timestamp: ts })
    setProcessing(true)

    setAgentStatus(activeRole, {
      id: activeRole,
      role: activeRole,
      state: 'planning',
      currentTask: 'Thinking through this',
      lastAction: 'Processing your request',
    })

    let resolvedInput = userInput
    const parseResult = referenceParser.parse(userInput)
    if (parseResult.references.length > 0) {
      const resolved = await referenceResolver.resolveAll(parseResult.references)
      const contextBlock = referenceResolver.formatForInjection(resolved)
      resolvedInput = contextBlock
        ? `${parseResult.text}\n\n${contextBlock}`
        : parseResult.text

      useTimelineStore.getState().setMessageReferences(
        correlationId,
        resolved.map((r) => ({
          type: r.reference.type,
          target: r.reference.target,
          qualifier: r.reference.qualifier,
          content: r.content,
          error: r.error,
          durationMs: r.durationMs,
        })),
      )
    }

    console.log("[FLOW:1] ChatSession.handleSend: calling executionSessionManager.start (inputLen=" + resolvedInput.length + ")")

    executionSessionManager.start({
      input: resolvedInput,
      activeRole,
      correlationId,
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ChatSession] Execution failed:', msg)
      addMessage(activeRole, {
        role: 'assistant',
        content: `Execution failed: ${msg}`,
        timestamp: Date.now(),
      })
    }).finally(() => {
      setProcessing(false)
      sendingRef.current = false
      correlationIdsRef.current.delete(correlationId)
    })
  }, [activeRole, isProcessing, addMessage, setProcessing, setAgentStatus])

  const handleCancel = useCallback(() => {
    ExecutionSessionManager.cancelCurrent()
    setProcessing(false)
    sendingRef.current = false
  }, [setProcessing])

  if (!hasProvider && !rootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/10 mb-4">
          <Bot className="h-7 w-7 text-blue-400/60" />
        </div>
        <h3 className="text-sm font-semibold text-white/70 mb-2">No agent configured</h3>
        <p className="text-xs text-white/30 max-w-xs mb-6">
          Add an AI provider and wire it to a role in Settings to start coding with AI assistance.
        </p>
      </div>
    )
  }

  if (!isWired && hasProvider) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/10 mb-3">
          <WifiOff className="h-6 w-6 text-amber-400/60" />
        </div>
        <h3 className="text-sm font-semibold text-white/70 mb-2">Role not wired</h3>
        <p className="text-xs text-white/30 max-w-xs">
          The role "{activeRole}" is not connected to any provider model. Configure it in Settings → Roles.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ChatTimeline messages={chatMessages} />

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-white/[0.04] bg-white/[0.01]">
          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          <span className="text-[11px] text-white/40">Agent is working...</span>
        </div>
      )}

      <ChatComposer
        onSend={handleSend}
        onCancel={handleCancel}
        disabled={!isWired}
        isProcessing={isProcessing}
        placeholder={isWired ? 'Ask me anything...' : 'Wire a role to start chatting'}
      />
    </div>
  )
}
