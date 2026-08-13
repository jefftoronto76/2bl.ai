'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XCircle, Feather } from 'lucide-react';
import { useAuthUser } from '@/services/auth/client';
import { Message, useChatStore, type ClientMediaItem, type PendingEcho } from './chatStore';
import { MagicLinkCard } from './MagicLinkCard';
import { createDefaultRegistry } from '@/services/chat/ui/v1/registry';
import {
  MEDIA_UPLOAD_PATTERN_SOURCE,
  MEDIA_UPLOAD_FAILED_PATTERN_SOURCE,
  MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE,
} from '@/services/chat/ui/v1/mediaMarkerPatterns';
import { ChatThread } from '@/components/chat/ChatThread';
import { DeliveryStatus } from '@/components/chat/DeliveryStatus';
import { MessageActions } from '@/components/chat/MessageActions';
import { UserMessageActions } from '@/components/chat/UserMessageActions';
import { EditableUserBubble } from '@/components/chat/EditableUserBubble';
import { useMessageFeedback, type UseMessageFeedbackReturn } from '@/services/chat/ui/v1/useMessageFeedback';
import type { UseMemoriesReturn, MemoryRow, MemorySourceKind } from '@/services/chat/ui/v1/useMemories';
import { MemoryCard, MemoryRunningPill, MemorySavedReceipt, MemoryErrorLine } from './memory/MemoryCard';
import { PhotoUploadActions } from './memory/PhotoUploadActions';
import type { SessionImage } from './memory/BlockCanvas';
import { memoryKindOf, KIND_ICONS } from './memory/memoryKinds';
import { UploadThumbnail } from './UploadThumbnail';
import { ImageLightbox } from './ImageLightbox';
import { useChatOverlayHost } from './v2/ChatOverlayHost';
import { useScrollAnchor, ScrollToLatestButton } from './ScrollToLatestButton';
import { membershipMarkdownComponents } from './markdownComponents';
import { ERROR_COPY } from '@/components/chat/errorCopy';
import type { ChatErrorType, MarkerParseResult } from '@/services/chat/ui/v1/types';


interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  /** Opens a saved memory in the memory panel (memory-panel-layout Stage A).
   *  Optional so this stays a non-breaking addition; when omitted, saved
   *  receipts render inert, same as before this stage. */
  onOpenMemory?: (memory: MemoryRow) => void;
  /** Classified reason the most recent turn failed, or null when it succeeded. */
  errorType: ChatErrorType | null;
  /** Owned by ChatHero.tsx (memory-panel-layout CardView chrome pass,
   *  2026-08-08) — one useMemories(state.sessionId) instance shared with the
   *  memory panel, not a second one instantiated here. Renaming or removing
   *  a memory from the panel needs to be reflected in this transcript's own
   *  MemorySavedReceipt rows immediately, not just after a reload; two
   *  independent hook instances would each hold their own stale copy. */
  memories: UseMemoriesReturn;
  /** Fires the shared "coming soon" toast for every stubbed action — the
   *  per-photo "+" (PhotoUploadActions) and MemorySavedReceipt's own "+"
   *  (add to a story). Same handler ChatHero.tsx already passes to
   *  MemoryCardView as `onStub`. Optional so this stays a non-breaking
   *  addition; when omitted, those "+" buttons simply don't render (see
   *  MemorySavedReceipt's own optional-onStub posture). */
  onStub?: (message: string) => void;
  /**
   * The session's own ready image media items — same array BlockCanvas.tsx's
   * ImageBlockRow and the memory panel already resolve a linked photo
   * against. Sourced from useChatStore().mediaItems by ChatHero.tsx, same as
   * the copy already threaded to MemoryCardView. Lets a DRAFT photo memory's
   * MemoryCard (media_item_id populated at create time by
   * createPhotoMemoryFromMedia, before Keep) show its real photo instead of
   * always falling back to the placeholder. Optional (defaults to `[]`) so
   * this stays a non-breaking addition for existing call sites/tests that
   * mount MessageList directly without it — a memory simply falls back to
   * the placeholder in that case, same graceful-degradation posture as
   * every other application of this lookup pattern. */
  sessionImages?: SessionImage[];
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

// ── Media parsing ─────────────────────────────────────────────────────────────

// Pattern source is canonical in mediaMarkerPatterns.ts, shared with
// registry.ts's MEDIA_UPLOAD_MARKER/MEDIA_UPLOAD_FAILED_MARKER/
// MEDIA_UPLOAD_DUPLICATE_MARKER — each consumer builds its own RegExp
// instance so `.lastIndex` state never leaks between them.
const MEDIA_UPLOAD_RE = new RegExp(MEDIA_UPLOAD_PATTERN_SOURCE, 'g');
const MEDIA_FAILED_RE = new RegExp(MEDIA_UPLOAD_FAILED_PATTERN_SOURCE, 'g');
const MEDIA_UPLOAD_DUPLICATE_RE = new RegExp(MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE, 'g');

