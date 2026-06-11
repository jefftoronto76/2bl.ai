'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { useAuthUser } from '@/services/auth/client';
import { Message, useChatStore } from './chatStore';
import { MagicLinkCard } from './MagicLinkCard';
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

// Shown to platform_admin users only — never to regular members.
// Renders the raw marker bracket text that was stripped from displayed prose.
function DebugPill({ raw }: { raw: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-black/60 border border-white/10 w-fit">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted opacity-50 select-none">
        debug
      </span>
      <span className="font-mono text-xs text-text-muted opacity-75 break-all">
        {raw}
      </span>
    </div>
  );
}

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
  const { claimCurrentSession } = useChatStore();
  const { user } = useAuthUser();

  // Gate strictly on the boundary's isPlatformAdmin (provider-resolved inside
  // services/auth) — never expose debug view to members.
  const isAdmin = user?.isPlatformAdmin === true;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isError]);

  // Parse assistant messages once: markers are stripped, prose drives the bubble.
  const parsed = messages.map((m) =>
    m.role === 'assistant' ? markerRegistry.parse(m.content) : null,
  );

  // Extract the first [NAME: …] marker value from parsed messages — used to
  // pre-fill the MagicLinkCard name field when the engine has already captured
  // the visitor's name mid-conversation.
  const visitorName = parsed
    .flatMap((r) => r?.markers ?? [])
    .find((m) => m.type === 'NAME')
    ?.fields[0] ?? null;

  // Called from MagicLinkCard.onSuccess: claim the anonymous session, then
  // sync the newly-authenticated user into the members table with their name.
  const handleAuthSuccess = useCallback(async (name: string) => {
    await claimCurrentSession();
    await fetch('/api/members/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || null }),
    }).catch((err) =>
      console.error('[heirloom/MessageList] members sync failed:', err),
    );
  }, [claimCurrentSession]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {messages.map((msg, i) => {
          if (msg.role === 'user') {
            // Admin debug: [SYSTEM: ...] signals are sent via sendHidden and
            // never added to the store, so this branch handles any future case
            // where system-tagged content reaches messages (e.g. a stored
            // hidden turn), without touching non-admin paths.
            if (isAdmin && /^\[SYSTEM:\s*[^\]]*\]/.test(msg.content.trim())) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <DebugPill raw={msg.content.trim()} />
                </div>
              );
            }
            return <MessageBubble key={msg.id} message={msg} content={msg.content} />;
          }

          const result = parsed[i];
          const prose = result?.prose ?? '';
          const authPrompt = result?.markers.find((m) => m.type === 'ACCOUNT_CREATE');
          // All parsed markers (NAME, EMAIL, PHONE, BOOKING, ACCOUNT_CREATE) are
          // shown as debug pills when admin. result.markers is already populated
          // by the registry — debug view is purely additive display.
          const debugMarkers = isAdmin ? (result?.markers ?? []) : [];

          // Skip empty assistant messages — no prose, no auth prompt, no debug.
          if (!prose && !authPrompt && debugMarkers.length === 0) return null;

          return (
            <div key={msg.id} className="flex flex-col gap-3">
              {prose && <MessageBubble message={msg} content={prose} />}
              {authPrompt && (
                <MagicLinkCard
                  reason={authPrompt.fields[0] || undefined}
                  initialName={visitorName}
                  onSuccess={handleAuthSuccess}
                />
              )}
              {debugMarkers.length > 0 && (
                <div className="flex flex-col gap-1.5 ml-11">
                  {debugMarkers.map((m, idx) => (
                    <DebugPill key={idx} raw={m.raw} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {isLoading && <TypingIndicator />}
        {isError && <ErrorBubble />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
