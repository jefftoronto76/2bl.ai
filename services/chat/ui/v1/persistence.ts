// services/chat/ui/v1/persistence.ts
//
// Client-side IndexedDB buffering, shared by both chat surfaces (Heirloom
// membership + jefflougheed widget). Each surface gets its own isolated
// database, selected via the `namespace` argument every function takes:
// 'heirloom' -> the `heirloom:chat:v1` database, 'sage' -> `sage:chat:v1`.
// Best-effort durability: every turn is buffered here as it completes.
//
// Multi-thread by design: each thread lives in the `threads` store keyed by
// its session id (or DRAFT_ID for a thread with no server session yet), with
// a lightweight `threadIndex` store (id + updatedAt + title) that the Recent
// sidebar can read without loading full transcripts.
//
// Pure module — no React, no store dependency. The store converts between its
// in-memory Message (timestamp: Date) and the PersistedMessage shape here
// (timestamp: ISO string) so this layer stays JSON-serializable and independent.
//
// Rehydration/retention POLICY (when to read this back, when to clear it) is
// deliberately NOT this module's concern — it lives in the caller (today,
// core/useChatSession.ts). This module only offers the storage primitives.

import { openDB, type IDBPDatabase } from 'idb';
import type { UIMessage } from './types';
import { titleSourceFromContent } from './mediaMarkerPatterns';

export type PersistenceNamespace = 'heirloom' | 'sage';

const DB_NAMES: Record<PersistenceNamespace, string> = {
  heirloom: 'heirloom:chat:v1',
  sage: 'sage:chat:v1',
};

const THREADS_STORE = 'threads';
const INDEX_STORE = 'threadIndex';
const DB_VERSION = 1;

/** Sentinel index id for the not-yet-persisted draft thread. */
export const DRAFT_ID = 'draft';

const TITLE_MAX = 60;

export interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Delivery state of a user message's send attempt — see UIMessage.status. */
  status?: 'sending' | 'sent' | 'failed';
  /** True if the user hit Stop mid-stream for this assistant message. */
  stopped?: boolean;
  /** Regenerated reply variants, oldest first — see UIMessage.versions. */
  versions?: string[];
  /** Index into `versions` of the currently-displayed version. */
  versionIdx?: number;
  /** True once this user message has been edited and resent. */
  edited?: boolean;
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

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch {
    // Accessing indexedDB can throw in some privacy modes / sandboxed frames.
    return false;
  }
}

// One open connection per namespace, memoized so repeated calls don't reopen
// the database. A failed open clears its cache entry so a later call retries
// rather than replaying the same rejected promise forever.
const dbPromises = new Map<PersistenceNamespace, Promise<IDBPDatabase>>();

function getDB(namespace: PersistenceNamespace): Promise<IDBPDatabase> | null {
  if (!isIndexedDBAvailable()) return null;
  let promise = dbPromises.get(namespace);
  if (!promise) {
    promise = openDB(DB_NAMES[namespace], DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(THREADS_STORE)) {
          db.createObjectStore(THREADS_STORE);
        }
        if (!db.objectStoreNames.contains(INDEX_STORE)) {
          db.createObjectStore(INDEX_STORE, { keyPath: 'id' });
        }
      },
    });
    promise.catch(() => dbPromises.delete(namespace));
    dbPromises.set(namespace, promise);
  }
  return promise;
}

/**
 * Narrow a canonical UIMessage down to the JSON-serializable PersistedMessage
 * shape this buffer stores, converting the epoch-ms timestamp to ISO 8601.
 * status/stopped/versions/versionIdx/edited round-trip as-is — reconciling
 * any in-flight-looking state (e.g. a message still 'sending') back to a
 * settled state is the revive side's job (see reviveUIMessage in message.ts),
 * not this write path's.
 */
export function toPersistedMessage(message: UIMessage): PersistedMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp).toISOString(),
    ...(message.status !== undefined ? { status: message.status } : {}),
    ...(message.stopped !== undefined ? { stopped: message.stopped } : {}),
    ...(message.versions !== undefined ? { versions: message.versions } : {}),
    ...(message.versionIdx !== undefined ? { versionIdx: message.versionIdx } : {}),
    ...(message.edited !== undefined ? { edited: message.edited } : {}),
  };
}

export function toPersistedMessages(messages: UIMessage[]): PersistedMessage[] {
  return messages.map(toPersistedMessage);
}

function deriveTitle(messages: PersistedMessage[]): string | undefined {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return undefined;
  // titleSourceFromContent strips [MEDIA_UPLOAD: ...] and friends first — a
  // media-only first message (no typed caption) used to index this thread
  // under its raw bracket marker text verbatim. Same underlying issue as
  // chatStore.tsx's deriveSessionTitle (DB-backed sessions); this is the
  // shared local-thread-index path both chat surfaces read the Recent list
  // labels from.
  const normalized = titleSourceFromContent(firstUser.content).replace(/\s+/g, ' ');
  if (normalized.length === 0) return undefined;
  return normalized.length > TITLE_MAX ? `${normalized.slice(0, TITLE_MAX - 1)}…` : normalized;
}

