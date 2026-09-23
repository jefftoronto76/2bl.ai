'use client';

// components/shells/membership/v2/StoryView.tsx
//
// Real Story View — Phase 1a (real-story-view-1a-static-list): an ordered
// list of a story's memories. Mounts as a third pane in ChatHero.tsx, same
// slot/pattern as MemoryCardView/MediaGallery/StoryAdminPanel
// (self-contained: fetches its own memory list, no parent-held list).
// Deliberately NOT in this pass, per the build sequence this Phase belongs
// to (Design Handovers/ Aug 2026 Atomic Updates/01_real_story_view):
//   - No "Share this story" / "+" add-existing-memories buttons — neither
//     has a real production counterpart yet (only the design-handover
//     mockup has them); adding either here would be new work belonging to
//     its own later pass, not this list view.
//   - No "Publish this story" — no defined behavior exists anywhere for
//     it; not guessed at here.
//
// Ownership line: uses `story.isOwner` (real — GET/POST /api/stories,
// services/crm/stories.ts's listStories/createStory), not fixed text. Only
// rendered when true, rather than showing anything false/misleading for a
// collaborator who reached this story via artifact_subscribers.
//
// Row tap (Phase 1b, real-story-view-1b-row-tap-editor): the row's own
// button (title/body/date) is a real <button>, not a decorative div —
// semantic + keyboard accessible per CLAUDE.md's Accessibility principle.
// Tapping it calls onOpenMemory with BOTH the memory id and its own
// session_id — the caller (ChatHero.tsx) needs the latter to open a
// correctly-scoped editor; see StoryMemoryEditor.tsx's doc comment for why
// a story's memory can't generally be opened through ChatHero's own
// currently-active-chat-scoped memory hook.
//
// Row layout (Phase 1e, Story Deck & Memory Panel handover, 2026-09):
// uniform row height regardless of content — a fixed h-24 + centered
// content, rather than letting a body-less memory collapse to a shorter
// row than its neighbors. The kind icon box is conditional on
// `kind.media` ('still' | 'video' only) — text/audio/document memories
// show title/passage/date with no icon box, matching the handover's "a
// thumbnail only renders when the memory actually has photo/video
// content" rule. No `mem.kinds` (plural, mixed-content) handling here —
// that concept doesn't exist anywhere in production yet (confirmed
// repo-wide), so this stays on the existing single `source_kind`.
//
// Reorder (Phase 1c, real-story-view-1c-reorder): up/down move buttons per
// row, not drag-and-drop — deliberately simpler for this pass. Sibling
// buttons alongside the row's own open-editor button, not nested inside it
// (a <button> can't contain another <button>). PATCHes
// /api/stories/[id]/memories ({ memoryId, direction }), then refetches the
// list rather than reordering local state client-side — simplest correct
// option (see moveMemoryInStory's own doc comment, services/crm/
// story-containments.ts, for why the server is the only place that can
// safely compute the new order). Every row's move buttons disable while
// ANY move is in flight, not just the moved row's — a second click on a
// different row before the first move's round trip + refetch resolves
// could otherwise race against a server order the client hasn't seen yet.
//
// Desktop drag-and-drop (Phase 2, Story Deck & Memory Panel handover,
// 2026-09): ADDS a drag handle alongside the up/down buttons — it doesn't
// replace them. The buttons stay exactly as built (keyboard/screen-reader
// accessible, already tested); drag is a pointer-only convenience on top,
// matching CLAUDE.md's accessibility rule (no regression for non-pointer
// users) and the "one change at a time" principle (adding a capability,
// not restructuring the existing one). No new endpoint: a drop is a
// same-direction repeat of the existing single-step PATCH, once per
// position crossed (handleMove's `steps` param), then one refetch at the
// end — the server recomputes its own order on every call, so the client
// never needs to track an intermediate order between steps. `isMobile`
// (same 768px breakpoint ChatHero.tsx uses via @mantine/hooks) hides the
// grip and disables `draggable`: native HTML5 drag doesn't fire from touch
// input, so showing a non-functional handle there would be misleading —
// the existing up/down buttons are already mobile's real fallback, per
// the handover's own "drag becomes chevrons on mobile" note (already true
// here since this view never had drag to fall back FROM until now).
//
// List/Grid toggle, persisted per-story (Phase 3, Story Deck & Memory
// Panel handover, 2026-09): a segmented control in the header. Grid uses a
// CSS grid with fixed-width tracks (grid-cols-[repeat(auto-fill,
// minmax(220px,1fr))]) rather than flex-wrap, per the handover's own note
// that flex-grow stretches tiles in a short trailing row. This view manages
// its view mode itself (self-contained, same posture as its own memory
// fetch above) rather than threading a callback through ChatHero.tsx —
// nothing outside this view renders it. Persisted via PATCH
// /api/stories/[id] ({ view_mode }) into artifacts.metadata — per-story,
// not global, not merely local state (product decision) — with an
// optimistic update that reverts on failure. DeckRow/DeckGridTile below
// share the same drag-and-drop handlers from Phase 2 (same names as the
// design handover's own prototype components, `story-canvas-panel.jsx`,
// for easy cross-reference) so reordering works identically in both views.