interface ParsedUserMessage {
  uploads: Array<{ filename: string; mediaItemId: string; type: string }>;
  failures: Array<{ filename: string }>;
  /** A content-hash match reused an existing row instead of a fresh upload — `status` is captured AT MATCH TIME, a fallback for before the live mediaItems lookup catches up (see UploadThumbnail.tsx's duplicateLabel prop doc). */
  duplicates: Array<{ filename: string; mediaItemId: string; type: string; status: string }>;
  text: string;
}

function parseUserMessage(content: string): ParsedUserMessage {
  const uploads: ParsedUserMessage['uploads'] = [];
  const failures: ParsedUserMessage['failures'] = [];
  const duplicates: ParsedUserMessage['duplicates'] = [];

  let m: RegExpExecArray | null;
  MEDIA_UPLOAD_RE.lastIndex = 0;
  while ((m = MEDIA_UPLOAD_RE.exec(content)) !== null) {
    uploads.push({ filename: m[1].trim(), mediaItemId: m[2].trim(), type: m[3].trim() });
  }
  MEDIA_FAILED_RE.lastIndex = 0;
  while ((m = MEDIA_FAILED_RE.exec(content)) !== null) {
    failures.push({ filename: m[1].trim() });
  }
  MEDIA_UPLOAD_DUPLICATE_RE.lastIndex = 0;
  while ((m = MEDIA_UPLOAD_DUPLICATE_RE.exec(content)) !== null) {
    duplicates.push({ filename: m[1].trim(), mediaItemId: m[2].trim(), type: m[3].trim(), status: m[4].trim() });
  }

  const text = content
    .replace(/\[MEDIA_UPLOAD:[^\]]+\]/g, '')
    .replace(/\[MEDIA_UPLOAD_FAILED:[^\]]+\]/g, '')
    .replace(/\[MEDIA_UPLOAD_DUPLICATE:[^\]]+\]/g, '')
    .trim();

  return { uploads, failures, duplicates, text };
}

/** Status-specific copy for a MEDIA_UPLOAD_DUPLICATE thumbnail's small label — prefers the live mediaItems status over the marker's captured one, see the marker's own doc comment. */
function duplicateLabelForStatus(status: string): string {
  if (status === 'ready') return 'Already uploaded';
  if (status === 'failed') return 'Matches a previous upload that failed';
  return 'Already being processed';
}

/**
 * A user message's own upload (if any) drives the memory's source kind — see
 * parseUserMessage above. Checks duplicates alongside uploads (not just
 * uploads) so UploadThumbnail.tsx's isImage check resolves correctly for a
 * duplicate match too — without this a duplicate image would render as a
 * generic file-icon row instead of the actual photo thumbnail. Video has no
 * upload path yet, so it's never derived here.
 */
function sourceKindForUserMessage(userMsg: ParsedUserMessage): MemorySourceKind {
  if (userMsg.uploads.some(u => u.type === 'image') || userMsg.duplicates.some(d => d.type === 'image')) return 'photo';
  if (userMsg.uploads.some(u => u.type === 'audio') || userMsg.duplicates.some(d => d.type === 'audio')) return 'audio';
  if (userMsg.uploads.some(u => u.type === 'document') || userMsg.duplicates.some(d => d.type === 'document')) return 'document';
  return 'conversation';
}

interface MemorySlotHandlers {
  onKeep: (memory: MemoryRow) => void;
  onDiscard: (memory: MemoryRow) => void;
  onRetitle: (memory: MemoryRow, title: string) => void;
  onOpen?: (memory: MemoryRow) => void;
  /** Threaded through to MemorySavedReceipt's own "+" (add to a story) — see MessageListProps.onStub. */
  onStub?: (message: string) => void;
}

/**
 * Renders whatever this message's memory is doing right now — running pill,
 * draft card, saved receipt, or a live failure line — or nothing at all.
 * Shared by both render functions below since a bookmark (and therefore a
 * memory) can be anchored to a guide or a visitor message alike. Takes the
 * sourceKind this anchor would create() with (source-specific per caller —
 * see sourceKindForUserMessage / the assistant 'conversation' literal) so
 * the failure line's "Try again" can replay the exact same call.
 *
 * mediaItemId (optional, added 2026-08-08 — Photo Bookmark) is threaded
 * straight through to every useMemories lookup/create call below, so this
 * same function backs BOTH the whole-message slot (mediaItemId omitted) and
 * a per-photo slot anchored to the same message (PhotoUploadActions.tsx) —
 * see useMemories.ts's composite key doc for why the two never collide.
 */
