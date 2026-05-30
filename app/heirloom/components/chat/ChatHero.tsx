'use client';

import { CSSProperties } from 'react';
import { Sidebar } from './Sidebar';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { useChatStore } from '../store/chatStore';
import { useKeyboardViewport } from '@/services/chat/ui/v1/core/useKeyboardViewport';

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 select-none">
      <h1 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-8 text-center">
        What&apos;s a story worth keeping?
      </h1>
    </div>
  );
}

export function ChatHero() {
  const { state, isError } = useChatStore();

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
    <section style={surfaceStyle} className="h-full flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 h-full">
        <ChatHeader />

        <div className="flex flex-col flex-1 min-h-0">
          {state.hasStarted ? (
            <MessageList messages={state.messages} isLoading={state.isLoading} isError={isError} />
          ) : (
            <EmptyState />
          )}

          <div className="pb-4">
            <ChatInput />
          </div>
        </div>
      </div>
    </section>
  );
}
