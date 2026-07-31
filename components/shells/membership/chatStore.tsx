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
import { createClient } from '@/services/auth/supabase';
import type { MediaItem } from '@/services/media/types';
import type { MediaAttachmentInput } from '@/services/chat/server/types';
import type { ChatErrorType } from '@/services/chat/ui/v1/types';

// Client-only extension — localPreviewUrl is never persisted to the DB.
export type ClientMediaItem = MediaItem & { localPreviewUrl?: string };
import { useChatSession } from '@/services/chat/ui/v1/core/useChatSession';
import { reviveUIMessages } from '@/services/chat/ui/v1';
import {
  clearDraft,
  clearSession,
  findMostRecentThread,
  readIndex,
  DRAFT_ID,
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
  starred: boolean;
  /** Count of published (kept) memories anchored to this session — see services/crm/sessions.ts. */
  memoryCount: number;
}

interface ChatContextType {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  sendMessage: (content: string) => Promise<void>;
  /** Classified reason the most recent turn failed, or null when it succeeded. */
  errorType: ChatErrorType | null;
  /** Re-runs the last turn (assistant-reply error retry, and per-message
   *  delivery-status retry on a failed user message — see useChatTurn). */
  retry: () => Promise<void>;
  /** Aborts the in-flight turn, keeping whatever content already streamed in. */
  stop: () => void;
  /** Re-generates one assistant message — see useChatTurn.ts `regenerate`. */
  regenerate: (messageId: string) => Promise<void>;
  /** Switches the displayed `versions` entry for a message — see useChatTurn.ts. */
  setActiveVersion: (messageId: string, versionIdx: number) => void;
  /** Edits + re-delivers a user message, truncating everything after it — see useChatTurn.ts. */
  editMessage: (messageId: string, text: string) => Promise<void>;
  /** Re-delivers a user message unchanged, truncating everything after it — see useChatTurn.ts. */
  resendMessage: (messageId: string) => Promise<void>;
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
  /** Name set by the admin at invite creation time. Null when not set. */
  invitedName: string | null;
  /** True when the visitor arrived with an invite token in the URL. */
  hasInviteToken: boolean;
  /** True when the signed-in member has role 'admin' or 'owner' on this tenant. */
  isAdmin: boolean;
  /** Raw invite token from the URL — present only when the visitor arrived via
   *  an unused invite link. Null after sign-in (consumed). Passed to
   *  MagicLinkCard so it can write it to Clerk unsafeMetadata on sign-up. */
  inviteToken: string | null;
  /** Toggle the starred flag for a session. Optimistic — reverts on API failure. */
  starSession: (id: string) => Promise<void>;
  /** Rename a session. No-op on empty/whitespace title. Optimistic — reverts on failure. */
  renameSession: (id: string, title: string) => Promise<void>;
  /** Soft-delete a session (sets status=deleted). Removes from recentSessions. Optimistic. */
  deleteSession: (id: string) => Promise<void>;
  /**
   * Adjusts a session's memoryCount in the local recentSessions cache by
   * `delta` — purely a local reconciliation, no network call, since the
   * actual write already happened via the memories API (services/crm/memories.ts).
   * Called by MessageList after Keep/Discard so the sidebar badge (SidebarV2)
   * doesn't wait for the next full /api/sessions refetch to reflect it.
   */
  bumpMemoryCount: (id: string, delta: number) => void;
  /** Media items associated with the current chat session. Populated by Realtime
   *  subscription + catch-up query on session load. */
  mediaItems: ClientMediaItem[];
  /** Register a newly-uploaded pending item so the UI can show a processing chip
   *  before the background job starts. Upserts by id. For images, pass
   *  localPreviewUrl (a blob: URL from URL.createObjectURL) for instant preview. */
  addMediaItem: (item: ClientMediaItem) => void;
}

// Shape returned by GET /api/sessions. `messages` is opaque jsonb over the wire;
// reviveUIMessages narrows + revives it (incl. legacy ISO timestamps) below.
interface ApiSession {
  id: string;
  messages: unknown;
  updated_at: string;
  visitor_name: string | null;
  title: string | null;
  starred: boolean;
  memory_count: number;
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
  // Use the DB-stored title when available; fall back to the derived title for
  // sessions that pre-date AI title generation or whose title hasn't been set yet.
  const title = row.title?.trim() || deriveSessionTitle(row.visitor_name, messages);
  return {
    id: row.id,
    updatedAt: row.updated_at,
    messages,
    title,
    starred: row.starred ?? false,
    memoryCount: row.memory_count ?? 0,
  };
}

