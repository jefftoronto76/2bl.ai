'use client';

import { ChevronDown, CircleUser as UserCircle, X } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { useChatStore } from './chatStore';

export function ChatHeader() {
  const { dispatch } = useChatStore();

  return (
    <header className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
      <button
        type="button"
        className="flex items-center gap-1.5 font-body text-text-primary font-semibold text-base hover:bg-text-primary/10 rounded-lg px-2 py-1.5 transition-colors"
      >
        <span>Your Story</span>
        <ChevronDown size={14} className="text-text-muted" />
      </button>

      <div className="flex items-center gap-1">
        <IconButton label="Account">
          <UserCircle size={18} />
        </IconButton>
        <IconButton label="Close" onClick={() => dispatch({ type: 'CLOSE_CHAT' })}>
          <X size={18} />
        </IconButton>
      </div>
    </header>
  );
}
