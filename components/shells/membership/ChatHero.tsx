'use client';

import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '@mantine/hooks';
import { Check } from 'lucide-react';
import { SidebarV2 } from './v2/SidebarV2';
import { BeginStoryModal } from './v2/BeginStoryModal';
import { ConfirmDeleteModal } from './v2/ConfirmDeleteModal';
import { useChatOverlayHost } from './v2/ChatOverlayHost';
import { useModalA11y } from './v2/useModalA11y';
import type { RowAction, RowTarget, Story, WritingPrompt } from './v2/types';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { MediaGallery } from './MediaGallery';
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

  // Media gallery — full-bleed overlay (same pattern as VoiceImmersive:
  // portaled into ChatDrawerV2's relative body, absolute inset-0). Opened
  // from SidebarV2's "Media" nav item, which already had an onMedia prop
  // but nothing passed it — MediaGallery.tsx itself was already real and
  // functional, just unreachable from navigation.
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  const overlayHost = useChatOverlayHost();
  const mediaGalleryRef = useRef<HTMLDivElement>(null);
  const closeMediaGallery = useCallback(() => setMediaGalleryOpen(false), []);
  // Persistent focus-restoration target for the mobile path — see the
  // comment on useModalA11y's restoreFocusRef. The mobile SidebarV2 (whose
  // Media button triggered the open) unmounts the instant it opens, so
  // restoring focus to "whatever was focused" would land on body instead;
  // ChatHeader's hamburger button survives the whole mobile session.
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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

  // Same behavior as SidebarV2's own "New Chat" row: on mobile, dismiss the
  // sidebar overlay once the destination is chosen. SidebarV2 doesn't chain
  // this itself for Media (no onClose call in its onMedia button), so it
  // lives here instead.
  const handleOpenMedia = useCallback(() => {
    setMediaGalleryOpen(true);
    if (isMobile) dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, [isMobile, dispatch]);

  // Escape (capture-phase, stopPropagation), initial focus, Tab trap, focus
  // restore — same a11y contract as the V2 modals (BeginStoryModal etc). On
  // mobile, restore focus to the hamburger (see menuButtonRef above) instead
  // of the default "whatever was focused," since the real opener is gone by
  // the time this runs.
  useModalA11y(
    mediaGalleryOpen,
    mediaGalleryRef,
    closeMediaGallery,
    undefined,
    isMobile ? menuButtonRef : undefined,
  );

  return (
    <section style={surfaceStyle} className="h-full w-full flex bg-background overflow-hidden">
      {/* Desktop: docked sidebar */}
      {!isMobile && (
        <SidebarV2
          stories={stories}
          writingPrompts={WRITING_PROMPTS}
          onCreateStory={() => setBeginStoryOpen(true)}
          onMedia={handleOpenMedia}
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
              onMedia={handleOpenMedia}
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
          menuButtonRef={menuButtonRef}
        />

        <div className="flex flex-col flex-1 min-h-0">
          {isGated ? (
            <GateView />
          ) : (
            <>
              {state.hasStarted ? (
                <MessageList messages={state.messages} isLoading={state.isLoading} errorType={errorType} />
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

      {/* Media gallery — full-bleed overlay, same portal pattern as
          VoiceImmersive (ChatInput.tsx): portaled into ChatDrawerV2's
          relative body so `absolute inset-0` covers the whole drawer,
          transform-safely, rather than being clipped by this static
          section. z-[72] sits above VoiceImmersive (z-70) and below the
          BeginStory/ConfirmDelete modals (z-80/85) — the three are never
          open simultaneously today, but this keeps the stacking order
          sane if that changes. */}
      {mediaGalleryOpen && overlayHost &&
        createPortal(
          <div
            ref={mediaGalleryRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Media"
            className="absolute inset-0 z-[72] hl-animate-fade focus:outline-none"
          >
            <MediaGallery onClose={closeMediaGallery} />
          </div>,
          overlayHost,
        )}

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
