'use client';

import { useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { Message } from '../store/chatStore';
import { createDefaultRegistry } from '@/services/chat/ui/v1/registry';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isError: boolean;
}

const dotDelays = ['delay-[0ms]', 'delay-[150ms]', 'delay-[300ms]'];

// Strip every marker ([BOOKING: ...], [NAME: ...], …) from assistant prose so
// they never render as raw bracket text. Heirloom has no booking-card UI yet,
// so booking cards are dropped and only the surrounding prose is shown.
const markerRegistry = createDefaultRegistry();

function MessageBubble({ message, content }: { message: Message; content: string }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center mt-0.5">
          <Bot size={14} className="text-accent" />
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 font-body text-base leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-surface text-text-primary rounded-br-sm'
            : 'bg-transparent text-text-primary rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

function ErrorBubble() {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center mt-0.5">
        <Bot size={14} className="text-accent" />
      </div>
      <div className="max-w-[75%] rounded-2xl rounded-bl-sm px-4 py-3 font-body text-base leading-relaxed bg-transparent text-text-primary">
        Something went wrong reaching your story guide. Please try again in a moment.
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center">
        <Bot size={14} className="text-accent" />
      </div>
      <div className="bg-surface rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {dotDelays.map((d, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce ${d}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MessageList({ messages, isLoading, isError }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isError]);

  // Parse assistant messages once: markers are stripped, prose drives the bubble.
  const parsed = messages.map((m) =>
    m.role === 'assistant' ? markerRegistry.parse(m.content) : null,
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {messages.map((msg, i) => {
          const content = msg.role === 'user' ? msg.content : parsed[i]?.prose ?? '';
          // Skip an assistant message with no prose (only a marker, or cleared
          // on error).
          if (msg.role === 'assistant' && !content) return null;
          return <MessageBubble key={msg.id} message={msg} content={content} />;
        })}
        {isLoading && <TypingIndicator />}
        {isError && <ErrorBubble />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
