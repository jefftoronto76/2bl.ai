// services/chat/server/turn-context/registry.ts
//
// The one place a provider is registered. Adding a per-turn variable is:
// one file under providers/, one line here, one colocated test, one row in
// System Docs/Utilities/Chat Server.md's provider table. registry.test.ts
// enforces the first three.
//
// Prompt position comes from each provider's `order`, not from the sequence
// below — the runner sorts. The list is kept in prompt order anyway so a
// reader sees the assembled shape at a glance.

import { basePromptProvider } from './providers/base-prompt'
import { bookingProvider } from './providers/booking'
import { memberContextProvider } from './providers/member-context'
import { sessionContextProvider } from './providers/session-context'
import { mediaProvider } from './providers/media'
import { questionModeProvider } from './providers/question-mode'
import type { ContextProvider } from './types'

export const PROVIDERS: readonly ContextProvider[] = [
  basePromptProvider,
  bookingProvider,
  memberContextProvider,
  sessionContextProvider,
  mediaProvider,
  questionModeProvider,
]
