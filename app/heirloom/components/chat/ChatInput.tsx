'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

export function ChatInput() {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, state } = useChatStore();

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || state.isLoading) return;
    void sendMessage(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const canSend = value.trim().length > 0 && !state.isLoading;

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="relative flex items-end gap-2 bg-surface border border-border rounded-2xl px-3 py-2.5 focus-within:border-accent/40 transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything"
          rows={1}
          className="flex-1 bg-transparent text-text-primary placeholder-text-muted font-body text-base resize-none focus:outline-none leading-6 py-1 min-h-[28px] max-h-[200px]"
        />

        <button
          type="button"
          aria-label="Send message"
          disabled={!canSend}
          onClick={handleSend}
          className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 mb-0.5 ${
            canSend
              ? 'bg-accent hover:bg-accent-hover text-background'
              : 'bg-text-primary/10 text-text-muted cursor-not-allowed'
          }`}
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  );
}
