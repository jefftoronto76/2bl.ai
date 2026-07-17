'use client';

// components/shells/membership/v2/SidebarV2.tsx
//
// V2 sidebar. Like the v1 Sidebar it reads conversation data + New Chat from
// useChatStore(); the new V2 concepts (Stories, Writing Prompts, threshold
// Search, per-row menus) come in via props so the parent stays in control.
//
// Layout (top → bottom):
//   • collapse toggle
//   • Search        — subtle until recentSessions.length >= searchThreshold
//   • New Chat · Uploads · Share Heirloom
//   • Conversations — collapsible; lists store recentSessions (kebab per row)
//   • sign-in nudge — anonymous visitors only (ported from the v1 Sidebar)
//   • Stories       — Create action, Invite action, then the story list;
//                     `storiesDisabled` renders the section inert ("soon" tag)
//   • Writing Prompts (bottom)

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
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
  SquarePen,
  Star,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useChatStore } from '../chatStore';
import { IconButton } from '../ui/IconButton';
import type { RowAction, RowTarget, Story, WritingPrompt } from './types';

export interface SidebarV2Props {
  /** Stories list (not part of the chat store). */
  stories: Story[];
  /** Writing prompts shown at the bottom. */
  writingPrompts: WritingPrompt[];
  /** Conversation count at/above which Search resolves from subtle → visible.
   *  Default 8. */
  searchThreshold?: number;
  /** Whether Conversations starts expanded. Default true. */
  conversationsDefaultOpen?: boolean;
  /** IDs of starred conversations (drives the Star/Unstar menu label + rest-state marker). */
  starredConversationIds?: string[];
  /** IDs of starred stories (drives the Star/Unstar menu label + rest-state marker). */
  starredStoryIds?: string[];
  /** Render the Stories section inert: actions disabled, "soon" tag on the
   *  header. The section stays visible. Default false. */
  storiesDisabled?: boolean;

  // Nav actions (New Chat + the conversation list come from the store)
  onMedia?: () => void;
  onUploads?: () => void;
  onShareHeirloom?: () => void;
  onSearch?: (query: string) => void;

