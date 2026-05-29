'use client'

// services/chat/ui/v1/core/ChatSessionProvider.tsx
//
// The single place useChatSession is invoked per conversation. Surfaces never
// call useChatSession directly — they consume the value via
// useChatSessionContext. That guarantees ONE turn engine per conversation, so
// streaming, error, and retry are shared across every surface under the
// provider (the confirmed shared-retry behavior).
//
// Canonical topology (docs/chat-ui-v2-design.md §2.1):
//   - Singleton (jefflougheed Hero + Overlay): one provider with an instanceKey
//     mounted at a common ancestor of both surfaces.
//   - Isolated (Heirloom panel): one provider with no instanceKey around the
//     one surface tree.
//
// This phase is core-only — no tenant mounts this provider yet.

import { createContext, useContext, type ReactNode } from 'react'
import { useChatSession, type ChatSession, type ChatSessionConfig } from './useChatSession'

const ChatSessionContext = createContext<ChatSession | null>(null)

export interface ChatSessionProviderProps extends ChatSessionConfig {
  children: ReactNode
}

export function ChatSessionProvider({ instanceKey, children }: ChatSessionProviderProps) {
  const session = useChatSession({ instanceKey })
  return <ChatSessionContext.Provider value={session}>{children}</ChatSessionContext.Provider>
}

export function useChatSessionContext(): ChatSession {
  const ctx = useContext(ChatSessionContext)
  if (!ctx) {
    throw new Error('useChatSessionContext must be used within a ChatSessionProvider')
  }
  return ctx
}
