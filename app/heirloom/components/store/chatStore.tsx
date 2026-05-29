'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useUser } from '@clerk/nextjs';
import { useChatTurn } from '@/services/chat/ui/v1/useChatTurn';
import type { ChatEngineAccessors } from '@/services/chat/ui/v1';
import { createUIMessage, reviveUIMessages } from '@/services/chat/ui/v1';
import type { ChatMessage } from '@/services/chat/server/types';
import {
  bufferThread,
  clearDraft,
  clearSession,
  findMostRecentThread,
  type PersistedMessage,
} from '../../lib/chatPersistence';
import {
  chatReducer,
  initialState,
  type ChatState,
  type ChatAction,
  type Message,
} from './chatReducer';

// Re-export the reducer's state/action contracts so existing consumers keep
// importing them from chatStore. The pure reducer itself lives in chatReducer.ts
// (no React/Clerk deps) so its transitions stay unit-testable.
export type { ChatState, ChatAction, Message };

/** A previous session loaded from the DB, for the Recent sidebar + recovery. */
export interface RecentSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: Message[];
}

interface ChatContextType {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  sendMessage: (content: string) => Promise<void>;
  isError: boolean;
  recentSessions: RecentSession[];
  loadSession: (id: string) => void;
  /** Clear the active conversation and start fresh (New Chat). History stays. */
  newChat: () => void;
}

// Shape returned by GET /api/sessions. `messages` is opaque jsonb over the wire;
// we narrow it to the persisted message shape and revive timestamps below.
interface ApiSession {
  id: string;
  messages: unknown;
  updated_at: string;
  visitor_name: string | null;
}

