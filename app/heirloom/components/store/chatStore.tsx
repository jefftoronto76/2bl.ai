'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';

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
}

export type ChatAction =
  | { type: 'SEND_MESSAGE'; payload: Message }
  | { type: 'ADD_ASSISTANT_MESSAGE'; payload: Message }
  | { type: 'UPDATE_LAST_ASSISTANT'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR'; payload: boolean }
  | { type: 'OPEN_CHAT' }
  | { type: 'CLOSE_CHAT' };

const initialState: ChatState = {
  messages: [],
  hasStarted: false,
  isSidebarExpanded: false,
  isLoading: false,
  isChatOpen: false,
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
    default:
      return state;
  }
}

interface ChatContextType {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  return <ChatContext.Provider value={{ state, dispatch }}>{children}</ChatContext.Provider>;
}

export function useChatStore() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatStore must be used within ChatProvider');
  return ctx;
}
