'use client';

import React, { createContext, useContext, useMemo, useReducer, useRef, ReactNode } from 'react';
import { useChatTurn } from '@/services/chat/ui/v1/useChatTurn';
import type { ChatEngineAccessors } from '@/services/chat/ui/v1';
import type { ChatMessage } from '@/services/chat/server/types';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

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
  | { type: 'SET_SESSION_ID'; payload: string };

const initialState: ChatState = {
  messages: [],
  hasStarted: false,
  isSidebarExpanded: false,
  isLoading: false,
  isChatOpen: false,
  sessionId: null,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
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
    default:
      return state;
  }
}

interface ChatContextType {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  sendMessage: (content: string) => Promise<void>;
  isError: boolean;
}

const ChatContext = createContext<ChatContextType | null>(null);

function toMessage(role: 'user' | 'assistant', content: string): Message {
  return { id: crypto.randomUUID(), role, content, timestamp: new Date() };
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  // Authoritative, synchronously-updated mirrors of the conversation state the
  // engine reads/writes. The reducer drives rendering, but its dispatch is
  // async — so the engine reads these refs (updated inline in the accessors)
  // to avoid persisting a stale transcript when useChatTurn reads getMessages()
  // synchronously after the stream settles. Messages and sessionId are mutated
  // ONLY through these accessors (no component dispatches SEND_MESSAGE /
  // ADD_ASSISTANT_MESSAGE / UPDATE_LAST_ASSISTANT / SET_SESSION_ID), so the
  // refs and reducer never diverge.
  const messagesRef = useRef<Message[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  // The engine eagerly seeds an empty assistant message before streaming; we
  // defer materializing it until the first token so the typing indicator shows
  // (and no empty bubble flashes) — matching the prior Heirloom behavior.
  const assistantPendingRef = useRef(false);

  const accessors = useMemo<ChatEngineAccessors>(
    () => ({
      getMessages: () => messagesRef.current,
      addMessage: (msg: ChatMessage) => {
        if (msg.role === 'user') {
          const m = toMessage('user', msg.content);
          messagesRef.current = [...messagesRef.current, m];
          dispatch({ type: 'SEND_MESSAGE', payload: m });
          return;
        }
        // assistant
        if (msg.content === '') {
          assistantPendingRef.current = true;
          return;
        }
        const m = toMessage('assistant', msg.content);
        messagesRef.current = [...messagesRef.current, m];
        assistantPendingRef.current = false;
        dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: m });
      },
      updateLastMessage: (content: string) => {
        if (assistantPendingRef.current) {
          assistantPendingRef.current = false;
          const m = toMessage('assistant', content);
          messagesRef.current = [...messagesRef.current, m];
          dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: m });
          return;
        }
        const msgs = [...messagesRef.current];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            msgs[i] = { ...msgs[i], content };
            break;
          }
        }
        messagesRef.current = msgs;
        dispatch({ type: 'UPDATE_LAST_ASSISTANT', payload: content });
      },
      setStreaming: (val: boolean) => dispatch({ type: 'SET_LOADING', payload: val }),
      setSessionId: (id: string) => {
        sessionIdRef.current = id;
        dispatch({ type: 'SET_SESSION_ID', payload: id });
      },
      getSessionId: () => sessionIdRef.current,
    }),
    [],
  )

  const turn = useChatTurn({ accessors })

  return (
    <ChatContext.Provider value={{ state, dispatch, sendMessage: turn.send, isError: turn.isError }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatStore() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatStore must be used within ChatProvider');
  return ctx;
}
