'use client';

import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { Check, X } from 'lucide-react';
import { SidebarV2 } from './v2/SidebarV2';
import { BeginStoryModal } from './v2/BeginStoryModal';
import { ConfirmDeleteModal } from './v2/ConfirmDeleteModal';
import type { RowAction, RowTarget, Story, WritingPrompt } from './v2/types';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { useChatStore } from './chatStore';
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories';
import { useKeyboardViewport } from '@/services/chat/ui/v1/core/useKeyboardViewport';
import { SaveChatCTA } from './SaveChatCTA';
import { GateView } from './GateView';

// Static client-side prompt set — Writing Prompts have no backend yet (the
// sidebar's other story affordances are stubbed for the same reason). Copy is
// placeholder-grade: review before launch.
const WRITING_PROMPTS: WritingPrompt[] = [
  { id: 'wp-1', text: 'What’s a smell that takes you straight back to childhood?' },
  { id: 'wp-2', text: 'Tell me about a meal you’ll never forget.' },
  { id: 'wp-3', text: 'What did your first home look like?' },
  { id: 'wp-4', text: 'Who taught you something you still carry?' },
];

function EmptyState() {
  const { invitedName, hasInviteToken } = useChatStore();
  const personalized = hasInviteToken && invitedName;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 select-none">
      {personalized ? (
        <>
          <h1 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-3 text-center">
            Welcome, {invitedName}.
          </h1>
          <p className="text-text-muted text-base md:text-lg text-center">
            What&apos;s a story worth keeping?
          </p>
        </>
      ) : (
        <h1 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-8 text-center">
          What&apos;s a story worth keeping?
        </h1>
      )}
    </div>
  );
}

/**
 * Stage A placeholder content for the memory panel (memory-panel-layout
 * plan, Design Handovers/design_handoff_memory_panel_layout_2026/). The
 * handoff explicitly scopes the panel's own card content as a separate
 * piece ("a single scrollable container is all this layout requires of
 * it") — this stub proves the panel shell opens/closes/shows the right
 * memory; it is not the eventual card-view design.
 */
function MemoryPanelStub({ memory, onClose }: { memory: MemoryRow; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">Memory</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close memory panel"
          className="rounded p-1 text-text-muted hover:text-text-primary"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h3 className="m-0 font-display text-lg font-medium text-text-primary">{memory.title}</h3>
        <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">{memory.body}</p>
      </div>
    </div>
  );
}

export interface ChatHeroProps {
  /** Drawer width state — passed through to ChatHeader's expand toggle. */
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

export function ChatHero({ isFullScreen, onToggleFullScreen }: ChatHeroProps) {
  const { state, dispatch, errorType, isGated, sendMessage, recentSessions, starSession, renameSession, deleteSession } = useChatStore();

  // V2 sidebar wiring. Stories are EPHEMERAL client state this pass — there is
  // no stories backend yet (schema is Studio work), so created stories live for
  // the session and demo the flow; rows are inert (no select/chat/kebab
  // handlers passed). Invite / Uploads / Share / Search are stubbed per the
  // integration decisions.
  const [beginStoryOpen, setBeginStoryOpen] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);

  // Memory panel (memory-panel-layout plan, Stage A). Desktop only through
  // Stage E — Stage F is the dedicated mobile counterpart; until then a
  // resize down to mobile width while a panel is open simply drops it (see
  // the render guards below), rather than half-rendering a broken layout.
  const [openMemory, setOpenMemory] = useState<MemoryRow | null>(null);

  // Kebab action state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    target: RowTarget;
    id: string;
    title?: string;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  const toastKeyRef = useRef(0);

