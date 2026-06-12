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
import { useAuthUser } from '@/services/auth/client';
import { useChatSession } from '@/services/chat/ui/v1/core/useChatSession';
import { reviveUIMessages } from '@/services/chat/ui/v1';
import {
  bufferThread,
  clearDraft,
  clearSession,
  findMostRecentThread,
  readIndex,
  DRAFT_ID,
  type PersistedMessage,
} from '@/services/chat/ui/v1/persistence';
import { createUIMessage } from '@/services/chat/ui/v1/message';
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
  /** True when the visitor is signed in via Clerk. Drives feature gates
   *  (voice, uploads, memory persistence) and sidebar activation. */
  isMember: boolean;
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
  /**
   * Inject a synthetic assistant message carrying an ACCOUNT_CREATE marker so
   * the chat surface renders a MagicLinkCard without a round-trip to the API.
   * Called when a guest deliberately initiates sign-in (e.g. taps "Sign in"
   * in the ChatHeader dropdown).
   */
  dispatchSystemSignal: (signal: string) => void;
  /**
   * Link the current anonymous session to the newly-signed-in user.
   * Called by MagicLinkCard's onSuccess after Clerk authentication completes.
   * No-ops gracefully when no session exists yet. The existing isSignedIn
   * effect handles DB recovery and Recent-sidebar refresh automatically.
   */
  claimCurrentSession: () => Promise<void>;
  /**
   * Sync the members row then claim EVERY anonymous session from this browser's
   * localStorage index. Called by SaveChatCTA after sign-up so the full
   * conversation history is linked — not just the current session.
   * Optional name is written to users.name (column exists on `users`).
   * members table has no name column — name never touches members.
   */
  claimAllSessions: (name?: string) => Promise<void>;
  /**
   * Append a synthetic assistant message to the conversation without a network
   * round-trip. Used after sign-up to confirm membership in-chat.
   */
  injectAssistantMessage: (content: string) => void;
  /**
   * True when the invite gate is active AND the visitor is not an authorized
   * member. Chat UI renders GateView instead of the conversation when true.
   */
  isGated: boolean;
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

// Set true immediately before calling openSignIn / openSignUp so the beforeunload
// handler does not fire a false positive when the OAuth popup opens. Reset to
// false on window focus (popup closed / user returned). Module-level so it is
// shared across all components that open a Clerk modal.
let oauthInProgress = false;
export function setOAuthInProgress(val: boolean): void {
  oauthInProgress = val;
}

