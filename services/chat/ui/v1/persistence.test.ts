import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bufferThread,
  clearDraft,
  clearSession,
  clearTranscripts,
  readThread,
  readIndex,
  findMostRecentThread,
  __resetPersistenceForTests,
  DRAFT_ID,
  type PersistedMessage,
} from './persistence';

function msg(role: 'user' | 'assistant', content: string): PersistedMessage {
  return { id: crypto.randomUUID(), role, content, timestamp: '2026-05-28T00:00:00.000Z' };
}

beforeEach(async () => {
  await __resetPersistenceForTests('heirloom');
  await __resetPersistenceForTests('sage');
  // Only Date is faked — setTimeout/microtasks stay real so IndexedDB's
  // internal event dispatch (fake-indexeddb, wired in vitest.setup.ts) never
  // stalls waiting on a timer we've paused.
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bufferThread', () => {
  it('writes a pre-session thread to the draft slot and indexes it', async () => {
    await bufferThread('heirloom', [msg('user', 'Hello there')], null);

    const draft = await readThread('heirloom', DRAFT_ID);
    expect(draft).not.toBeNull();
    expect(draft?.sessionId).toBeNull();
    expect(draft?.messages).toHaveLength(1);

    const index = await readIndex('heirloom');
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe(DRAFT_ID);
    expect(index[0].title).toBe('Hello there');
    expect(index[0].updatedAt).toBeTruthy();
  });

  it('writes a thread under its session id when a sessionId exists', async () => {
    await bufferThread('heirloom', [msg('user', 'Hi')], 'sess-123');

    const thread = await readThread('heirloom', 'sess-123');
    expect(thread).not.toBeNull();
    expect(thread?.sessionId).toBe('sess-123');
    expect((await readIndex('heirloom'))[0].id).toBe('sess-123');
  });

  it('no-ops on an empty thread so no index noise is created', async () => {
    await bufferThread('heirloom', [], null);
    expect(await readThread('heirloom', DRAFT_ID)).toBeNull();
    expect(await readIndex('heirloom')).toHaveLength(0);
  });

  it('refreshes (does not duplicate) the index entry across turns', async () => {
    vi.setSystemTime(new Date('2026-05-28T10:00:00.000Z'));
    await bufferThread('heirloom', [msg('user', 'Q1')], 'sess-1');
    vi.setSystemTime(new Date('2026-05-28T10:00:05.000Z'));
    await bufferThread('heirloom', [msg('user', 'Q1'), msg('assistant', 'A1')], 'sess-1');

    const index = await readIndex('heirloom');
    expect(index).toHaveLength(1);
    expect(index[0].updatedAt).toBe('2026-05-28T10:00:05.000Z');
    expect((await readThread('heirloom', 'sess-1'))?.messages).toHaveLength(2);
  });

  it('truncates long titles to the first user message', async () => {
    const long = 'a'.repeat(120);
    await bufferThread('heirloom', [msg('user', long)], null);
    const title = (await readIndex('heirloom'))[0].title ?? '';
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('clearDraft', () => {
  it('removes the draft slot and its index entry, leaving session threads intact', async () => {
    await bufferThread('heirloom', [msg('user', 'draft msg')], null);
    await bufferThread('heirloom', [msg('user', 'session msg')], 'sess-9');

    await clearDraft('heirloom');

    expect(await readThread('heirloom', DRAFT_ID)).toBeNull();
    expect((await readIndex('heirloom')).some(e => e.id === DRAFT_ID)).toBe(false);
    expect(await readThread('heirloom', 'sess-9')).not.toBeNull();
    expect((await readIndex('heirloom')).some(e => e.id === 'sess-9')).toBe(true);
  });
});

describe('clearSession', () => {
  it('removes the session thread and its index entry, leaving other threads intact', async () => {
    await bufferThread('heirloom', [msg('user', 'keep me')], 'sess-keep');
    await bufferThread('heirloom', [msg('user', 'clear me')], 'sess-clear');

    await clearSession('heirloom', 'sess-clear');

    expect(await readThread('heirloom', 'sess-clear')).toBeNull();
    expect((await readIndex('heirloom')).some(e => e.id === 'sess-clear')).toBe(false);
    expect(await readThread('heirloom', 'sess-keep')).not.toBeNull();
    expect((await readIndex('heirloom')).some(e => e.id === 'sess-keep')).toBe(true);
  });

  it('leaves nothing for findMostRecentThread to recover when the only thread is cleared', async () => {
    await bufferThread('heirloom', [msg('user', 'only thread')], 'sess-only');
    await clearSession('heirloom', 'sess-only');
    expect(await findMostRecentThread('heirloom')).toBeNull();
  });
});

describe('clearTranscripts', () => {
  it('drops session transcripts but keeps their index entries (the claim index)', async () => {
    await bufferThread('heirloom', [msg('user', 'thread one')], 'sess-1');
    await bufferThread('heirloom', [msg('user', 'thread two')], 'sess-2');

    await clearTranscripts('heirloom');

    expect(await readThread('heirloom', 'sess-1')).toBeNull();
    expect(await readThread('heirloom', 'sess-2')).toBeNull();
    const ids = (await readIndex('heirloom')).map(e => e.id);
    expect(ids).toContain('sess-1');
    expect(ids).toContain('sess-2');
  });

  it('drops the draft slot entirely — transcript AND index entry (not claimable)', async () => {
    await bufferThread('heirloom', [msg('user', 'pre-session draft')], null);
    await bufferThread('heirloom', [msg('user', 'real session')], 'sess-1');

    await clearTranscripts('heirloom');

    expect(await readThread('heirloom', DRAFT_ID)).toBeNull();
    expect((await readIndex('heirloom')).some(e => e.id === DRAFT_ID)).toBe(false);
    expect((await readIndex('heirloom')).some(e => e.id === 'sess-1')).toBe(true);
  });

  it('leaves findMostRecentThread with nothing to rehydrate', async () => {
    await bufferThread('heirloom', [msg('user', 'only thread')], 'sess-only');
    await clearTranscripts('heirloom');
    expect(await findMostRecentThread('heirloom')).toBeNull();
  });

  it('no-ops safely on an empty store', async () => {
    await expect(clearTranscripts('heirloom')).resolves.not.toThrow();
    expect(await readIndex('heirloom')).toHaveLength(0);
  });
});

describe('findMostRecentThread', () => {
  it('returns null when nothing is buffered', async () => {
    expect(await findMostRecentThread('heirloom')).toBeNull();
  });

  it('returns the most recently updated thread across multiple threads', async () => {
    vi.setSystemTime(new Date('2026-05-28T09:00:00.000Z'));
    await bufferThread('heirloom', [msg('user', 'older')], 'sess-old');
    vi.setSystemTime(new Date('2026-05-28T11:00:00.000Z'));
    await bufferThread('heirloom', [msg('user', 'newer')], 'sess-new');
    vi.setSystemTime(new Date('2026-05-28T10:00:00.000Z'));
    await bufferThread('heirloom', [msg('user', 'middle')], 'sess-mid');

    const recovered = await findMostRecentThread('heirloom');
    expect(recovered?.sessionId).toBe('sess-new');
    expect(recovered?.messages[0].content).toBe('newer');
  });

  it('can recover an unsaved draft when it is the most recent', async () => {
    vi.setSystemTime(new Date('2026-05-28T08:00:00.000Z'));
    await bufferThread('heirloom', [msg('user', 'saved')], 'sess-saved');
    vi.setSystemTime(new Date('2026-05-28T12:00:00.000Z'));
    await bufferThread('heirloom', [msg('user', 'unsaved draft')], null);

    const recovered = await findMostRecentThread('heirloom');
    expect(recovered?.sessionId).toBeNull();
    expect(recovered?.messages[0].content).toBe('unsaved draft');
  });
});

describe('namespace isolation', () => {
  it('keeps heirloom and sage threads in separate databases', async () => {
    await bufferThread('heirloom', [msg('user', 'heirloom thread')], 'sess-shared-id');
    await bufferThread('sage', [msg('user', 'sage thread')], 'sess-shared-id');

    const heirloomThread = await readThread('heirloom', 'sess-shared-id');
    const sageThread = await readThread('sage', 'sess-shared-id');
    expect(heirloomThread?.messages[0].content).toBe('heirloom thread');
    expect(sageThread?.messages[0].content).toBe('sage thread');

    await clearSession('sage', 'sess-shared-id');
    expect(await readThread('sage', 'sess-shared-id')).toBeNull();
    expect(await readThread('heirloom', 'sess-shared-id')).not.toBeNull();
  });
});
