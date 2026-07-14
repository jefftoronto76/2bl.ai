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
import type { ChatMessage, ChatMode, MediaAttachmentInput } from '@/services/chat/server/types'
import type { UseChatTurnOptions, UseChatTurnReturn } from './types'

async function streamTurn(
  messages: ChatMessage[],
  mode: ChatMode,
  sessionId: string | null,
  onChunk: (accumulated: string) => void,
  inviteToken?: string | null,
  mediaItems?: MediaAttachmentInput[] | null,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/sage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      mode: mode ?? null,
      session_id: sessionId ?? null,
      invite_token: inviteToken ?? null,
      media_items: mediaItems?.length ? mediaItems : null,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  await readDataStream(response, onChunk)
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export function useChatTurn({ accessors }: UseChatTurnOptions): UseChatTurnReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const [isError, setIsError] = useState(false)

  // Mirror of isStreaming for the send/retry guard — a ref so a rapid second
  // call sees the in-flight state without waiting for a re-render.
  const streamingRef = useRef(false)
  const retryMsgsRef = useRef<ChatMessage[]>([])
  const retrySessionIdRef = useRef<string | null>(null)
  const retryMediaItemsRef = useRef<MediaAttachmentInput[] | null>(null)
  // The id of the user message that triggered the in-flight/last turn, so its
  // delivery `status` can be updated by id — retry() re-runs the same
  // transition on the same message rather than adding a new one.
  const retryUserMsgIdRef = useRef<string | null>(null)
  // The controller backing the in-flight send()/retry() fetch, if any —
  // stop() aborts it. A fresh controller is created per turn so a stale one
  // from a prior (already-settled) turn is never accidentally reused.
  const abortControllerRef = useRef<AbortController | null>(null)

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
    (sessionId: string, ttftMs: number | null) => {
      const finalMessages = accessors.getMessages()
      fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: finalMessages,
          visitorName: null,
          ...(ttftMs !== null ? { ttft_ms: ttftMs } : {}),
        }),
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

  // Resolves the assistant side of a Stop: if nothing streamed in yet, the
  // still-empty placeholder is dropped entirely (never rendered or
  // persisted); otherwise the partial content is kept and flagged `stopped`.
  const finishAbortedTurn = useCallback(
    (assistantMsgId: string | null) => {
      if (!assistantMsgId) return
      const current = accessors.getMessages()
      const assistantMsg = current.find(m => m.id === assistantMsgId)
      if (!assistantMsg) return
      if (assistantMsg.content === '') {
        accessors.removeMessageById(assistantMsgId)
      } else {
        accessors.patchMessageById(assistantMsgId, { stopped: true })
      }
    },
    [accessors],
  )

  const send = useCallback(
    async (input: string) => {
      const text = input.trim()
      if (!text || streamingRef.current) return

      // TTFT: start the clock before any async work (session create + stream
      // fetch) so the measurement reflects the full wait the visitor actually
      // experiences, and stamp firstChunkAt on the first streamed chunk only.
      const sendStartedAt = performance.now()
      let firstChunkAt: number | null = null

      setIsError(false)
      const userMsg: ChatMessage = { role: 'user', content: text }
      const msgsToSend = [...accessors.getMessages(), userMsg]
      accessors.addMessage(userMsg)
      // Read the id the store just assigned to the message we added (addMessage
      // takes the lean ChatMessage in, the canonical UIMessage — with id — is
      // constructed internally), so delivery status can target it by id.
      const withUserMsg = accessors.getMessages()
      const userMsgId = withUserMsg[withUserMsg.length - 1]?.id ?? null
      retryUserMsgIdRef.current = userMsgId
      if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'sending' })
      setStreaming(true)
      accessors.addMessage({ role: 'assistant', content: '' })
      const withAssistant = accessors.getMessages()
      const assistantMsgId = withAssistant[withAssistant.length - 1]?.id ?? null

      const controller = new AbortController()
      abortControllerRef.current = controller

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

      const currentMediaItems = accessors.getMediaItems?.() ?? null
      retryMsgsRef.current = msgsToSend
      retrySessionIdRef.current = activeSessionId
      retryMediaItemsRef.current = currentMediaItems

      try {
        await streamTurn(msgsToSend, accessors.getMode?.() ?? null, activeSessionId, chunk => {
          if (firstChunkAt === null) firstChunkAt = performance.now()
          accessors.updateLastMessage(chunk)
        },
          accessors.getInviteToken?.() ?? null,
          currentMediaItems,
          controller.signal,
        )
      } catch (err) {
        if (isAbortError(err)) {
          // The user's message genuinely reached the server (the fetch was in
          // flight) — Stop is a client-side choice to cut the reply short, not
          // a delivery failure, so this still counts as 'sent'.
          if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'sent' })
          finishAbortedTurn(assistantMsgId)
          setStreaming(false)
          if (activeSessionId) persist(activeSessionId, null)
          return
        }
        accessors.updateLastMessage('')
        if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'failed' })
        setIsError(true)
        setStreaming(false)
        return
      }
      if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'sent' })
      setStreaming(false)

      const ttftMs = firstChunkAt !== null ? Math.round(firstChunkAt - sendStartedAt) : null
      if (activeSessionId) persist(activeSessionId, ttftMs)
    },
    [accessors, setStreaming, persist, finishAbortedTurn],
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
      const withAssistant = accessors.getMessages()
      const assistantMsgId = withAssistant[withAssistant.length - 1]?.id ?? null

      const controller = new AbortController()
      abortControllerRef.current = controller

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
          accessors.getInviteToken?.() ?? null,
          undefined,
          controller.signal,
        )
      } catch (err) {
        if (isAbortError(err)) {
          finishAbortedTurn(assistantMsgId)
          setStreaming(false)
          if (activeSessionId) persist(activeSessionId, null)
          return
        }
        accessors.updateLastMessage('')
        setIsError(true)
        setStreaming(false)
        return
      }
      setStreaming(false)

      if (activeSessionId) persist(activeSessionId, null)
    },
    [accessors, setStreaming, persist, finishAbortedTurn],
  )

  const retry = useCallback(async () => {
    if (streamingRef.current) return
    setIsError(false)
    // Real retries can fail again (unlike the design prototype's simulated
    // always-succeeds retry) — re-run the full 'sending' -> 'sent' | 'failed'
    // transition on the same user message rather than assuming success.
    const userMsgId = retryUserMsgIdRef.current
    if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'sending' })
    setStreaming(true)
    accessors.updateLastMessage('')
    const current = accessors.getMessages()
    const assistantMsgId = current[current.length - 1]?.id ?? null

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      await streamTurn(
        retryMsgsRef.current,
        accessors.getMode?.() ?? null,
        retrySessionIdRef.current,
        chunk => accessors.updateLastMessage(chunk),
        accessors.getInviteToken?.() ?? null,
        retryMediaItemsRef.current,
        controller.signal,
      )
    } catch (err) {
      if (isAbortError(err)) {
        if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'sent' })
        finishAbortedTurn(assistantMsgId)
        setStreaming(false)
        const sessionId = retrySessionIdRef.current
        if (sessionId) persist(sessionId, null)
        return
      }
      accessors.updateLastMessage('')
      if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'failed' })
      setIsError(true)
      setStreaming(false)
      return
    }
    if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'sent' })
    setStreaming(false)

    const sessionId = retrySessionIdRef.current
    if (sessionId) persist(sessionId, null)
  }, [accessors, setStreaming, persist, finishAbortedTurn])

  const stop = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const regenerate = useCallback(
    async (messageId: string) => {
      if (streamingRef.current) return
      const allMessages = accessors.getMessages()
      const targetIdx = allMessages.findIndex(m => m.id === messageId)
      if (targetIdx === -1 || allMessages[targetIdx].role !== 'assistant') return

      setIsError(false)
      const targetMsg = allMessages[targetIdx]
      // Context is everything up to (not including) the message being
      // regenerated — a later message never re-derives the context that
      // followed it.
      const contextMsgs = allMessages.slice(0, targetIdx)
      // Seed `versions` with the pre-regenerate content on the first
      // regenerate for this message; subsequent regenerates just keep adding.
      const priorVersions = targetMsg.versions?.length ? targetMsg.versions : [targetMsg.content]
      const priorContent = priorVersions[priorVersions.length - 1]

      accessors.patchMessageById(messageId, { content: '', stopped: false })
      setStreaming(true)

      const controller = new AbortController()
      abortControllerRef.current = controller

      const activeSessionId = accessors.getSessionId()
      const currentMediaItems = accessors.getMediaItems?.() ?? null

      try {
        await streamTurn(
          contextMsgs,
          accessors.getMode?.() ?? null,
          activeSessionId,
          chunk => accessors.patchMessageById(messageId, { content: chunk }),
          accessors.getInviteToken?.() ?? null,
          currentMediaItems,
          controller.signal,
        )
      } catch (err) {
        if (isAbortError(err)) {
          const current = accessors.getMessages().find(m => m.id === messageId)
          if (current?.content === '') {
            // Nothing streamed for this attempt — restore the prior version
            // rather than leaving the message empty.
            accessors.patchMessageById(messageId, { content: priorContent, stopped: false })
          } else {
            accessors.patchMessageById(messageId, { stopped: true })
          }
          setStreaming(false)
          if (activeSessionId) persist(activeSessionId, null)
          return
        }
        // Regenerate failed outright — restore the prior version; the
        // earlier variant is untouched, so nothing is lost.
        accessors.patchMessageById(messageId, { content: priorContent })
        setIsError(true)
        setStreaming(false)
        return
      }

      const finalContent = accessors.getMessages().find(m => m.id === messageId)?.content ?? ''
      const versions = [...priorVersions, finalContent]
      accessors.patchMessageById(messageId, { versions, versionIdx: versions.length - 1 })
      setStreaming(false)
      if (activeSessionId) persist(activeSessionId, null)
    },
    [accessors, setStreaming, persist],
  )

  return { send, sendHidden, retry, stop, regenerate, isStreaming, isError }
}