const ChatContext = createContext<ChatContextType | null>(null);

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
  gateEnabled = false,
  isAuthorized = false,
  isAdmin = false,
  enableExitWarning = false,
  invitedName = null,
  hasInviteToken = false,
  inviteToken,
  autoOpenChat = false,
  memberId,
}: {
  children: ReactNode;
  /** Whether the invite gate is enabled (from tenant settings). Default: false. */
  gateEnabled?: boolean;
  /** Whether the current visitor is an active member or invite holder. Default: false. */
  isAuthorized?: boolean;
  /** True when the signed-in member has role 'admin' or 'owner' on this tenant. Default: false. */
  isAdmin?: boolean;
  /** Register the beforeunload exit warning. Pass true only from the chat widget
   *  mount point — never from a landing-page-only context. Default: false. */
  enableExitWarning?: boolean;
  /** Name set by the admin at invite creation. Null when not set. */
  invitedName?: string | null;
  /** True when the visitor arrived with an invite token in the URL. */
  hasInviteToken?: boolean;
  /** Raw invite token — present only when the visitor arrived via an unused
   *  token. Stored in a ref (not state) and consumed once on the false→true
   *  isSignedIn transition to call the accept endpoint. */
  inviteToken?: string;
  /** When true, open the chat panel immediately on mount. Sourced from
   *  members.auto_open on the invite row. Default: false. */
  autoOpenChat?: boolean;
  /** Supabase members.id for the pre-auth invite holder — lets getMemberPrimer
   *  look up the member directly without chat_sessions.user_id. Only set for
   *  guests who haven't signed in yet. */
  memberId?: string;
}) {
  // Shell state only (sidebar + panel open). Conversation state now lives in the
  // shared session below. The reducer's conversation actions remain defined but
  // are no longer dispatched from here (removed in a follow-up commit).
  const [shellState, dispatch] = useReducer(chatReducer, initialState);

  // Auto-open the chat panel when the invite was created with auto_open=true.
  // Runs once on mount only — the empty dep array is intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (autoOpenChat) {
      dispatch({ type: 'OPEN_CHAT' });
    }
  }, []);
  // Boundary hook — passes the provider's isLoaded/isSignedIn tri-state
  // through verbatim. The recovery effect, wasSignedInRef first-observation
  // guard, and isMember below all depend on isSignedIn staying undefined
  // until isLoaded is true.
  const { isLoaded, isSignedIn } = useAuthUser();
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  // The conversation engine + state, isolated to this provider (no instanceKey).
  // persistNamespace: 'heirloom' opts into the shared core's IndexedDB
  // persistence (turn-boundary buffering, pagehide flush, unconditional
  // mount-time rehydration — no signed-in gate; see core/useChatSession.ts).
  const session = useChatSession({
    getMemberId: () => memberIdRef.current,
    getInviteToken: () => inviteTokenRef.current,
    getMediaItems: (): MediaAttachmentInput[] => mediaItemsRef.current.map(m => ({
      mediaItemId: m.id,
      type: m.type,
      filename: m.original_filename,
    })),
    persistNamespace: 'heirloom',
  });
  const {
    messages,
    sessionId,
    isStreaming,
    errorType,
    send,
    sendHidden,
    retry,
    stop,
    regenerate,
    setActiveVersion,
    editMessage,
    resendMessage,
    hydrate,
    reset,
  } = session;

  // Latest-value mirror refs, assigned during render, so event handlers
  // (pagehide / beforeunload) and newChat read the current transcript/session
  // synchronously without re-binding listeners.
  const messagesRef = useRef<Message[]>(messages);

  // Fire the auto-greeting once when the invite was created with auto_open=true
  // and there is no existing conversation. Waits for auth to load, then defers
  // 350ms so localStorage/DB hydration effects (which also trigger on isLoaded)
  // have time to complete and re-render before we check messagesRef.current.
  const autoGreetSentRef = useRef(false);
  useEffect(() => {
    if (!autoOpenChat || !isLoaded || autoGreetSentRef.current) return;
    const timer = setTimeout(() => {
      if (autoGreetSentRef.current) return;
      if (messagesRef.current.length > 0) return; // returning member with history
      autoGreetSentRef.current = true;
      void sendHidden('Hi');
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenChat, isLoaded]);
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

  // Stable ref for the invite token — must not change across renders so the
  // wasSignedIn effect closure always reads the original value from page load.
  const inviteTokenRef = useRef<string | null>(inviteToken ?? null);

  // Stable ref for the pre-auth member id — threaded into every /api/sage
  // request so getMemberPrimer can look up the primer without user_id.
  const memberIdRef = useRef<string | null>(memberId ?? null);

  // Ref mirror for mediaItems state — updated every render so the getMediaItems
  // closure passed to useChatSession always reads the current array without
  // needing to be recreated (same pattern as memberIdRef above).
  const mediaItemsRef = useRef<ClientMediaItem[]>([]);

  // Tracks the sessionId this component last observed, so the recentSessions-
  // immediate-add effect below fires only on a genuine transition — not on
  // every render, and not when hydrate() restores an id (primed in
  // hydrateConversation below). IndexedDB persistence itself (buffering,
  // draft re-keying, mount-time rehydration, pagehide flush) is now owned
  // entirely by the shared core (persistNamespace: 'heirloom' above) — this
  // ref exists only to drive the Recent-sidebar bookkeeping below.
  const prevSessionIdRef = useRef<string | null>(sessionId);

  // Hydrate the conversation from a DB row / Recent-sidebar entry. Primes
  // prevSessionIdRef so the recentSessions-immediate-add effect does NOT treat
  // a restored session id as a newly-created one.
  const hydrateConversation = useCallback(
    (input: { messages: Message[]; sessionId: string | null }) => {
      prevSessionIdRef.current = input.sessionId;
      hydrate(input);
    },
    [hydrate],
  );

  // Add a newly-created session to the Recent sidebar immediately (mid-turn),
  // rather than waiting for the reply to finish streaming (the "turn finishes"
  // effect further down also covers it, but this makes it feel instant).
  // Guarded on isStreamingRef.current — true only while a live send() is in
  // flight — because the core's own mount-time rehydration is now
  // unconditional (see persistNamespace above) and invisible to this
  // component: a restored session id also transitions sessionId from null to
  // a real id, and without this guard it would be misfiled here as "just
  // created" with a fabricated title/timestamp instead of a real restore.
  useEffect(() => {
    if (sessionId === prevSessionIdRef.current) return;
    prevSessionIdRef.current = sessionId;
    if (sessionId && isStreamingRef.current) {
      const msgs = messagesRef.current.filter(
        m => !(m.role === 'assistant' && m.content === ''),
      );
      if (msgs.length > 0) {
        setRecentSessions(prev => {
          if (prev.some(s => s.id === sessionId)) return prev;
          return [
            {
              id: sessionId,
              title: deriveSessionTitle(null, msgs),
              updatedAt: new Date().toISOString(),
              messages: msgs,
              starred: false,
              memoryCount: 0,
            },
            ...prev,
          ];
        });
      }
    }
  }, [sessionId]);

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
        const local = await findMostRecentThread('heirloom');
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

  // Reactive Recent list: when a turn finishes (isStreaming true→false) while
  // signed in, upsert the live thread into recentSessions so the sidebar
  // reflects the new/updated session without a reload. Local upsert only — no
  // GET /api/sessions refetch here: the engine fires the transcript PATCH
  // fire-and-forget AFTER setStreaming(false), so an immediate refetch would
  // race the write. The DB fetch on the next load reconciles (titles gain
  // visitor_name there when the server captured one).
  const prevIsStreamingRef = useRef(false);
  // Tracks sessions that have had an AI title generated so the effect never
  // fires twice for the same session across re-renders.
  const aiTitledIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const finished = prevIsStreamingRef.current && !isStreaming;
    prevIsStreamingRef.current = isStreaming;
    if (!finished || !isSignedInRef.current) return;
    const id = sessionIdRef.current;
    if (!id) return;
    // Never store the empty streaming placeholder (or the error-cleared
    // assistant message) into the Recent entry.
    const msgs = messagesRef.current.filter(
      m => !(m.role === 'assistant' && m.content === ''),
    );
    if (msgs.length === 0) return;
    // Preserve the starred state and memory count for an existing session in
    // the list — this update only refreshes messages/title/timestamp after a
    // turn, it doesn't touch memories.
    const existing = recentSessions.find(s => s.id === id);
    setRecentSessions(prev => [
      {
        id,
        title: deriveSessionTitle(null, msgs),
        updatedAt: new Date().toISOString(),
        messages: msgs,
        starred: existing?.starred ?? false,
        memoryCount: existing?.memoryCount ?? 0,
      },
      ...prev.filter(s => s.id !== id),
    ]);

    // AI title generation — first turn only (1 user + 1 assistant message).
    // Fire-and-forget: any failure leaves the derived title in place.
    if (msgs.length === 2 && !aiTitledIdsRef.current.has(id)) {
      aiTitledIdsRef.current.add(id);
      const firstUserMsg = msgs.find(m => m.role === 'user');
      const firstAssistantMsg = msgs.find(m => m.role === 'assistant');
      const firstUserMessage = firstUserMsg?.content.trim() ?? '';
      const firstAssistantText = (firstAssistantMsg?.content ?? '').slice(0, 200).trim();
      if (firstUserMessage) {
        console.log('[heirloom/title] triggered:', id);
        fetch(`/api/sessions/${id}/title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstUserMessage, firstAssistantText }),
        })
          .then(r => r.json())
          .then((data: { title?: string | null }) => {
            if (data.title) {
              console.log('[heirloom/title] received:', id, '|', data.title);
              setRecentSessions(prev =>
                prev.map(s => s.id === id ? { ...s, title: data.title! } : s),
              );
            }
          })
          .catch(err => console.error('[heirloom/title] fetch failed:', id, err));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

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
    const realIds = (await readIndex('heirloom'))
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
            if (!r.ok) {
              console.warn('[heirloom/chat] post-sign-in claim failed:', id, r.status);
            } else {
              console.log('[heirloom/chat] post-sign-in claimed session:', id);
              // Claimed → the DB owns it (recovery + Recent sidebar); drop the
              // local buffer entry so localStorage is clean after sign-in. A
              // failed claim keeps its entry for the next attempt.
              void clearSession('heirloom', id);
            }
          })
          .catch(err => console.error('[heirloom/chat] post-sign-in claim error:', id, err))
      )
    );
    // The draft slot has no server session — nothing to claim; drop it too.
    void clearDraft('heirloom');
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
      if (inviteTokenRef.current) {
        void fetch('/api/heirloom/invites/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteTokenRef.current }),
        }).catch(err => console.error('[heirloom/chat] invite accept failed:', err));
      }
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
    void clearDraft('heirloom');
    if (cleared) void clearSession('heirloom', cleared);
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
    const realIds = (await readIndex('heirloom'))
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
            if (!r.ok) {
              console.warn('[heirloom/chat] claim failed:', id, r.status);
            } else {
              console.log('[heirloom/chat] claimed session:', id);
              // Claimed → DB-owned; drop the local buffer entry (see
              // claimSessionsOnly). Failed claims keep theirs.
              void clearSession('heirloom', id);
            }
          })
          .catch(err => console.error('[heirloom/chat] claim error:', id, err))
      )
    );
    // The draft slot has no server session — nothing to claim; drop it too.
    void clearDraft('heirloom');
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

  // ── Kebab action mutations ──────────────────────────────────────────────────

  const starSession = useCallback(async (id: string) => {
    const prev = recentSessions.find(s => s.id === id);
    if (!prev) return;
    const newStarred = !prev.starred;
    // Optimistic update
    setRecentSessions(sessions =>
      sessions.map(s => s.id === id ? { ...s, starred: newStarred } : s),
    );
    console.log('[heirloom/session] star:', id, newStarred);
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: newStarred }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.error('[heirloom/session] star failed:', id, err);
      // Revert
      setRecentSessions(sessions =>
        sessions.map(s => s.id === id ? { ...s, starred: prev.starred } : s),
      );
    }
  }, [recentSessions]);

  const bumpMemoryCount = useCallback((id: string, delta: number) => {
    setRecentSessions(sessions =>
      sessions.map(s => s.id === id ? { ...s, memoryCount: Math.max(0, s.memoryCount + delta) } : s),
    );
  }, []);

  const renameSession = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const prev = recentSessions.find(s => s.id === id);
    if (!prev) return;
    // Optimistic update
    setRecentSessions(sessions =>
      sessions.map(s => s.id === id ? { ...s, title: trimmed } : s),
    );
    console.log('[heirloom/session] rename:', id, trimmed);
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.error('[heirloom/session] rename failed:', id, err);
      // Revert
      setRecentSessions(sessions =>
        sessions.map(s => s.id === id ? { ...s, title: prev.title } : s),
      );
    }
  }, [recentSessions]);

  const deleteSession = useCallback(async (id: string) => {
    const prevSessions = recentSessions;
    // Optimistic removal
    setRecentSessions(sessions => sessions.filter(s => s.id !== id));
    // If this is the active conversation, start fresh
    if (sessionIdRef.current === id) {
      newChat();
    }
    console.log('[heirloom/session] delete:', id);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.error('[heirloom/session] delete failed:', id, err);
      // Revert — restore removed session at its original position
      setRecentSessions(prevSessions);
    }
  }, [recentSessions, newChat]);

  // ── Media items — Realtime subscription + catch-up hydration ──────────────
  const [mediaItems, setMediaItems] = useState<ClientMediaItem[]>([]);
  // Keep the ref current so getMediaItems (passed to useChatSession above) always
  // reads the latest value without the closure needing to be recreated each render.
  mediaItemsRef.current = mediaItems;

  const addMediaItem = useCallback((item: ClientMediaItem) => {
    setMediaItems(prev => {
      const idx = prev.findIndex(m => m.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        // Preserve localPreviewUrl when updating an existing item (Realtime
        // updates won't carry it — keep the one set on initial upload).
        next[idx] = { localPreviewUrl: prev[idx].localPreviewUrl, ...item };
        return next;
      }
      return [...prev, item];
    });
  }, []);

  // Catch-up: on session load, fetch any items whose Realtime completion event
  // was missed (tab closed during processing). Runs whenever sessionId changes.
  useEffect(() => {
    if (!sessionId || !isSignedIn) return;
    let cancelled = false;
    fetch(`/api/media?chat_id=${sessionId}&status=ready,failed`)
      .then(r => r.json())
      .then((data: { items?: MediaItem[] }) => {
        if (!cancelled && Array.isArray(data.items) && data.items.length > 0) {
          setMediaItems(prev => {
            const merged = [...prev];
            for (const item of data.items!) {
              const idx = merged.findIndex(m => m.id === item.id);
              if (idx >= 0) merged[idx] = item;
              else merged.push(item);
            }
            return merged;
          });
        }
      })
      .catch(err => console.error('[heirloom/chat] media catch-up failed:', err));
    return () => { cancelled = true; };
  }, [sessionId, isSignedIn]);

  // Realtime subscription: listen for media_items UPDATE events on this chat.
  // Requires `supabase_realtime` publication enabled on media_items in Studio.
  useEffect(() => {
    if (!sessionId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`media-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'media_items',
          filter: `chat_id=eq.${sessionId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const item = payload.new as unknown as MediaItem;
          if (item.status === 'ready' || item.status === 'failed') {
            addMediaItem(item);
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [sessionId, addMediaItem]);

  // Polling fallback for pending media items: poll the API every 3 s while
  // any item is still pending or processing. Realtime postgres_changes would
  // be cleaner but requires RLS SELECT access — since Heirloom authenticates
  // via Clerk rather than Supabase Auth, auth.uid() is always null and the
  // subscription silently receives no events. The API route uses the service-
  // role client so it bypasses RLS. The effect re-runs whenever mediaItems
  // changes, creating a self-regulating loop that stops automatically once
  // all items are ready or failed.
  useEffect(() => {
    if (!sessionId || !isSignedIn) return;
    const hasPending = mediaItems.some(
      (m) => m.status === 'pending' || m.status === 'processing',
    );
    if (!hasPending) return;

    const timer = setTimeout(() => {
      fetch(`/api/media?chat_id=${sessionId}&status=ready,failed`)
        .then((r) => r.json())
        .then((data: { items?: MediaItem[] }) => {
          if (!Array.isArray(data.items) || data.items.length === 0) return;
          setMediaItems((prev) => {
            const merged = [...prev];
            for (const item of data.items!) {
              const idx = merged.findIndex((m) => m.id === item.id);
              if (idx >= 0) {
                merged[idx] = { localPreviewUrl: merged[idx].localPreviewUrl, ...item };
              } else {
                merged.push(item);
              }
            }
            return merged;
          });
        })
        .catch((err) =>
          console.error('[heirloom/chat] media status poll failed:', err),
        );
    }, 3000);

    return () => clearTimeout(timer);
  }, [sessionId, isSignedIn, mediaItems]);

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
      value={{ state, dispatch, sendMessage: send, errorType, retry, stop, regenerate, setActiveVersion, editMessage, resendMessage, recentSessions, loadSession, newChat, dispatchSystemSignal, claimCurrentSession, claimAllSessions, injectAssistantMessage, isGated: gateEnabled && !isAuthorized, invitedName, hasInviteToken, isAdmin, inviteToken: inviteTokenRef.current, starSession, renameSession, deleteSession, bumpMemoryCount, mediaItems, addMediaItem }}
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
