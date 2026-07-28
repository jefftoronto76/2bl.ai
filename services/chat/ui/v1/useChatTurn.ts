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
import type { ChatErrorType, UseChatTurnOptions, UseChatTurnReturn } from './types'
import { toModelMessages } from './message'

// Thrown from streamTurn's three failure checkpoints so the call sites below
// can classify without re-deriving the reason from a bare Error. AbortError
// (the user hit Stop) is never wrapped — it propagates as-is so the existing
// isAbortError() branches in send/sendHidden/retry/regenerate keep handling
// it as a client-initiated cancellation, not a failure.
class ChatTurnError extends Error {
  constructor(public readonly errorType: ChatErrorType) {
    super(errorType)
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function classifyError(err: unknown): ChatErrorType {
  return err instanceof ChatTurnError ? err.errorType : 'unknown'
}

async function streamTurn(
  messages: ChatMessage[],
  mode: ChatMode,
  sessionId: string | null,
  onChunk: (accumulated: string) => void,
  inviteToken?: string | null,
  mediaItems?: MediaAttachmentInput[] | null,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/sage', {
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
  } catch (err) {
    if (isAbortError(err)) throw err
    // fetch() itself threw — no response was ever obtained (offline, DNS
    // failure, connection refused, etc.).
    throw new ChatTurnError('network')
  }

  if (!response.ok) {
    if (response.status === 429) throw new ChatTurnError('rate_limited')
    if (response.status === 401) throw new ChatTurnError('auth_error')
    throw new ChatTurnError('unknown')
  }

  // A response can be `ok` (200, already streaming) and still fail mid-turn:
  // the AI SDK surfaces an upstream/provider error as an in-stream `3:"..."`
  // part rather than a different HTTP status, since headers are already
  // committed by the time the failure happens.
  let streamErrorMessage: string | null = null
  try {
    await readDataStream(response, onChunk, message => {
      streamErrorMessage = message
    })
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new ChatTurnError('stream_interrupted')
  }
  if (streamErrorMessage !== null) {
    throw new ChatTurnError('stream_interrupted')
  }
}

export function useChatTurn({ accessors }: UseChatTurnOptions): UseChatTurnReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const [errorType, setErrorType] = useState<ChatErrorType | null>(null)

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
    (sessionId: string, ttftMs: number | null, errorType?: ChatErrorType) => {
      const finalMessages = accessors.getMessages()
      fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: finalMessages,
          visitorName: null,
          ...(ttftMs !== null ? { ttft_ms: ttftMs } : {}),
          ...(errorType ? { last_error_type: errorType } : {}),
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

  // Resolves the assistant side of a Stop. One path regardless of timing —
  // whether Stop was hit before the first token arrived or mid-stream, the
  // message is always kept (never removed) and always tagged both
  // `stopped: true` and `error_type: 'user_stopped'`, so there is a durable
  // record that a stop happened even when there was nothing yet to show.
  // (Previously the empty-content case deleted the placeholder outright —
  // silently indistinguishable from the assistant never having been asked
  // to respond at all, with no trace in the persisted transcript.)
  const finishAbortedTurn = useCallback(
    (assistantMsgId: string | null) => {
      if (!assistantMsgId) return
      const current = accessors.getMessages()
      const assistantMsg = current.find(m => m.id === assistantMsgId)
      if (!assistantMsg) return
      accessors.patchMessageById(assistantMsgId, { stopped: true, error_type: 'user_stopped' })
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

      setErrorType(null)
      const userMsg: ChatMessage = { role: 'user', content: text }
      // toModelMessages folds a trailing stopped:true assistant message into
      // this new user turn as continuation context instead of replaying it
      // as a completed assistant turn (see message.ts). userMsg itself
      // (added to the store below) stays the clean, unmodified text — only
      // the array sent to the model is transformed.
      const msgsToSend = toModelMessages([...accessors.getMessages(), userMsg])
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
          // a delivery failure, so this still counts as 'sent'. 'user_stopped'
          // still goes through the same classify → banner → persist path as
          // the other 5 error types, so Stop gets consistent feedback and a
          // durable last_error_type regardless of whether any content had
          // streamed back yet.
          if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'sent' })
          finishAbortedTurn(assistantMsgId)
          setErrorType('user_stopped')
          setStreaming(false)
          if (activeSessionId) persist(activeSessionId, null, 'user_stopped')
          return
        }
        const classified = classifyError(err)
        accessors.updateLastMessage('')
        if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'failed', error_type: classified })
        setErrorType(classified)
        setStreaming(false)
        if (activeSessionId) persist(activeSessionId, null, classified)
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

      setErrorType(null)
      const hiddenMsg: ChatMessage = { role: 'user', content: content.trim() }
      // See send() above — folds a trailing stopped assistant turn into this
      // hidden user turn as continuation context.
      const msgsToSend = toModelMessages([...accessors.getMessages(), hiddenMsg])
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
          setErrorType('user_stopped')
          setStreaming(false)
          if (activeSessionId) persist(activeSessionId, null, 'user_stopped')
          return
        }
        const classified = classifyError(err)
        accessors.updateLastMessage('')
        // sendHidden's user message is never added to the store, so there is
        // no user-message id to tag — the assistant placeholder is the only
        // message this turn produced, and it still holds the empty content.
        if (assistantMsgId) accessors.patchMessageById(assistantMsgId, { error_type: classified })
        setErrorType(classified)
        setStreaming(false)
        if (activeSessionId) persist(activeSessionId, null, classified)
        return
      }
      setStreaming(false)

      if (activeSessionId) persist(activeSessionId, null)
    },
    [accessors, setStreaming, persist, finishAbortedTurn],
  )

  const retry = useCallback(async () => {
    if (streamingRef.current) return
    setErrorType(null)
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
        setErrorType('user_stopped')
        setStreaming(false)
        const sessionId = retrySessionIdRef.current
        if (sessionId) persist(sessionId, null, 'user_stopped')
        return
      }
      const classified = classifyError(err)
      accessors.updateLastMessage('')
      if (userMsgId) accessors.patchMessageById(userMsgId, { status: 'failed', error_type: classified })
      setErrorType(classified)
      setStreaming(false)
      const sessionId = retrySessionIdRef.current
      if (sessionId) persist(sessionId, null, classified)
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

      setErrorType(null)
      const targetMsg = allMessages[targetIdx]
      // Context is everything up to (not including) the message being
      // regenerated — a later message never re-derives the context that
      // followed it. toModelMessages folds any stopped assistant turn
      // earlier in that context the same way send()/sendHidden() do.
      const contextMsgs = toModelMessages(allMessages.slice(0, targetIdx))
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
          // Unlike send()/sendHidden()/retry() (finishAbortedTurn), a
          // regenerate always has a known-good prior version to fall back to,
          // so the zero-content case restores it rather than leaving the
          // message blank — no data loss either way. The banner + persisted
          // last_error_type still apply uniformly, matching every other Stop.
          const current = accessors.getMessages().find(m => m.id === messageId)
          if (current?.content === '') {
            accessors.patchMessageById(messageId, { content: priorContent, stopped: false })
          } else {
            accessors.patchMessageById(messageId, { stopped: true, error_type: 'user_stopped' })
          }
          setErrorType('user_stopped')
          setStreaming(false)
          if (activeSessionId) persist(activeSessionId, null, 'user_stopped')
          return
        }
        // Regenerate failed outright — restore the prior version; the
        // earlier variant is untouched, so nothing is lost.
        const classified = classifyError(err)
        accessors.patchMessageById(messageId, { content: priorContent, error_type: classified })
        setErrorType(classified)
        setStreaming(false)
        if (activeSessionId) persist(activeSessionId, null, classified)
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

  const setActiveVersion = useCallback(
    (messageId: string, versionIdx: number) => {
      const msg = accessors.getMessages().find(m => m.id === messageId)
      if (!msg?.versions || versionIdx < 0 || versionIdx >= msg.versions.length) return
      accessors.patchMessageById(messageId, { content: msg.versions[versionIdx], versionIdx })
      const sessionId = accessors.getSessionId()
      if (sessionId) persist(sessionId, null)
    },
    [accessors, persist],
  )

  return { send, sendHidden, retry, stop, regenerate, setActiveVersion, isStreaming, errorType }
}
