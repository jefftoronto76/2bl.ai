'use client';

// components/shells/membership/v2/SidebarV2.tsx
//
// V2 sidebar. Like the v1 Sidebar it reads conversation data + New Chat from
// useChatStore(); the new V2 concepts (Stories, Writing Prompts, Search,
// per-row menus) come in via props so the parent stays in control.
//
// Layout (top → bottom):
//   • header row   — search (title-only: conversations + stories, live,
//                    always visible — Aug 2026 Search and Collapse Bar) next
//                    to a collapse toggle (desktop) or Close-X (mobile, when
//                    onClose is provided)
//   • New Chat · Share Heirloom
//   • Conversations — collapsible; lists store recentSessions (kebab per row)
//   • sign-in nudge — anonymous visitors only (ported from the v1 Sidebar)
//   • Stories       — Create action, then the story list, each row carrying
//                     its own invite icon (onInviteStory);
//                     `storiesDisabled` renders the section inert ("soon" tag)
//   • Writing Prompts (bottom)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Bookmark,
  ChevronRight,
  Clock,
  FolderInput,
  FolderMinus,
  Feather,
  Images,
  LogIn,
  MessageCircle,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Quote,
  Search,
  Share2,
  Shield,
  SquarePen,
  Star,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useChatStore } from '../chatStore';
import { IconButton } from '../ui/IconButton';
import type { RowAction, RowTarget, Story, WritingPrompt } from './types';

export interface SidebarV2Props {
  /** Stories list (not part of the chat store). */
  stories: Story[];
  /** Writing prompts shown at the bottom. */
  writingPrompts: WritingPrompt[];
  /** Whether Conversations starts expanded. Default true. */
  conversationsDefaultOpen?: boolean;
  /** IDs of starred conversations (drives the Star/Unstar menu label + rest-state marker). */
  starredConversationIds?: string[];
  /** IDs of starred stories (drives the Star/Unstar menu label + rest-state marker). */
  starredStoryIds?: string[];
  /** Render the Stories section inert: actions disabled, "soon" tag on the
   *  header. The section stays visible. Default false. */
  storiesDisabled?: boolean;
  /** The story id whose StoryView pane is currently open (ChatHero's
   *  `storyViewId`, real-story-view Phase 1a/1b) — moved to the top of the
   *  Stories list, same spirit as the active session. Unlike `sessionId`
   *  this isn't chat-store state (a story pane isn't a chat session), so it
   *  arrives as a prop rather than being read off useChatStore() the way
   *  orderedSessions reads state.sessionId below. Undefined when no story
   *  pane is open. */
  activeStoryId?: string;

  // Nav actions (New Chat + the conversation list come from the store)
  onMedia?: () => void;
  onShareHeirloom?: () => void;
  /** Fires on every keystroke in the search field. SidebarV2 already uses the
   *  query itself to filter the Memories/Stories lists below (title/name,
   *  case-insensitive) — this is only for a parent that wants to observe it
   *  too; no-op if omitted. */
  onSearch?: (query: string) => void;

  // Stories
  onCreateStory?: () => void;
  /** Invite collaborators to a specific story — the row's own invite icon,
   *  not the old story-agnostic header button (see invites-collaboration-modal). */
  onInviteStory?: (storyId: string) => void;
  onSelectStory?: (storyId: string) => void;
  onStartStoryChat?: (storyId: string) => void;

  // Writing prompts
  onSelectPrompt?: (prompt: WritingPrompt) => void;

  // Per-row kebab menu
  onRowAction?: (target: RowTarget, id: string, action: RowAction) => void;

  // Mobile overlay close callback — called after New Chat or session selection
  // so the parent can dismiss the overlay. No-op when undefined (desktop).
  onClose?: () => void;

  // Inline rename
  /** Session id currently being renamed — shows an input in place of the title. */
  renamingId?: string;
  /** Called when rename input blurs or Enter is pressed. Empty string = cancel. */
  onRenameCommit?: (id: string, newTitle: string) => void;