  // Auto-dismiss toast after 2.2s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message: string) => {
    setToast({ message, key: ++toastKeyRef.current });
  }, []);

  const starredIds = recentSessions.filter(s => s.starred).map(s => s.id);

  const handleRenameCommit = useCallback((id: string, newTitle: string) => {
    setRenamingId(null);
    const trimmed = newTitle.trim();
    if (!trimmed) return; // Escape or empty — cancel
    void renameSession(id, trimmed);
    showToast('Renamed');
  }, [renameSession, showToast]);

  const handleRowAction = useCallback((target: RowTarget, id: string, action: RowAction) => {
    // Delete always opens the confirmation dialog, regardless of target.
    if (action === 'delete') {
      const title =
        target === 'conversation'
          ? recentSessions.find(s => s.id === id)?.title
          : stories.find(s => s.id === id)?.name;
      setPendingDelete({ target, id, title });
      return;
    }
    // Story actions and chapter/invite actions are deferred — no-op
    if (target !== 'conversation') return;
    switch (action) {
      case 'star': {
        const session = recentSessions.find(s => s.id === id);
        void starSession(id);
        showToast(session?.starred ? 'Star removed' : 'Starred');
        break;
      }
      case 'rename':
        setRenamingId(id);
        break;
      // moveToChapter, removeFromChapter, invite: deferred — deliberate no-op
    }
  }, [recentSessions, stories, starSession, showToast]);

  const handleCreateStory = (name: string, description: string) => {
    setStories((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name, description: description || undefined },
    ]);
    setBeginStoryOpen(false);
  };

  const handleSelectPrompt = (prompt: WritingPrompt) => {
    // Gated visitors see GateView instead of the conversation — a prompt send
    // would vanish behind it. Streaming guard matches ChatInput's.
    if (isGated || state.isLoading) return;
    void sendMessage(prompt.text);
  };

  // iOS keyboard handling. While the chat panel is open it's a modal overlay,
  // so we lock body scroll (the landing page behind must not scroll) and pin the
  // surface to the visual viewport. Under the scroll-lock iOS can't shift the
  // page, so visualViewport.offsetTop stays 0 and the keyboard simply shrinks
  // the viewport from the bottom — shrinking the surface from h-full to vv.height
  // lifts the composer to sit directly above the keyboard. Inert on desktop
  // (vv.height never drops below the threshold) and while the panel is closed.
  const { keyboardOpen, height } = useKeyboardViewport({
    active: state.isChatOpen,
    lockBodyScroll: true,
  });
  const surfaceStyle: CSSProperties | undefined =
    keyboardOpen && height != null ? { height: `${height}px` } : undefined;

  const isMobile = useMediaQuery('(max-width: 768px)') ?? false;

  // On mobile, close the overlay when Esc is pressed (capture phase so it runs
  // before any modal Esc handlers that would also stop propagation).
  useEffect(() => {
    if (!isMobile || !state.isSidebarExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'TOGGLE_SIDEBAR' });
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isMobile, state.isSidebarExpanded, dispatch]);

  return (
    <section style={surfaceStyle} className="h-full w-full flex flex-col bg-background overflow-hidden">
      {/* Spans the full drawer width, above sidebar|chat|panel — not nested
          inside the chat column. It always rendered inside the chat column
          before the memory panel existed, which was invisible then (chat
          WAS the whole remaining width) but became visibly wrong once the
          panel became a sibling pane: this bar has to sit above the whole
          row, matching the Story Canvas reference the panel-layout handoff
          cites as source of truth, not scoped to one pane. */}
      <ChatHeader
        isFullScreen={isFullScreen}
        onToggleFullScreen={onToggleFullScreen}
        onMenuOpen={isMobile ? () => dispatch({ type: 'TOGGLE_SIDEBAR' }) : undefined}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop: docked sidebar */}
        {!isMobile && (
          <SidebarV2
            stories={stories}
            writingPrompts={WRITING_PROMPTS}
            onCreateStory={() => setBeginStoryOpen(true)}
            onSelectPrompt={handleSelectPrompt}
            onRowAction={handleRowAction}
            starredConversationIds={starredIds}
            renamingId={renamingId ?? undefined}
            onRenameCommit={handleRenameCommit}
          />
        )}

        {/* Mobile: overlay drawer — absolute resolves to ChatDrawerV2's relative body */}
        {isMobile && state.isSidebarExpanded && (
          <>
            <div
              className="hl-animate-fade absolute inset-0 z-20 bg-black/40"
              aria-hidden="true"
              onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            />
            <div className="hl-animate-sheet-left absolute inset-y-0 left-0 z-30">
              <SidebarV2
                stories={stories}
                writingPrompts={WRITING_PROMPTS}
                onCreateStory={() => setBeginStoryOpen(true)}
                onSelectPrompt={handleSelectPrompt}
                onRowAction={handleRowAction}
                starredConversationIds={starredIds}
                renamingId={renamingId ?? undefined}
                onRenameCommit={handleRenameCommit}
                onClose={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
              />
            </div>
          </>
        )}

        {/* min-w-0 lets flex shrink below content size — fine on mobile
            (chat is always flex-1 there), but on desktop with the panel open
            it let this column shrink past content that refuses to shrink
            further, overflowing past the column's real edge. Floored at
            380px — the plan's own MIN_CHAT_WIDTH, brought forward from
            Stage C since even this fixed, non-resizable split needs a real
            minimum. */}
        <div
          className={`flex flex-col h-full min-h-0 ${!isMobile && openMemory ? 'flex-[2]' : 'flex-1'} ${isMobile ? 'min-w-0' : 'min-w-[380px]'}`}
        >
          <div className="flex flex-col flex-1 min-h-0">
            {isGated ? (
              <GateView />
            ) : (
              <>
                {state.hasStarted ? (
                  <MessageList
                    messages={state.messages}
                    isLoading={state.isLoading}
                    errorType={errorType}
                    onOpenMemory={isMobile ? undefined : setOpenMemory}
                  />
                ) : (
                  <EmptyState />
                )}

                <div className="pb-4">
                  <ChatInput />
                  <SaveChatCTA />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Memory panel — Stage A: fixed 40/60 split of the space remaining
            after the (untouched-this-stage) sidebar, no animation, no
            resize. Desktop only; Stage F adds the mobile counterpart. */}
        {!isMobile && openMemory && (
          <div className="h-full min-w-[320px] flex-[3] overflow-hidden border-l border-border">
            <MemoryPanelStub memory={openMemory} onClose={() => setOpenMemory(null)} />
          </div>
        )}
      </div>

      {/* absolute inset-0 — resolves to the drawer's relative body (this
          section is static), so modals overlay the whole drawer. */}
      <BeginStoryModal
        open={beginStoryOpen}
        onClose={() => setBeginStoryOpen(false)}
        onCreate={handleCreateStory}
      />
      <ConfirmDeleteModal
        item={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.target === 'story') {
            // No stories backend yet (ephemeral client state — see the
            // stories comment above) — remove locally, no network call.
            setStories(prev => prev.filter(s => s.id !== pendingDelete.id));
          } else {
            void deleteSession(pendingDelete.id);
          }
          showToast('Deleted');
          setPendingDelete(null);
        }}
      />

      {/* Kebab action confirmation toast — fixed bottom-center, auto-dismiss 2.2s */}
      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-border shadow-lg pointer-events-none select-none"
        >
          <Check size={13} className="text-accent flex-shrink-0" />
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-text-primary">
            {toast.message}
          </span>
        </div>
      )}
    </section>
  );
}
