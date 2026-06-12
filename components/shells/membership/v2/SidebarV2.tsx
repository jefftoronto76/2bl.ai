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
//   • Stories       — Create action, Invite action, then the story list
//   • Writing Prompts (bottom)

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderInput,
  FolderMinus,
  Feather,
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
  /** IDs of starred conversations (drives the Star/Unstar menu label). */
  starredConversationIds?: string[];

  // Nav actions (New Chat + the conversation list come from the store)
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
}

// ── Section label ───────────────────────────────────────────────────────────

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={12} className="text-text-muted" />
      <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-text-muted">
        {children}
      </span>
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

function RowMenu({
  open,
  starred,
  onAction,
  onClose,
}: {
  open: boolean;
  starred?: boolean;
  onAction: (action: RowAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-1 top-full mt-1 z-50 w-52 rounded-xl bg-surface border border-border shadow-lg p-1.5"
    >
      {MENU_ITEMS.map((it, i) => (
        <div key={it.key}>
          {it.danger && <div className="h-px bg-border my-1.5 mx-2" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onAction(it.key);
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg font-body text-sm transition-colors focus:outline-none ${
              it.danger
                ? 'text-amber-400 hover:bg-amber-400/10'
                : 'text-text-primary hover:bg-text-primary/[0.08]'
            }`}
          >
            <it.icon
              size={16}
              className={it.danger ? 'text-amber-400' : 'text-text-muted'}
            />
            {it.key === 'star' && starred ? 'Unstar' : it.label}
          </button>
        </div>
      ))}
    </div>
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
          className="flex-1 min-w-0 bg-transparent border-none outline-none font-body text-sm text-text-primary placeholder-text-muted"
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
  onUploads,
  onShareHeirloom,
  onSearch,
  onCreateStory,
  onInviteToStories,
  onSelectStory,
  onStartStoryChat,
  onSelectPrompt,
  onRowAction,
}: SidebarV2Props) {
  const { state, dispatch, recentSessions, loadSession, newChat } = useChatStore();
  const expanded = state.isSidebarExpanded;

  const [convosOpen, setConvosOpen] = useState(conversationsDefaultOpen);
  const [menuId, setMenuId] = useState<string | null>(null); // `${target}:${id}`
  const searchRevealed = recentSessions.length >= searchThreshold;

  const navBtn =
    'flex items-center gap-3 rounded-lg text-text-muted hover:bg-text-primary/10 ' +
    'hover:text-text-primary transition-all duration-200 focus:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <aside
      className={`flex flex-col h-full bg-background border-r border-border transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
        expanded ? 'w-64' : 'w-12'
      }`}
    >
      {/* Collapse toggle */}
      <div className={`flex items-center px-1.5 mb-2 pt-2 ${expanded ? 'justify-end' : 'justify-center'}`}>
        <IconButton
          label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
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
          onClick={newChat}
          className={`${navBtn} ${expanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'}`}
        >
          <SquarePen size={16} className="flex-shrink-0" />
          {expanded && <span className="font-body text-base font-medium truncate">New Chat</span>}
        </button>
        <button
          type="button"
          aria-label="Uploads"
          onClick={onUploads}
          className={`${navBtn} ${expanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'}`}
        >
          <Upload size={16} className="flex-shrink-0" />
          {expanded && <span className="font-body text-base font-medium truncate">Uploads</span>}
        </button>
        <button
          type="button"
          aria-label="Share Heirloom"
          onClick={onShareHeirloom}
          className={`${navBtn} ${expanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'}`}
        >
          <Share2 size={16} className="flex-shrink-0" />
          {expanded && (
            <span className="font-body text-base font-medium truncate">Share Heirloom</span>
          )}
        </button>

        {/* Conversations — collapsible, last in the primary nav */}
        <div>
          <button
            type="button"
            aria-label="Conversations"
            aria-expanded={convosOpen}
            onClick={() => setConvosOpen((o) => !o)}
            className={`${navBtn} ${expanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'}`}
          >
            <MessageSquare size={16} className="flex-shrink-0" />
            {expanded && (
              <>
                <span className="font-body text-base font-medium truncate flex-1 text-left">
                  Conversations
                </span>
                <ChevronRight
                  size={14}
                  className={`text-text-muted transition-transform ${convosOpen ? 'rotate-90' : ''}`}
                />
              </>
            )}
          </button>

          {expanded && convosOpen && (
            <div className="ml-[18px] pl-2 border-l border-border flex flex-col gap-0.5 mt-0.5">
              {recentSessions.length === 0 ? (
                <span className="px-2 py-1.5 font-body text-sm italic text-text-muted">
                  No conversations yet
                </span>
              ) : (
                recentSessions.map((session) => {
                  const id = `conversation:${session.id}`;
                  const isMenuOpen = menuId === id;
                  return (
                    <div key={session.id} className="relative group flex items-center">
                      <button
                        type="button"
                        onClick={() => loadSession(session.id)}
                        aria-current={state.sessionId === session.id ? 'true' : undefined}
                        className={`flex-1 min-w-0 text-left px-2 py-1.5 rounded-lg font-body text-sm truncate transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          state.sessionId === session.id
                            ? 'bg-text-primary/10 text-text-primary'
                            : 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
                        }`}
                      >
                        {session.title}
                      </button>
                      {onRowAction && (
                        <button
                          type="button"
                          aria-label="Conversation options"
                          onClick={() => setMenuId(isMenuOpen ? null : id)}
                          className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <MoreVertical size={15} />
                        </button>
                      )}
                      <RowMenu
                        open={isMenuOpen}
                        starred={starredConversationIds.includes(session.id)}
                        onAction={(action) =>
                          onRowAction?.('conversation', session.id, action)
                        }
                        onClose={() => setMenuId(null)}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </nav>

      {expanded && (
        <div className="flex flex-col gap-6 mt-5 px-3 pb-3 flex-1 min-h-0 overflow-y-auto">
          {/* Stories */}
          <div>
            <SectionLabel icon={BookOpen}>Stories</SectionLabel>

            {/* Create + Invite — directly under the header */}
            <div className="flex flex-col gap-px mb-2 pb-2 border-b border-border">
              <button
                type="button"
                onClick={onCreateStory}
                className="flex items-center gap-2.5 w-full text-left px-2 py-2 rounded-lg text-accent hover:bg-accent/15 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Plus size={15} className="flex-shrink-0" />
                <span className="font-body text-sm font-semibold">Create</span>
              </button>
              <button
                type="button"
                onClick={onInviteToStories}
                className="flex items-center gap-2.5 w-full text-left px-2 py-2 rounded-lg text-text-muted hover:bg-text-primary/[0.06] hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <UserPlus size={15} className="flex-shrink-0" />
                <span className="font-body text-sm font-medium">Invite</span>
              </button>
            </div>

            {/* Story list */}
            <div className="flex flex-col gap-0.5">
              {stories.map((story) => {
                const id = `story:${story.id}`;
                const isMenuOpen = menuId === id;
                return (
                  <div key={story.id} className="relative group flex items-center gap-0.5">
                    <button
                      type="button"
                      title={story.description ?? story.name}
                      onClick={() => onSelectStory?.(story.id)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg text-text-muted hover:bg-text-primary/[0.05] hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span className="flex-shrink-0 w-[5px] h-[5px] rounded-full bg-accent/60" />
                      <span className="flex-1 min-w-0 font-display text-base truncate">
                        {story.name}
                      </span>
                    </button>
                    {onStartStoryChat && (
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
                    {onRowAction && (
                      <button
                        type="button"
                        aria-label="Story options"
                        onClick={() => setMenuId(isMenuOpen ? null : id)}
                        className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <MoreVertical size={15} />
                      </button>
                    )}
                    <RowMenu
                      open={isMenuOpen}
                      onAction={(action) => onRowAction?.('story', story.id, action)}
                      onClose={() => setMenuId(null)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Writing Prompts — bottom */}
          <div>
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
