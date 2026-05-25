'use client';

import { useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { Message } from '../store/chatStore';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

const dotDelays = ['delay-[0ms]', 'delay-[150ms]', 'delay-[300ms]'];

function MessageBubble({ message }: { message: Message }) {
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
        {message.content}
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

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