export function ChatProvider({
  children,
  gateEnabled = true,
  isAuthorized = false,
  enableExitWarning = false,
}: {
  children: ReactNode;
  /** Whether the invite gate is enabled (from tenant settings). Default: true. */
  gateEnabled?: boolean;
  /** Whether the current visitor is an active member or invite holder. Default: false. */
  isAuthorized?: boolean;
  /** Register the beforeunload exit warning. Pass true only from the chat widget
   *  mount point — never from a landing-page-only context. Default: false. */
  enableExitWarning?: boolean;
}) {
  // Shell state only (sidebar + panel open). Conversation state now lives in the
  // shared session below. The reducer's conversation actions remain defined but
  // are no longer dispatched from here (removed in a follow-up commit).
  const [shellState, dispatch] = useReducer(chatReducer, initialState);
  // Boundary hook — passes the provider's isLoaded/isSignedIn tri-state
  // through verbatim. The recovery effect, wasSignedInRef first-observation
  // guard, and isMember below all depend on isSignedIn staying undefined
  // until isLoaded is true.
  const { isLoaded, isSignedIn } = useAuthUser();
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  // The conversation engine + state, isolated to this provider (no instanceKey).
  const session = useChatSession({});
  const { messages, sessionId, isStreaming, isError, send, sendHidden, hydrate, reset } = session;

  // Latest-value mirror refs, assigned during render, so event handlers
  // (pagehide / beforeunload) and newChat read the current transcript/session
  // synchronously without re-binding listeners.
  const messagesRef = useRef<Message[]>(messages);
  const sessionIdRef = useRef<string | null>(sessionId);
  const isStreamingRef = useRef<boolean>(isStreaming);
  const isSignedInRef = useRef<boolean>(!!isSignedIn);
  messagesRef.current = messages;
  sessionIdRef.current = sessionId;
  isStreamingRef.current = isStreaming;
  isSignedInRef.current = !!isSignedIn;

  // Tracks the last-observed isSignedIn value so the post-sign-in effect only
  // fires on the false→true transition — not on every page load when the user
  // is already signed in. null = Clerk not yet loaded (initial observation
  // pending); false/true = steady state.
  const wasSignedInRef = useRef<boolean | null>(null);

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

  // Rehydrate the most recently buffered thread once the auth provider has
  // loaded — SIGNED-IN ONLY. A signed-out reload starts fresh by design: the
  // buffers stay on disk so the post-sign-in claim flow can still link those
  // sessions (they are cleared after a successful claim), but the
  // conversation is not restored. Signed-in users get the local buffer
  // immediately; the DB-recovery effect below may override it with a strictly
  // newer DB thread (most-recent-wins). Runs once per page load — a
  // mid-session sign-in does not retro-hydrate over a live conversation.
  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (!isLoaded || hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    if (!isSignedIn) return;
    const thread = findMostRecentThread();
    if (!thread || thread.messages.length === 0) return;
    hydrateConversation({
      messages: reviveUIMessages(thread.messages),
      sessionId: thread.sessionId,
    });
  }, [isLoaded, isSignedIn, hydrateConversation]);

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
  // Suppressed for signed-in users (DB recovery covers their history) and when
  // an OAuth popup is opening (the popup triggers beforeunload on the parent
  // window — a false positive). Chrome 119+ needs BOTH preventDefault() and
  // returnValue set. Reads mirror refs so the single mount-time listener always
  // sees current state. Gated on enableExitWarning so landing-page-only contexts
  // never register it.
  useEffect(() => {
    if (!enableExitWarning) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (
        !isSignedInRef.current &&
        !oauthInProgress &&
        (isStreamingRef.current || messagesRef.current.length > 0)
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    // Reset the OAuth flag when the popup closes and the parent window regains focus.
    const onFocus = () => { oauthInProgress = false; };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('focus', onFocus);
    };
  }, [enableExitWarning]);

  // Claim every real session in the localStorage index plus the current in-memory
  // session — WITHOUT touching the members row. Used by the wasSignedIn effect
  // below so session linking happens on every sign-in regardless of entry point,
  // while member creation (pending vs active) stays flow-specific: GateView calls
  // /api/heirloom/members/claim (pending), SaveChatCTA calls claimAllSessions
  // (active via /api/members/sync). Keeping them separate prevents the "sync to
  // active" path from bypassing the invite-gate waitlist.
  const claimSessionsOnly = useCallback(async () => {
    const realIds = readIndex()
      .map(e => e.id)
      .filter(id => id !== DRAFT_ID);
    const currentId = sessionIdRef.current;
    if (currentId && !realIds.includes(currentId)) {
      realIds.push(currentId);
    }
    await Promise.allSettled(
      realIds.map(id =>
        fetch(`/api/sessions/${id}/claim`, { method: 'POST' })
          .then(r => {
            if (!r.ok) console.warn('[heirloom/chat] post-sign-in claim failed:', id, r.status);
            else console.log('[heirloom/chat] post-sign-in claimed session:', id);
          })
          .catch(err => console.error('[heirloom/chat] post-sign-in claim error:', id, err))
      )
    );
  }, []); // reads refs synchronously — no reactive deps needed

  // Claim all browser-local sessions on the false→true isSignedIn transition.
  // The first-observation guard (wasSignedInRef.current === null) means this
  // never fires on page load when the user is already signed in — only on an
  // actual sign-in event during the current page session. Member creation is
  // intentionally excluded (see claimSessionsOnly above).
  useEffect(() => {
    if (!isLoaded) return;
    if (wasSignedInRef.current === null) {
      // First time Clerk reports a definitive state — record it, take no action.
      wasSignedInRef.current = !!isSignedIn;
      return;
    }
    if (isSignedIn && !wasSignedInRef.current) {
      wasSignedInRef.current = true;
      void claimSessionsOnly();
    }
    if (!isSignedIn) {
      // Reset on sign-out so the next sign-in fires again.
      wasSignedInRef.current = false;
    }
  }, [isLoaded, isSignedIn, claimSessionsOnly]);

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

  // Inject a hidden system signal into the API context so the guide responds
  // conversationally (asks for name, eventually emits ACCOUNT_CREATE). The
  // [SYSTEM: ...] message is never added to the store and never renders in the
  // UI — only the guide's reply is visible to the member.
  const dispatchSystemSignal = useCallback((signal: string) => {
    sendHidden(`[SYSTEM: ${signal}]`);
  }, [sendHidden]);

  // Link the current anonymous session to the newly-signed-in user. Called by
  // MagicLinkCard's onSuccess after Clerk auth completes. Idempotent — the
  // route returns 200 if already claimed by the same user. The isSignedIn
  // effect above handles DB recovery + Recent refresh once Clerk updates.
  const claimCurrentSession = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    try {
      const res = await fetch(`/api/sessions/${id}/claim`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[heirloom/chat] session claim failed:', res.status, data);
      } else {
        console.log('[heirloom/chat] session claimed:', id);
      }
    } catch (err) {
      console.error('[heirloom/chat] session claim error:', err);
    }
  }, []);

  // Sync the Heirloom members row, then claim every real session in the
  // localStorage index so the full conversation history is linked to the new
  // user — not just the current session. Fire-and-forget per session; a failed
  // claim on one session does not abort the others.
  const claimAllSessions = useCallback(async (name?: string) => {
    // 1. Create/refresh the members row (email + phone from Clerk).
    // name goes to users.name — members table has no name column.
    await fetch('/api/members/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name ?? null }),
    }).catch(err =>
      console.error('[heirloom/chat] members sync failed:', err)
    );

    // 2. Collect all real session IDs from the localStorage index.
    const realIds = readIndex()
      .map(e => e.id)
      .filter(id => id !== DRAFT_ID);

    // Include the in-memory session in case it hasn't flushed to the index yet.
    const currentId = sessionIdRef.current;
    if (currentId && !realIds.includes(currentId)) {
      realIds.push(currentId);
    }

    await Promise.allSettled(
      realIds.map(id =>
        fetch(`/api/sessions/${id}/claim`, { method: 'POST' })
          .then(r => {
            if (!r.ok) console.warn('[heirloom/chat] claim failed:', id, r.status);
            else console.log('[heirloom/chat] claimed session:', id);
          })
          .catch(err => console.error('[heirloom/chat] claim error:', id, err))
      )
    );

  }, []);

  // Append a synthetic assistant message without a network round-trip. Uses
  // hydrateConversation so prevSessionIdRef stays primed (no spurious draft →
  // session transition) and the buffer-flush effects pick it up naturally.
  const injectAssistantMessage = useCallback(
    (content: string) => {
      const msg: Message = createUIMessage('assistant', content);
      hydrateConversation({
        messages: [...messagesRef.current, msg],
        sessionId: sessionIdRef.current,
      });
    },
    [hydrateConversation],
  );

  // The context state preserves the historical ChatState shape: conversation
  // fields are sourced from the session, shell fields from the reducer.
  // isMember derives directly from Clerk — no local state needed.
  const state: ChatState = {
    messages,
    hasStarted: messages.length > 0,
    isSidebarExpanded: shellState.isSidebarExpanded,
    isLoading: isStreaming,
    isChatOpen: shellState.isChatOpen,
    sessionId,
    isMember: isLoaded && !!isSignedIn,
  };

  return (
    <ChatContext.Provider
      value={{ state, dispatch, sendMessage: send, isError, recentSessions, loadSession, newChat, dispatchSystemSignal, claimCurrentSession, claimAllSessions, injectAssistantMessage, isGated: gateEnabled && !isAuthorized }}
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
