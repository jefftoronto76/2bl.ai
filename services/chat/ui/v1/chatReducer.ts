// services/chat/ui/v1/chatReducer.ts
//
// The pure Heirloom SHELL reducer — sidebar + chat-panel open/close state and
// its action union. Deliberately dependency-free (no React, no Clerk, no store
// wiring) so the transitions stay unit-testable in isolation. Conversation state
// (messages, sessionId, streaming) now lives in the shared session
// (useChatSession); this reducer owns only presentation/shell state. The
// ChatProvider in components/shells/membership/chatStore.tsx composes the two
// into the context's ChatState.

// Message is the canonical UIMessage (Phase 0): { id, role, content, timestamp:number }.
// Re-exported under the historical name so consumers (MessageList, the chatStore
// re-export) are unchanged. Type-only import — this module stays runtime-pure.
import type { UIMessage } from './types';
export type Message = UIMessage;

/** Presentation/shell state for the Heirloom chat panel. */
export interface ShellState {
  isSidebarExpanded: boolean;
  isChatOpen: boolean;
}

export type ChatAction =
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR'; payload: boolean }
  | { type: 'OPEN_CHAT' }
  | { type: 'CLOSE_CHAT' };

export const initialState: ShellState = {
  isSidebarExpanded: false,
  isChatOpen: false,
};

export function chatReducer(state: ShellState, action: ChatAction): ShellState {
  switch (action.type) {
    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarExpanded: !state.isSidebarExpanded };
    case 'SET_SIDEBAR':
      return { ...state, isSidebarExpanded: action.payload };
    case 'OPEN_CHAT':
      return { ...state, isChatOpen: true };
    case 'CLOSE_CHAT':
      return { ...state, isChatOpen: false };
    default:
      return state;
  }
}
