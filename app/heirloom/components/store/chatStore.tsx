'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useUser } from '@clerk/nextjs';
import { useChatSession } from '@/services/chat/ui/v1/core/useChatSession';
import { reviveUIMessages } from '@/services/chat/ui/v1';
import {
  bufferThread,
  clearDraft,
  clearSession,
  findMostRecentThread,
  type PersistedMessage,
} from '@/services/chat/ui/v1/persistence';
import {
  chatReducer,
  initialState,
  type ChatAction,
  type Message,
} from '@/services/chat/ui/v1/chatReducer';

// The context's conversation+shell state shape. Conversation fields are sourced
// from the shared session, shell fields from the reducer (see ChatProvider) —
// defined here, where the two are composed, rather than in the shell reducer.
export interface ChatState {
  messages: Message[];
  hasStarted: boolean;
  isSidebarExpanded: boolean;
  isLoading: boolean;
  isChatOpen: boolean;
  sessionId: string | null;
}

// Re-export the shell action union + Message so existing consumers keep importing
// them from chatStore. The pure shell reducer lives in chatReducer.ts.
export type { ChatAction, Message };

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
// reviveUIMessages narrows + revives it (incl. legacy ISO timestamps) below.
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

// Bridge the canonical UIMessage (timestamp: number) to the JSON-serializable
// PersistedMessage (timestamp: ISO string) the localStorage buffer stores. Reads
// go through reviveUIMessage(s), which also accept legacy ISO-string timestamps.
function serialize(m: Message): PersistedMessage {
  return { id: m.id, role: m.role, content: m.content, timestamp: new Date(m.timestamp).toISOString() };
}

export function ChatProvider({ children }: { children: ReactNode }) {
  // Shell state only (sidebar + panel open). Conversation state now lives in the
  // shared session below. The reducer's conversation actions remain defined but
  // are no longer dispatched from here (removed in a follow-up commit).
  const [shellState, dispatch] = useReducer(chatReducer, initialState);
  const { isLoaded, isSignedIn } = useUser();
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  // The conversation engine + state, isolated to this provider (no instanceKey).
  const session = useChatSession({});
  const { messages, sessionId, isStreaming, isError, send, hydrate, reset } = session;

  // Latest-value mirror refs, assigned during render, so event handlers
  // (pagehide / beforeunload) and newChat read the current transcript/session
  // synchronously without re-binding listeners.
  const messagesRef = useRef<Message[]>(messages);
  const sessionIdRef = useRef<string | null>(sessionId);
  const isStreamingRef = useRef<boolean>(isStreaming);
  messagesRef.current = messages;
  sessionIdRef.current = sessionId;
  isStreamingRef.current = isStreaming;

  // Last sessionId the buffering effect acted on. Lets clearDraft + re-buffer
  // fire only on a genuine null→id transition (a live send creating a session) —
  // never on every render, and never when hydrate() restores an id (primed in
  // hydrateConversation below).
  const prevSessionIdRef = useRef<string | null>(sessionId);

  // Write the current transcript to localStorage. Reads the mirror ref so a
  // mid-stream flush sees the latest tokens. Drops the empty streaming-assistant
  // placeholder so it is never persisted (it is skipped on render too). No-ops
  // on an empty thread (bufferThread guards length 0).
  const persistCurrent = useCallback(() => {
    const msgs = messagesRef.current.filter(
      m => !(m.role === 'assistant' && m.content === ''),
    );
    bufferThread(msgs.map(serialize), sessionIdRef.current);
  }, []);

  // Hydrate the conversation from a buffer / DB row. Primes prevSessionIdRef so
  // the sessionId effect does NOT treat a restored session id as a new draft→
  // session transition — which would needlessly clearDraft + re-buffer, bumping
  // updatedAt and breaking most-recent-wins recovery.
  const hydrateConversation = useCallback(
    (input: { messages: Message[]; sessionId: string | null }) => {
      prevSessionIdRef.current = input.sessionId;
      hydrate(input);
    },
    [hydrate],
  );

  // Buffer on TURN BOUNDARIES only — keyed on isStreaming, never on messages, so
  // there is no per-token localStorage thrash. Fires on turn start (false→true:
  // the user message is present → recoverable if the reply is interrupted) and
  // turn finish (true→false: final assistant content). hydrate() does not touch
  // isStreaming, so restoring a thread never triggers a write here.
  useEffect(() => {
    persistCurrent();
  }, [isStreaming, persistCurrent]);

  // When a real session id arrives mid-turn (engine lazy-create), drop the orphan
  // draft slot and re-buffer under the session key. Guarded by a prev-value
  // compare so it fires only on an actual transition — not on every render, and
  // not when hydrate() restored the id (prevSessionIdRef was primed to match).
  useEffect(() => {
    if (sessionId === prevSessionIdRef.current) return;
    prevSessionIdRef.current = sessionId;
    if (sessionId) {
      clearDraft();
      persistCurrent();
    }
  }, [sessionId, persistCurrent]);

  // Rehydrate the most recently buffered thread on mount so a refresh restores
  // the conversation. hydrateConversation is stable → runs once.
  useEffect(() => {
    const thread = findMostRecentThread();
    if (!thread || thread.messages.length === 0) return;
    hydrateConversation({
      messages: reviveUIMessages(thread.messages),
      sessionId: thread.sessionId,
    });
  }, [hydrateConversation]);

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
  // never clobbers a fresher local thread). Anonymous users skip this entirely.
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

        hydrateConversation({ messages: newest.messages, sessionId: newest.id });
      } catch (err) {
        console.error('[heirloom/chat] DB session recovery failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, hydrateConversation]);

  // Warn before leaving while a turn is in flight or any conversation exists.
  // The condition is deliberately broad: anonymous visitors have no cross-device
  // DB recovery yet, so an existing thread is treated as unsaved on leave. Chrome
  // 119+ needs BOTH preventDefault() and returnValue set. Reads the mirror refs
  // so the single mount-time listener always sees current state.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isStreamingRef.current || messagesRef.current.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Start a fresh conversation (Sidebar "New Chat"). Drops the active thread's
  // localStorage entries — both the pre-session draft slot AND the current
  // session-keyed entry (captured before reset) — so the next mount does not
  // re-hydrate the just-cleared conversation, then resets the session. Shell
  // state (sidebar/panel) is preserved; recentSessions + DB rows are untouched.
  const newChat = useCallback(() => {
    const cleared = sessionIdRef.current;
    clearDraft();
    if (cleared) clearSession(cleared);
    prevSessionIdRef.current = null;
    reset();
  }, [reset]);

  // Load a previously-fetched session into the conversation (Recent sidebar).
  const loadSession = useCallback(
    (id: string) => {
      const found = recentSessions.find(s => s.id === id);
      if (!found) return;
      hydrateConversation({ messages: found.messages, sessionId: found.id });
    },
    [recentSessions, hydrateConversation],
  );

  // The context state preserves the historical ChatState shape: conversation
  // fields are sourced from the session, shell fields from the reducer.
  const state: ChatState = {
    messages,
    hasStarted: messages.length > 0,
    isSidebarExpanded: shellState.isSidebarExpanded,
    isLoading: isStreaming,
    isChatOpen: shellState.isChatOpen,
    sessionId,
  };

  return (
    <ChatContext.Provider
      value={{ state, dispatch, sendMessage: send, isError, recentSessions, loadSession, newChat }}
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