/**
 * Write the current thread to IndexedDB and refresh its index entry, in one
 * transaction. Stores under the session id when one exists, otherwise the
 * draft slot (DRAFT_ID). No-op when there are no messages, so empty threads
 * never create index noise.
 */
export async function bufferThread(
  namespace: PersistenceNamespace,
  messages: PersistedMessage[],
  sessionId: string | null,
): Promise<void> {
  if (messages.length === 0) return;
  const dbPromise = getDB(namespace);
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    const updatedAt = new Date().toISOString();
    const id = sessionId ?? DRAFT_ID;
    const thread: PersistedThread = { sessionId, messages, updatedAt };
    const entry: ThreadIndexEntry = { id, updatedAt, title: deriveTitle(messages) };
    const tx = db.transaction([THREADS_STORE, INDEX_STORE], 'readwrite');
    tx.objectStore(THREADS_STORE).put(thread, id);
    tx.objectStore(INDEX_STORE).put(entry);
    await tx.done;
  } catch {
    // Quota exceeded / serialization failure / DB unavailable — best-effort, swallow.
  }
}

/**
 * Drop the draft slot and its index entry. Called when a server session id
 * arrives: the thread is re-buffered under its real session id by the next
 * bufferThread call, so the draft would otherwise linger as an orphan and be
 * re-hydrated on the next load.
 */
export async function clearDraft(namespace: PersistenceNamespace): Promise<void> {
  const dbPromise = getDB(namespace);
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    const tx = db.transaction([THREADS_STORE, INDEX_STORE], 'readwrite');
    tx.objectStore(THREADS_STORE).delete(DRAFT_ID);
    tx.objectStore(INDEX_STORE).delete(DRAFT_ID);
    await tx.done;
  } catch {
    // best-effort
  }
}

/**
 * Drop a session-keyed thread and its index entry. Called by New Chat: once a
 * conversation has had a completed turn it lives under its real session id
 * (not the draft slot), so clearDraft alone leaves it behind to be re-hydrated
 * on the next mount. Removing the session entry is what actually clears the
 * conversation for good. Mirrors clearDraft for the post-session case.
 */
export async function clearSession(namespace: PersistenceNamespace, sessionId: string): Promise<void> {
  const dbPromise = getDB(namespace);
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    const tx = db.transaction([THREADS_STORE, INDEX_STORE], 'readwrite');
    tx.objectStore(THREADS_STORE).delete(sessionId);
    tx.objectStore(INDEX_STORE).delete(sessionId);
    await tx.done;
  } catch {
    // best-effort
  }
}

/**
 * Drop every buffered transcript while KEEPING the session index. Existing
 * callers use this so the index ids survive for a later claim flow even
 * though the transcript content is scrubbed. The draft slot is dropped
 * entirely (transcript + index entry): it has no server session, so it is
 * not claimable.
 */
export async function clearTranscripts(namespace: PersistenceNamespace): Promise<void> {
  const dbPromise = getDB(namespace);
  if (dbPromise) {
    try {
      const db = await dbPromise;
      const entries = await db.getAll(INDEX_STORE) as ThreadIndexEntry[];
      const tx = db.transaction(THREADS_STORE, 'readwrite');
      for (const entry of entries) {
        if (entry.id === DRAFT_ID) continue;
        tx.objectStore(THREADS_STORE).delete(entry.id);
      }
      await tx.done;
    } catch {
      // best-effort
    }
  }
  await clearDraft(namespace);
}

/** Load one buffered thread by id (DRAFT_ID resolves to the draft slot). */
export async function readThread(namespace: PersistenceNamespace, id: string): Promise<PersistedThread | null> {
  const dbPromise = getDB(namespace);
  if (!dbPromise) return null;
  try {
    const db = await dbPromise;
    const thread = await db.get(THREADS_STORE, id) as PersistedThread | undefined;
    return thread ?? null;
  } catch {
    return null;
  }
}

export async function readIndex(namespace: PersistenceNamespace): Promise<ThreadIndexEntry[]> {
  const dbPromise = getDB(namespace);
  if (!dbPromise) return [];
  try {
    const db = await dbPromise;
    const entries = await db.getAll(INDEX_STORE) as ThreadIndexEntry[];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

/**
 * Return the most recently updated buffered thread, or null when none exist.
 * Used on mount to rehydrate the conversation the visitor was last in.
 */
export async function findMostRecentThread(namespace: PersistenceNamespace): Promise<PersistedThread | null> {
  const index = await readIndex(namespace);
  if (index.length === 0) return null;
  const newest = index.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  return readThread(namespace, newest.id);
}

/**
 * Test-only: closes and deletes the IndexedDB database for a namespace so
 * each test starts from a clean slate. Mirrors the `__reset*` test-helper
 * pattern in core/store-registry.ts.
 */
export async function __resetPersistenceForTests(namespace: PersistenceNamespace): Promise<void> {
  const existing = dbPromises.get(namespace);
  dbPromises.delete(namespace);
  if (existing) {
    try {
      const db = await existing;
      db.close();
    } catch {
      // ignore — nothing to close if the open itself failed
    }
  }
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAMES[namespace]);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
