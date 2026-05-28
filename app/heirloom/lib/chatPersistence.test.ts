import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bufferThread,
  clearDraft,
  readThread,
  readIndex,
  findMostRecentThread,
  sessionKey,
  DRAFT_KEY,
  DRAFT_ID,
  INDEX_KEY,
  type PersistedMessage,
} from './chatPersistence';

function msg(role: 'user' | 'assistant', content: string): PersistedMessage {
  return { id: crypto.randomUUID(), role, content, timestamp: '2026-05-28T00:00:00.000Z' };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bufferThread', () => {
  it('writes a pre-session thread to the draft slot and indexes it', () => {
    bufferThread([msg('user', 'Hello there')], null);

    const draft = readThread(DRAFT_ID);
    expect(draft).not.toBeNull();
    expect(draft?.sessionId).toBeNull();
    expect(draft?.messages).toHaveLength(1);
    expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();

    const index = readIndex();
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe(DRAFT_ID);
    expect(index[0].title).toBe('Hello there');
    expect(index[0].updatedAt).toBeTruthy();
  });

  it('writes a thread under its session key when a sessionId exists', () => {
    bufferThread([msg('user', 'Hi')], 'sess-123');

    expect(window.localStorage.getItem(sessionKey('sess-123'))).not.toBeNull();
    expect(readThread('sess-123')?.sessionId).toBe('sess-123');
    expect(readIndex()[0].id).toBe('sess-123');
  });

  it('no-ops on an empty thread so no index noise is created', () => {
    bufferThread([], null);
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(INDEX_KEY)).toBeNull();
    expect(readIndex()).toHaveLength(0);
  });

  it('returns true on a successful write and false on an empty no-op', () => {
    expect(bufferThread([msg('user', 'saved')], 'sess-ok')).toBe(true);
    expect(bufferThread([], null)).toBe(false);
  });

  it('refreshes (does not duplicate) the index entry across turns', () => {
    vi.setSystemTime(new Date('2026-05-28T10:00:00.000Z'));
    bufferThread([msg('user', 'Q1')], 'sess-1');
    vi.setSystemTime(new Date('2026-05-28T10:00:05.000Z'));
    bufferThread([msg('user', 'Q1'), msg('assistant', 'A1')], 'sess-1');

    const index = readIndex();
    expect(index).toHaveLength(1);
    expect(index[0].updatedAt).toBe('2026-05-28T10:00:05.000Z');
    expect(readThread('sess-1')?.messages).toHaveLength(2);
  });

  it('truncates long titles to the first user message', () => {
    const long = 'a'.repeat(120);
    bufferThread([msg('user', long)], null);
    const title = readIndex()[0].title ?? '';
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('clearDraft', () => {
  it('removes the draft slot and its index entry, leaving session threads intact', () => {
    bufferThread([msg('user', 'draft msg')], null);
    bufferThread([msg('user', 'session msg')], 'sess-9');

    clearDraft();

    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(readIndex().some(e => e.id === DRAFT_ID)).toBe(false);
    expect(readThread('sess-9')).not.toBeNull();
    expect(readIndex().some(e => e.id === 'sess-9')).toBe(true);
  });
});

describe('findMostRecentThread', () => {
  it('returns null when nothing is buffered', () => {
    expect(findMostRecentThread()).toBeNull();
  });

  it('returns the most recently updated thread across multiple threads', () => {
    vi.setSystemTime(new Date('2026-05-28T09:00:00.000Z'));
    bufferThread([msg('user', 'older')], 'sess-old');
    vi.setSystemTime(new Date('2026-05-28T11:00:00.000Z'));
    bufferThread([msg('user', 'newer')], 'sess-new');
    vi.setSystemTime(new Date('2026-05-28T10:00:00.000Z'));
    bufferThread([msg('user', 'middle')], 'sess-mid');

    const recovered = findMostRecentThread();
    expect(recovered?.sessionId).toBe('sess-new');
    expect(recovered?.messages[0].content).toBe('newer');
  });

  it('can recover an unsaved draft when it is the most recent', () => {
    vi.setSystemTime(new Date('2026-05-28T08:00:00.000Z'));
    bufferThread([msg('user', 'saved')], 'sess-saved');
    vi.setSystemTime(new Date('2026-05-28T12:00:00.000Z'));
    bufferThread([msg('user', 'unsaved draft')], null);

    const recovered = findMostRecentThread();
    expect(recovered?.sessionId).toBeNull();
    expect(recovered?.messages[0].content).toBe('unsaved draft');
  });
});
