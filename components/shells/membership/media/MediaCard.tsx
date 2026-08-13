'use client';

// Card anatomy — Stage 2 (Design Handovers/media_stages_08_2026/
// stage-2-card-anatomy-icons/README_stage.md): vertical, image-forward card
// with a 16/10 thumbnail area on top (real photo when available, a per-type
// tinted tile otherwise) and the existing body/footer below it, unchanged.
// Shared by the in-chat panel and the standalone page via MediaItemsGrid.

import { useState } from 'react';
import {
  AudioLines,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { MediaItemWithUrl } from '@/services/media/display-url';
import { useFreshImageUrl } from '@/services/media/useFreshImageUrl';
import { sanitizeFailureReason, isNeedsReupload } from '@/services/media/errorCopy';

// Small icon-only footer button — same shape/border/hover language as
// MemoryCardView.tsx's own icon-only footer actions (Talk about this / Use
// as a base / Remove), just sized down (h-8 w-8 vs. that panel's h-9 w-9)
// for this card's much narrower footer row. `danger` matches Remove's
// hover-to-red treatment there.
function CardIconButton({
  label,
  danger,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px] border border-border bg-transparent text-text-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        danger ? 'hover:border-border hover:text-red-400' : 'hover:border-accent hover:text-text-primary'
      } ${className}`}
      {...props}
    />
  );
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaTypeIcon({ type, size = 16 }: { type: MediaItemWithUrl['type']; size?: number }) {
  if (type === 'audio') return <AudioLines size={size} className="text-accent" />;
  if (type === 'image') return <ImageIcon size={size} className="text-accent" />;
  return <FileText size={size} className="text-accent" />;
}

// Accent tint mixed into the surface-2 tile background, per type — 8% for
// image (no 'video' member exists on MediaItemType today, see the Stage 2
// investigation notes; add one here if/when that type ships), 5% audio, 3%
// document. A translucent overlay layered on the opaque bg-surface-2 base
// (below), not CSS color-mix() — avoids any browser-support question and
// matches the layered-tint pattern already used elsewhere (e.g. bg-accent/10
// icon chips). Static literal classes, not string-built, so Tailwind's
// content scanner can actually see them.
const MEDIA_TILE_TINT: Record<MediaItemWithUrl['type'], string> = {
  image: 'bg-accent/[0.08]',
  audio: 'bg-accent/[0.05]',
  document: 'bg-accent/[0.03]',
};

export function StatusBadge({ status }: { status: MediaItemWithUrl['status'] }) {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent/15 text-accent font-mono text-[9.5px] uppercase tracking-wide">
        <CheckCircle size={9} />
        Ready
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 font-mono text-[9.5px] uppercase tracking-wide">
        <XCircle size={9} />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-text-muted/15 text-text-muted font-mono text-[9.5px] uppercase tracking-wide">
      <Loader2 size={9} className="animate-spin" />
      Processing
    </span>
  );
}

export function MediaCard({
  item,
  onRetry,
  onAddToMemory,
  onEditStub,
  onDeleteRequest,
  onRename,
}: {
  item: MediaItemWithUrl;
  onRetry: (id: string) => void;
  /** Opens the add-to-memory slide-in panel for this item (media/AddToMemoryPanel.tsx). */
  onAddToMemory: (item: MediaItemWithUrl) => void;
  /** Explicit stub — no edit surface exists yet, same "Editing media is coming soon" pattern memory editing uses elsewhere. */
  onEditStub: () => void;
  /** Opens the (generalized) ConfirmDeleteModal for this item — the caller owns the dialog and the actual removal. */
  onDeleteRequest: (item: MediaItemWithUrl) => void;
  /**
   * Filename rename commit — Aug 2026 Atomic Updates/
   * 09_media_metadata_lazyload. Local-state only: no PATCH endpoint exists
   * for media items today (confirmed absent, same investigation as the
   * delete flow above), so the caller just patches original_filename in its
   * own items array. A page refresh reverts to the stored filename until a
   * real rename endpoint exists — do not add persistence-implying copy
   * here without one.
   */
  onRename: (id: string, name: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(item.original_filename);
  // Confirmed by THIS session's own retry response, checked alongside the
  // DB-persisted signal (isNeedsReupload(item.error_message) — set by a
  // prior attempt, this session or another one) since this card does a
  // one-shot fetch on mount with no live poll, so a fresh item.error_message
  // wouldn't otherwise reach this component after a retry click. Ported
  // from the pre-Stage-1 MediaGallery.tsx's inline MediaCard when merging
  // main's needs-reupload work (heirloom-media-upload-failures) into this
  // shared component.
  const [confirmedNeedsReupload, setConfirmedNeedsReupload] = useState(false);
  const needsReupload = confirmedNeedsReupload || isNeedsReupload(item.error_message);

  // Real thumbnail: image items only — 'video' isn't a MediaItemType member
  // today (Stage 2 investigation notes), so there's no reachable code path
  // for a video thumbnail/play-badge to build against. item.url is the
  // batched signed url from GET /api/media (services/media/display-url.ts,
  // image items only) — 60s-expiry, so useFreshImageUrl shows it immediately
  // (no flicker) then re-resolves a fresh one via GET /api/media/[id]/url on
  // mount, same pattern already used for chat-transcript and memory-panel
  // images (services/media/useFreshImageUrl.ts).
  const isImage = item.type === 'image';
  const { url: freshUrl } = useFreshImageUrl(isImage ? item.id : undefined, item.url ?? undefined);
  const hasThumbnail = isImage && !!freshUrl;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/media/${item.id}/url`);
      if (!res.ok) throw new Error(`${res.status}`);
      const { url } = await res.json();
      window.open(url, '_blank', 'noopener noreferrer');
    } catch (err) {
      console.error('[MediaCard] download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleRetry = async () => {
    if (needsReupload) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/media/${item.id}/retry`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (body?.needsReupload) {
        // Not a "pending, reprocessing" outcome — don't bump status via
        // onRetry, that would misleadingly imply something is running.
        setConfirmedNeedsReupload(true);
      } else if (res.ok) {
        onRetry(item.id);
      }
    } catch (err) {
      console.error('[MediaCard] retry failed:', err);
    } finally {
      setRetrying(false);
    }
  };

  const date = new Date(item.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const startRename = () => {
    setDraftName(item.original_filename);
    setRenaming(true);
  };

  // Escape reverts WITHOUT forcing a blur — mirrors MemoryCardView.tsx's
  // own title-edit fix (same file's history): blurring synchronously right
  // after a state revert can read the STALE pre-revert value, since the
  // state update is async. Enter, by contrast, blurs deliberately — that's
  // what actually triggers the commit below via onBlur.
  const commitRename = () => {
    setRenaming(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== item.original_filename) onRename(item.id, trimmed);
  };
  const cancelRename = () => {
    setDraftName(item.original_filename);
    setRenaming(false);
  };

  return (
    <div className="border border-border rounded-xl bg-surface overflow-hidden flex flex-col h-full">
      {/* Thumbnail area — 16/10, image-forward. Real photo when available;
          otherwise a per-type tinted tile with a centered icon badge, never
          a bare icon on flat gray (explicit design requirement). */}
      <div className="relative w-full flex-shrink-0" style={{ aspectRatio: '16 / 10' }}>
        <div className="absolute top-2 left-2 z-10">
          <StatusBadge status={item.status} />
        </div>
        {hasThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={freshUrl}
            alt={item.original_filename}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-surface-2">
            <div className={`absolute inset-0 ${MEDIA_TILE_TINT[item.type]}`} />
            <div className="absolute inset-0 grid place-items-center">
              <div className="w-14 h-14 rounded-full bg-accent-soft border border-accent/35 grid place-items-center text-accent">
                <MediaTypeIcon type={item.type} size={24} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3.5 flex flex-col gap-2.5 flex-1 min-h-0">
        <div className="min-w-0">
          {renaming ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') cancelRename();
              }}
              className="w-full bg-transparent border border-accent/30 rounded-md px-1.5 -mx-1.5 py-0 text-[13px] font-body text-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
          ) : (
            <button
              type="button"
              onClick={startRename}
              title="Rename file"
              aria-label="Rename file"
              className="flex items-center gap-1.5 w-full min-w-0 text-left"
            >
              <span className="text-[13px] font-body text-text-primary leading-tight truncate">
                {item.original_filename}
              </span>
              <Pencil size={11} className="flex-shrink-0 text-text-muted" />
            </button>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {item.classification && (
              <span className="font-mono text-[9.5px] text-text-muted capitalize">
                {item.classification.replace(/_/g, ' ')}
              </span>
            )}
            <span className="font-mono text-[9.5px] text-text-muted">
              {item.status === 'processing'
                ? `Uploaded ${date} · Processing`
                : `${prettySize(item.file_size_bytes)} · Uploaded ${date}`}
            </span>
          </div>
        </div>

        {item.derived_content && (
          <div className="border-t border-border pt-2.5">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="font-mono text-[10px] uppercase tracking-wide text-text-muted hover:text-text-primary transition-colors"
            >
              {expanded ? 'Hide' : 'Show'} extracted content
            </button>
            {expanded && (
              <p className="mt-2 font-body text-[12.5px] text-text-primary leading-relaxed whitespace-pre-wrap line-clamp-6">
                {item.derived_content}
              </p>
            )}
          </div>
        )}

        {item.status === 'failed' && (
          <p className="text-[11.5px] font-body text-red-400 leading-snug">
            {needsReupload
              ? 'This file needs to be uploaded again — remove it and attach it to a new message.'
              : sanitizeFailureReason(item.error_message)}
          </p>
        )}

        <div className="flex items-center gap-1.5 pt-0.5 mt-auto flex-wrap">
          <CardIconButton label="Add to memory" onClick={() => onAddToMemory(item)}>
            <Plus size={14} />
          </CardIconButton>
          <CardIconButton label="Edit" onClick={onEditStub}>
            <Pencil size={14} />
          </CardIconButton>
          {item.status === 'ready' && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border/80 font-body text-[11.5px] transition-colors disabled:opacity-50"
            >
              <Download size={12} />
              {downloading ? 'Opening…' : 'Download'}
            </button>
          )}
          {/* Hidden once a reprocess attempt confirms the file is gone — a
              second click would just fail identically forever (see
              verifyAndReprocess, services/media/processor.ts). The message
              above already tells the member what to do instead. */}
          {(item.status === 'failed' || item.status === 'ready') && !needsReupload && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              title={item.status === 'ready' ? 'Re-run analysis on this file' : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 font-body text-[11.5px] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={retrying ? 'animate-spin' : ''} />
              {item.status === 'ready'
                ? retrying
                  ? 'Reprocessing…'
                  : 'Reprocess'
                : retrying
                  ? 'Retrying…'
                  : 'Try again'}
            </button>
          )}
          <CardIconButton
            label="Delete"
            danger
            className="ml-auto"
            onClick={() => onDeleteRequest(item)}
          >
            <Trash2 size={14} />
          </CardIconButton>
        </div>
      </div>
    </div>
  );
}
