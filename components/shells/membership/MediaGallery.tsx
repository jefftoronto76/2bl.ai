'use client';

import { useEffect, useState } from 'react';
import {
  AudioLines,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  RefreshCw,
  X,
} from 'lucide-react';
import type { MediaItem } from '@/services/media/types';
import { sanitizeFailureReason, isNeedsReupload } from '@/services/media/errorCopy';

interface MediaGalleryProps {
  onClose: () => void;
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function MediaTypeIcon({ type }: { type: MediaItem['type'] }) {
  if (type === 'audio') return <AudioLines size={16} className="text-accent" />;
  if (type === 'image') return <ImageIcon size={16} className="text-accent" />;
  return <FileText size={16} className="text-accent" />;
}

function StatusBadge({ status }: { status: MediaItem['status'] }) {
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

function MediaCard({ item, onRetry }: { item: MediaItem; onRetry: (id: string) => void }) {
  const [downloading, setDownloading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Confirmed by THIS session's own retry response, checked alongside the
  // DB-persisted signal (isNeedsReupload(item.error_message) — set by a
  // prior attempt, this session or another one) since this gallery does a
  // one-shot fetch on mount with no live poll, so a fresh item.error_message
  // wouldn't otherwise reach this component after a retry click.
  const [confirmedNeedsReupload, setConfirmedNeedsReupload] = useState(false);
  const needsReupload = confirmedNeedsReupload || isNeedsReupload(item.error_message);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/media/${item.id}/url`);
      if (!res.ok) throw new Error(`${res.status}`);
      const { url } = await res.json();
      window.open(url, '_blank', 'noopener noreferrer');
    } catch (err) {
      console.error('[MediaGallery] download failed:', err);
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
      console.error('[MediaGallery] retry failed:', err);
    } finally {
      setRetrying(false);
    }
  };

  const date = new Date(item.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="border border-border rounded-xl bg-surface p-3.5 flex flex-col gap-2.5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent/10 grid place-items-center">
          <MediaTypeIcon type={item.type} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-body text-text-primary leading-tight truncate">
            {item.original_filename}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={item.status} />
            {item.classification && (
              <span className="font-mono text-[9.5px] text-text-muted capitalize">
                {item.classification.replace(/_/g, ' ')}
              </span>
            )}
            <span className="font-mono text-[9.5px] text-text-muted ml-auto">
              {prettySize(item.file_size_bytes)} · {date}
            </span>
          </div>
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

      <div className="flex items-center gap-2 pt-0.5">
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
      </div>
    </div>
  );
}

export function MediaGallery({ onClose }: MediaGalleryProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/media')
      .then((r) => r.json())
      .then((data: { items?: MediaItem[] }) => {
        setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch((err) => console.error('[MediaGallery] fetch failed:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleRetry = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'pending' as const } : item)),
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h2 className="font-display text-[15px] text-text-primary">Media</h2>
        <button
          type="button"
          aria-label="Close media gallery"
          onClick={onClose}
          className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-text-muted">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
            <ImageIcon size={28} className="text-text-muted opacity-40" />
            <p className="font-body text-sm text-text-muted">
              No media yet. Attach a photo, audio file, or document to a message to get started.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <MediaCard key={item.id} item={item} onRetry={handleRetry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
