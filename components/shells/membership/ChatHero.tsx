'use client';

import { CSSProperties, useState } from 'react';
import { SidebarV2 } from './v2/SidebarV2';
import { BeginStoryModal } from './v2/BeginStoryModal';
import type { Story, WritingPrompt } from './v2/types';
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

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 select-none">
      <h1 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-8 text-center">
        What&apos;s a story worth keeping?
      </h1>
    </div>
  );
}

export interface ChatHeroProps {
  /** Drawer width state — passed through to ChatHeader's expand toggle. */
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

export function ChatHero({ isFullScreen, onToggleFullScreen }: ChatHeroProps) {
  const { state, isError, isGated, sendMessage } = useChatStore();

  // V2 sidebar wiring. Stories are EPHEMERAL client state this pass — there is
  // no stories backend yet (schema is Studio work), so created stories live for
  // the session and demo the flow; rows are inert (no select/chat/kebab
  // handlers passed). Invite / Uploads / Share / Search are stubbed per the
  // integration decisions.
  const [beginStoryOpen, setBeginStoryOpen] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);

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

  return (
    <section style={surfaceStyle} className="h-full w-full flex bg-background overflow-hidden">
      <SidebarV2
        stories={stories}
        writingPrompts={WRITING_PROMPTS}
        onCreateStory={() => setBeginStoryOpen(true)}
        onSelectPrompt={handleSelectPrompt}
      />

      <div className="flex flex-col flex-1 min-w-0 h-full">
        <ChatHeader isFullScreen={isFullScreen} onToggleFullScreen={onToggleFullScreen} />

        <div className="flex flex-col flex-1 min-h-0">
          {isGated ? (
            <GateView />
          ) : (
            <>
              {state.hasStarted ? (
                <MessageList messages={state.messages} isLoading={state.isLoading} isError={isError} />
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
          section is static), so the modal overlays the whole drawer. */}
      <BeginStoryModal
        open={beginStoryOpen}
        onClose={() => setBeginStoryOpen(false)}
        onCreate={handleCreateStory}
      />
    </section>
  );
}
