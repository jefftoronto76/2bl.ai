'use client';

/**
 * Store handlers for editing / resending a visitor message.
 *
 * Both share one rule: EDITING REWRITES HISTORY FROM THAT POINT FORWARD.
 * Everything after the edited message — assistant replies, memory cards, offers —
 * is truncated, then the message re-enters delivery.
 *
 * Sequencing matters. Cancel any in-flight generation BEFORE mutating the list,
 * or a late-arriving stream token will write into a message that no longer exists.
 */

import { useCallback } from 'react';
import { useChatStore } from '@/lib/stores/chat';

export function useEditAndResend() {
  const { messagesRef, setMessages, cancelGeneration, deliver } = useChatStore();

  const cancelInFlight = useCallback(() => {
    cancelGeneration(); // clears the stream interval, nulls streamingId, sets the cancelled flag
  }, [cancelGeneration]);

  const editMessage = useCallback(
    (id: string, text: string) => {
      cancelInFlight();
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx === -1) return prev;
        const next = prev.slice(0, idx + 1);
        next[idx] = { ...next[idx], content: text, status: 'sending', edited: true };
        return next;
      });
      // Next tick: the truncation must be committed before delivery re-enters.
      setTimeout(() => deliver(id, text, { isRetry: true }), 0);
    },
    [cancelInFlight, setMessages, deliver],
  );

  const resendMessage = useCallback(
    (id: string) => {
      cancelInFlight();
      const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        return idx === -1 ? prev : prev.slice(0, idx + 1);
      });
      setTimeout(() => deliver(id, msg.content, { isRetry: true }), 0);
    },
    [cancelInFlight, messagesRef, setMessages, deliver],
  );

  return { editMessage, resendMessage };
}