function deriveSessionTitle(visitorName: string | null, messages: Message[]): string {
  const name = visitorName?.trim();
  if (name) return name;
  const firstUser = messages.find(m => m.role === 'user');
  const text = firstUser?.content.trim().replace(/\s+/g, ' ') ?? '';
  if (text.length === 0) return 'New conversation';
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

function toRecentSession(row: ApiSession): RecentSession {
  const messages = reviveUIMessages(row.messages);
  return {
    id: row.id,
    updatedAt: row.updated_at,
    messages,
    title: deriveSessionTitle(row.visitor_name, messages),
  };
}

const ChatContext = createContext<ChatContextType | null>(null);

function toMessage(role: 'user' | 'assistant', content: string): Message {
  return createUIMessage(role, content);
}

// Bridge the canonical UIMessage (timestamp: number) and the JSON-serializable
// PersistedMessage (timestamp: ISO string) the localStorage buffer stores. Reads
// go through reviveUIMessage(s), which also accept legacy ISO-string timestamps.
function serialize(m: Message): PersistedMessage {
  return { id: m.id, role: m.role, content: m.content, timestamp: new Date(m.timestamp).toISOString() };
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { isLoaded, isSignedIn } = useUser();
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

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

  // Navigate-away guard: a ref (not reducer state) so the beforeunload handler
  // reads the current value synchronously without re-binding on every render.
  // Mirrors isLoading — whether a turn is in flight.
  const isLoadingRef = useRef(false);

  // Write the current authoritative transcript to localStorage. Reads the refs
  // (not reducer state) so it always sees the latest turn, even mid-stream when
  // called from the pagehide/visibilitychange flush. No-ops on an empty thread.
  const persistCurrent = useCallback(() => {
    bufferThread(messagesRef.current.map(serialize), sessionIdRef.current);
  }, []);

  const accessors = useMemo<ChatEngineAccessors>(
    () => ({
      getMessages: () => messagesRef.current,
      addMessage: (msg: ChatMessage) => {
        if (msg.role === 'user') {
          const m = toMessage('user', msg.content);
          messagesRef.current = [...messagesRef.current, m];
          dispatch({ type: 'SEND_MESSAGE', payload: m });
          // Buffer the user turn immediately so an interrupted reply (page
          // closed mid-stream, before the DB PATCH) still recovers the question.
          persistCurrent();
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
        persistCurrent();
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
      setStreaming: (val: boolean) => {
        isLoadingRef.current = val;
        dispatch({ type: 'SET_LOADING', payload: val });
        // Streaming flipping to false marks a completed turn — buffer the final
        // assistant content. We deliberately do NOT buffer per token (every
        // updateLastMessage) to avoid thrashing localStorage during the stream.
        if (!val) persistCurrent();
      },
      setSessionId: (id: string) => {
        // A real session id arrived — drop the draft slot so it is not left as
        // an orphan, then re-buffer the thread under its session key.
        clearDraft();
        sessionIdRef.current = id;
        dispatch({ type: 'SET_SESSION_ID', payload: id });
        persistCurrent();
      },
      getSessionId: () => sessionIdRef.current,
    }),
    [persistCurrent],
  )

  const turn = useChatTurn({ accessors })

  // Rehydrate the most recently buffered thread on mount so a refresh restores
  // the conversation. Syncs the engine refs too, so the next turn continues the
  // same session (and PATCHes the same DB row) without touching the DB path.
  useEffect(() => {
    const thread = findMostRecentThread();
    if (!thread || thread.messages.length === 0) return;
    const messages = reviveUIMessages(thread.messages);
    messagesRef.current = messages;
    sessionIdRef.current = thread.sessionId;
    dispatch({ type: 'HYDRATE', payload: { messages, sessionId: thread.sessionId } });
  }, []);

  // Flush the live transcript when the page is hidden or unloaded, so a turn
  // still streaming (never reached the DB) survives a tab close / app switch.
  useEffect(() => {
    const onPageHide = () => persistCurrent();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistCurrent();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [persistCurrent]);

  // Signed-in cross-device recovery + Recent list. Fetch the user's DB sessions,
  // populate the Recent sidebar, and — most-recent-wins — hydrate from the newest
  // DB session only when it is strictly newer than the local buffer (so this
  // never clobbers a fresher local thread). Anonymous users skip this entirely
  // and keep localStorage-only behavior.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sessions');
        if (!res.ok || cancelled) return;
        const data: { sessions?: ApiSession[] } = await res.json();
        const rows = Array.isArray(data.sessions) ? data.sessions : [];
        if (cancelled) return;
        const sessions = rows.map(toRecentSession);
        setRecentSessions(sessions);

        const newest = sessions[0]; // GET /api/sessions orders updated_at desc
        if (!newest || newest.messages.length === 0) return;
        const local = findMostRecentThread();
        const localMs = local ? new Date(local.updatedAt).getTime() : 0;
        if (new Date(newest.updatedAt).getTime() <= localMs) return;

        messagesRef.current = newest.messages;
        sessionIdRef.current = newest.id;
        dispatch({ type: 'HYDRATE', payload: { messages: newest.messages, sessionId: newest.id } });
      } catch (err) {
        console.error('[heirloom/chat] DB session recovery failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  // Warn before leaving while a turn is in flight or any conversation exists.
  // The condition is deliberately broad: anonymous visitors have no cross-device
  // DB recovery yet, so an existing thread is treated as unsaved on leave (tighten
  // to a dirty/confirmed-flush check once signed-in DB recovery lands). Chrome
  // 119+ needs BOTH preventDefault() and returnValue set to show the dialog.
  // Reads refs so the single mount-time listener always sees current state — no
  // re-binding, no leak.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLoadingRef.current || messagesRef.current.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Start a fresh conversation (Sidebar "New Chat"). Clears the authoritative
  // engine refs so the next turn lazily creates a brand-new session, drops the
  // active thread's localStorage entry — both the pre-session draft slot AND the
  // current session-keyed entry, captured before the ref is nulled — and resets
  // the reducer to the empty-greeting state. Clearing the session entry is what
  // prevents the mount rehydration from reloading the just-cleared conversation
  // on the next refresh. recentSessions is left intact so the Recent sidebar
  // keeps showing prior threads, and DB rows are untouched (loadable from Recent).
  const newChat = useCallback(() => {
    const clearedSessionId = sessionIdRef.current;
    messagesRef.current = [];
    sessionIdRef.current = null;
    assistantPendingRef.current = false;
    isLoadingRef.current = false;
    clearDraft();
    if (clearedSessionId) clearSession(clearedSessionId);
    dispatch({ type: 'RESET' });
  }, []);

  // Load a previously-fetched session into the conversation (Recent sidebar
  // click). Syncs the engine refs so the next turn continues that session.
  const loadSession = useCallback(
    (id: string) => {
      const session = recentSessions.find(s => s.id === id);
      if (!session) return;
      messagesRef.current = session.messages;
      sessionIdRef.current = session.id;
      dispatch({ type: 'HYDRATE', payload: { messages: session.messages, sessionId: session.id } });
    },
    [recentSessions],
  );

  return (
    <ChatContext.Provider
      value={{ state, dispatch, sendMessage: turn.send, isError: turn.isError, recentSessions, loadSession, newChat }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatStore() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatStore must be used within ChatProvider');
  return ctx;
}