  /**
   * Forces the collapsed icon rail (w-12) regardless of the user's own
   * expand/collapse preference — used while the memory panel is open
   * (memory-panel-layout Stage B), where there isn't room for both the full
   * sidebar and the panel inside the drawer's capped width. Deliberately
   * does not touch the internal `expanded` state, so the user's own
   * preference is exactly what they left it at once the panel closes.
   * Default false.
   */
  forceCollapsed?: boolean;
}

// ── Section label ───────────────────────────────────────────────────────────

function SectionLabel({
  icon: Icon,
  large,
  trailing,
  children,
}: {
  icon: typeof Clock;
  /** When true, renders a slightly larger icon (14px) and text-sm label. */
  large?: boolean;
  /** Optional right-aligned adornment (e.g. the "soon" tag). */
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={large ? 14 : 12} className="text-text-muted" />
      <span
        className={
          large
            ? 'font-mono text-sm tracking-[0.2em] uppercase text-text-muted'
            : 'font-mono text-[11px] tracking-[0.2em] uppercase text-text-muted'
        }
      >
        {children}
      </span>
      {trailing && <span className="ml-auto">{trailing}</span>}
    </div>
  );
}

// ── Memory count mark ───────────────────────────────────────────────────────
// One mark — accent bookmark + mono numeral — used on both conversation rows
// and the section header's aggregate, so they read as one system. Rows/totals
// with no memories render NOTHING — the absence is what makes a marked row a
// signal. Counts are derived from each session's own memory_count (itself
// derived server-side from published artifacts rows — see
// services/crm/sessions.ts) — never stored beyond that.
function SidebarMemoryCount({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      title={`${count} ${count === 1 ? 'memory' : 'memories'} kept`}
      className="inline-flex shrink-0 items-center gap-[3px] text-accent"
    >
      <Bookmark size={11} />
      <span className="font-mono text-[10.5px] leading-none">{count}</span>
    </span>
  );
}

// ── Per-row kebab menu ──────────────────────────────────────────────────────

// `targets` makes this list target-aware — previously a single flat array
// rendered identically for both conversation and story rows (moveToChapter/
// removeFromChapter showed on story rows too, purely by omission: they're
// chapter-related, not story-related, and were only ever wired as no-ops for
// stories elsewhere — see ChatHero.tsx's handleRowAction — not by design).
// 'admin' is the first item that's genuinely target-specific by design (Admin
// panel, story-only — Updated Story Kebabs handover).
const MENU_ITEMS: { key: RowAction; icon: typeof Star; label: string; danger?: boolean; targets: RowTarget[] }[] = [
  { key: 'star', icon: Star, label: 'Star', targets: ['conversation', 'story'] },
  { key: 'rename', icon: Pencil, label: 'Rename', targets: ['conversation', 'story'] },
  { key: 'admin', icon: Shield, label: 'Admin', targets: ['story'] },
  { key: 'moveToChapter', icon: FolderInput, label: 'Move to chapter', targets: ['conversation'] },
  { key: 'removeFromChapter', icon: FolderMinus, label: 'Remove from chapter', targets: ['conversation'] },
  { key: 'delete', icon: Trash2, label: 'Delete', danger: true, targets: ['conversation', 'story'] },
];

const MENU_WIDTH = 208; // w-52
const MENU_EST_HEIGHT = 272; // 6 items + separator + padding — flip threshold

