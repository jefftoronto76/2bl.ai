'use client'

// services/chat/ui/v1/useChatTurn.ts
//
// The shared chat-turn engine. Owns one streamed assistant turn end-to-end:
// append the visitor message, lazily create a session, stream the reply from
// /api/sage, and persist the final transcript to /api/sessions/[id]. Store-
// agnostic by design — it reads and writes conversation state only through the
// injected ChatEngineAccessors, so jefflougheed (Zustand) and Heirloom
// (useReducer context) can share one implementation, and jefflougheed's Hero +
// overlay keep driving a single shared conversation rather than two.
//
// Behavior is a faithful move of the duplicated send()/retry() logic that
// lived in src/components/Chat.tsx and src/components/Hero.tsx. The /api/sage
// wire format is unchanged.

import { useCallback, useRef, useState } from 'react'
import { readDataStream } from '@/services/chat/server/stream-utils'
import type { ChatMessage, ChatMode } from '@/services/chat/server/types'
import type { UseChatTurnOptions, UseChatTurnReturn } from './types'

async function streamTurn(
  messages: ChatMessage[],
  mode: ChatMode,
  sessionId: string | null,
  onChunk: (accumulated: string) => void,
): Promise<void> {
  const response = await fetch('/api/sage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      mode: mode ?? null,
      session_id: sessionId ?? null,
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  await readDataStream(response, onChunk)
}

export function useChatTurn({ accessors }: UseChatTurnOptions): UseChatTurnReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const [isError, setIsError] = useState(false)

  // Mirror of isStreaming for the send/retry guard — a ref so a rapid second
  // call sees the in-flight state without waiting for a re-render.
  const streamingRef = useRef(false)
  const retryMsgsRef = useRef<ChatMessage[]>([])
  const retrySessionIdRef = useRef<string | null>(null)

  // Drive both the local mirror and the consumer's store (so other readers of
  // streaming state — e.g. the Nav status pip — stay in sync).
  const setStreaming = useCallback(
    (val: boolean) => {
      streamingRef.current = val
      setIsStreaming(val)
      accessors.setStreaming(val)
    },
    [accessors],
  )

  // visitorName is always null from the client today — there is no client-side
  // name capture; the server extracts it in onFinish. Sending null preserves
  // the exact prior PATCH body. The full message objects (with id/timestamp)
  // flow through accessors.getMessages() so the persisted jsonb shape is
  // unchanged.
  const persist = useCallback(
    (sessionId: string) => {
      const finalMessages = accessors.getMessages()
      fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: finalMessages, visitorName: null }),
      })
        .then(r =>
          r
            .json()
            .then(d =>
              console.log('[chat/turn] PATCH /api/sessions status:', r.status, '| response:', JSON.stringify(d)),
            ),
        )
        .catch(err => console.error('[chat/turn] PATCH /api/sessions failed:', err))
    },
    [accessors],
  )

  const send = useCallback(
    async (input: string) => {
      const text = input.trim()
      if (!text || streamingRef.current) return

      setIsError(false)
      const userMsg: ChatMessage = { role: 'user', content: text }
      const msgsToSend = [...accessors.getMessages(), userMsg]
      accessors.addMessage(userMsg)
      setStreaming(true)
      accessors.addMessage({ role: 'assistant', content: '' })

      let activeSessionId = accessors.getSessionId()
      if (!activeSessionId) {
        try {
          const res = await fetch('/api/sessions', { method: 'POST' })
          const data = await res.json()
          console.log('[chat/turn] POST /api/sessions status:', res.status, '| response:', JSON.stringify(data))
          if (data.id) {
            activeSessionId = data.id
            accessors.setSessionId(data.id)
          }
        } catch (err) {
          console.error('[chat/turn] POST /api/sessions failed:', err)
        }
      }

      retryMsgsRef.current = msgsToSend
      retrySessionIdRef.current = activeSessionId

      try {
        await streamTurn(msgsToSend, accessors.getMode?.() ?? null, activeSessionId, chunk =>
          accessors.updateLastMessage(chunk),
        )
      } catch {
        accessors.updateLastMessage('')
        setIsError(true)
        setStreaming(false)
        return
      }
      setStreaming(false)

      if (activeSessionId) persist(activeSessionId)
    },
    [accessors, setStreaming, persist],
  )

  // Like send(), but the user message is included in msgsToSend for the API
  // without being added to the store. The assistant reply renders normally. Used
  // for system signals where the application drives a guide turn without showing
  // a user bubble.
  const sendHidden = useCallback(
    async (content: string) => {
      if (!content.trim() || streamingRef.current) return

      setIsError(false)
      const hiddenMsg: ChatMessage = { role: 'user', content: content.trim() }
      const msgsToSend = [...accessors.getMessages(), hiddenMsg]
      // Deliberately NOT calling accessors.addMessage(hiddenMsg) — hidden from UI.
      setStreaming(true)
      accessors.addMessage({ role: 'assistant', content: '' })

      let activeSessionId = accessors.getSessionId()
      if (!activeSessionId) {
        try {
          const res = await fetch('/api/sessions', { method: 'POST' })
          const data = await res.json()
          console.log('[chat/turn] POST /api/sessions status:', res.status, '| response:', JSON.stringify(data))
          if (data.id) {
            activeSessionId = data.id
            accessors.setSessionId(data.id)
          }
        } catch (err) {
          console.error('[chat/turn] POST /api/sessions failed:', err)
        }
      }

      try {
        await streamTurn(msgsToSend, accessors.getMode?.() ?? null, activeSessionId, chunk =>
          accessors.updateLastMessage(chunk),
        )
      } catch {
        accessors.updateLastMessage('')
        setIsError(true)
        setStreaming(false)
        return
      }
      setStreaming(false)

      if (activeSessionId) persist(activeSessionId)
    },
    [accessors, setStreaming, persist],
  )

  const retry = useCallback(async () => {
    if (streamingRef.current) return
    setIsError(false)
    setStreaming(true)
    accessors.updateLastMessage('')

    try {
      await streamTurn(
        retryMsgsRef.current,
        accessors.getMode?.() ?? null,
        retrySessionIdRef.current,
        chunk => accessors.updateLastMessage(chunk),
      )
    } catch {
      accessors.updateLastMessage('')
      setIsError(true)
      setStreaming(false)
      return
    }
    setStreaming(false)

    const sessionId = retrySessionIdRef.current
    if (sessionId) persist(sessionId)
  }, [accessors, setStreaming, persist])

  return { send, sendHidden, retry, isStreaming, isError }
}
