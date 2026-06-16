'use client';

import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import { SidebarV2 } from './v2/SidebarV2';
import { BeginStoryModal } from './v2/BeginStoryModal';
import { ConfirmDeleteModal } from './v2/ConfirmDeleteModal';
import type { RowAction, RowTarget, Story, WritingPrompt } from './v2/types';
import { ChatHeader } from './ChatHeader';
import { ChatInput, type ChatInputHandle } from './ChatInput';
import { MessageList } from './MessageList';
import { useChatStore } from './chatStore';
import { useKeyboardViewport } from '@/services/chat/ui/v1/core/useKeyboardViewport';
import { SaveChatCTA } from './SaveChatCTA';
import { GateView } from './GateView';
import type { MediaAction } from './MediaPills';

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
  const { state, isError, isGated, sendMessage, injectAssistantMessage, recentSessions, starSession, renameSession, deleteSession, pendingPills, setPendingPills } = useChatStore();

  // Ref forwarded to ChatInput so drag-drop can pass files to the composer.
  const composerRef = useRef<ChatInputHandle>(null);

  // ── Drag-drop state ───────────────────────────────────────────────────────
  const [isDraggingOver, setIsDraggingOver] = useState(false);

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

  // ── Pill dispatcher ───────────────────────────────────────────────────────
  const handlePill = useCallback((action: MediaAction, mediaItemId: string) => {
    setPendingPills(null);
    switch (action) {
      case 'story':
        void sendMessage(`[media: ${mediaItemId}] Let's talk about this. What's the story behind it?`);
        break;
      case 'caption':
        void sendMessage(`I'd like to add a caption to this photo.`);
        break;
      case 'tagPeople':
        void sendMessage(`Can you help me note who's in this photo?`);
        break;
      case 'tagDate':
        void sendMessage(`When do you think this was taken? Let's figure out the date.`);
        break;
      case 'memory':
        void sendMessage(`Add this as a spoken memory.`);
        break;
      case 'file':
        injectAssistantMessage('Saved to your materials. You can find it in the Materials library anytime.');
        break;
      case 'ocr':
        // TODO(2bl): call /api/media/ocr?id=mediaItemId → open TranscriptReview
        injectAssistantMessage('Transcribing your document… (coming soon — the full transcription pipeline will be wired shortly)');
        break;
      case 'stt':
        // TODO(2bl): call /api/transcribe with audio → open TranscriptReview
        injectAssistantMessage('Transcribing your audio… (coming soon)');
        break;
      case 'frameGrab':
        injectAssistantMessage('Pulling a still from your video… (coming soon)');
        break;
      case 'reviewEach':
        void sendMessage(`Let's go through these one by one.`);
        break;
      case 'batchFile':
        injectAssistantMessage('All files saved to your materials.');
        break;
      default:
        void sendMessage(`Let's work with this.`);
    }
  }, [sendMessage, injectAssistantMessage, setPendingPills]);

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

  // Drag-drop: forward dropped files to the composer's addFiles handle.
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) setIsDraggingOver(true);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const { files } = e.dataTransfer;
    if (files.length > 0) composerRef.current?.addFiles(files);
  };

  return (
    <section
      style={surfaceStyle}
      className="h-full w-full flex bg-background overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-drop overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-accent/60 bg-surface/80 backdrop-blur-sm pointer-events-none select-none">
          <Upload size={36} className="text-accent" />
          <p className="font-display text-xl italic text-text-primary">Drop to add to this memory</p>
        </div>
      )}
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

      <div className="flex flex-col flex-1 min-w-0 h-full">
        <ChatHeader isFullScreen={isFullScreen} onToggleFullScreen={onToggleFullScreen} />

        <div className="flex flex-col flex-1 min-h-0">
          {isGated ? (
            <GateView />
          ) : (
            <>
              {state.hasStarted ? (
                <MessageList
                  messages={state.messages}
                  isLoading={state.isLoading}
                  isError={isError}
                  onPill={handlePill}
                />
              ) : (
                <EmptyState />
              )}

              <div className="pb-4">
                <ChatInput ref={composerRef} />
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