function RowMenu({
  open,
  anchorRect,
  starred,
  target,
  onAction,
  onClose,
}: {
  open: boolean;
  /** Kebab button rect captured at click time — positions the fixed menu. */
  anchorRect: DOMRect | null;
  starred?: boolean;
  /** Which row type this menu belongs to — filters MENU_ITEMS down to the
   *  entries whose `targets` include it (e.g. 'admin' is story-only,
   *  'moveToChapter'/'removeFromChapter' are conversation-only). */
  target: RowTarget;
  onAction: (action: RowAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // 'click' (not mousedown) so toggling the kebab button doesn't close-then-
    // reopen: the button's own click handler and this listener see the same
    // event, and both resolve to "close".
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // Capture-phase Escape with stopPropagation so the chat panel's own
    // window-level Escape handler doesn't also fire (one press, one layer).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // The menu is position: fixed — anchored to a rect captured at open. Any
    // scroll or resize detaches it from its row, so just close.
    const onScrollOrResize = () => onClose();
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  // Rendered through a portal: the sidebar is overflow-hidden and the section
  // list overflow-y-auto, so an in-tree absolute menu gets clipped. Fixed
  // positioning from the captured rect, flipped above the anchor when there
  // is no room below.
  const top =
    anchorRect.bottom + 4 + MENU_EST_HEIGHT > window.innerHeight
      ? Math.max(8, anchorRect.top - MENU_EST_HEIGHT - 4)
      : anchorRect.bottom + 4;
  const left = Math.max(
    8,
    Math.min(anchorRect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
  );

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ top, left }}
      className="fixed z-[90] w-52 rounded-xl bg-surface border border-border shadow-lg p-1.5"
    >
      {MENU_ITEMS.filter((it) => it.targets.includes(target)).map((it) => (
        <div key={it.key}>
          {it.danger && <div className="h-px bg-border my-1.5 mx-2" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onAction(it.key);
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg font-body text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              it.danger
                ? 'text-[#E58D80] hover:bg-[#E58D80]/10'
                : 'text-text-primary hover:bg-text-primary/[0.08]'
            }`}
          >
            <it.icon
              size={16}
              className={it.danger ? 'text-[#E58D80]' : 'text-text-muted'}
            />
            {it.key === 'star' && starred ? 'Unstar' : it.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ── Search ───────────────────────────────────────────────────────────────
// Title-only search (Aug 2026 Search and Collapse Bar, Phase 1): filters
// conversations by title and stories by name, live, off one shared query —
// no threshold gate anymore (`revealed` is always passed `true` by the
// caller now that search has real filtering behind it regardless of
// conversation count). The hover/focus/typing "active" treatment below is
// unchanged from before the threshold was removed.

function SearchField({
  expanded,
  revealed,
  value,
  onSearch,
}: {
  expanded: boolean;
  revealed: boolean;
  value: string;
  onSearch: (q: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = revealed || focused || hovered || value.length > 0;

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label="Search"
        className={`w-9 h-8 flex items-center justify-center rounded-lg text-text-muted transition-opacity ${
          revealed ? 'opacity-80' : 'opacity-40'
        } hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        <Search size={16} />
      </button>
    );
  }

  return (
    <div
      className="flex-1 min-w-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all ${
          active
            ? 'bg-surface border-border opacity-100'
            : 'bg-transparent border-transparent opacity-40'
        }`}
      >
        <Search size={15} className="flex-shrink-0 text-text-muted" />
        <input
          value={value}
          onChange={(e) => onSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search your story"
          aria-label="Search your story"
          className="flex-1 min-w-0 bg-transparent border-none outline-none font-body text-base text-text-primary placeholder-text-muted"
        />
      </div>
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

export function SidebarV2({
  stories,
  writingPrompts,
  conversationsDefaultOpen = true,
  starredConversationIds = [],
  starredStoryIds = [],
  storiesDisabled = false,
  onMedia,
  onShareHeirloom,
  onSearch,
  onCreateStory,
  onInviteStory,
  onSelectStory,
  onStartStoryChat,
  onSelectPrompt,
  onRowAction,
  onClose,
  renamingId,
  onRenameCommit,
  forceCollapsed = false,
  activeStoryId,
}: SidebarV2Props) {
  const { state, recentSessions, loadSession, newChat } = useChatStore();
  const { isMember } = state;

  // Active-session-to-top (2026-08-13) — recentSessions arrives server-sorted
  // by updated_at DESC (services/crm/sessions.ts) and just switching to an
  // older session (no new message sent) never touches updated_at, so without
  // this the active row stays wherever it naturally falls instead of
  // surfacing at the top. Derived, not mutated in place — recentSessions
  // itself stays server-order; only totalMemoryCount below reads it directly,
  // and a sum doesn't care about order. filteredSessions (search+collapse
  // redesign, merged same day) is derived from orderedSessions, not
  // recentSessions, specifically so the active row stays first under a live
  // search too — see that definition below. No match (or already first)
  // returns the original array as-is, so nothing downstream that relies on
  // referential stability sees a needless new array.
  const orderedSessions = useMemo(() => {
    const activeIndex = recentSessions.findIndex((s) => s.id === state.sessionId);
    if (activeIndex <= 0) return recentSessions;
    const active = recentSessions[activeIndex];
    return [active, ...recentSessions.slice(0, activeIndex), ...recentSessions.slice(activeIndex + 1)];
  }, [recentSessions, state.sessionId]);

  // Active-story-to-top (2026-08-14, closing the other half of
  // active_item_to_top) — same pattern as orderedSessions above: derived,
  // not a mutation of the `stories` prop, stable sort, no-op (same array
  // reference) when there's no active story or it's already first.
  // `activeStoryId` is a prop (ChatHero's storyViewId) rather than store
  // state, since a story pane isn't a chat session the way sessionId is.
  const orderedStories = useMemo(() => {
    if (!activeStoryId) return stories;
    const activeIndex = stories.findIndex((s) => s.id === activeStoryId);
    if (activeIndex <= 0) return stories;
    const active = stories[activeIndex];
    return [active, ...stories.slice(0, activeIndex), ...stories.slice(activeIndex + 1)];
  }, [stories, activeStoryId]);

  // Whether this docked/overlay instance shows full labels + lists (w-64) or
  // just the icon rail (w-12). Deliberately NOT state.isSidebarExpanded —
  // that flag means "is the mobile overlay open at all" (owned by ChatHero /
  // the shell reducer). Conflating the two meant the desktop sidebar — which
  // always renders — started in the collapsed icon rail (isSidebarExpanded's
  // initial value is false), hiding the Memories/Conversations list and every
  // row inside it until a visitor first found and clicked the tiny collapse
  // chevron: clicking a conversation "did nothing" because there was nothing
  // rendered to click. This local flag starts expanded so the conversation
  // list is visible and clickable immediately, on both mobile and desktop.
  const [expanded, setExpanded] = useState(true);
  // Stage B: every render decision below reads isExpanded, not expanded
  // directly — forceCollapsed overrides the visible state without touching
  // the user's own stored preference.
  const isExpanded = forceCollapsed ? false : expanded;

  const [convosOpen, setConvosOpen] = useState(conversationsDefaultOpen);
  const [storiesOpen, setStoriesOpen] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null); // `${target}:${id}`
  // The open menu's kebab-button rect, captured at click time (the menu portals
  // to <body> with fixed positioning — see RowMenu).
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const totalMemoryCount = recentSessions.reduce((sum, s) => sum + s.memoryCount, 0);

  // Title-only search (Phase 1 — conversations + stories; memory content is
  // a separate later phase, see the handover). Query lives here, not inside
  // SearchField, so it can drive both list filters below.
  const [query, setQuery] = useState('');
  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    onSearch?.(q);
  }, [onSearch]);
  const trimmedQuery = query.trim().toLowerCase();
  // Filters orderedSessions (active-first), not recentSessions directly —
  // Array.filter preserves relative order, so the active session (already
  // moved to front by orderedSessions above) stays at the front of the
  // filtered results too when it matches the query, instead of the
  // pre-reorder server order resurfacing under search.
  const filteredSessions = trimmedQuery
    ? orderedSessions.filter((s) => s.title.toLowerCase().includes(trimmedQuery))
    : orderedSessions;
  // Filters orderedStories (active-first), not stories directly — same
  // ordering of operations as filteredSessions above (sort, then filter) so
  // the active story stays first among search results too.
  const filteredStories = trimmedQuery
    ? orderedStories.filter((s) => s.name.toLowerCase().includes(trimmedQuery))
    : orderedStories;

  // Stable reference so RowMenu's [open, onClose] effect doesn't re-register
  // its window listener on every SidebarV2 render.
  const closeMenu = useCallback(() => setMenuId(null), []);

  const toggleMenu = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    // Stop propagation so the click never reaches an already-open RowMenu's
    // window listener. Without this, clicking Kebab B while Menu A is open
    // causes onDocClick (A's listener) to fire in the same event batch as
    // toggleMenu, calling setMenuId(null) after setMenuId('B') — last write
    // wins, Menu B never opens.
    e.stopPropagation();
    if (menuId === id) {
      setMenuId(null);
    } else {
      setMenuRect(e.currentTarget.getBoundingClientRect());
      setMenuId(id);
    }
  };

  // gap-0.5 (2px) stacks these buttons vertically — half-gap (1px) top/bottom
  // is as far as an invisible hit-area can safely grow without adjacent rows'
  // zones overlapping. Horizontal is deliberately untouched: in the
  // collapsed state the <aside> is only w-12 (48px total) with
  // overflow-x-hidden, so there's no room to expand into without either
  // clipping or widening the collapsed column itself (a visible change).
  const navBtn =
    'relative flex items-center gap-3 rounded-lg text-text-muted hover:bg-text-primary/10 ' +
    'hover:text-text-primary transition-all duration-200 focus:outline-none ' +
    "focus-visible:ring-2 focus-visible:ring-accent before:absolute before:content-[''] before:-inset-y-[1px]";

  return (
    <aside
      className={`flex flex-col h-full bg-background border-r border-border transition-all duration-300 ease-in-out overflow-x-hidden overflow-y-auto flex-shrink-0 ${
        isExpanded ? 'w-64' : 'w-12'
      }`}
    >
      {/* Header row — search + collapse (desktop) or Close-X (mobile, when
          onClose is provided), combined (Aug 2026 Search and Collapse Bar).
          The toggle/close button is hidden while forced, same as the old
          standalone collapse row — nothing meaningful to toggle to while
          forceCollapsed overrides the rendered width regardless of the
          user's own preference. Search itself keeps rendering (degraded to
          its icon-only form) since forceCollapsed only ever affects width,
          not whether search should exist. */}
      <div
        className={`flex mb-2 pt-2 ${
          isExpanded ? 'items-center gap-2 px-3' : 'flex-col items-center gap-1.5 px-1.5'
        }`}
      >
        <SearchField expanded={isExpanded} revealed value={query} onSearch={handleSearch} />
        {!forceCollapsed && (
          onClose ? (
            <IconButton
              label="Close menu"
              onClick={onClose}
              className="relative flex-shrink-0 before:absolute before:inset-[-4px] before:content-['']"
            >
              <X size={18} />
            </IconButton>
          ) : (
            <IconButton
              label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
              onClick={() => setExpanded((v) => !v)}
              className={`relative flex-shrink-0 transition-transform duration-300 before:absolute before:inset-[-4px] before:content-[''] ${expanded ? 'rotate-180' : ''}`}
            >
              <ChevronRight size={16} />
            </IconButton>
          )
        )}
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5 px-1.5 pt-1.5">
        <button
          type="button"
          aria-label="New Chat"
          onClick={() => { newChat(); onClose?.(); }}
          className={`${navBtn} ${isExpanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'}`}
        >
          <SquarePen size={16} className="flex-shrink-0" />
          {isExpanded && <span className="font-body text-sm font-normal truncate">New Chat</span>}
        </button>
        <button
          type="button"
          aria-label="Media"
          onClick={onMedia}
          className={`${navBtn} ${isExpanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'} ${onMedia ? '' : 'opacity-40 pointer-events-none'}`}
        >
          <Images size={16} className="flex-shrink-0" />
          {isExpanded && <span className="font-body text-sm font-normal truncate">Media</span>}
        </button>
        <button
          type="button"
          aria-label="Share Heirloom"
          onClick={onShareHeirloom}
          className={`${navBtn} ${isExpanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'} ${onShareHeirloom ? '' : 'opacity-40 pointer-events-none'}`}
        >
          <Share2 size={16} className="flex-shrink-0" />
          {isExpanded && (
            <span className="font-body text-sm font-normal truncate">Share Heirloom</span>
          )}
        </button>

        {/* Conversations — collapsible, last in the primary nav */}
        <div>
          <button
            type="button"
            aria-label="Memories"
            aria-expanded={convosOpen}
            onClick={() => setConvosOpen((o) => !o)}
            className={`${navBtn} ${isExpanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'}`}
          >
            <MessageSquare size={16} className="flex-shrink-0" />
            {isExpanded && (
              <>
                <span className="font-body text-sm font-normal truncate flex-1 text-left">
                  Memories
                </span>
                <SidebarMemoryCount count={totalMemoryCount} />
                <ChevronRight
                  size={14}
                  className={`text-text-muted transition-transform ${convosOpen ? 'rotate-90' : ''}`}
                />
              </>
            )}
          </button>

          {isExpanded && convosOpen && (
            <div className="ml-[18px] pl-2 border-l border-border flex flex-col gap-0.5 mt-0.5 max-h-48 overflow-y-auto">
              {filteredSessions.length === 0 ? (
                <span className="px-2 py-1.5 font-body text-sm italic text-text-muted">
                  {trimmedQuery ? 'No matches' : 'No memories yet'}
                </span>
              ) : (
                filteredSessions.map((session) => {
                  const id = `conversation:${session.id}`;
                  const isMenuOpen = menuId === id;
                  return (
                    <div key={session.id} className="relative group flex items-center">
                      {renamingId === session.id ? (
                        <input
                          autoFocus
                          defaultValue={session.title}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.currentTarget.blur(); }
                            if (e.key === 'Escape') { onRenameCommit?.(session.id, ''); }
                          }}
                          onBlur={(e) => onRenameCommit?.(session.id, e.currentTarget.value)}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg font-body text-base bg-surface border border-accent/30 text-text-primary outline-none focus:ring-2 focus:ring-accent"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => { loadSession(session.id); onClose?.(); }}
                          aria-current={state.sessionId === session.id ? 'true' : undefined}
                          className={`flex-1 min-w-0 text-left px-2 py-1.5 rounded-lg font-body text-sm truncate transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            state.sessionId === session.id
                              ? 'bg-text-primary/10 text-text-primary'
                              : 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
                          }`}
                        >
                          {session.title}
                        </button>
                      )}
                      <SidebarMemoryCount count={session.memoryCount} />
                      {onRowAction && (
                        // One 28×28 slot: star marker at rest, kebab on hover.
                        // Both fill the same absolute box — no layout shift.
                        <div className="relative flex-shrink-0 w-7 h-7">
                          {starredConversationIds.includes(session.id) && (
                            <span
                              className={`absolute inset-0 grid place-items-center text-accent pointer-events-none transition-opacity ${
                                isMenuOpen ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
                              }`}
                            >
                              <Star size={13} fill="currentColor" />
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label="Conversation options"
                            aria-expanded={isMenuOpen}
                            onClick={(e) => toggleMenu(id, e)}
                            className={`absolute inset-0 flex items-center justify-center rounded-lg text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      )}
                      <RowMenu
                        open={isMenuOpen}
                        anchorRect={menuRect}
                        starred={starredConversationIds.includes(session.id)}
                        target="conversation"
                        onAction={(action) =>
                          onRowAction?.('conversation', session.id, action)
                        }
                        onClose={closeMenu}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Sign-in nudge — anonymous visitors only (v1 Sidebar parity). */}
      {isExpanded && !isMember && (
        <div className="mt-4 px-3">
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
            <LogIn size={13} className="flex-shrink-0 text-text-muted" />
            <p className="font-body text-xs text-text-muted leading-snug">
              Sign in to save your story across sessions.
            </p>
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="flex flex-col gap-6 mt-5 px-3 pb-3 flex-1 min-h-0 overflow-y-auto">
          {/* Stories */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={14} className="text-text-muted" />
              <span className="font-mono text-sm tracking-[0.2em] uppercase text-text-muted">
                Stories
              </span>
              <div className="ml-auto flex items-center gap-1">
                {storiesDisabled && (
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-muted/60 mr-1">
                    soon
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Create a new story"
                  title="Create a new story"
                  onClick={() => { onCreateStory?.(); setStoriesOpen(true); }}
                  disabled={storiesDisabled || !onCreateStory}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-accent hover:bg-accent/15 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  aria-label={storiesOpen ? 'Collapse stories' : 'Expand stories'}
                  aria-expanded={storiesOpen}
                  onClick={() => setStoriesOpen((o) => !o)}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-text-muted hover:bg-text-primary/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <ChevronRight
                    size={14}
                    className={`transition-transform ${storiesOpen ? 'rotate-90' : ''}`}
                  />
                </button>
              </div>
            </div>

            {/* Story list */}
            {storiesOpen && (
              <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                {filteredStories.map((story) => {
                  const id = `story:${story.id}`;
                  const isMenuOpen = menuId === id;
                  return (
                    <div key={story.id} className="relative group flex items-center gap-0.5">
                      <button
                        type="button"
                        title={story.description ?? story.name}
                        onClick={() => onSelectStory?.(story.id)}
                        disabled={storiesDisabled}
                        className="flex-1 min-w-0 flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg text-text-muted hover:bg-text-primary/[0.05] hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-muted"
                      >
                        <span className="flex-shrink-0 w-[5px] h-[5px] rounded-full bg-accent/60" />
                        <span className="flex-1 min-w-0 font-display text-base truncate">
                          {story.name}
                        </span>
                      </button>
                      {onStartStoryChat && !storiesDisabled && (
                        <button
                          type="button"
                          aria-label={`Start a chat in ${story.name}`}
                          title="Start a new chat"
                          onClick={() => onStartStoryChat(story.id)}
                          className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:bg-accent/15 hover:text-accent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <MessageCircle size={14} />
                        </button>
                      )}
                      {onInviteStory && !storiesDisabled && (
                        // Sibling button, not nested inside the row's own <button>
                        // (invalid HTML) — same pattern as onStartStoryChat above.
                        <button
                          type="button"
                          aria-label={`Invite collaborators to ${story.name}`}
                          title="Invite collaborators"
                          onClick={() => onInviteStory(story.id)}
                          className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:bg-accent/15 hover:text-accent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <UserPlus size={14} />
                        </button>
                      )}
                      {/* Kebab is hidden entirely (not rendered with a filtered/
                          empty item list) for a story this member doesn't own —
                          every current row action (star/rename/invite/delete/
                          admin) is owner-only, and a collaborator has no way to
                          coordinate with the owner to request one (no
                          inter-member chat exists), so a visible-but-inert kebab
                          would just be a dead end. This doesn't apply to
                          conversation rows above — sessions have no ownership
                          concept. */}
                      {onRowAction && !storiesDisabled && story.isOwner && (
                        // One 28×28 slot: star marker at rest, kebab on hover.
                        <div className="relative flex-shrink-0 w-7 h-7">
                          {starredStoryIds.includes(story.id) && (
                            <span
                              className={`absolute inset-0 grid place-items-center text-accent pointer-events-none transition-opacity ${
                                isMenuOpen ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
                              }`}
                            >
                              <Star size={13} fill="currentColor" />
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label="Story options"
                            aria-expanded={isMenuOpen}
                            onClick={(e) => toggleMenu(id, e)}
                            className={`absolute inset-0 flex items-center justify-center rounded-lg text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      )}
                      {story.isOwner && (
                        <RowMenu
                          open={isMenuOpen}
                          anchorRect={menuRect}
                          starred={starredStoryIds.includes(story.id)}
                          target="story"
                          onAction={(action) => onRowAction?.('story', story.id, action)}
                          onClose={closeMenu}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Writing Prompts — bottom */}
          <div className="opacity-40 pointer-events-none">
            <SectionLabel icon={Feather}>Writing Prompts</SectionLabel>
            <div className="flex flex-col gap-2">
              {writingPrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => onSelectPrompt?.(prompt)}
                  className="flex gap-2.5 items-start text-left px-3 py-2.5 rounded-xl bg-transparent border border-border text-text-muted hover:bg-accent/15 hover:border-accent/30 hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Quote size={13} className="flex-shrink-0 text-accent/80 mt-0.5" />
                  <span className="font-display italic text-base leading-snug">{prompt.text}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
