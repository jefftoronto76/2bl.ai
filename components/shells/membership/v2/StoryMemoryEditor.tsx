'use client';

// components/shells/membership/v2/StoryMemoryEditor.tsx
//
// Real Story View — Phase 1b (row-tap-to-editor wiring). Opens ONE memory
// tapped from StoryView.tsx's row list, using MemoryCardView as the actual
// editor chrome — but with its OWN useMemories(sessionId) instance, scoped
// to the TAPPED MEMORY'S OWN session, not whatever chat happens to be open
// in ChatHero right now.
//
// This is deliberate, not an oversight: a story's memories routinely come
// from different chat sessions than the one currently open (that's the
// whole point of a story — pulling memories together across conversations).
// PATCH /api/sessions/[id]/memories/[memoryId]'s four everyday actions
// (keep/discard/retitle/revise_blocks) are session-scoped for real — the
// URL's session id is matched against the memory's own session_id column,
// and for those four actions THAT'S THE ONLY ACCESS CONTROL THEY HAVE (no
// sign-in required — see that route file's own doc comment; assign_story is
// the one exception, real getCurrentUserId()-gated). Reusing ChatHero's own
// `memories` hook (useMemories(state.sessionId)) here would silently 404 on
// every action except "+" for any memory from a different session — the
// common case, not an edge case. A second, independently-scoped hook
// instance is the fix that doesn't touch that route's existing anonymous-
// safe trust model at all.
//
// Same reasoning applies to the block canvas's image-attach picker
// (BlockCanvas.tsx's sessionImages prop) — ChatHero's own sessionImages is
// scoped to the CURRENTLY OPEN chat's uploads via useChatStore(), which
// would silently fail to render this memory's own linked photo (or offer
// its own session's photos to attach) if it belongs to a different session.
// Fetched here directly via GET /api/media?chat_id=<this memory's session>,
// the same unpaginated fetch chatStore.tsx's own hydration already uses —
// unpaginated is fine here too: this only feeds a picker dropdown, not an
// account-scale gallery.

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useMemories } from '@/services/chat/ui/v1/useMemories';
import { MemoryCardView } from '../memory/MemoryCardView';
import type { SessionImage } from '../memory/BlockCanvas';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import type { Story } from './types';

export interface StoryMemoryEditorProps {
  memoryId: string;
  sessionId: string;
  stories: Story[];
  onClose: () => void;
  /** Shared toast — same one ChatHero passes to StoryView/StoryAdminPanel. */
  onFlash: (message: string) => void;
}

interface RawMediaItem {
  id: string;
  type: string;
  status: string;
  url?: string | null;
  original_filename?: string | null;
}

export function StoryMemoryEditor({ memoryId, sessionId, stories, onClose, onFlash }: StoryMemoryEditorProps) {
  const memories = useMemories(sessionId);
  const memory = memories.memories.find((m) => m.id === memoryId);

  const [sessionImages, setSessionImages] = useState<SessionImage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/media?chat_id=${encodeURIComponent(sessionId)}&status=ready`);
        if (!res.ok || cancelled) return;
        const data: { items?: RawMediaItem[] } = await res.json();
        if (cancelled) return;
        const images = (data.items ?? [])
          .filter((item) => item.type === 'image' && item.status === 'ready' && !!item.url)
          .map((item) => ({ id: item.id, url: item.url as string, filename: item.original_filename ?? '' }));
        setSessionImages(images);
      } catch (err) {
        console.error('[StoryMemoryEditor] session images fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const [pendingRemove, setPendingRemove] = useState(false);

  const handleRemove = async () => {
    if (!memory) return;
    await memories.discard(memory);
    setPendingRemove(false);
    onClose();
  };

  const handleAssignStory = async (storyId: string) => {
    if (!memory) return;
    const story = stories.find((s) => s.id === storyId);
    const wasAlreadyInAStory = !!memory.storyId;
    await memories.assignToStory(memory.id, storyId);
    onFlash(wasAlreadyInAStory ? `Moved to ${story?.name ?? 'story'}` : `Added to ${story?.name ?? 'story'}`);
  };

  if (!memories.isLoaded) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-text-muted">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  if (!memory) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center justify-end px-4 py-3 border-b border-border flex-shrink-0">
          <button
            type="button"
            aria-label="Close memory panel"
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="font-body text-sm text-text-muted text-center">This memory could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <MemoryCardView
        memory={memory}
        onClose={onClose}
        onRetitle={(title) => memories.rename(memory.id, title)}
        onRemove={() => setPendingRemove(true)}
        onStub={onFlash}
        onReviseBlocks={(blocks) => memories.reviseBlocks(memory.id, blocks)}
        sessionImages={sessionImages}
        stories={stories}
        onAssignStory={handleAssignStory}
      />
      <ConfirmDeleteModal
        item={pendingRemove ? { target: 'memory', id: memory.id, title: memory.title } : null}
        onClose={() => setPendingRemove(false)}
        onConfirm={() => void handleRemove()}
      />
    </>
  );
}
