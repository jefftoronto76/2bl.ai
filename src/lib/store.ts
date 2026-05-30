import type { RefObject } from 'react'
import { create } from 'zustand'

// MIGRATION: conversation slice moved to useChatSession (services/chat/ui/v1/core)
// Commented out pending live domain verification. Remove once confirmed working.
// See feat/chat-ui-v2-foundation branch and docs/chat-ui-v2-design.md
//
// The conversation slice (SageMessage + messages/isStreaming/sessionId and their
// actions) is now owned by the shared session, consumed via useChatSessionContext.
// Hero and Chat read conversation state from there. The shell slice below
// (isExpanded/expand/collapse, mode/setMode, composerRef/setComposerRef/
// focusComposer, visitorName/hasGreeted, reset) stays live here.

// export interface SageMessage {
//   id: string
//   role: 'user' | 'assistant'
//   content: string
//   timestamp: number
// }

interface SageStore {
  // MIGRATION (conversation slice → useChatSession): commented pending verification.
  // messages: SageMessage[]
  visitorName: string | null
  hasGreeted: boolean
  // isStreaming: boolean
  isExpanded: boolean
  mode: 'question' | null
  // sessionId: string | null
  composerRef: RefObject<HTMLTextAreaElement | null> | null
  // addMessage: (msg: Omit<SageMessage, 'id' | 'timestamp'>) => void
  // updateLastMessage: (content: string) => void
  setVisitorName: (name: string) => void
  setGreeted: (greeted: boolean) => void
  // setStreaming: (streaming: boolean) => void
  // setSessionId: (id: string) => void
  setMode: (mode: 'question' | null) => void
  setComposerRef: (ref: RefObject<HTMLTextAreaElement | null> | null) => void
  focusComposer: () => void
  expand: (mode?: 'question') => void
  collapse: () => void
  reset: () => void
}

export const useSageStore = create<SageStore>((set, get) => ({
  // MIGRATION (conversation slice → useChatSession): commented pending verification.
  // messages: [],
  visitorName: null,
  hasGreeted: false,
  // isStreaming: false,
  isExpanded: false,
  mode: null,
  // sessionId: null,
  composerRef: null,
  // addMessage: (msg) => set((state) => ({
  //   messages: [...state.messages, {
  //     ...msg,
  //     id: `${Date.now()}-${Math.random()}`,
  //     timestamp: Date.now()
  //   }]
  // })),
  // updateLastMessage: (content) => set((state) => {
  //   const messages = [...state.messages]
  //   if (messages.length > 0) {
  //     messages[messages.length - 1] = { ...messages[messages.length - 1], content }
  //   }
  //   return { messages }
  // }),
  setVisitorName: (name) => set({ visitorName: name }),
  setGreeted: (greeted) => set({ hasGreeted: greeted }),
  // setStreaming: (streaming) => set({ isStreaming: streaming }),
  // setSessionId: (id) => set({ sessionId: id }),
  setMode: (mode) => set({ mode }),
  setComposerRef: (ref) => set({ composerRef: ref }),
  focusComposer: () => {
    const ref = get().composerRef
    ref?.current?.focus({ preventScroll: false })
  },
  // Opens the full-viewport overlay (Chat.tsx). Called from Nav "CHAT" link,
  // the in-page #chat section CTA, and Work's "Click here" (with 'question').
  // Hero's inline composer does NOT use expand() — it owns its own UI and
  // writes to the shared session state (messages, sessionId, streaming, mode)
  // directly.
  expand: (mode) => set({ isExpanded: true, mode: mode ?? null }),
  collapse: () => set({ isExpanded: false }),
  reset: () => set({
    // MIGRATION (conversation slice → useChatSession): commented pending verification.
    // messages: [],
    visitorName: null,
    hasGreeted: false,
    // isStreaming: false,
    isExpanded: false,
    mode: null,
    // sessionId: null,
    composerRef: null,
  }),
}))
