'use client';

import { Sidebar } from './Sidebar';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { useChatStore } from '../store/chatStore';

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

  return (
    <section className="h-full flex bg-background overflow-hidden">
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
