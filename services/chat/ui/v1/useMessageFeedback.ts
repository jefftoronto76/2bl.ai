'use client'

// services/chat/ui/v1/useMessageFeedback.ts
//
// Headless data hook (no JSX) for the thumbs/reason-chip feedback captured by
// components/chat/MessageActions.tsx + FeedbackPopover.tsx. Fetches existing
// ratings for a session on mount (GET /api/sessions/[id]/feedback) so a
// reloaded conversation shows previously-set ratings, and posts rating/
// reason/note changes (POST, same route) — mirrors the useSageParameters.ts
// pattern (fetch-on-mount, resilient to errors, no JSX).
//
// Ratings are keyed by message_index — the position of the message in the
// persisted `messages` array — not the client-side `UIMessage.id`, matching
// the message_feedback table's column and the value the server can key an
// upsert on without needing the id to be stable across the wire.

import { useCallback, useEffect, useRef, useState } from 'react'

export type FeedbackRating = 'up' | 'down' | null

export interface MessageFeedbackState {
  rating: FeedbackRating
  tags: string[]
  detail: string
}

export interface UseMessageFeedbackReturn {
  /** Current feedback state for a message index — {rating: null, tags: [], detail: ''} if never rated. */
  getFeedback(messageIndex: number): MessageFeedbackState
  /** Sets the rating (toggles off if it's already the active rating). Persists immediately. */
  rate(messageIndex: number, rating: 'up' | 'down'): void
  /** Persists the reason chips + note for a message, keeping its current rating. */
  submitFeedback(messageIndex: number, reasons: string[], note: string): void
}

const EMPTY_FEEDBACK: MessageFeedbackState = { rating: null, tags: [], detail: '' }

interface FeedbackRow {
  message_index: number
  rating: FeedbackRating
  tags: string[] | null
  detail: string | null
}

export function useMessageFeedback(sessionId: string | null): UseMessageFeedbackReturn {
  const [byIndex, setByIndex] = useState<Record<number, MessageFeedbackState>>({})
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/sessions/${sessionId}/feedback`)
      .then(r => r.json())
      .then((data: { feedback?: FeedbackRow[] }) => {
        if (!Array.isArray(data.feedback)) return
        const next: Record<number, MessageFeedbackState> = {}
        for (const row of data.feedback) {
          next[row.message_index] = { rating: row.rating, tags: row.tags ?? [], detail: row.detail ?? '' }
        }
        setByIndex(next)
      })
      .catch(err => console.error('[useMessageFeedback] fetch failed:', err))
  }, [sessionId])

  const post = useCallback(
    (messageIndex: number, body: { rating: FeedbackRating; tags?: string[]; detail?: string | null }) => {
      const sid = sessionIdRef.current
      if (!sid) return
      fetch(`/api/sessions/${sid}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_index: messageIndex, ...body }),
      }).catch(err => console.error('[useMessageFeedback] post failed:', err))
    },
    [],
  )

  const getFeedback = useCallback(
    (messageIndex: number): MessageFeedbackState => byIndex[messageIndex] ?? EMPTY_FEEDBACK,
    [byIndex],
  )

  const rate = useCallback(
    (messageIndex: number, rating: 'up' | 'down') => {
      setByIndex(prev => {
        const current = prev[messageIndex] ?? EMPTY_FEEDBACK
        const clearing = current.rating === rating
        const next: MessageFeedbackState = clearing ? EMPTY_FEEDBACK : { ...current, rating }
        post(messageIndex, clearing ? { rating: null } : { rating, tags: current.tags, detail: current.detail })
        return { ...prev, [messageIndex]: next }
      })
    },
    [post],
  )

  const submitFeedback = useCallback(
    (messageIndex: number, reasons: string[], note: string) => {
      setByIndex(prev => {
        const current = prev[messageIndex] ?? EMPTY_FEEDBACK
        const next: MessageFeedbackState = { ...current, tags: reasons, detail: note }
        post(messageIndex, { rating: current.rating, tags: reasons, detail: note })
        return { ...prev, [messageIndex]: next }
      })
    },
    [post],
  )

  return { getFeedback, rate, submitFeedback }
}