function renderMemorySlot(
  anchorId: string,
  sourceKind: MemorySourceKind,
  memories: UseMemoriesReturn,
  handlers: MemorySlotHandlers,
  mediaItemId?: string,
  sessionImages: SessionImage[] = [],
): ReactNode {
  if (memories.isPending(anchorId, mediaItemId)) {
    const kind = memories.getPendingKind(anchorId, mediaItemId);
    return kind ? <MemoryRunningPill sourceKind={kind} /> : null;
  }
  const memory = memories.getByAnchor(anchorId, mediaItemId);
  if (memory?.status === 'draft') {
    return (
      <MemoryCard
        memory={memory}
        onKeep={() => handlers.onKeep(memory)}
        onDiscard={() => handlers.onDiscard(memory)}
        onRetitle={(title) => handlers.onRetitle(memory, title)}
        sessionImages={sessionImages}
      />
    );
  }
  if (memory?.status === 'published') {
    return (
      <MemorySavedReceipt
        memory={memory}
        onRetitle={(title) => handlers.onRetitle(memory, title)}
        onOpen={handlers.onOpen}
        onStub={handlers.onStub}
        sessionImages={sessionImages}
      />
    );
  }
  const errorType = memories.getErrorType(anchorId, mediaItemId);
  if (errorType) {
    return <MemoryErrorLine errorType={errorType} onRetry={() => memories.create(anchorId, sourceKind, mediaItemId)} />;
  }
  return null;
}

// ── Inline media components ───────────────────────────────────────────────────

/** Small chip for uploads that failed before reaching the server. */
function FailedUploadChip({ filename }: { filename: string }) {
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-2 max-w-[75%] rounded-2xl rounded-br-sm border border-red-400/20 bg-surface px-3.5 py-2 text-red-400">
        <XCircle size={12} className="flex-shrink-0" />
        <span className="font-mono text-[10.5px] truncate">{filename} — upload failed</span>
      </div>
    </div>
  );
}

// Same thumbnail bounding box as UploadThumbnail.tsx — duplicated rather
// than imported (this component deliberately doesn't share code with
// UploadThumbnail, see the doc comment below), so the echo and the real
// thumbnail it swaps into use identical sizing math.
const THUMB_MAX_W = 240;
const THUMB_MAX_H = 320;
const UPLOADING_PLACEHOLDER_BOX = { width: 192, height: 144 };

