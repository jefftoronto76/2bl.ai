'use client';

/**
 * SidebarMemoryCount — one mark, used in three places.
 *
 * Conversation rows, story rows, and the MEMORIES section header all use this
 * same accent bookmark + mono numeral so they read as a single system.
 * Rows with no memories render NOTHING — the absence is what makes the
 * marked rows a signal.
 *
 * Counts are always DERIVED from the memory list, never stored:
 *   memories.filter(m => m.sessionId === id).length
 *   memories.filter(m => m.storyId  === id).length
 */

import { Bookmark } from 'lucide-react';

export function SidebarMemoryCount({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      title={`${count} ${count === 1 ? 'memory' : 'memories'} kept`}
      className="inline-flex shrink-0 items-center gap-[3px] text-accent"
    >
      <Bookmark size={11} />
      <span className="font-mono text-[10.5px] leading-none">{count}</span>
    </span>
  );
}
