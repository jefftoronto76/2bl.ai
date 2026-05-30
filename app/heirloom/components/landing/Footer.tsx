'use client';

import { BookOpen } from 'lucide-react';
import { useChatStore } from '@/components/shells/membership/chatStore';

export function Footer() {
  const { dispatch } = useChatStore();

  return (
    <footer className="bg-background py-12 sm:py-16 border-t border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center">
                <BookOpen size={16} className="text-accent" />
              </div>
              <span className="font-display font-semibold text-text-primary text-lg">
                Heirloom
              </span>
            </div>
            <p className="font-body text-text-muted text-base leading-relaxed max-w-sm">
              AI-guided biography platform — from first memory to printed book.
            </p>
          </div>

          <button
            type="button"
            onClick={() => dispatch({ type: 'OPEN_CHAT' })}
            className="inline-flex items-center justify-center self-start md:self-auto bg-accent hover:bg-accent-hover text-background font-body text-base font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Start Your Story
          </button>
        </div>

        <div className="border-t border-border pt-8">
          <p className="font-body text-text-muted text-base">
            &copy; {new Date().getFullYear()} Heirloom. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