  // Stories
  onCreateStory?: () => void;
  onInviteToStories?: () => void;
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

// ── Per-row kebab menu ──────────────────────────────────────────────────────

const MENU_ITEMS: { key: RowAction; icon: typeof Star; label: string; danger?: boolean }[] = [
  { key: 'star', icon: Star, label: 'Star' },
  { key: 'rename', icon: Pencil, label: 'Rename' },
  { key: 'invite', icon: UserPlus, label: 'Invite collaborators' },
  { key: 'moveToChapter', icon: FolderInput, label: 'Move to chapter' },
  { key: 'removeFromChapter', icon: FolderMinus, label: 'Remove from chapter' },
  { key: 'delete', icon: Trash2, label: 'Delete', danger: true },
];

const MENU_WIDTH = 208; // w-52
const MENU_EST_HEIGHT = 272; // 6 items + separator + padding — flip threshold

function RowMenu({
  open,
  anchorRect,
  starred,
  onAction,
  onClose,
}: {
  open: boolean;
  /** Kebab button rect captured at click time — positions the fixed menu. */
  anchorRect: DOMRect | null;
  starred?: boolean;
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
      {MENU_ITEMS.map((it) => (
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

// ── Threshold-gated search ──────────────────────────────────────────────────

function SearchField({
  expanded,
  revealed,
  onSearch,
}: {
  expanded: boolean;
  revealed: boolean;
  onSearch?: (q: string) => void;
}) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = revealed || focused || hovered || value.length > 0;

  if (!expanded) {
    return (
      <div className="flex justify-center px-1.5 py-0.5">
        <button
          type="button"
          aria-label="Search"
          className={`w-9 h-8 flex items-center justify-center rounded-lg text-text-muted transition-opacity ${
            revealed ? 'opacity-80' : 'opacity-40'
          } hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
        >
          <Search size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="px-3 pt-0.5"
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
          onChange={(e) => {
            setValue(e.target.value);
            onSearch?.(e.target.value);
          }}
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
  searchThreshold = 8,
  conversationsDefaultOpen = true,
  starredConversationIds = [],
  starredStoryIds = [],
  storiesDisabled = false,
  onMedia,
  onUploads,
  onShareHeirloom,
  onSearch,
  onCreateStory,
  onInviteToStories,
  onSelectStory,
  onStartStoryChat,
  onSelectPrompt,
  onRowAction,
  onClose,
  renamingId,
  onRenameCommit,
}: SidebarV2Props) {
  const { state, dispatch, recentSessions, loadSession, newChat } = useChatStore();
  const expanded = state.isSidebarExpanded;
  const { isMember } = state;

  const [convosOpen, setConvosOpen] = useState(conversationsDefaultOpen);
  const [menuId, setMenuId] = useState<string | null>(null); // `${target}:${id}`
  // The open menu's kebab-button rect, captured at click time (the menu portals
  // to <body> with fixed positioning — see RowMenu).
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const searchRevealed = recentSessions.length >= searchThreshold;

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

  const navBtn =
    'flex items-center gap-3 rounded-lg text-text-muted hover:bg-text-primary/10 ' +
    'hover:text-text-primary transition-all duration-200 focus:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <aside
      className={`flex flex-col h-full bg-background border-r border-border transition-all duration-300 ease-in-out overflow-x-hidden overflow-y-auto flex-shrink-0 ${
        expanded ? 'w-64' : 'w-12'
      }`}
    >
      {/* Collapse toggle */}
      <div className={`flex items-center px-1.5 mb-2 pt-2 ${expanded ? 'justify-end' : 'justify-center'}`}>
        <IconButton
          label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className={`relative transition-transform duration-300 before:absolute before:inset-[-4px] before:content-[''] ${expanded ? 'rotate-180' : ''}`}
        >
          <ChevronRight size={16} />
        </IconButton>
      </div>

      <SearchField expanded={expanded} revealed={searchRevealed} onSearch={onSearch} />

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5 px-1.5 pt-1.5">
        <button
          type="button"
          aria-label="New Chat"
          onClick={() => { newChat(); onClose?.(); }}
          className={`${navBtn} ${expanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'}`}
        >
          <SquarePen size={16} className="flex-shrink-0" />
          {expanded && <span className="font-body text-sm font-normal truncate">New Chat</span>}
        </button>
        <button
          type="button"
          aria-label="Media"
          onClick={onMedia}
          className={`${navBtn} ${expanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'} ${onMedia ? '' : 'opacity-40 pointer-events-none'}`}
        >
          <Images size={16} className="flex-shrink-0" />
          {expanded && <span className="font-body text-sm font-normal truncate">Media</span>}
        </button>
        <button
          type="button"
          aria-label="Uploads"
          onClick={onUploads}
          className={`${navBtn} ${expanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'} opacity-40 pointer-events-none`}
        >
          <Upload size={16} className="flex-shrink-0" />
          {expanded && <span className="font-body text-sm font-normal truncate">Uploads</span>}
        </button>
        <button
          type="button"
          aria-label="Share Heirloom"
          onClick={onShareHeirloom}
          className={`${navBtn} ${expanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'} opacity-40 pointer-events-none`}
        >
          <Share2 size={16} className="flex-shrink-0" />
          {expanded && (
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
            className={`${navBtn} ${expanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'}`}
          >
            <MessageSquare size={16} className="flex-shrink-0" />
            {expanded && (
              <>
                <span className="font-body text-sm font-normal truncate flex-1 text-left">
                  Memories
                </span>
                <ChevronRight
                  size={14}
                  className={`text-text-muted transition-transform ${convosOpen ? 'rotate-90' : ''}`}
                />
              </>
            )}
          </button>

          {expanded && convosOpen && (
            <div className="ml-[18px] pl-2 border-l border-border flex flex-col gap-0.5 mt-0.5 max-h-48 overflow-y-auto">
              {recentSessions.length === 0 ? (
                <span className="px-2 py-1.5 font-body text-sm italic text-text-muted">
                  No memories yet
                </span>
              ) : (
                recentSessions.map((session) => {
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
      {expanded && !isMember && (
        <div className="mt-4 px-3">
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
            <LogIn size={13} className="flex-shrink-0 text-text-muted" />
            <p className="font-body text-xs text-text-muted leading-snug">
              Sign in to save your story across sessions.
            </p>
          </div>
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-6 mt-5 px-3 pb-3 flex-1 min-h-0 overflow-y-auto">
          {/* Stories */}
          <div>
            <SectionLabel
              icon={BookOpen}
              large
              trailing={
                storiesDisabled ? (
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-muted/60">
                    soon
                  </span>
                ) : undefined
              }
            >
              Stories
            </SectionLabel>

            {/* Create + Invite — directly under the header */}
            <div className="flex flex-col gap-px mb-2 pb-2 border-b border-border">
              <button
                type="button"
                onClick={onCreateStory}
                disabled={storiesDisabled || !onCreateStory}
                className="flex items-center gap-2.5 w-full text-left px-2 py-2 rounded-lg text-accent hover:bg-accent/15 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent opacity-40 pointer-events-none"
              >
                <Plus size={15} className="flex-shrink-0" />
                <span className="font-body text-sm font-semibold">Create</span>
              </button>
              <button
                type="button"
                onClick={onInviteToStories}
                disabled={storiesDisabled || !onInviteToStories}
                className="flex items-center gap-2.5 w-full text-left px-2 py-2 rounded-lg text-text-muted hover:bg-text-primary/[0.06] hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-muted"
              >
                <UserPlus size={15} className="flex-shrink-0" />
                <span className="font-body text-sm font-medium">Invite</span>
              </button>
            </div>

            {/* Story list */}
            <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
              {stories.map((story) => {
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
                    {onRowAction && !storiesDisabled && (
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
                    <RowMenu
                      open={isMenuOpen}
                      anchorRect={menuRect}
                      starred={starredStoryIds.includes(story.id)}
                      onAction={(action) => onRowAction?.('story', story.id, action)}
                      onClose={closeMenu}
                    />
                  </div>
                );
              })}
            </div>
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