import { useCallback, useEffect, useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { BookOpen, Bookmark, ChevronDown, ChevronUp, Eye, GripVertical, LayoutGrid, List, Loader2, Plus, Upload, X } from 'lucide-react';
import type { Story } from './types';
import { memoryKindOf, KIND_ICONS } from '../memory/memoryKinds';
import { CoverBackPanel, type CoverBackData } from './CoverBackPanel';
import { PreviewModal } from './PreviewModal';

export interface StoryViewProps {
  story: Story;
  onClose: () => void;
  onOpenMemory: (memoryId: string, sessionId: string) => void;
  /** Shared toast — same one ChatHero passes to StoryMemoryEditor. Only
   *  used for a move failure; the initial load already has its own inline
   *  error state below. */
  onFlash: (message: string) => void;
  /** Fired once a view-mode PATCH actually succeeds (never on failure/
   *  revert) — mirrors the confirmed value into ChatHero's own `stories`
   *  array, the same handoff `onDescriptionCommit`/`handleUpdateStoryDescription`
   *  already use for the admin panel's description edits. Without this,
   *  `stories` (which supplies `story.viewMode` to every fresh StoryView
   *  mount, via the re-sync effect below) never learns about the save, so
   *  closing and reopening the Deck shows the stale mode again. */
  onViewModeCommit?: (mode: 'list' | 'grid') => void;
}

interface StoryMemoryRow {
  id: string;
  session_id: string;
  title: string;
  body: string;
  source_kind: 'conversation' | 'photo' | 'video' | 'audio' | 'document';
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Collapsed Deck rail (Story-to-memory rail collapse, 2026-09, desktop
 *  only) — rendered by ChatHero.tsx alongside StoryMemoryEditor instead of
 *  fully unmounting this whole view, so opening a memory doesn't lose the
 *  Deck's place entirely. A new, small, dedicated component rather than a
 *  `collapsed` mode on StoryView itself: StoryView's header alone carries
 *  six interactive elements plus full list/grid rendering, drag state, and
 *  two modals — threading a collapsed branch through all of that would be
 *  far messier than this, and StoryView already fully unmounts on this same
 *  transition today (no state to preserve). 48px/w-12, icon-only, matches
 *  the nav's own collapsed-rail convention (SidebarV2.tsx) rather than
 *  inventing rotated/truncated text — no cover-thumbnail field exists on
 *  Story to show instead, and BookOpen is already this view's own header
 *  icon. One real <button> covering the whole rail (not a small icon in a
 *  decorative column) — this file's own header comment already states the
 *  "real <button>, not a decorative div" rule per CLAUDE.md's accessibility
 *  principle, and there's no click-anywhere-on-a-div precedent anywhere in
 *  this component family to depart from that for. */
export function DeckRail({ story, onExpand }: { story: Story; onExpand: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Expand ${story.name}`}
      title={story.name}
      onClick={onExpand}
      className="flex-shrink-0 w-12 h-full flex items-center justify-center border-r border-border bg-background hover:bg-text-primary/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <BookOpen size={18} className="text-accent" aria-hidden />
    </button>
  );
}

/** Shared by both DeckRow and DeckGridTile below — everything the drag
 *  gesture itself needs, independent of which view is rendering it. */
interface DeckDragProps {
  index: number;
  isMobile: boolean;
  moving: string | null;
  dragIndex: number | null;
  overIndex: number | null;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function DeckRow({
  memory,
  total,
  onOpen,
  onMove,
  drag,
}: {
  memory: StoryMemoryRow;
  total: number;
  onOpen: () => void;
  onMove: (direction: 'up' | 'down') => void;
  drag: DeckDragProps;
}) {
  const kind = memoryKindOf(memory.source_kind);
  const Icon = KIND_ICONS[kind.icon] ?? BookOpen;
  const hasThumbnail = kind.media === 'still' || kind.media === 'video';
  const isFirst = drag.index === 0;
  const isLast = drag.index === total - 1;
  return (
    <li
      data-testid="deck-memory-row"
      draggable={!drag.isMobile && drag.moving === null}
      onDragStart={drag.onDragStart}
      onDragEnter={drag.onDragEnter}
      onDragOver={(e) => { if (drag.dragIndex !== null) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); drag.onDrop(); }}
      onDragEnd={drag.onDragEnd}
      className={`flex items-center gap-1 border-b border-border last:border-b-0 transition-opacity ${
        drag.dragIndex === drag.index ? 'opacity-40' : ''
      } ${drag.overIndex === drag.index && drag.dragIndex !== null && drag.dragIndex !== drag.index ? 'bg-accent/5' : ''}`}
    >
      {!drag.isMobile && (
        <span aria-hidden="true" className="flex-shrink-0 w-5 flex items-center justify-center text-text-muted/40 cursor-grab">
          <GripVertical size={14} />
        </span>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-3 h-24 flex-1 min-w-0 text-left rounded-lg -mx-1 px-1 hover:bg-text-primary/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {hasThumbnail && (
          <span data-testid="memory-thumbnail" className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
            <Icon size={16} aria-hidden />
          </span>
        )}
        {/* Reading-width cap (2026-09) — 780px matches the prototype's own
            content column (chat-widget-canvas.jsx, maxWidth: 780). Only the
            text is capped; the row's hover background, border, and move
            buttons still span the full width. */}
        <div className="min-w-0 flex-1 max-w-[780px]">
          <p className="font-body text-sm font-semibold text-text-primary truncate">{memory.title}</p>
          {memory.body && (
            <p className="font-body text-[13px] text-text-muted line-clamp-2 mt-0.5">{memory.body}</p>
          )}
          <p className="font-mono text-[10.5px] text-text-muted mt-1">{formatDate(memory.created_at)}</p>
        </div>
      </button>
      <div className="flex flex-col flex-shrink-0">
        <button
          type="button"
          aria-label="Move up"
          disabled={isFirst || drag.moving !== null}
          onClick={() => onMove('up')}
          className="grid place-items-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronUp size={14} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={isLast || drag.moving !== null}
          onClick={() => onMove('down')}
          className="grid place-items-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronDown size={14} aria-hidden />
        </button>
      </div>
    </li>
  );
}

/** Grid cards are one universal size (2026-09, story-deck workspace fixes
 *  item 5): every tile — memory, cover, back — is a fixed h-72 (288px)
 *  regardless of content, with a fixed h-28 media band (not aspect-ratio,
 *  which would make band height depend on column width). Text that doesn't
 *  fit scrolls inside the card's own content area; the card never grows.
 *  Widths already match within a row via the grid's shared 1fr tracks. The
 *  full text is always reachable by opening the memory. */
const GRID_CARD_CLASS =
  'w-full h-72 flex flex-col text-left overflow-hidden transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const GRID_CARD_BAND_CLASS = 'flex flex-shrink-0 h-28 items-center justify-center';
const GRID_CARD_CONTENT_CLASS = 'block flex-1 min-h-0 overflow-y-auto p-3';

/** Grid-view counterpart to DeckRow — same drag-and-drop, same thumbnail
 *  rule, no up/down buttons (a tile has no natural place for them the way
 *  a full-width row does; drag plus the row view's buttons already cover
 *  both pointer and keyboard reordering). */
function DeckGridTile({
  memory,
  onOpen,
  drag,
}: {
  memory: StoryMemoryRow;
  onOpen: () => void;
  drag: DeckDragProps;
}) {
  const kind = memoryKindOf(memory.source_kind);
  const Icon = KIND_ICONS[kind.icon] ?? BookOpen;
  const hasThumbnail = kind.media === 'still' || kind.media === 'video';
  return (
    <li
      data-testid="deck-memory-row"
      draggable={!drag.isMobile && drag.moving === null}
      onDragStart={drag.onDragStart}
      onDragEnter={drag.onDragEnter}
      onDragOver={(e) => { if (drag.dragIndex !== null) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); drag.onDrop(); }}
      onDragEnd={drag.onDragEnd}
      className={`list-none transition-opacity ${drag.dragIndex === drag.index ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className={`${GRID_CARD_CLASS} rounded-xl border bg-surface hover:bg-text-primary/[0.02] ${
          drag.overIndex === drag.index && drag.dragIndex !== null && drag.dragIndex !== drag.index ? 'border-accent' : 'border-border'
        }`}
      >
        {hasThumbnail && (
          <span className={`${GRID_CARD_BAND_CLASS} bg-accent/15 text-accent`}>
            <Icon size={22} aria-hidden />
          </span>
        )}
        <span data-testid="grid-card-content" className={GRID_CARD_CONTENT_CLASS}>
          <span className="block font-body text-sm font-semibold text-text-primary truncate">{memory.title}</span>
          {memory.body && (
            <span className="block font-body text-[12.5px] text-text-muted mt-1">
              {memory.body}
            </span>
          )}
          <span className="block font-mono text-[10px] text-text-muted mt-2">{formatDate(memory.created_at)}</span>
        </span>
      </button>
    </li>
  );
}

/** Cover/back's list-view row (Phase 4, Story Deck & Memory Panel handover,
 *  2026-09) — a distinct dashed-border row, pinned first (cover) or last
 *  (back) via render order in StoryView, not a flag on this component.
 *  Never draggable — it isn't a memory, it isn't reorderable. Stub only:
 *  `data` is StoryView's own local state, never persisted (see
 *  CoverBackPanel.tsx's header comment). */
function DeckEndRow({
  kind,
  data,
  onEdit,
  onRemove,
}: {
  kind: 'cover' | 'back';
  data: CoverBackData | null;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const label = kind === 'cover' ? 'Cover' : 'Back page';
  return (
    <li data-testid="deck-end-row" draggable={false} className="flex items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-3 h-24 flex-1 min-w-0 text-left rounded-2xl border-[1.5px] border-dashed border-border bg-surface-2 px-3 hover:bg-text-primary/[0.02] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex-shrink-0 w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center text-text-muted">
          {kind === 'cover' ? <BookOpen size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1 max-w-[780px]">
          <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-accent">{label}</p>
          <p className="font-display text-[15px] font-medium text-text-primary truncate mt-0.5">
            {data ? data.heading || 'Untitled' : 'Not added yet'}
          </p>
          <p className="font-body text-xs text-text-muted mt-0.5">{data ? 'Tap to edit' : 'Tap to choose a template'}</p>
        </div>
      </button>
      {data && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={15} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** Grid-view counterpart to DeckEndRow — sized like DeckGridTile so cover/
 *  back scale with the same column width rather than spanning full width. */
function DeckEndTile({
  kind,
  data,
  onEdit,
  onRemove,
}: {
  kind: 'cover' | 'back';
  data: CoverBackData | null;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const label = kind === 'cover' ? 'Cover' : 'Back page';
  return (
    <li data-testid="deck-end-row" draggable={false} className="relative list-none">
      <button
        type="button"
        onClick={onEdit}
        className={`${GRID_CARD_CLASS} rounded-xl border-[1.5px] border-dashed border-border bg-surface-2 hover:bg-text-primary/[0.02]`}
      >
        <span className={`${GRID_CARD_BAND_CLASS} bg-background text-text-muted`}>
          {kind === 'cover' ? <BookOpen size={22} aria-hidden /> : <Bookmark size={22} aria-hidden />}
        </span>
        <span data-testid="grid-card-content" className={GRID_CARD_CONTENT_CLASS}>
          <span className="block font-mono text-[10px] tracking-[0.12em] uppercase text-accent">{label}</span>
          <span className="block font-display text-sm font-medium text-text-primary truncate mt-0.5">
            {data ? data.heading || 'Untitled' : 'Not added yet'}
          </span>
          <span className="block font-body text-[11px] text-text-muted mt-0.5">{data ? 'Tap to edit' : 'Tap to choose a template'}</span>
        </span>
      </button>
      {data && (
        // Sibling of the tile button, not nested inside it — a <button>
        // can't validly contain another focusable/interactive element.
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="absolute top-2 right-2 grid place-items-center w-6 h-6 rounded-md bg-black/55 text-white cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={13} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** Header "Add" menu (Phase 4) — Memory / Cover page / Back page. Closes on
 *  outside click via the fixed full-screen backdrop, same pattern
 *  SourceMenu.tsx's popover variant uses for its own relative-positioned
 *  dropdown. "Memory" is disabled: no real "add an existing memory to this
 *  story" picker exists in production yet (traced before building this —
 *  the only real memory<->story attachment path today is the reverse
 *  direction, a memory's own StoryPicker) — stubbing a fake connection here
 *  would be worse than being upfront that it's not built. */
function AddMenu({
  hasCover,
  hasBack,
  onPick,
}: {
  hasCover: boolean;
  hasBack: boolean;
  onPick: (kind: 'cover' | 'back') => void;
}) {
  const [open, setOpen] = useState(false);
  const item =
    'flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg font-body text-[13.5px] text-text-primary ' +
    'hover:bg-text-primary/[0.07] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        aria-label="Add to this story"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Plus size={16} aria-hidden />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-40" aria-hidden="true" />
          <div role="menu" aria-label="Add to this story" className="absolute top-full right-0 mt-1.5 z-50 w-52 rounded-xl bg-surface border border-border shadow-[0_18px_50px_-16px_rgba(0,0,0,0.55)] p-1.5">
            <button type="button" role="menuitem" disabled className={`${item} opacity-40 cursor-not-allowed`} title="Coming soon">
              <Bookmark size={15} className="flex-shrink-0 text-accent" aria-hidden />
              Memory
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onPick('cover'); }}
              className={item}
            >
              <BookOpen size={15} className="flex-shrink-0 text-accent" aria-hidden />
              {hasCover ? 'Edit cover page' : 'Cover page'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onPick('back'); }}
              className={item}
            >
              <Bookmark size={15} className="flex-shrink-0 text-accent" aria-hidden />
              {hasBack ? 'Edit back page' : 'Back page'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function StoryView({ story, onClose, onOpenMemory, onFlash, onViewModeCommit }: StoryViewProps) {
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false;
  const [memories, setMemories] = useState<StoryMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Non-null while a move's PATCH + refetch round trip is in flight — the
  // moved memory's own id, though every row's buttons disable while it's
  // set (see this file's own header comment for why).
  const [moving, setMoving] = useState<string | null>(null);
  // Drag-and-drop (desktop only) — the source row's index while a drag is
  // active, and the row currently under the pointer, purely for the visual
  // opacity/highlight below. Neither drives reordering directly: the actual
  // move only happens on drop, via the same PATCH endpoint the buttons use.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(story.viewMode ?? 'list');
  // Guards against out-of-order PATCH responses (found in review): without
  // this, clicking List then Grid before the first request resolves fires
  // two overlapping PATCHes whose responses can land in either order,
  // leaving the persisted value mismatched from the last click. Mirrors
  // `moving`'s own disable-the-control-while-in-flight pattern above rather
  // than a request-queueing/epoch mechanism.
  const [savingViewMode, setSavingViewMode] = useState(false);
  // Cover/back pages (Phase 4) — STUB ONLY, local state, never persisted:
  // no schema/API work this round (see CoverBackPanel.tsx's header
  // comment). `editingEnd` is which panel is open, if any; `null` means
  // closed.
  const [cover, setCover] = useState<CoverBackData | null>(null);
  const [backPage, setBackPage] = useState<CoverBackData | null>(null);
  const [editingEnd, setEditingEnd] = useState<'cover' | 'back' | null>(null);
  // Preview reader (Phase 5) — view-only, reads whatever's already in this
  // component's own state (memories/cover/backPage), no fetch of its own.
  const [previewOpen, setPreviewOpen] = useState(false);

  // Re-syncs when a different story is opened — this component doesn't
  // remount on story switch (ChatHero.tsx passes no `key`), so without this
  // the previous story's view mode AND cover/back stub state would leak
  // into the next one. Deliberately keyed on story.id ONLY (found in
  // review, 2026-09-23): a successful view-mode save now flows back into
  // `story.viewMode` via ChatHero's onViewModeCommit mirror (a new `story`
  // object, same id), and this effect used to also key on story.viewMode —
  // so saving List/Grid for the SAME story re-ran this same reset and
  // silently wiped the member's in-progress cover/back-page edits. No
  // separate re-sync of viewMode is needed here either: handleSetViewMode
  // already sets it optimistically before onViewModeCommit ever fires.
  useEffect(() => {
    setViewMode(story.viewMode ?? 'list');
    setCover(null);
    setBackPage(null);
    setEditingEnd(null);
    setPreviewOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id]);

  /** Returns the fresh list on success, or null on any failure — never
   *  throws, matching this component's existing silent-log-and-degrade
   *  posture for the initial load. */
  const loadMemories = useCallback(async (): Promise<StoryMemoryRow[] | null> => {
    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(story.id)}/memories`);
      if (!res.ok) return null;
      const data: { memories?: StoryMemoryRow[] } = await res.json();
      return Array.isArray(data.memories) ? data.memories : [];
    } catch (err) {
      console.error('[StoryView] memories fetch failed:', err);
      return null;
    }
  }, [story.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      const result = await loadMemories();
      if (cancelled) return;
      if (result === null) {
        setLoadError(true);
      } else {
        setMemories(result);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMemories]);

  /** `steps` > 1 backs a drag-and-drop drop that crossed more than one row:
   *  the endpoint only ever moves one position, so this repeats the same
   *  single-step PATCH `steps` times (each one recomputed server-side off
   *  its own persisted order, never off a client-held order) and refetches
   *  once at the end, not after every step. */
  const handleMove = async (memoryId: string, direction: 'up' | 'down', steps = 1) => {
    setMoving(memoryId);
    try {
      for (let i = 0; i < steps; i++) {
        const res = await fetch(`/api/stories/${encodeURIComponent(story.id)}/memories`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memoryId, direction }),
        });
        if (!res.ok) {
          console.error('[StoryView] move failed:', res.status);
          onFlash('Could not move memory');
          // A multi-step drag (steps > 1) can fail partway through — an
          // earlier step in this same loop may have already persisted.
          // Refetch so local state reflects the server's real order rather
          // than staying on the pre-move order, which would make the next
          // drag/nudge compute its target from indices that no longer
          // match what's actually persisted.
          const partial = await loadMemories();
          if (partial !== null) setMemories(partial);
          return;
        }
      }
      const result = await loadMemories();
      if (result === null) {
        onFlash('Could not move memory');
        return;
      }
      setMemories(result);
    } catch (err) {
      console.error('[StoryView] move threw:', err);
      onFlash('Could not move memory');
    } finally {
      setMoving(null);
    }
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex || moving !== null) return;
    const dragged = memories[dragIndex];
    const steps = Math.abs(targetIndex - dragIndex);
    const direction = targetIndex > dragIndex ? 'down' : 'up';
    void handleMove(dragged.id, direction, steps);
  };

  /** Optimistic — flips immediately, PATCHes in the background, reverts on
   *  failure. A no-op if it's already the current mode (avoids a pointless
   *  request when the segmented control re-fires its own active state).
   *  Disables the List/Grid buttons for the duration (savingViewMode) so a
   *  second click can't fire an overlapping PATCH whose response might land
   *  before the first's — see the buttons' own `disabled` prop below. Calls
   *  onViewModeCommit only once the PATCH is confirmed, never on revert, so
   *  ChatHero's `stories` only ever mirrors an actually-persisted value. */
  const handleSetViewMode = async (mode: 'list' | 'grid') => {
    if (mode === viewMode || savingViewMode) return;
    const previous = viewMode;
    setViewMode(mode);
    setSavingViewMode(true);
    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(story.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view_mode: mode }),
      });
      if (!res.ok) {
        console.error('[StoryView] view mode update failed:', res.status);
        setViewMode(previous);
        onFlash('Could not save view preference');
        return;
      }
      onViewModeCommit?.(mode);
    } catch (err) {
      console.error('[StoryView] view mode update threw:', err);
      setViewMode(previous);
      onFlash('Could not save view preference');
    } finally {
      setSavingViewMode(false);
    }
  };

  /** Mobile Preview gating (Phase 6) — the button stays visible everywhere
   *  (removing it entirely was the brief's other allowed option, but this
   *  round picked the message, per the handover's own Known-unknowns note),
   *  but tapping it on a small screen surfaces a toast instead of opening
   *  the reader — no mobile-optimized book-reading experience was designed
   *  this round. Reuses the shared `onFlash` toast, same one every other
   *  failure message in this file already goes through. */
  const handleOpenPreview = () => {
    if (isMobile) {
      onFlash('Preview looks best on a bigger screen — open Heirloom on your computer to see the finished book.');
      return;
    }
    setPreviewOpen(true);
  };

  const countLabel = `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`;

  return (
    <div className="relative flex flex-col h-full bg-background">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border flex-shrink-0">
        <div className="min-w-0 flex items-center gap-2.5">
          <BookOpen size={16} className="text-accent flex-shrink-0" aria-hidden />
          <div className="min-w-0">
            <h2 className="font-display text-[15px] text-text-primary truncate">{story.name}</h2>
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-text-muted mt-0.5">
              {countLabel}
              {story.isOwner ? ' · you own this story' : ''}
            </p>
          </div>
        </div>
        <AddMenu hasCover={!!cover} hasBack={!!backPage} onPick={(kind) => setEditingEnd(kind)} />
        {!isMobile && (
          <div role="group" aria-label="Deck layout" className="flex items-center gap-0.5 p-0.5 rounded-lg bg-text-primary/5 border border-border flex-shrink-0">
            <button
              type="button"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              disabled={savingViewMode}
              onClick={() => handleSetViewMode('list')}
              className={`grid place-items-center w-7 h-7 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed ${
                viewMode === 'list' ? 'bg-accent text-background' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <List size={14} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              disabled={savingViewMode}
              onClick={() => handleSetViewMode('grid')}
              className={`grid place-items-center w-7 h-7 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed ${
                viewMode === 'grid' ? 'bg-accent text-background' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <LayoutGrid size={14} aria-hidden />
            </button>
          </div>
        )}
        <button
          type="button"
          aria-label="Preview this story"
          title="Preview this story"
          onClick={handleOpenPreview}
          className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Eye size={15} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Share this story — coming soon"
          title="Sharing is coming soon"
          disabled
          className="grid place-items-center w-8 h-8 rounded-lg text-text-muted opacity-40 cursor-not-allowed flex-shrink-0"
        >
          <Upload size={15} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Close story"
          onClick={onClose}
          className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-text-muted">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : loadError ? (
          <p className="font-body text-sm text-text-muted">Could not load this story&rsquo;s memories.</p>
        ) : (
          <>
            {viewMode === 'grid' && !isMobile ? (
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                <DeckEndTile kind="cover" data={cover} onEdit={() => setEditingEnd('cover')} onRemove={() => setCover(null)} />
                {memories.map((memory, index) => (
                  <DeckGridTile
                    key={memory.id}
                    memory={memory}
                    onOpen={() => onOpenMemory(memory.id, memory.session_id)}
                    drag={{
                      index,
                      isMobile,
                      moving,
                      dragIndex,
                      overIndex,
                      onDragStart: () => setDragIndex(index),
                      onDragEnter: () => { if (dragIndex !== null) setOverIndex(index); },
                      onDrop: () => handleDrop(index),
                      onDragEnd: () => { setDragIndex(null); setOverIndex(null); },
                    }}
                  />
                ))}
                <DeckEndTile kind="back" data={backPage} onEdit={() => setEditingEnd('back')} onRemove={() => setBackPage(null)} />
              </ol>
            ) : (
              <ol className="flex flex-col gap-2">
                <DeckEndRow kind="cover" data={cover} onEdit={() => setEditingEnd('cover')} onRemove={() => setCover(null)} />
                {memories.map((memory, index) => (
                  <DeckRow
                    key={memory.id}
                    memory={memory}
                    total={memories.length}
                    onOpen={() => onOpenMemory(memory.id, memory.session_id)}
                    onMove={(direction) => handleMove(memory.id, direction)}
                    drag={{
                      index,
                      isMobile,
                      moving,
                      dragIndex,
                      overIndex,
                      onDragStart: () => setDragIndex(index),
                      onDragEnter: () => { if (dragIndex !== null) setOverIndex(index); },
                      onDrop: () => handleDrop(index),
                      onDragEnd: () => { setDragIndex(null); setOverIndex(null); },
                    }}
                  />
                ))}
                <DeckEndRow kind="back" data={backPage} onEdit={() => setEditingEnd('back')} onRemove={() => setBackPage(null)} />
              </ol>
            )}
            {memories.length === 0 && (
              <p className="font-body text-sm italic text-text-muted mt-4">
                No memories in this story yet. New memories will show up here as they&rsquo;re kept.
              </p>
            )}
          </>
        )}
      </div>

      <CoverBackPanel
        kind={editingEnd ?? 'cover'}
        open={editingEnd !== null}
        initial={editingEnd === 'cover' ? cover : editingEnd === 'back' ? backPage : null}
        onClose={() => setEditingEnd(null)}
        onSave={(data) => {
          if (editingEnd === 'cover') setCover(data);
          else if (editingEnd === 'back') setBackPage(data);
          setEditingEnd(null);
        }}
        onRemove={() => {
          if (editingEnd === 'cover') setCover(null);
          else if (editingEnd === 'back') setBackPage(null);
          setEditingEnd(null);
        }}
      />

      <PreviewModal
        open={previewOpen}
        storyName={story.name}
        cover={cover}
        backPage={backPage}
        memories={memories}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
