'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { Check } from 'lucide-react';
import { SidebarV2 } from './v2/SidebarV2';
import { BeginStoryModal } from './v2/BeginStoryModal';
import { ConfirmDeleteModal } from './v2/ConfirmDeleteModal';
import type { RowAction, RowTarget, Story, WritingPrompt } from './v2/types';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { useChatStore } from './chatStore';
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

// Layout-less content — MessageList's own wrapper owns the flex-1/centering/
// padding around whatever `emptyState` it's handed.
function EmptyState() {
  const { invitedName, hasInviteToken } = useChatStore();
  const personalized = hasInviteToken && invitedName;
  return personalized ? (
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

  // iOS keyboard handling is pure CSS (h-dvh on ChatDrawerV2, cascading down
  // to this section's h-full) — app/layout.tsx sets interactiveWidget:
  // 'resizes-content', which makes dvh shrink correctly on keyboard-open on
  // both iOS Safari and Android Chrome, mirroring components/shells/widget/
  // Chat.tsx's overlay. useKeyboardViewport is kept only for its body
  // scroll-lock (the landing page behind the panel must not scroll while
  // it's open) — trackViewport: false means no visualViewport listener runs
  // and no height is computed here.
  useKeyboardViewport({
    active: state.isChatOpen,
    lockBodyScroll: true,
    trackViewport: false,
  });

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
    <section className="h-full w-full flex bg-background overflow-hidden">
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

      <div className="flex flex-col flex-1 min-w-0 h-full min-h-0">
        <ChatHeader
          isFullScreen={isFullScreen}
          onToggleFullScreen={onToggleFullScreen}
          onMenuOpen={isMobile ? () => dispatch({ type: 'TOGGLE_SIDEBAR' }) : undefined}
        />

        <div className="flex flex-col flex-1 min-h-0">
          {isGated ? (
            <GateView />
          ) : (
            <MessageList
              messages={state.messages}
              isLoading={state.isLoading}
              errorType={errorType}
              emptyState={<EmptyState />}
              composer={
                <>
                  <ChatInput />
                  <SaveChatCTA />
                </>
              }
            />
          )}
        </div>
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
          void deleteSession(pendingDelete.id);
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
