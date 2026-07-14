import { describe, it, expect, vi } from 'vitest'
import {
  createChatSessionStore,
  initialChatSessionState,
  type ChatSessionState,
} from './store'
import type { UIMessage } from '../types'

function msg(role: 'user' | 'assistant', content: string): UIMessage {
  return { id: `${role}-${content}`, role, content, timestamp: 1_780_056_000_000 }
}

describe('initialChatSessionState', () => {
  it('is an empty, idle conversation', () => {
    expect(initialChatSessionState()).toEqual({
      messages: [],
      sessionId: null,
      isStreaming: false,
      errorType: null,
      mode: null,
    })
  })

  it('returns a fresh object each call (no shared mutable default)', () => {
    const a = initialChatSessionState()
    const b = initialChatSessionState()
    expect(a).not.toBe(b)
    expect(a.messages).not.toBe(b.messages)
  })
})

describe('createChatSessionStore', () => {
  it('starts from the empty state', () => {
    const store = createChatSessionStore()
    expect(store.getState()).toEqual(initialChatSessionState())
  })

  it('merges a partial setState', () => {
    const store = createChatSessionStore()
    store.setState({ sessionId: 'sess-1' })
    expect(store.getState().sessionId).toBe('sess-1')
    // untouched fields preserved
    expect(store.getState().messages).toEqual([])
    expect(store.getState().isStreaming).toBe(false)
  })

  it('replaces the messages array wholesale on write', () => {
    const store = createChatSessionStore()
    const next: UIMessage[] = [msg('user', 'hi')]
    store.setState({ messages: next })
    expect(store.getState().messages).toBe(next)
  })

  it('keeps the state reference stable until the next write', () => {
    const store = createChatSessionStore()
    const before = store.getState()
    expect(store.getState()).toBe(before) // stable for useSyncExternalStore
    store.setState({ isStreaming: true })
    expect(store.getState()).not.toBe(before)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const store = createChatSessionStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.setState({ isStreaming: true })
    expect(listener).toHaveBeenCalledTimes(1)

    store.setState({ errorType: 'unknown' })
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    store.setState({ sessionId: 'x' })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('creates independent stores (no cross-talk)', () => {
    const a = createChatSessionStore()
    const b = createChatSessionStore()
    a.setState({ sessionId: 'a-session' })
    expect(b.getState().sessionId).toBeNull()
  })

  it('round-trips a full conversation slice', () => {
    const store = createChatSessionStore()
    const state: Partial<ChatSessionState> = {
      messages: [msg('user', 'hello'), msg('assistant', 'hi there')],
      sessionId: 'sess-9',
      isStreaming: true,
      mode: 'question',
    }
    store.setState(state)
    expect(store.getState()).toMatchObject(state)
  })
})

describe('hydrate', () => {
  it('replaces messages and sessionId wholesale', () => {
    const store = createChatSessionStore()
    store.setState({ messages: [msg('user', 'old')], sessionId: 'old-session' })
    const restored = [msg('user', 'recovered'), msg('assistant', 'welcome back')]
    store.hydrate({ messages: restored, sessionId: 'sess-7' })
    expect(store.getState().messages).toBe(restored)
    expect(store.getState().sessionId).toBe('sess-7')
  })

  it('accepts a null sessionId (pre-session draft thread)', () => {
    const store = createChatSessionStore()
    store.hydrate({ messages: [msg('user', 'draft')], sessionId: null })
    expect(store.getState().sessionId).toBeNull()
    expect(store.getState().messages).toHaveLength(1)
  })

  it('does not touch mode / isStreaming / errorType', () => {
    const store = createChatSessionStore()
    store.setState({ mode: 'question', isStreaming: true, errorType: 'unknown' })
    store.hydrate({ messages: [msg('user', 'hi')], sessionId: 's' })
    expect(store.getState().mode).toBe('question')
    expect(store.getState().isStreaming).toBe(true)
    expect(store.getState().errorType).toBe('unknown')
  })

  it('notifies subscribers', () => {
    const store = createChatSessionStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.hydrate({ messages: [msg('user', 'hi')], sessionId: 's' })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('reset', () => {
  it('clears messages, sessionId, isStreaming, and errorType', () => {
    const store = createChatSessionStore()
    store.setState({
      messages: [msg('user', 'hi'), msg('assistant', 'yo')],
      sessionId: 'sess-3',
      isStreaming: true,
      errorType: 'unknown',
    })
    store.reset()
    expect(store.getState().messages).toEqual([])
    expect(store.getState().sessionId).toBeNull()
    expect(store.getState().isStreaming).toBe(false)
    expect(store.getState().errorType).toBeNull()
  })

  it('leaves mode untouched (request context, not conversation content)', () => {
    const store = createChatSessionStore()
    store.setState({ mode: 'question', messages: [msg('user', 'hi')] })
    store.reset()
    expect(store.getState().mode).toBe('question')
  })

  it('notifies subscribers', () => {
    const store = createChatSessionStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.reset()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
