// app/heirloom/components/store/chatReducer.ts
//
// The pure Heirloom chat reducer, its action union, and the conversation state
// shape. Deliberately dependency-free (no React, no Clerk, no store wiring) so
// the state-transition logic is unit-testable in isolation. The ChatProvider in
// chatStore.tsx wires this reducer to React and re-exports these types, so
// consumers keep importing from chatStore.

// Message is the canonical UIMessage (Phase 0): { id, role, content, timestamp:number }.
// Re-exported under the historical name so consumers (MessageList, the chatStore
// re-export) are unchanged. Type-only import — the reducer stays runtime-pure.
import type { UIMessage } from '@/services/chat/ui/v1/types';
export type Message = UIMessage;

export interface ChatState {
  messages: Message[];
  hasStarted: boolean;
  isSidebarExpanded: boolean;
  isLoading: boolean;
  isChatOpen: boolean;
  sessionId: string | null;
}

export type ChatAction =
  | { type: 'SEND_MESSAGE'; payload: Message }
  | { type: 'ADD_ASSISTANT_MESSAGE'; payload: Message }
  | { type: 'UPDATE_LAST_ASSISTANT'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR'; payload: boolean }
  | { type: 'OPEN_CHAT' }
  | { type: 'CLOSE_CHAT' }
  | { type: 'SET_SESSION_ID'; payload: string }
  | { type: 'HYDRATE'; payload: { messages: Message[]; sessionId: string | null } }
  | { type: 'RESET' };

export const initialState: ChatState = {
  messages: [],
  hasStarted: false,
  isSidebarExpanded: false,
  isLoading: false,
  isChatOpen: false,
  sessionId: null,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SEND_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload], hasStarted: true };
    case 'ADD_ASSISTANT_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload], isLoading: false };
    case 'UPDATE_LAST_ASSISTANT': {
      // Replace the content of the trailing assistant message (used by the
      // streaming sendMessage wired in Commit 3).
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], content: action.payload };
          break;
        }
      }
      return { ...state, messages };
    }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarExpanded: !state.isSidebarExpanded };
    case 'SET_SIDEBAR':
      return { ...state, isSidebarExpanded: action.payload };
    case 'OPEN_CHAT':
      return { ...state, isChatOpen: true };
    case 'CLOSE_CHAT':
      return { ...state, isChatOpen: false };
    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.payload };
    case 'HYDRATE':
      // Replace the conversation wholesale from a recovered buffer. hasStarted
      // follows whether any messages were restored so the chat opens straight
      // into the transcript rather than the empty-state greeting.
      return {
        ...state,
        messages: action.payload.messages,
        sessionId: action.payload.sessionId,
        hasStarted: action.payload.messages.length > 0,
      };
    case 'RESET':
      // Start a fresh conversation: drop the active transcript and session and
      // return to the empty-greeting state. Deliberately preserves UI chrome
      // (isSidebarExpanded, isChatOpen) — the panel stays open on the greeting —
      // and leaves recentSessions (separate provider state) untouched so history
      // remains in the Recent sidebar.
      return {
        ...state,
        messages: [],
        hasStarted: false,
        isLoading: false,
        sessionId: null,
      };
    default:
      return state;
  }
}
