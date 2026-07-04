import { describe, it, expect } from 'vitest'
import type { ExecutionEvent } from '@/runtime/ExecutionEvent'
import { adaptEvent, adaptEventStream, projectToTimelineItems } from '@/runtime/execution/canonical-adapter'
import { createEventId, createSessionId, createCanonicalBase } from '@/runtime/execution/canonical-events'
import type { CanonicalExecutionEvent } from '@/runtime/execution/canonical-events'

const SESSION_ID = createSessionId()
const CORRELATION_ID = createEventId()
const TS = 1_700_000_000_000

function makeBase(type: string): ExecutionEvent & { correlationId?: string } {
  return { type: type as any, executionId: SESSION_ID, timestamp: TS, correlationId: CORRELATION_ID } as any
}

describe('canonical-events / createEventId', () => {
  it('produces unique IDs', () => {
    const a = createEventId()
    const b = createEventId()
    expect(a).not.toBe(b)
  })

  it('produces IDs with prefix', () => {
    expect(createEventId()).toMatch(/^evt_\d+_\d+_[a-z0-9]{4}$/)
  })
})

describe('canonical-events / createSessionId', () => {
  it('produces IDs with prefix', () => {
    expect(createSessionId()).toMatch(/^ses_\d+_[a-z0-9]{6}$/)
  })
})

describe('canonical-events / createCanonicalBase', () => {
  it('returns a valid base object', () => {
    const base = createCanonicalBase(SESSION_ID, CORRELATION_ID)
    expect(base.sessionId).toBe(SESSION_ID)
    expect(base.correlationId).toBe(CORRELATION_ID)
    expect(base.id).toMatch(/^evt_/)
    expect(typeof base.createdAt).toBe('number')
  })
})

// ── Adapter edge cases ──

describe('adaptEvent / unknown event type', () => {
  it('returns empty for unmapped events', () => {
    const ev = makeBase('THINKING_STARTED') as unknown as ExecutionEvent
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toEqual([])
  })
})

// ── Individual event mapping ──

