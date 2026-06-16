'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AudioLines, CheckCircle, FileText, Image as ImageIcon, Loader2, Plus, XCircle } from 'lucide-react';
import type { MediaItem } from '@/services/media/types';

type FilterTab = 'all' | 'image' | 'document' | 'audio' | 'video';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Photos' },
  { key: 'document', label: 'Letters' },
  { key: 'audio', label: 'Audio' },
  { key: 'video', label: 'Video' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ item }: { item: MediaItem }) {
  if (item.status === 'pending' || item.status === 'processing') {
    return (
      <div className="flex items-center gap-1.5">
        <Loader2 size={10} className="text-text-muted animate-spin flex-shrink-0" />
        <span className="font-mono text-[10px] text-text-muted">Processing…</span>
      </div>
    );
  }
  if (item.status === 'ready') {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle size={10} className="text-accent flex-shrink-0" />
        <span className="font-mono text-[10px] text-text-muted">{item.classification ?? 'Ready'}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <XCircle size={10} className="text-red-400 flex-shrink-0" />
      <span className="font-mono text-[10px] text-red-400">Failed</span>
    </div>
  );
}

function ImageCard({ item }: { item: MediaItem }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/media/${item.id}/url`)
      .then((r) => r.json())
      .then((d: { url?: string }) => { if (d.url) setUrl(d.url); })
      .catch(() => {});
  }, [item.id]);

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-border bg-surface hover:border-accent/40 transition-colors">
      <div className="aspect-square bg-background flex items-center justify-center overflow-hidden">
        {url ? (
          <img src={url} alt={item.original_filename} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={24} className="text-text-muted opacity-30" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <span className="font-body text-[13px] text-text-primary truncate leading-tight">
          {item.original_filename}
        </span>
        <StatusBadge item={item} />
        <div className="flex items-center justify-between mt-1">
          <span className="font-mono text-[10px] text-text-muted">{formatBytes(item.file_size_bytes)}</span>
          <span className="font-mono text-[10px] text-text-muted truncate max-w-[60%] text-right">
            {item.story_id ? 'Saved to story' : 'Unfiled'}
          </span>
        </div>
      </div>
    </div>
  );
}

function FileCard({ item }: { item: MediaItem }) {
  const icon =
    item.type === 'audio' ? (
      <AudioLines size={22} className="text-accent" />
    ) : (
      <FileText size={22} className="text-accent" />
    );

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-border bg-surface hover:border-accent/40 transition-colors">
      <div className="aspect-square bg-background flex items-center justify-center">
        {icon}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <span className="font-body text-[13px] text-text-primary truncate leading-tight">
          {item.original_filename}
        </span>
        <StatusBadge item={item} />
        <div className="flex items-center justify-between mt-1">
          <span className="font-mono text-[10px] text-text-muted">{formatBytes(item.file_size_bytes)}</span>
          <span className="font-mono text-[10px] text-text-muted truncate max-w-[60%] text-right">
            {item.story_id ? 'Saved to story' : 'Unfiled'}
          </span>
        </div>
      </div>
    </div>
  );
}

function MediaCard({ item }: { item: MediaItem }) {
  if (item.type === 'image') return <ImageCard item={item} />;
  return <FileCard item={item} />;
}

function EmptyState({ tab }: { tab: FilterTab }) {
  const label = TABS.find((t) => t.key === tab)?.label?.toLowerCase() ?? 'materials';
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <p className="font-display italic text-xl text-text-muted">No {label} yet.</p>
      <p className="font-body text-sm text-text-muted max-w-xs leading-relaxed">
        Add materials from the chat by uploading photos, letters, or audio recordings.
      </p>
      <Link
        href="/heirloom"
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-background font-body text-sm hover:bg-accent-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Plus size={14} />
        Add materials
      </Link>
    </div>
  );
}

interface MaterialsGridProps {
  items: MediaItem[];
}

export function MaterialsGrid({ items }: MaterialsGridProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const countFor = (tab: FilterTab): number => {
    if (tab === 'all') return items.length;
    if (tab === 'video') return 0;
    return items.filter((i) => i.type === tab).length;
  };

  const filtered = items.filter((item) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'video') return false;
    return item.type === activeTab;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/heirloom"
            className="font-mono text-[11px] tracking-[0.2em] uppercase text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ← Back
          </Link>
          <h1 className="font-display text-2xl font-light text-text-primary mt-1">Materials</h1>
          <p className="font-body text-sm text-text-muted mt-0.5">
            Your photos, letters, and recordings
          </p>
        </div>
        <Link
          href="/heirloom"
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-background font-body text-sm hover:bg-accent-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Add materials</span>
          <span className="sm:hidden">Add</span>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="border-b border-border px-6 flex gap-0 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const count = countFor(tab.key);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={activeTab === tab.key}
              className={[
                'px-4 py-3 font-body text-sm whitespace-nowrap border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                activeTab === tab.key
                  ? 'border-accent text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary',
              ].join(' ')}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-2 font-mono text-[11px] opacity-50">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="px-6 py-6">
        {filtered.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