function thumbnailBoxSize(width?: number, height?: number): { width: number; height: number } {
  if (!width || !height) return UPLOADING_PLACEHOLDER_BOX;
  const scale = Math.min(THUMB_MAX_W / width, THUMB_MAX_H / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * PendingEcho's own rendering — a standalone visual echo of what the real
 * message + UploadThumbnail will look like once it exists, deliberately NOT
 * built by reusing UploadThumbnail.tsx (kept untouched, per this feature's
 * scope). Same container classes/shimmer treatment as UploadThumbnail's own
 * uploading state, so the swap from echo to real message (see MessageList's
 * pendingEcho render block below) reads as one continuous thing, not two.
 */
function PendingEchoAttachment({
  filename,
  previewUrl,
  type,
  width,
  height,
}: {
  filename: string;
  previewUrl?: string;
  type: 'audio' | 'image' | 'document';
  width?: number;
  height?: number;
}) {
  const kind = memoryKindOf(type === 'image' ? 'photo' : type);
  const Icon = KIND_ICONS[kind.icon] ?? Feather;
  const isImage = type === 'image';
  const boxSize = thumbnailBoxSize(width, height);

  return (
    <div className="flex justify-end">
      <div
        className={
          isImage
            ? 'relative max-w-60 max-h-80 overflow-hidden rounded-2xl rounded-br-sm border border-border bg-surface'
            : 'relative flex max-w-[75%] items-center gap-2.5 overflow-hidden rounded-2xl rounded-br-sm border border-border bg-surface px-3.5 py-2.5'
        }
      >
        {isImage ? (
          previewUrl ? (
            <img
              src={previewUrl}
              alt={filename}
              className="block max-w-60 max-h-80 object-contain"
              style={{ width: boxSize.width, height: boxSize.height }}
            />
          ) : (
            <div style={{ width: boxSize.width, height: boxSize.height }} />
          )
        ) : (
          <>
            <span className="flex-shrink-0 text-accent"><Icon size={16} aria-hidden /></span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-body text-text-primary leading-tight">
              {filename}
            </span>
          </>
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-upload-shimmer motion-reduce:animate-none"
          style={{
            backgroundImage:
              'linear-gradient(100deg, transparent 30%, rgb(var(--color-accent) / 0.28) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
    </div>
  );
}

/** The full echo — attachment thumbnails + the composer's text, if any,
 *  positioned exactly where the real message will land once it exists. */
function PendingEchoBubble({ echo }: { echo: PendingEcho }) {
  return (
    <div className="flex flex-col gap-2">
      {echo.attachments.map((a, i) => (
        <PendingEchoAttachment
          key={i}
          filename={a.filename}
          previewUrl={a.previewUrl}
          type={a.type}
          width={a.width}
          height={a.height}
        />
      ))}
      {echo.text && (
        <div className="flex flex-col items-end gap-1.5">
          <div className="w-fit max-w-[90%] rounded-[18px] rounded-br-[5px] border border-border bg-surface px-4 py-3 font-body text-[15.5px] leading-[1.62] whitespace-pre-wrap text-text-primary opacity-55">
            {echo.text}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  content,
  status,
  onRetry,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onResend,
  onKeep,
  hasMemory,
  keepDisabled,
}: {
  message: Message;
  content: string;
  /** User messages only — delivery status of this message's send attempt. */
  status?: 'sending' | 'sent' | 'failed';
  onRetry?: () => void;
  /** User messages only — Edit/Copy/Send again row (components/chat/UserMessageActions.tsx). */
  isEditing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (text: string) => void;
  onResend?: () => void;
  /** The memory bookmark — first in UserMessageActions' row. See MessageList's renderMemorySlot for the card/pill/receipt itself. */
  onKeep?: () => void;
  hasMemory?: boolean;
  keepDisabled?: boolean;
}) {
  const isUser = message.role === 'user';
  const deliveryStatus = isUser ? status ?? 'sent' : 'sent';

  // Swaps the bubble in place for the editing textarea — same position, no
  // layout jump. DeliveryStatus/UserMessageActions never render alongside it.
  if (isUser && isEditing && onCancelEdit && onSaveEdit) {
    return (
      <div className="flex justify-end">
        <EditableUserBubble initialValue={content} onCancel={onCancelEdit} onSave={onSaveEdit} />
      </div>
    );
  }

  // Assistant path — never actually exercised (MessageBubble is only ever
  // called with a user message; see makeRenderUserMessage) but kept intact.
  if (!isUser) {
    return (
      <div className="group flex flex-col items-start gap-1.5">
        <div className="flex gap-3 justify-start">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden mt-0.5">
            <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
          </div>
          <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-transparent px-4 py-3 font-body text-base leading-relaxed whitespace-pre-wrap text-text-primary">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    // flex-col + items-end (not grid): each child right-aligns to the
    // container's own edge independently, regardless of its own width — this
    // is what actually guarantees the action row's right edge lands under
    // the bubble's. A prior "grid" version of this got that backwards: a
    // single-column CSS grid stretches every item to a shared track width
    // (default justify-items: stretch), and that track is sized to the
    // WIDEST row's max-content — usually the actions row, not the bubble —
    // so the bubble's own max-w-[90%] resolved against the actions row's
    // width instead of the real container, and the two rows' right edges
    // didn't actually align. Verified empirically (Playwright/Chromium
    // harness reproducing this exact DOM+CSS) before reverting.
    <div className="group flex flex-col items-end gap-1.5">
      <div
        onClick={deliveryStatus === 'failed' ? onRetry : undefined}
        className={[
          // Visitor bubble spec (Design Handovers/spec_visitor_bubble.md): shrink-to-fit
          // measure, 18px radius with a 5px bottom-right tail, 15.5/1.62
          // type ramp. Widened past the spec's original 76% (2026-07-28) —
          // it read as cramped next to the assistant's much wider reply.
          //
          // The shake animation used to live on a wrapping <div> around this
          // bubble (present unconditionally, class toggled). That extra
          // shrink-to-fit layer between this flex item and its w-fit content
          // broke max-w-[90%]'s percentage resolution in Chrome — a
          // percentage max-width on a plain block descendant of an
          // align-items:flex-end flex item (not the item itself) hits an
          // indeterminate/circular sizing case, and Chrome resolved it to a
          // width far narrower than the content needed (measured: "Hello"
          // computed to ~72px and wrapped into 2 lines, vs. ~80px/1 line
          // once unwrapped). Applying `chat-bubble-shake` directly on this
          // element — making it the direct flex item, no wrapper — fixes it.
          // Verified via Playwright against the real dev server (not a
          // synthetic harness): before 71.7×76.2px (wrapped), after
          // 79.7×51.1px (single line) for the same "Hello" content.
          'w-fit max-w-[90%] rounded-[18px] rounded-br-[5px] border px-4 py-3 font-body text-[15.5px] leading-[1.62] whitespace-pre-wrap text-text-primary',
          deliveryStatus === 'failed' ? 'cursor-pointer bg-red-400/10 border-red-400/45 chat-bubble-shake' : 'bg-surface border-border',
          deliveryStatus === 'sending' ? 'opacity-55' : '',
        ].filter(Boolean).join(' ')}
      >
        {content}
      </div>
      {onRetry && <DeliveryStatus status={deliveryStatus} onRetry={onRetry} />}
      {deliveryStatus === 'sent' && onStartEdit && onResend && (
        <UserMessageActions
          content={content}
          edited={message.edited}
          onEdit={onStartEdit}
          onResend={onResend}
          onKeep={onKeep}
          hasMemory={hasMemory}
          keepDisabled={keepDisabled}
        />
      )}
    </div>
  );
}

// Same avatar + bubble chrome as MessageBubble's assistant branch, but
// renders a markdown ReactNode instead of a plain string — markdown owns its
// own block spacing, so whitespace-pre-wrap is dropped here.
function AssistantMarkdownBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden mt-0.5">
        <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
      </div>
      <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-transparent px-4 py-3 font-body text-base leading-relaxed text-text-primary">
        {children}
      </div>
    </div>
  );
}

function ErrorBubble({ retry, errorType }: { retry: () => void; errorType: ChatErrorType }) {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden mt-0.5">
        <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
      </div>
      <div className="max-w-[75%] flex flex-col items-start gap-2 rounded-2xl rounded-bl-sm px-4 py-3 font-body text-base leading-relaxed bg-transparent text-text-primary">
        <span>{ERROR_COPY[errorType]}</span>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-text-muted transition-colors hover:border-border/80 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden">
        <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
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

// Renders a user message exactly as before: the admin-only [SYSTEM:] debug
// branch, then media chips (image/audio/document/failed), then prose — now
// with the Edit/Copy/Send again row (or the editing textarea) below the prose,
// plus the memory bookmark and whatever it produced (running pill / draft
// card / saved receipt / failure line).
function makeRenderUserMessage(
  isAdmin: boolean,
  mediaItems: ClientMediaItem[],
  retry: () => void,
  editingId: string | null,
  setEditingId: (id: string | null) => void,
  editMessage: (id: string, text: string) => Promise<void>,
  resendMessage: (id: string) => Promise<void>,
  memories: UseMemoriesReturn,
  keepDisabled: (anchorId: string, mediaItemId?: string) => boolean,
  renderMemorySlotFn: (anchorId: string, sourceKind: MemorySourceKind, mediaItemId?: string) => ReactNode,
  onEnlarge: (src: string, filename: string) => void,
  onStub: ((message: string) => void) | undefined,
) {
  return function renderUserMessage(msg: Message): ReactNode {
    // Admin debug: [SYSTEM: ...] signals are sent via sendHidden and never
    // added to the store, so this branch handles any future case where
    // system-tagged content reaches messages (e.g. a stored hidden turn),
    // without touching non-admin paths.
    if (isAdmin && /^\[SYSTEM:\s*[^\]]*\]/.test(msg.content.trim())) {
      return (
        <div key={msg.id} className="flex justify-end">
          <DebugPill raw={msg.content.trim()} />
        </div>
      );
    }

    const userMsg = parseUserMessage(msg.content);
    const memory = memories.getByAnchor(msg.id);

    return (
      <div key={msg.id} className="flex flex-col gap-2">
        {/* Real uploads — thumbnail/icon + shimmer while pending/processing,
            static once ready, small retry badge on failure. Renders
            unconditionally, caption or no caption. A photo upload
            additionally gets its own PhotoUploadActions row below the
            thumbnail (Photo Bookmark, 2026-08-08) — the `group` wrapper is
            what lets that row's hover-gated icons track the WHOLE
            thumbnail's hover state rather than needing to be hovered
            themselves. Audio/document uploads are untouched: no action row,
            same as before this feature. */}
        {userMsg.uploads.map(u => {
          const mediaItem = mediaItems.find(m => m.id === u.mediaItemId);
          const thumbnail = (
            <UploadThumbnail
              item={mediaItem}
              sourceKind={sourceKindForUserMessage({ uploads: [u], failures: [], duplicates: [], text: '' })}
              filename={u.filename}
              onEnlarge={onEnlarge}
            />
          );
          if (u.type !== 'image') {
            return <div key={u.mediaItemId}>{thumbnail}</div>;
          }
          return (
            <div key={u.mediaItemId} className="group flex flex-col gap-1">
              {thumbnail}
              <PhotoUploadActions
                isReady={mediaItem?.status === 'ready'}
                onBookmark={() => {
                  // Same double-save guard as the whole-message bookmark
                  // below — a memory may already exist for this exact photo,
                  // or a create call may already be in flight for it.
                  if (memories.getByAnchor(msg.id, u.mediaItemId) || memories.isPending(msg.id, u.mediaItemId)) return;
                  memories.create(msg.id, 'photo', u.mediaItemId);
                }}
                onAddToMemory={() => onStub?.('Coming soon')}
                hasMemory={!!memories.getByAnchor(msg.id, u.mediaItemId)}
                keepDisabled={keepDisabled(msg.id, u.mediaItemId)}
                gpsFound={typeof mediaItem?.latitude === 'number' && typeof mediaItem?.longitude === 'number'}
              />
              {renderMemorySlotFn(msg.id, 'photo', u.mediaItemId)}
            </div>
          );
        })}
        {/* Failed-before-server uploads — no media_items row exists at all,
            so these have nothing to retry against. */}
        {userMsg.failures.map((f, idx) => (
          <FailedUploadChip key={idx} filename={f.filename} />
        ))}
        {/* Content-hash duplicate matches — the real thumbnail (same
            mediaItems lookup as a fresh upload, since it's the same live
            item), with a small label instead of no signal at all. No
            PhotoUploadActions/memory slot: the ORIGINAL upload already has
            those, this is a reused reference to it, not a new bookmarkable
            moment. Status prefers the live mediaItems entry over the
            marker's captured one (duplicateLabelForStatus). */}
        {userMsg.duplicates.map(d => {
          const mediaItem = mediaItems.find(m => m.id === d.mediaItemId);
          return (
            <div key={d.mediaItemId}>
              <UploadThumbnail
                item={mediaItem}
                sourceKind={sourceKindForUserMessage({ uploads: [], failures: [], duplicates: [d], text: '' })}
                filename={d.filename}
                onEnlarge={onEnlarge}
                duplicateLabel={duplicateLabelForStatus(mediaItem?.status ?? d.status)}
              />
            </div>
          );
        })}
        {/* Prose — only when there's actual text alongside the upload */}
        {userMsg.text && (
          <MessageBubble
            message={msg}
            content={userMsg.text}
            status={msg.status}
            onRetry={retry}
            isEditing={editingId === msg.id}
            onStartEdit={() => setEditingId(msg.id)}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={text => {
              setEditingId(null);
              void editMessage(msg.id, text);
            }}
            onResend={() => void resendMessage(msg.id)}
            onKeep={() => {
              // Guards against a double-save: a memory may already exist for
              // this anchor (e.g. auto-created by a SAVE_MEMORY marker on an
              // assistant reply this bookmark also targets — not applicable
              // to user messages today, but the guard is symmetric with the
              // assistant onKeep below) or a create call may already be in
              // flight. hasMemory below only used to be cosmetic (icon state);
              // this makes the click itself a no-op too, not just the label.
              if (memory || memories.isPending(msg.id)) return;
              memories.create(msg.id, sourceKindForUserMessage(userMsg));
            }}
            hasMemory={!!memory}
            keepDisabled={keepDisabled(msg.id)}
          />
        )}
        {userMsg.text && renderMemorySlotFn(msg.id, sourceKindForUserMessage(userMsg))}
      </div>
    );
  };
}

interface AssistantRenderConfig {
  isAdmin: boolean;
  inviteToken: string | null;
  storyInviteToken: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  handleAuthSuccess: (name: string) => void;
  messages: Message[];
  isStreaming: boolean;
  regenerate: (id: string) => void;
  setActiveVersion: (id: string, versionIdx: number) => void;
  feedback: UseMessageFeedbackReturn;
  memories: UseMemoriesReturn;
  keepDisabled: (anchorId: string) => boolean;
  renderMemorySlotFn: (anchorId: string, sourceKind: MemorySourceKind) => ReactNode;
}

// Renders an assistant message exactly as before: prose bubble, the
// ACCOUNT_CREATE → MagicLinkCard prompt, and admin-only debug pills for every
// parsed marker. Adds the MessageActions row (Copy/Regenerate/version
// carousel) below the prose, aligned under the avatar like the debug pills.
function makeRenderAssistantMessage(config: AssistantRenderConfig) {
  return function renderAssistantMessage(
    msg: Message,
    parsed: MarkerParseResult,
    markdown: ReactNode,
    index: number,
  ): ReactNode {
    const prose = parsed.prose;
    const authPrompt = parsed.markers.find((m) => m.type === 'ACCOUNT_CREATE');
    // All parsed markers (NAME, EMAIL, PHONE, BOOKING, ACCOUNT_CREATE) are
    // shown as debug pills when admin. parsed.markers is already populated
    // by the registry — debug view is purely additive display.
    const debugMarkers = config.isAdmin ? parsed.markers : [];

    // Skip empty assistant messages — no prose, no auth prompt, no debug.
    if (!prose && !authPrompt && debugMarkers.length === 0) return null;

    // Suppress actions on the message currently being streamed into; scope
    // Regenerate to the latest assistant message only (see MessageActions.tsx).
    // `index` is ChatThread's own map() index — using it directly (rather
    // than config.messages.findIndex((m) => m.id === msg.id)) turned an O(n)
    // render into O(n^2) for a long saved conversation, which is exactly the
    // "clunky" case: switching into an old, long Heirloom story reran a full
    // array scan per assistant message.
    const messageIndex = index;
    const isLast = config.messages[config.messages.length - 1]?.id === msg.id;
    const isActive = config.isStreaming && isLast;
    const versions = msg.versions ?? [];
    const versionIdx = msg.versionIdx ?? 0;
    const { rating } = config.feedback.getFeedback(messageIndex);

    return (
      <div key={msg.id} className="group flex flex-col gap-3">
        {prose && <AssistantMarkdownBubble>{markdown}</AssistantMarkdownBubble>}
        {prose && !isActive && (
          // 60px, not the avatar-only 44px (w-8 avatar + gap-3): the text
          // bubble itself adds another 16px of left padding (px-4) before
          // its actual text starts, so ml-11 alone left the action row
          // sitting under the avatar rather than under the text — visibly
          // misaligned next to jefflougheed's equivalent (SageReply's prose
          // and its MessageActions row share a single pl-4, no avatar to
          // offset for, so they align by construction there).
          <div className="ml-[60px] flex flex-col gap-2">
            <MessageActions
              content={msg.content}
              stopped={msg.stopped}
              versionIdx={versionIdx}
              versionCount={versions.length}
              onRegenerate={isLast ? () => config.regenerate(msg.id) : undefined}
              onVersionChange={(dir) => config.setActiveVersion(msg.id, versionIdx + dir)}
              rating={rating}
              onRate={(val) => config.feedback.rate(messageIndex, val)}
              onFeedback={(reasons, note) => config.feedback.submitFeedback(messageIndex, reasons, note)}
              onKeep={() => {
                // Same double-save guard as the visitor row — matters more
                // here, since a SAVE_MEMORY marker (see the effect above)
                // can already have created a memory for this exact anchor
                // before the visitor ever touches the bookmark.
                if (config.memories.getByAnchor(msg.id) || config.memories.isPending(msg.id)) return;
                config.memories.create(msg.id, 'conversation');
              }}
              hasMemory={!!config.memories.getByAnchor(msg.id)}
              keepDisabled={config.keepDisabled(msg.id)}
            />
            {config.renderMemorySlotFn(msg.id, 'conversation')}
          </div>
        )}
        {authPrompt && (
          <MagicLinkCard
            reason={authPrompt.fields[0] || undefined}
            initialName={config.visitorName}
            initialEmail={config.visitorEmail}
            initialPhone={config.visitorPhone}
            inviteToken={config.inviteToken}
            storyInviteToken={config.storyInviteToken}
            onSuccess={config.handleAuthSuccess}
          />
        )}
        {debugMarkers.length > 0 && (
          <div className="flex flex-col gap-1.5 ml-[60px]">
            {debugMarkers.map((m, idx) => (
              <DebugPill key={idx} raw={m.raw} />
            ))}
          </div>
        )}
      </div>
    );
  };
}

function renderError(retry: () => void, errorType: ChatErrorType): ReactNode {
  return <ErrorBubble retry={retry} errorType={errorType} />;
}

function renderStreamingIndicator(): ReactNode {
  return <TypingIndicator />;
}

export function MessageList({ messages, isLoading, errorType, onOpenMemory, memories, onStub, sessionImages = [] }: MessageListProps) {
  const {
    claimCurrentSession,
    inviteToken,
    storyInviteToken,
    mediaItems,
    retry,
    regenerate,
    setActiveVersion,
    editMessage,
    resendMessage,
    bumpMemoryCount,
    pendingEcho,
    state,
  } = useChatStore();
  const feedback = useMessageFeedback(state.sessionId);
  const { user } = useAuthUser();
  const overlayHost = useChatOverlayHost();
  const [lightbox, setLightbox] = useState<{ src: string; filename: string } | null>(null);
  const { ref: scrollRef, atBottom, handleScroll, scrollToBottom } = useScrollAnchor();

  // SAVE_MEMORY: the guide's own inline signal ("enough has surfaced, write
  // this one up") rather than a manual click — but it triggers the exact same
  // action the bookmark does (memories.create), not a separate save path.
  // Only fires once a reply has finished streaming, matching the bookmark
  // button's own visibility (hidden on the still-active message — see the
  // `!isActive` gate in makeRenderAssistantMessage below) so the archivist
  // call never runs concurrently with the guide's own in-progress reply.
  // Guarded against firing twice for the same message (autoSavedRef) and
  // against double-saving if a memory already exists or is already in flight
  // for that anchor — the same guard the manual bookmark now uses too (see
  // the onKeep handlers below), so marker-then-click, click-then-marker, and
  // marker-fires-twice all land on the same no-op.
  //
  // Also gated on memories.isLoaded: this effect can run within milliseconds
  // of mount, well before useMemories' own GET for existing memories has
  // resolved — without waiting, an automatic fire can race past a memory
  // that already exists server-side (getByAnchor still returns undefined
  // because the list simply hasn't loaded yet, not because nothing exists).
  // A manual click doesn't need this — a human is never that fast — but the
  // guard is the same function for both, so it's correct for both.
  //
  // Also gated on memories.hasOpenDraft(m.id) — per-anchor as of the
  // cross-anchor-bleed fix (see the Memories entry in
  // System Docs/Known Gaps.md). This guards against re-opening a second
  // concurrent draft on the *same* anchor this marker would target — it does
  // not, and should not, wait on drafts open elsewhere: a manual draft on
  // message A must never block a SAVE_MEMORY marker on message B, or vice
  // versa. Deliberately checked BEFORE autoSavedRef is marked, and
  // deliberately does not mark it: skipping here is a deferral, not a
  // permanent no — once this anchor's own open draft is kept/discarded,
  // memories.hasOpenDraft(m.id) flips, this effect re-runs (memories is
  // already a dependency), and the same still-unmarked anchor fires then.
  const autoSavedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!memories.isLoaded) return;
    messages.forEach((m, i) => {
      if (m.role !== 'assistant') return;
      if (isLoading && i === messages.length - 1) return; // still streaming
      if (autoSavedRef.current.has(m.id)) return;
      const hasSaveMarker = markerRegistry.parse(m.content).markers.some((mk) => mk.type === 'SAVE_MEMORY');
      if (!hasSaveMarker) return;
      if (memories.hasOpenDraft(m.id)) return;
      autoSavedRef.current.add(m.id);
      if (memories.getByAnchor(m.id) || memories.isPending(m.id)) return;
      void memories.create(m.id, 'conversation');
    });
  }, [messages, isLoading, memories]);

  const memoryHandlers = {
    onKeep: (memory: MemoryRow) => {
      void memories.keep(memory);
      // Sidebar badge (SidebarV2, via recentSessions) doesn't share state with
      // this hook — reconcile it locally rather than waiting on the next full
      // /api/sessions refetch. Server truth (services/crm/sessions.ts's bulk
      // count) is unaffected either way.
      bumpMemoryCount(memory.session_id, 1);
    },
    // Discard is only ever reachable from the draft card (MemorySavedReceipt
    // has no Discard action) — a discarded memory never counted toward the
    // published total, so there's nothing to reconcile in recentSessions here.
    onDiscard: (memory: MemoryRow) => void memories.discard(memory),
    onRetitle: (memory: MemoryRow, title: string) => void memories.rename(memory.id, title),
    onOpen: onOpenMemory,
    onStub,
  };

  const renderMemorySlotFn = (anchorId: string, sourceKind: MemorySourceKind, mediaItemId?: string) =>
    renderMemorySlot(anchorId, sourceKind, memories, memoryHandlers, mediaItemId, sessionImages);

  // Never nag, never go dead (handoff §6): suppressed only while a turn is
  // streaming or *that specific anchor's (and, for a photo bookmark, that
  // specific photo's)* draft is already open — nothing else may hide the
  // bookmark. Per-anchor(+photo), not session-wide: a stale/open draft on a
  // different message — or a different photo on the SAME message — must
  // never disable this one.
  const keepDisabled = (anchorId: string, mediaItemId?: string) => isLoading || memories.hasOpenDraft(anchorId, mediaItemId);

  // Which user message (if any) is currently swapped into its editing
  // textarea — local, single-message-at-a-time, doesn't need to survive reload.
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    if (editingId && !messages.some(m => m.id === editingId)) setEditingId(null);
  }, [editingId, messages]);

  // Gate strictly on the boundary's isPlatformAdmin (provider-resolved inside
  // services/auth) — never expose debug view to members.
  const isAdmin = user?.isPlatformAdmin === true;

  // Scans every assistant message for the first NAME/EMAIL/PHONE marker, to
  // pre-fill MagicLinkCard fields. Separate from ChatThread's per-message
  // render-time parse (which only sees one message at a time) — this needs
  // every message at once, so it keeps its own registry.parse() pass.
  const scanned = messages.map((m) =>
    m.role === 'assistant' ? markerRegistry.parse(m.content) : null,
  );

  const visitorName = scanned
    .flatMap((r) => r?.markers ?? [])
    .find((m) => m.type === 'NAME')
    ?.fields[0] ?? null;

  const visitorEmail = scanned
    .flatMap((r) => r?.markers ?? [])
    .find((m) => m.type === 'EMAIL')
    ?.fields[0] ?? null;

  const visitorPhone = scanned
    .flatMap((r) => r?.markers ?? [])
    .find((m) => m.type === 'PHONE')
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
    <>
    {lightbox && overlayHost &&
      createPortal(
        <ImageLightbox src={lightbox.src} filename={lightbox.filename} onClose={() => setLightbox(null)} />,
        overlayHost,
      )}
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto overscroll-contain px-4 py-6"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        aria-atomic="false"
        aria-busy={isLoading}
      >
        <div className="max-w-2xl mx-auto flex flex-col gap-5">
          <ChatThread
            messages={messages}
            isStreaming={isLoading}
            errorType={errorType}
            retry={retry}
            renderUserMessage={makeRenderUserMessage(
              isAdmin,
              mediaItems,
              retry,
              editingId,
              setEditingId,
              editMessage,
              resendMessage,
              memories,
              keepDisabled,
              renderMemorySlotFn,
              (src, filename) => setLightbox({ src, filename }),
              onStub,
            )}
            renderAssistantMessage={makeRenderAssistantMessage({
              isAdmin,
              inviteToken,
              storyInviteToken,
              visitorName,
              visitorEmail,
              visitorPhone,
              handleAuthSuccess,
              messages,
              isStreaming: isLoading,
              regenerate,
              setActiveVersion,
              feedback,
              memories,
              keepDisabled,
              renderMemorySlotFn,
            })}
            renderError={renderError}
            renderStreamingIndicator={renderStreamingIndicator}
            showStreamingIndicator={isLoading}
            markdownComponents={membershipMarkdownComponents}
            scrollBehavior="smooth"
            scrollDeps={[messages, isLoading, errorType, pendingEcho]}
          />
          {pendingEcho && <PendingEchoBubble echo={pendingEcho} />}
        </div>
      </div>
      <ScrollToLatestButton visible={!atBottom} onClick={scrollToBottom} />
    </div>
    </>
  );
}
