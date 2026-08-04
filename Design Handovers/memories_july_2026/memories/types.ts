/**
 * Memory — the object the whole feature exists to produce.
 */

export type Photo = { id: string; url: string; alt?: string };

export type Memory = {
  id: string;
  title: string;      // 2–6 words, evocative, chapter-like
  passage: string;    // 90–150 words, FIRST PERSON, their voice
  sessionId: string;  // the conversation it came from
  storyId: string;    // the story it was filed into
  photos: Photo[];    // empty at creation — filled later
  createdAt: string;
};

/**
 * In the transcript a memory lives as a tool message, NOT a chat bubble.
 * It sits in the same ordered list as user/assistant messages so it keeps its
 * place in the conversation and is truncated correctly by an edit.
 */
export type MemoryToolMessage = {
  id: string;
  role: 'tool';
  kind: 'memory';
  state: 'running' | 'draft' | 'saved' | 'discarded';
  title?: string;
  passage?: string;
  storyId?: string;   // set on save
};

export type Story = { id: string; name: string; tagline?: string };
