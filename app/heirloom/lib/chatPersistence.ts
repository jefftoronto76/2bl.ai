// app/heirloom/lib/chatPersistence.ts
//
// Client-side localStorage buffering for the Heirloom chat. Best-effort
// durability: every turn is written here as it completes so a refresh or an
// interrupted turn can be recovered without waiting on the DB sync (which only
// lands on turn completion). The DB remains the source of truth — this layer
// is the recovery buffer in front of it.
//
// Multi-thread by design: each thread is stored under its own session key, with
// a lightweight index (id + updatedAt + title) that the (currently empty)
// Recent sidebar can later read. Conversations that have not yet been assigned
// a server session id buffer under a single draft slot, which is cleared once a
// real session id arrives.
//
// Pure module — no React, no store dependency. The store converts between its
// in-memory Message (timestamp: Date) and the PersistedMessage shape here
// (timestamp: ISO string) so this layer stays JSON-serializable and independent.

const KEY_PREFIX = 'heirloom:chat:v1';
export const INDEX_KEY = `${KEY_PREFIX}:index`;
export const DRAFT_KEY = `${KEY_PREFIX}:draft`;
/** Sentinel index id for the not-yet-persisted draft thread. */
export const DRAFT_ID = 'draft';

const TITLE_MAX = 60;

export function sessionKey(sessionId: string): string {
  return `${KEY_PREFIX}:session:${sessionId}`;
}

export interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

export interface PersistedThread {
  /** Null while the thread is still a draft (no server session yet). */
  sessionId: string | null;
  messages: PersistedMessage[];
  /** ISO 8601 timestamp of the last write. */
  updatedAt: string;
}

export interface ThreadIndexEntry {
  /** Server session id, or DRAFT_ID for the unsaved draft thread. */
  id: string;
  /** ISO 8601 timestamp of the thread's last write. */
  updatedAt: string;
  /** First user message, truncated — a label for the Recent list. */
  title?: string;
}

function isStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    // Accessing localStorage can throw in some privacy modes / sandboxed frames.
    return false;
  }
}

function safeGet<T>(key: string): T | null {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded / serialization failure — best-effort, so swallow.
  }
}

function safeRemove(key: string): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

export function readIndex(): ThreadIndexEntry[] {
  const entries = safeGet<ThreadIndexEntry[]>(INDEX_KEY);
  return Array.isArray(entries) ? entries : [];
}

function writeIndex(entries: ThreadIndexEntry[]): void {
  safeSet(INDEX_KEY, entries);
}

function upsertIndexEntry(entry: ThreadIndexEntry): void {
  const entries = readIndex().filter(e => e.id !== entry.id);
  entries.push(entry);
  writeIndex(entries);
}

function removeIndexEntry(id: string): void {
  const entries = readIndex().filter(e => e.id !== id);
  writeIndex(entries);
}

function deriveTitle(messages: PersistedMessage[]): string | undefined {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return undefined;
  const normalized = firstUser.content.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) return undefined;
  return normalized.length > TITLE_MAX ? `${normalized.slice(0, TITLE_MAX - 1)}…` : normalized;
}

/**
 * Write the current thread to localStorage and refresh its index entry. Stores
 * under the session key when a sessionId exists, otherwise the draft slot.
 * No-op when there are no messages, so empty threads never create index noise.
 */
export function bufferThread(messages: PersistedMessage[], sessionId: string | null): void {
  if (!isStorageAvailable() || messages.length === 0) return;

  const updatedAt = new Date().toISOString();
  const thread: PersistedThread = { sessionId, messages, updatedAt };
  const key = sessionId ? sessionKey(sessionId) : DRAFT_KEY;
  const id = sessionId ?? DRAFT_ID;

  safeSet(key, thread);
  upsertIndexEntry({ id, updatedAt, title: deriveTitle(messages) });
}

/**
 * Drop the draft slot and its index entry. Called when a server session id
 * arrives: the thread is re-buffered under its real session key by the next
 * bufferThread call, so the draft would otherwise linger as an orphan and be
 * re-hydrated on the next load.
 */
export function clearDraft(): void {
  safeRemove(DRAFT_KEY);
  removeIndexEntry(DRAFT_ID);
}

/** Load one buffered thread by id (DRAFT_ID resolves to the draft slot). */
export function readThread(id: string): PersistedThread | null {
  const key = id === DRAFT_ID ? DRAFT_KEY : sessionKey(id);
  return safeGet<PersistedThread>(key);
}

/**
 * Return the most recently updated buffered thread, or null when none exist.
 * Used on mount to rehydrate the conversation the visitor was last in.
 */
export function findMostRecentThread(): PersistedThread | null {
  const index = readIndex();
  if (index.length === 0) return null;
  const newest = index.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  return readThread(newest.id);
}