describe('adaptEvent / mapping', () => {
  it('EXECUTION_CREATED -> session_started', () => {
    const ev: ExecutionEvent = { type: 'EXECUTION_CREATED', executionId: SESSION_ID, input: 'hello', timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('session_started')
    if (c.type === 'session_started') {
      expect(c.input).toBe('hello')
      expect(c.sessionId).toBe(SESSION_ID)
    }
  })

  it('AGENT_ASSIGNED -> assistant_stream_started', () => {
    const ev: ExecutionEvent = { type: 'AGENT_ASSIGNED', executionId: SESSION_ID, roleId: 'r1', roleName: 'coder', modelName: 'gpt-4', providerName: 'openai', stepId: 's1', timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('assistant_stream_started')
    if (c.type === 'assistant_stream_started') {
      expect(c.roleName).toBe('coder')
      expect(c.modelName).toBe('gpt-4')
    }
  })

  it('TOKEN -> assistant_token', () => {
    const ev: ExecutionEvent = { type: 'TOKEN', executionId: SESSION_ID, token: 'hello', timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('assistant_token')
    if (c.type === 'assistant_token') expect(c.text).toBe('hello')
  })

  it('MESSAGE_COMPLETE -> assistant_completed', () => {
    const ev: ExecutionEvent = { type: 'MESSAGE_COMPLETE', executionId: SESSION_ID, stepId: 's1', content: 'done', finishReason: 'stop', timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('assistant_completed')
    if (c.type === 'assistant_completed') {
      expect(c.content).toBe('done')
      expect(c.finishReason).toBe('stop')
    }
  })

  it('TOOL_START -> tool_started', () => {
    const ev: ExecutionEvent = { type: 'TOOL_START', executionId: SESSION_ID, toolId: 't1', toolName: 'read_file', args: '{"path":"x"}', parallelGroup: 0, timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('tool_started')
    if (c.type === 'tool_started') {
      expect(c.name).toBe('read_file')
      expect(c.args).toBe('{"path":"x"}')
      expect(c.parallelGroup).toBe(0)
    }
  })

  it('TOOL_PROGRESS -> tool_progress', () => {
    const ev: ExecutionEvent = { type: 'TOOL_PROGRESS', executionId: SESSION_ID, toolId: 't1', progress: '50%', timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('tool_progress')
    if (c.type === 'tool_progress') expect(c.progress).toBe('50%')
  })

  it('TOOL_COMPLETE -> tool_completed', () => {
    const ev: ExecutionEvent = { type: 'TOOL_COMPLETE', executionId: SESSION_ID, toolId: 't1', toolName: 'read_file', result: 'content', durationMs: 100, timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('tool_completed')
    if (c.type === 'tool_completed') {
      expect(c.result).toBe('content')
      expect(c.durationMs).toBe(100)
    }
  })

  it('TOOL_ERROR -> tool_failed', () => {
    const ev: ExecutionEvent = { type: 'TOOL_ERROR', executionId: SESSION_ID, toolId: 't1', toolName: 'read_file', error: 'not found', durationMs: 50, timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('tool_failed')
    if (c.type === 'tool_failed') {
      expect(c.error).toBe('not found')
      expect(c.durationMs).toBe(50)
    }
  })

  it('COMMAND_START -> command_started', () => {
    const ev: ExecutionEvent = { type: 'COMMAND_START', executionId: SESSION_ID, command: 'npm test', timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('command_started')
    if (c.type === 'command_started') {
      expect(c.command).toBe('npm test')
    }
  })

  it('COMMAND_OUTPUT -> command_output', () => {
    const ev: ExecutionEvent = { type: 'COMMAND_OUTPUT', executionId: SESSION_ID, output: 'building...', timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('command_output')
    if (c.type === 'command_output') {
      expect(c.chunk).toBe('building...')
      expect(c.stream).toBe('stdout')
    }
  })

  it('COMMAND_COMPLETE -> command_completed (exitCode 0)', () => {
    const ev: ExecutionEvent = { type: 'COMMAND_COMPLETE', executionId: SESSION_ID, exitCode: 0, durationMs: 200, timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('command_completed')
    if (c.type === 'command_completed') expect(c.exitCode).toBe(0)
  })

  it('COMMAND_ERROR -> command_completed (exitCode null)', () => {
    const ev: ExecutionEvent = { type: 'COMMAND_ERROR', executionId: SESSION_ID, error: 'killed', durationMs: 300, timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('command_completed')
    if (c.type === 'command_completed') expect(c.exitCode).toBeNull()
  })

  it('CONTEXT_LOADING -> context_started', () => {
    const ev: ExecutionEvent = { type: 'CONTEXT_LOADING', executionId: SESSION_ID, source: 'file1.ts', timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('context_started')
  })

  it('CONTEXT_READY -> context_completed', () => {
    const ev: ExecutionEvent = { type: 'CONTEXT_READY', executionId: SESSION_ID, source: 'file1.ts', tokens: 100, timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('context_completed')
    if (c.type === 'context_completed') expect(c.tokens).toBe(100)
  })

  it('EXECUTION_COMPLETE -> session_completed', () => {
    const ev: ExecutionEvent = { type: 'EXECUTION_COMPLETE', executionId: SESSION_ID, content: 'done', filesEdited: 1, commandsRun: 2, toolCalls: 3, durationMs: 500, timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('session_completed')
    if (c.type === 'session_completed') expect(c.summary).toBe('done')
  })

  it('EXECUTION_FAILED -> session_failed', () => {
    const ev: ExecutionEvent = { type: 'EXECUTION_FAILED', executionId: SESSION_ID, error: 'timeout', durationMs: 600, timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('session_failed')
    if (c.type === 'session_failed') expect(c.error).toBe('timeout')
  })

  it('VERIFY_PASSED -> verification_completed (passed: true)', () => {
    const ev: ExecutionEvent = { type: 'VERIFY_PASSED', executionId: SESSION_ID, stepId: 's1', details: [], timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('verification_completed')
    if (c.type === 'verification_completed') expect(c.passed).toBe(true)
  })

  it('VERIFY_FAILED -> verification_completed (passed: false)', () => {
    const ev: ExecutionEvent = { type: 'VERIFY_FAILED', executionId: SESSION_ID, stepId: 's1', lintErrors: 1, typeErrors: 0, buildErrors: 0, testFailures: 0, details: [], autoFixApplied: false, timestamp: TS } as any
    const result = adaptEvent(ev, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(1)
    const c = result[0]
    expect(c.type).toBe('verification_completed')
    if (c.type === 'verification_completed') expect(c.passed).toBe(false)
  })
})

// ── adaptEventStream integration ──

describe('adaptEventStream', () => {
  it('adapts an ordered stream of events', () => {
    const events: ExecutionEvent[] = [
      { type: 'EXECUTION_CREATED', executionId: SESSION_ID, input: 'hello', timestamp: TS } as any,
      { type: 'AGENT_ASSIGNED', executionId: SESSION_ID, roleId: 'r1', roleName: 'coder', stepId: 's1', timestamp: TS } as any,
      { type: 'TOKEN', executionId: SESSION_ID, token: 'Hel', timestamp: TS } as any,
      { type: 'TOKEN', executionId: SESSION_ID, token: 'lo', timestamp: TS } as any,
      { type: 'MESSAGE_COMPLETE', executionId: SESSION_ID, stepId: 's1', content: 'Hello', finishReason: 'stop', timestamp: TS } as any,
      { type: 'EXECUTION_COMPLETE', executionId: SESSION_ID, content: 'done', filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: 1000, timestamp: TS } as any,
    ]
    const result = adaptEventStream(events, SESSION_ID, CORRELATION_ID)
    expect(result).toHaveLength(6)
    expect(result[0].type).toBe('session_started')
    expect(result[1].type).toBe('assistant_stream_started')
    expect(result[2].type).toBe('assistant_token')
    expect(result[3].type).toBe('assistant_token')
    expect(result[4].type).toBe('assistant_completed')
    expect(result[5].type).toBe('session_completed')
  })

  it('produces unique event IDs', () => {
    const events: ExecutionEvent[] = [
      { type: 'EXECUTION_CREATED', executionId: SESSION_ID, input: 'x', timestamp: TS } as any,
      { type: 'EXECUTION_COMPLETE', executionId: SESSION_ID, content: 'x', filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: 0, timestamp: TS } as any,
    ]
    const result = adaptEventStream(events, SESSION_ID, CORRELATION_ID)
    expect(result[0].id).not.toBe(result[1].id)
  })
})

// ── Timeline Projection ──

describe('projectToTimelineItems', () => {
  it('returns empty for empty input', () => {
    expect(projectToTimelineItems([])).toEqual([])
  })

  it('projects a full session: assistant + tool + command + end', () => {
    const started: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'session_started',
      input: 'hi',
      role: '',
    }
    const astStart: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'assistant_stream_started',
      roleId: 'r1',
      roleName: 'Assistant',
    }
    const token: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'assistant_token',
      text: 'Hel',
    }
    const content: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'assistant_completed',
      content: 'Hello!',
      finishReason: 'stop',
    }
    const toolS: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'tool_started',
      toolCallId: 'tc1',
      name: 'read_file',
      args: '{}',
    }
    const toolC: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'tool_completed',
      toolCallId: 'tc1',
      result: 'content',
      durationMs: 10,
    }
    const cmdS: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'command_started',
      commandId: 'cmd1',
      command: 'npm test',
      cwd: '',
    }
    const cmdC: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'command_completed',
      commandId: 'cmd1',
      exitCode: 0,
      durationMs: 100,
    }
    const complete: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'session_completed',
      summary: 'all good',
    }

    const items = projectToTimelineItems([started, astStart, token, content, toolS, toolC, cmdS, cmdC, complete])
    expect(items).toHaveLength(4)

    // session_end
    const sessionEnd = items.find(i => i.type === 'session_end')
    expect(sessionEnd).toBeDefined()
    expect(sessionEnd!.status).toBe('succeeded')

    // assistant_message
    const msg = items.find(i => i.type === 'assistant_message')
    expect(msg).toBeDefined()
    expect(msg!.status).toBe('succeeded')
    expect(msg!.body).toContain('Hello!')

    // tool_call
    const tool = items.find(i => i.type === 'tool_call')
    expect(tool).toBeDefined()
    expect(tool!.status).toBe('succeeded')
    expect(tool!.title).toBe('read_file')

    // command
    const cmd = items.find(i => i.type === 'command')
    expect(cmd).toBeDefined()
    expect(cmd!.status).toBe('succeeded')
  })

  it('marks tool_failed items as failed', () => {
    const toolS: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'tool_started',
      toolCallId: 'tc1',
      name: 'read_file',
      args: '{}',
    }
    const toolF: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'tool_failed',
      toolCallId: 'tc1',
      error: 'not found',
      durationMs: 5,
    }

    const items = projectToTimelineItems([toolS, toolF])
    const tool = items.find(i => i.type === 'tool_call')
    expect(tool).toBeDefined()
    expect(tool!.status).toBe('failed')
  })

  it('marks command with non-zero exit as failed', () => {
    const cmdS: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'command_started',
      commandId: 'cmd1',
      command: 'npm test',
      cwd: '',
    }
    const cmdC: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'command_completed',
      commandId: 'cmd1',
      exitCode: 1,
      durationMs: 50,
    }

    const items = projectToTimelineItems([cmdS, cmdC])
    const cmd = items.find(i => i.type === 'command')
    expect(cmd).toBeDefined()
    expect(cmd!.status).toBe('failed')
  })

  it('marks session_failed items as failed', () => {
    const started: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'session_started',
      input: 'hi',
      role: '',
    }
    const failed: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'session_failed',
      error: 'timeout',
    }

    const items = projectToTimelineItems([started, failed])
    const sessionEnd = items.find(i => i.type === 'session_end')
    expect(sessionEnd).toBeDefined()
    expect(sessionEnd!.status).toBe('failed')
  })

  it('marks session_cancelled items as cancelled', () => {
    const started: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'session_started',
      input: 'hi',
      role: '',
    }
    const cancelled: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'session_cancelled',
    }

    const items = projectToTimelineItems([started, cancelled])
    const sessionEnd = items.find(i => i.type === 'session_end')
    expect(sessionEnd).toBeDefined()
    expect(sessionEnd!.status).toBe('cancelled')
  })

  it('leaves open items as running', () => {
    const started: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'session_started',
      input: 'hi',
      role: '',
    }
    const astStart: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'assistant_stream_started',
      roleId: 'r1',
      roleName: 'Assistant',
    }

    const items = projectToTimelineItems([started, astStart])
    // session_end item is open (running)
    const sessionEnd = items.find(i => i.type === 'session_end')
    expect(sessionEnd).toBeDefined()
    expect(sessionEnd!.status).toBe('running')

    // assistant_message item is also open (running)
    const msg = items.find(i => i.type === 'assistant_message')
    expect(msg).toBeDefined()
    expect(msg!.status).toBe('running')
  })

  it('handles verification_completed', () => {
    const verS: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'verification_started',
    }
    const verC: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'verification_completed',
      passed: true,
      details: '',
    }

    const items = projectToTimelineItems([verS, verC])
    const ver = items.find(i => i.type === 'verification')
    expect(ver).toBeDefined()
    expect(ver!.status).toBe('succeeded')
  })

  it('preserves correlationId and sessionId on items', () => {
    const started: CanonicalExecutionEvent = {
      ...createCanonicalBase(SESSION_ID, CORRELATION_ID),
      type: 'session_started',
      input: 'hi',
      role: '',
    }

    const items = projectToTimelineItems([started])
    expect(items[0].sessionId).toBe(SESSION_ID)
    expect(items[0].correlationId).toBe(CORRELATION_ID)
  })
})
