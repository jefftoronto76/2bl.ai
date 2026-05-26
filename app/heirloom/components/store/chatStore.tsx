'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { readSageStream } from '../../lib/stream';

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
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    // Build the outgoing transcript synchronously from current state — the
    // reducer dispatch below is async, so we cannot read it back in time.
    const priorMessages = state.messages;
    const outgoing = [...priorMessages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    dispatch({ type: 'SEND_MESSAGE', payload: userMessage });
    dispatch({ type: 'SET_LOADING', payload: true });

    // Create a session on first send so the conversation is persisted to
    // Supabase. The dispatch above is async, so track the id locally for this
    // turn (mirrors src/components/Chat.tsx).
    let activeSessionId = state.sessionId;
    if (!activeSessionId) {
      try {
        const res = await fetch('/api/sessions', { method: 'POST' });
        const data: { id?: string } = await res.json();
        console.log('[heirloom/chat] POST /api/sessions status:', res.status, '| response:', JSON.stringify(data));
        if (data.id) {
          activeSessionId = data.id;
          dispatch({ type: 'SET_SESSION_ID', payload: data.id });
        }
      } catch (err) {
        console.error('[heirloom/chat] POST /api/sessions failed:', err);
      }
    }

    let assistantAdded = false;
    let assistantText = '';
    const pushAssistant = (text: string) => {
      assistantText = text;
      if (!assistantAdded) {
        assistantAdded = true;
        dispatch({
          type: 'ADD_ASSISTANT_MESSAGE',
          payload: { id: crypto.randomUUID(), role: 'assistant', content: text, timestamp: new Date() },
        });
      } else {
        dispatch({ type: 'UPDATE_LAST_ASSISTANT', payload: text });
      }
    };

    try {
      const response = await fetch('/api/sage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: outgoing, session_id: activeSessionId }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Sage request failed: ${response.status}`);
      }

      await readSageStream(response, pushAssistant);

      if (!assistantAdded) {
        pushAssistant('I didn’t quite catch that — could you try again?');
      }

      // Persist the final transcript once the stream settles.
      if (activeSessionId) {
        const finalMessages: Message[] = [
          ...priorMessages,
          userMessage,
          { id: crypto.randomUUID(), role: 'assistant', content: assistantText, timestamp: new Date() },
        ];
        fetch(`/api/sessions/${activeSessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: finalMessages, visitorName: null }),
        })
          .then((r) => r.json().then((d) => console.log('[heirloom/chat] PATCH /api/sessions status:', r.status, '| response:', JSON.stringify(d))))
          .catch((err) => console.error('[heirloom/chat] PATCH /api/sessions failed:', err));
      }
    } catch (err) {
      console.error('[heirloom/chat] sendMessage failed:', err);
      pushAssistant('Something went wrong reaching your story guide. Please try again in a moment.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  return (
    <ChatContext.Provider value={{ state, dispatch, sendMessage }}>{children}</ChatContext.Provider>
  );
}

export function useChatStore() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatStore must be used within ChatProvider');
  return ctx;
}
