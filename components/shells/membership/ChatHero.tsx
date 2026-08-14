'use client';

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { Check } from 'lucide-react';
import { SidebarV2 } from './v2/SidebarV2';
import { BeginStoryModal } from './v2/BeginStoryModal';
import { InviteCollaboratorsModal } from './v2/InviteCollaboratorsModal';
import { ConfirmDeleteModal } from './v2/ConfirmDeleteModal';
import type { Collaborator, RowAction, RowTarget, Story, WritingPrompt } from './v2/types';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { useChatStore } from './chatStore';
import { useMemories, type MemoryRow } from '@/services/chat/ui/v1/useMemories';
import { useKeyboardViewport } from '@/services/chat/ui/v1/core/useKeyboardViewport';
import { SaveChatCTA } from './SaveChatCTA';
import { GateView } from './GateView';
import { MemoryPanelDivider } from './MemoryPanelDivider';
import { MemoryCardView } from './memory/MemoryCardView';
import { MediaGallery } from './MediaGallery';
import { MediaPage } from './MediaPage';
import { StoryAdminPanel } from './v2/StoryAdminPanel';
import type { SessionImage } from './memory/BlockCanvas';
import { clampWidth, maxPanelWidth, seedPanelWidth, MIN_PANEL_WIDTH } from './memoryPanelWidth';

// Static client-side prompt set — Writing Prompts have no backend yet (the
// sidebar's other story affordances are stubbed for the same reason). Copy is
// placeholder-grade: review before launch.
const WRITING_PROMPTS: WritingPrompt[] = [
  { id: 'wp-1', text: 'What’s a smell that takes you straight back to childhood?' },
  { id: 'wp-2', text: 'Tell me about a meal you’ll never forget.' },
  { id: 'wp-3', text: 'What did your first home look like?' },
  { id: 'wp-4', text: 'Who taught you something you still carry?' },
];

// Media pane has no drag-resize (unlike the memory panel) — a fixed width is
// enough; MIN_PANEL_WIDTH (memoryPanelWidth.ts) is scoped to the resizable
// panel's clamp math and isn't reused here.
const MEDIA_PANEL_WIDTH = 400;

function EmptyState() {
  const { invitedName, hasInviteToken } = useChatStore();
  const personalized = hasInviteToken && invitedName;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 select-none">
      {personalized ? (
        <>
          <h1 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-3 text-center">
            Welcome, {invitedName}.
          </h1>
          <p className="text-text-muted text-base md:text-lg text-center">
            What&apos;s a story worth keeping?
          </p>
        </>
      ) : (
        <h1 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-8 text-center">
          What&apos;s a story worth keeping?
        </h1>
      )}
    </div>
  );
}

export interface ChatHeroProps {
  /** Drawer width state — passed through to ChatHeader's expand toggle. */
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

export function ChatHero({ isFullScreen, onToggleFullScreen }: ChatHeroProps) {
  const { state, dispatch, errorType, isGated, sendMessage, recentSessions, starSession, renameSession, deleteSession, bumpMemoryCount, mediaItems, joinedStoryConfirmation } = useChatStore();

  // The memory panel's image-block picker (BlockCanvas.tsx, via
  // MemoryCardView) only ever offers photos already uploaded in THIS
  // session, already fetched for the composer's own inline thumbnails —
  // no separate fetch for the panel. `status: 'ready'` and a resolved `url`
  // both matter: a still-processing/failed item has nothing to attach, and
  // `url` (the batch-fetched signed download URL, services/media/display-url.ts)
  // is what the picker's thumbnail and the committed block's <img> actually render.
  const sessionImages: SessionImage[] = useMemo(
    () =>
      mediaItems
        .filter((item) => item.type === 'image' && item.status === 'ready' && !!item.url)
        .map((item) => ({ id: item.id, url: item.url as string, filename: item.original_filename })),
    [mediaItems],
  );

  // V2 sidebar wiring. Stories are real now (2026-08-09) — artifacts rows,
  // type='story' (services/crm/stories.ts), a sibling to memories'
  // type='memory' rows, not a dedicated table. Created via POST /api/stories
  // (handleCreateStory below) and fetched on mount via GET /api/stories
  // (below) rather than living only in this local state, though this state
  // remains the source of truth SidebarV2 (and InviteCollaboratorsModal's
  // story picker) render from — the create/fetch/delete paths just keep it
  // in sync with the DB. Rows are still inert for select/chat — moveToChapter/
  // removeFromChapter and selecting into a story's own view remain
  // deliberate no-ops (there's no story view to select into yet; see System
  // Docs/Known Gaps.md). Uploads / Share / Search are stubbed per the
  // integration decisions. Invite is real (invites-collaboration-modal,
  // 2026-08-10) — see handleInviteStory below — and now picks from this
  // same real `stories` list, though createMemberInvite itself still only
  // bridges the chosen story_id through audit-event metadata, not a real
  // column/relationship (services/members/members.ts's own doc comment —
  // unchanged by this merge, still accurate: that's Stage 2 schema work
  // Real Stories didn't include).
  const [beginStoryOpen, setBeginStoryOpen] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);

  // Fetch/refresh hydration, mirroring chatStore.tsx's own GET /api/sessions
  // recovery effect (recentSessions) in shape: cancelled-flag guard, silent
  // console.error on failure (no error UI — matches this file's existing
  // silent-fail posture for kebab/memory-panel network calls elsewhere).
  // Unconditional (not gated on isSignedIn the way chatStore's session
  // recovery is) — GET /api/stories itself returns an empty list for an
  // anonymous/unresolvable-tenant request rather than erroring, so there's
  // nothing this component needs to gate on client-side. Extracted to a
  // stable callback so the joinedStoryConfirmation effect below can reuse it
  // to pick up a newly-granted story invite without a page reload, not just
  // the mount effect.
  const refreshStories = useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/stories');
        if (!res.ok || cancelled) return;
        const data: { stories?: Story[] } = await res.json();
        if (cancelled) return;
        setStories(Array.isArray(data.stories) ? data.stories : []);
      } catch (err) {
        console.error('[ChatHero] stories fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refreshStories(), [refreshStories]);

  // One useMemories(sessionId) instance, owned here and passed down to
  // MessageList (own prop, CardView chrome pass, 2026-08-08) — not one per
  // consumer. The panel (below) and the transcript's own MemorySavedReceipt
  // rows both read/write the same memory, so a rename or a remove from the
  // panel has to be visible in the transcript immediately, not just after a
  // reload; two independent hook instances would each hold their own stale
  // copy of the same server state.
  const memories = useMemories(state.sessionId);

  // Memory panel (memory-panel-layout plan, Stages A-E desktop; Stage F
  // 2026-08-09 adds mobile as a full-screen overlay — see the render guards
  // below). `openMemory` is which anchor is open (kept even if the
  // underlying row hasn't loaded yet); `liveOpenMemory` re-derives the
  // actual row to render from the shared `memories` list on every render,
  // so a title rename made through the panel itself (below) shows up
  // immediately without a second sync step.
  const [openMemory, setOpenMemory] = useState<MemoryRow | null>(null);
  const liveOpenMemory = openMemory
    ? memories.memories.find(m => m.id === openMemory.id) ?? openMemory
    : null;

  // In-chat Media panel — no "which item" concept (MediaGallery fetches its
  // own list scoped to state.sessionId), so a plain boolean is enough here,
  // unlike openMemory's MemoryRow | null. Mutually exclusive with the memory
  // panel via the wrapping handlers below, not a shared enum — keeps this
  // additive rather than touching openMemory's existing call sites. Opened
  // via ChatHeader's own icon (Stage 1, media_stages_08_2026) — the sidebar's
  // "Media" row no longer opens this surface, see mediaPageOpen below.
  const [mediaOpen, setMediaOpen] = useState(false);

  const handleOpenMedia = useCallback(() => {
    setMediaOpen(true);
    setOpenMemory(null);
    setAdminStoryId(null);
  }, []);

  // Standalone top-level Media page (MediaPage.tsx) — independent of any
  // chat session, shows every account file. Separate state from mediaOpen
  // (it's a different surface entirely, not the third-pane/bottom-sheet
  // mediaOpen drives), but still closes openMemory/mediaOpen on open: on
  // mobile both the memory full-screen overlay and MediaPage itself render
  // at the same absolute-inset-0 z-40 layer (see MediaPage.tsx's own comment
  // on why it can't be position:fixed here), so leaving one of those open
  // underneath would either stack two interactive full-screen dialogs or
  // silently strand the covered one — closing them is what "Media is a
  // top-level page, not a chat-scoped view" actually requires in practice.
  const [mediaPageOpen, setMediaPageOpen] = useState(false);

  const handleOpenMediaPage = useCallback(() => {
    setMediaPageOpen(true);
    setOpenMemory(null);
    setMediaOpen(false);
    setAdminStoryId(null);
  }, []);

  const handleOpenMemory = useCallback((row: MemoryRow | null) => {
    setOpenMemory(row);
    if (row) {
      setMediaOpen(false);
      setMediaPageOpen(false);
      setAdminStoryId(null);
    }
  }, []);

  // Panel drag-resize (Stage C). panelWidth is seeded fresh every time
  // openMemory transitions from null to a memory (the effect below) — a
  // drag from a previous open never carries over stale. panelRowRef reads
  // the row's real clientWidth for the clamp math; isDraggingPanel
  // suppresses the panel's own open/close CSS transition only while a drag
  // is actually live, so a resize tracks the cursor instead of animating
  // 300ms behind it.
  const panelRowRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(MIN_PANEL_WIDTH);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const wasMemoryOpenRef = useRef(false);

  // Single reseed path (Stage E): the panel-open effect below and the
  // divider's Home/double-click reset both call this — not two copies of
  // the same math. Always reads the row's CURRENT clientWidth, never a
  // frozen value, so a reset after the browser's been resized reflects the
  // new size, not whatever it was when the panel first opened.
  const resetPanelWidth = useCallback(() => {
    const total = panelRowRef.current?.clientWidth ?? window.innerWidth;
    setPanelWidth(seedPanelWidth(total));
  }, []);

  useEffect(() => {
    const isOpen = !!openMemory;
    if (isOpen && !wasMemoryOpenRef.current) {
      resetPanelWidth();
    }
    wasMemoryOpenRef.current = isOpen;
  }, [openMemory, resetPanelWidth]);

  // Kebab action state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    target: RowTarget;
    id: string;
    title?: string;
    hasActiveInviteOrSubscribers?: boolean;
  } | null>(null);
  // Story kebab's "Admin" action (Updated Story Kebabs handover, 2026-08-13)
  // — the story id StoryAdminPanel (below) renders for, non-null while it
  // should be open. Mutually exclusive with openMemory/mediaOpen via the
  // wrapping handlers (handleOpenMedia/handleOpenMemory above, this state's
  // own setter in handleRowAction below) — same pattern mediaOpen already
  // uses against openMemory, not a shared enum, so this stays additive.
  const [adminStoryId, setAdminStoryId] = useState<string | null>(null);
  // Re-derived from `stories` on every render (liveOpenMemory's own pattern
  // above) so a description edit committed through the open panel itself
  // shows up immediately once handleUpdateStoryDescription's setStories call
  // resolves, without a second sync step.
  const adminStory = adminStoryId ? stories.find(s => s.id === adminStoryId) ?? null : null;
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  const toastKeyRef = useRef(0);

  // Auto-dismiss toast after 2.2s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message: string) => {
    setToast({ message, key: ++toastKeyRef.current });
  }, []);

  // Story-invite acceptance confirmation (reusable-story-invite-links,
  // 2026-08-10) — same toast weight as "Deleted"/"Starred", fired once per
  // distinct joinedStoryConfirmation object (chatStore.tsx only ever sets
  // it once, guarded by storyInviteAcceptFiredRef). Serves both the
  // brand-new-signup moment and the already-a-member moment identically —
  // see chatStore.tsx's own doc comment for why one field covers both.
  // Also re-fetches stories — the newly-granted story otherwise doesn't
  // appear in the sidebar until a manual page reload, since stories was
  // previously only ever fetched once on mount.
  useEffect(() => {
    if (joinedStoryConfirmation) {
      showToast(`You've joined "${joinedStoryConfirmation.title}"`);
      refreshStories();
    }
  }, [joinedStoryConfirmation, showToast, refreshStories]);

  const starredIds = recentSessions.filter(s => s.starred).map(s => s.id);

  const handleRenameCommit = useCallback((id: string, newTitle: string) => {
    setRenamingId(null);
    const trimmed = newTitle.trim();
    if (!trimmed) return; // Escape or empty — cancel
    void renameSession(id, trimmed);
    showToast('Renamed');
  }, [renameSession, showToast]);

  const handleRowAction = useCallback((target: RowTarget, id: string, action: RowAction) => {
    // Delete always opens the confirmation dialog, regardless of target.
    if (action === 'delete') {
      const title =
        target === 'conversation'
          ? recentSessions.find(s => s.id === id)?.title
          : stories.find(s => s.id === id)?.name;
      const hasActiveInviteOrSubscribers =
        target === 'story' ? stories.find(s => s.id === id)?.hasActiveInviteOrSubscribers ?? false : false;
      setPendingDelete({ target, id, title, hasActiveInviteOrSubscribers });
      return;
    }
    // Admin is story-only (SidebarV2's MENU_ITEMS already gates it via
    // `targets`, so target should always be 'story' here — the check is
    // defensive, not load-bearing). Opens StoryAdminPanel as the third pane,
    // closing the memory/media panes the same way handleOpenMedia/
    // handleOpenMemory close each other and this one — including the
    // standalone Media page (mediaPageOpen), added when merging main's
    // StoryAdminPanel work into the media_stages_08_2026 branch: without
    // this, opening Admin while the standalone page was open would leave it
    // stranded underneath instead of replaced, the same stacking problem
    // handleOpenMediaPage/handleOpenMemory already guard against elsewhere.
    if (action === 'admin') {
      if (target === 'story') {
        setAdminStoryId(id);
        setOpenMemory(null);
        setMediaOpen(false);
        setMediaPageOpen(false);
      }
      return;
    }
    // Story actions and chapter/invite actions are deferred — no-op
    if (target !== 'conversation') return;
    switch (action) {
      case 'star': {
        const session = recentSessions.find(s => s.id === id);
        void starSession(id);
        showToast(session?.starred ? 'Star removed' : 'Starred');
        break;
      }
      case 'rename':
        setRenamingId(id);
        break;
      // moveToChapter, removeFromChapter, invite: deferred — deliberate no-op
    }
  }, [recentSessions, stories, starSession, showToast]);

  // CardView chrome (memory-panel-layout, 2026-08-08) — Remove is the one
  // footer action with real backend support (discardMemory via the shared
  // memories.discard, same PATCH .../memories/[memoryId] action: 'discard'
  // the draft card's own Discard already uses). Fires the count decrement
  // unconditionally alongside the discard call, mirroring MessageList.tsx's
  // onKeep (which bumps +1 the same way, without waiting on the response) —
  // this is the first path that can ever discard a PUBLISHED memory (the
  // draft card's Discard only ever targets a draft, which was never counted
  // toward the total), so without this the sidebar's memory badge would
  // drift upward every time Remove is used. Closes the panel unconditionally
  // once the call settles, matching this hook's existing silent-fail posture
  // for keep/discard/rename elsewhere in this feature — no error UI exists
  // for those today either.
  const handleRemoveMemory = useCallback(async (memory: MemoryRow) => {
    await memories.discard(memory);
    if (memory.status === 'published') bumpMemoryCount(memory.session_id, -1);
    setOpenMemory(null);
  }, [memories, bumpMemoryCount]);

  // "Talk about this" / "Use as a base" — neither has any backend
  // implementation in this codebase yet (see MemoryCardView.tsx's own doc
  // comment). Same shared toast every other not-yet-built type-specific
  // memory action already uses (MemoryCard.tsx's kind.extra buttons) —
  // visible, non-silent feedback rather than a button that looks live but
  // does nothing. ("+" used to share this stub too — now real, see
  // handleAssignMemoryToStory below.)
  const handleMemoryStub = useCallback((message: string) => {
    showToast(message);
  }, [showToast]);

  // "+" on MemoryCardView — real now (assign-memory-to-story, 2026-08-13):
  // PATCH .../memories/[memoryId] action: 'assign_story'
  // (assignMemoryToStory, services/crm/story-containments.ts) via
  // memories.assignToStory. Toast copy distinguishes first assignment
  // ("Added to X") from reassignment ("Moved to X") using the memory's own
  // PRIOR storyId, captured before the await — re-picking the story a
  // memory is already in never reaches this handler at all (StoryPicker's
  // own no-op guard skips calling onAssignStory in that case).
  const handleAssignMemoryToStory = useCallback(async (memory: MemoryRow, storyId: string) => {
    const story = stories.find((s) => s.id === storyId);
    const wasAlreadyInAStory = !!memory.storyId;
    await memories.assignToStory(memory.id, storyId);
    showToast(wasAlreadyInAStory ? `Moved to ${story?.name ?? 'story'}` : `Added to ${story?.name ?? 'story'}`);
  }, [stories, memories, showToast]);

  // Real persistence (2026-08-09) — POST /api/stories (services/crm/
  // stories.ts's createStory, an artifacts insert type='story'), replacing
  // the local-only crypto.randomUUID() row this used to build. On success,
  // prepends the server's own row (its real id, not a client-guessed one) to
  // local state rather than refetching the whole list. Leaves the modal open
  // on failure — BeginStoryModal only resets its fields when `open` next
  // transitions to true, so the member's typed name/description survive a
  // failed attempt to retry.
  const handleCreateStory = async (name: string, description: string) => {
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.story) {
        console.error('[ChatHero] create story failed:', res.status);
        showToast('Could not create story');
        return;
      }
      setStories((prev) => [data.story as Story, ...prev]);
      setBeginStoryOpen(false);
    } catch (err) {
      console.error('[ChatHero] create story threw:', err);
      showToast('Could not create story');
    }
  };

  // Real persistence (2026-08-09) — DELETE /api/stories/[id] (services/crm/
  // stories.ts's discardStory, stamping discarded_at on the same artifacts
  // row), replacing the local-only filter this used to do. Fire-and-forget
  // from ConfirmDeleteModal's onConfirm below (matching handleRemoveMemory's
  // own not-awaited-inline call there) — the dialog closes immediately;
  // failure only reverts local state and toasts, it doesn't reopen anything.
  const handleDeleteStory = useCallback(async (storyId: string) => {
    try {
      const res = await fetch(`/api/stories/${storyId}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error('[ChatHero] delete story failed:', res.status);
        showToast('Could not delete story');
        return;
      }
      setStories(prev => prev.filter(s => s.id !== storyId));
      showToast('Deleted');
    } catch (err) {
      console.error('[ChatHero] delete story threw:', err);
      showToast('Could not delete story');
    }
  }, [showToast]);

  // StoryAdminPanel's description field (story-admin-panel, 2026-08-13) —
  // real persistence via PATCH /api/stories/[id] (services/crm/stories.ts's
  // updateStoryDescription). StoryAdminPanel only calls this when the
  // trimmed value actually changed, so no extra guard needed here. Updates
  // the matching row in `stories` in place on success so the fresh
  // description flows back down to the open panel AND anywhere else a
  // story's description is shown (SidebarV2's row tooltip). Silent-fail
  // posture matches handleCreateStory/handleDeleteStory above — toast only,
  // no revert (the panel's own textarea already holds what the member typed
  // either way).
  const handleUpdateStoryDescription = useCallback(async (storyId: string, description: string) => {
    try {
      const res = await fetch(`/api/stories/${storyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.story) {
        console.error('[ChatHero] update story description failed:', res.status);
        showToast('Could not save description');
        return;
      }
      const updated = data.story as Story;
      setStories(prev => prev.map(s => (s.id === storyId ? { ...s, description: updated.description } : s)));
    } catch (err) {
      console.error('[ChatHero] update story description threw:', err);
      showToast('Could not save description');
    }
  }, [showToast]);

  // Invite collaborators (Phase 5 create/copy-flow + invalidation warning,
  // 2026-08-10, on top of reusable-story-invite-links the same day).
  // `invite` tracks which story row triggered the modal; `inviteLink` holds
  // the durable, reusable link once one has actually been created.
  // Opening the modal (handleInviteStory below) no longer creates or
  // fetches anything — InviteCollaboratorsModal's magicLink prop is
  // optional now, and renders its own "Not created yet" / Create state
  // until the member deliberately clicks Create (handleCreateInviteLink).
  // "Reset link" rotates an existing link (reset:true — revokes the old
  // row, inserts a fresh one) via the same createInviteLink call. Changing
  // the story picker or the primer while a link exists goes through
  // InviteCollaboratorsModal's own pendingEdit warning first; only once
  // Continue is clicked does the change reach handleInviteStoryChange /
  // handleInvitePrimerChange below, which apply it AND invalidate the old
  // link (DELETE /api/heirloom/story-invites) without minting a
  // replacement — the next Create/Reset click does that.
  const [invite, setInvite] = useState<{ storyId: string } | null>(null);
  const [invitePrimer, setInvitePrimer] = useState('');
  const [inviteLink, setInviteLink] = useState<{ token: string; url: string } | null>(null);
  const [inviteCollaborators, setInviteCollaborators] = useState<Collaborator[]>([]);

  const createInviteLink = useCallback(async (primer: string, storyId: string, reset: boolean) => {
    try {
      const res = await fetch('/api/heirloom/story-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: storyId, primer, reset }),
      });
      if (!res.ok) throw new Error('Could not create invite link');
      const data = (await res.json()) as { token: string; primer?: string; invite_url: string | null };
      const url = data.invite_url ?? `${window.location.origin}/join/${data.token}`;
      setInviteLink({ token: data.token, url });
      // Fetch-or-create returns the EXISTING link's stored primer on a
      // non-reset create — reflect it so a story that already had an active
      // link (created in another session) doesn't show a blank field once
      // its real link surfaces. Reset intentionally skips this: invitePrimer
      // already holds whatever the member just typed, which is what the new
      // link is being created with.
      if (!reset) setInvitePrimer(data.primer ?? '');
    } catch {
      showToast('Could not create invite link');
    }
  }, [showToast]);

  // Fire-and-forget — revokes the story's active link server-side without
  // creating a replacement. Failure is non-fatal to the edit the member just
  // made (the field still updates); it only means a since-invalidated link
  // could theoretically still be redeemed server-side, so it's logged, not
  // swallowed silently.
  const invalidateInviteLink = useCallback(async (storyId: string) => {
    try {
      const res = await fetch('/api/heirloom/story-invites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: storyId }),
      });
      if (!res.ok) console.error('[ChatHero] invalidate invite link failed:', res.status);
    } catch (err) {
      console.error('[ChatHero] invalidate invite link threw:', err);
    }
  }, []);

  const handleInviteStory = useCallback((storyId: string) => {
    setInvite({ storyId });
    setInvitePrimer('');
    setInviteLink(null);
  }, []);

  const handleCreateInviteLink = useCallback(() => {
    if (!invite) return;
    void createInviteLink(invitePrimer, invite.storyId, false);
  }, [invite, invitePrimer, createInviteLink]);

  const handleResetInviteLink = useCallback(() => {
    if (!invite) return;
    void createInviteLink(invitePrimer, invite.storyId, true);
  }, [invite, invitePrimer, createInviteLink]);

  // Reached only once InviteCollaboratorsModal decides an edit should
  // actually apply — instantly (no link yet) or via its own pendingEdit
  // warning's Continue (a link exists). A live link means the edit
  // invalidates it: drop back to "Not created yet" locally and revoke it
  // server-side, matching the warning's own promise to the member.
  const handleInviteStoryChange = useCallback((storyId: string) => {
    const priorStoryId = invite?.storyId;
    setInvite({ storyId });
    if (inviteLink && priorStoryId) {
      setInviteLink(null);
      void invalidateInviteLink(priorStoryId);
    }
  }, [invite, inviteLink, invalidateInviteLink]);

  const handleInvitePrimerChange = useCallback((value: string) => {
    setInvitePrimer(value);
    if (inviteLink && invite) {
      setInviteLink(null);
      void invalidateInviteLink(invite.storyId);
    }
  }, [invite, inviteLink, invalidateInviteLink]);

  // "Existing members" roster — refetched whenever the modal's story
  // changes (including via the invalidation warning), not on every primer
  // keystroke. Silent-fail on error, matching this file's existing posture
  // for the stories/mediaItems fetch-on-mount effects above. The same
  // response also carries the story's active invite link (if any) — used
  // to restore invitePrimer/inviteLink to their real values on open rather
  // than leaving handleInviteStory's blank/null reset in place when a link
  // already exists (invite-modal-restore-on-open, 2026-08-11).
  useEffect(() => {
    const storyId = invite?.storyId;
    if (!storyId) {
      setInviteCollaborators([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/heirloom/story-invites?story_id=${encodeURIComponent(storyId)}`);
        if (!res.ok || cancelled) return;
        const data: {
          collaborators?: Array<{ name: string | null; email: string | null; joinedAt: string }>;
          active_link?: { token: string; primer: string; invite_url: string | null } | null;
        } = await res.json();
        if (cancelled) return;
        setInviteCollaborators(
          (data.collaborators ?? []).map((c) => ({
            name: c.name ?? c.email ?? 'Member',
            status: 'joined' as const,
            joinedDate: new Date(c.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })),
        );
        if (data.active_link) {
          setInvitePrimer(data.active_link.primer);
          const url = data.active_link.invite_url ?? `${window.location.origin}/join/${data.active_link.token}`;
          setInviteLink({ token: data.active_link.token, url });
        }
      } catch (err) {
        console.error('[ChatHero] story collaborators fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invite?.storyId]);

  const closeInvite = useCallback(() => {
    setInvite(null);
    setInviteLink(null);
  }, []);

  const handleSelectPrompt = (prompt: WritingPrompt) => {
    // Gated visitors see GateView instead of the conversation — a prompt send
    // would vanish behind it. Streaming guard matches ChatInput's.
    if (isGated || state.isLoading) return;
    void sendMessage(prompt.text);
  };

  // iOS keyboard handling. While the chat panel is open it's a modal overlay,
  // so we lock body scroll (the landing page behind must not scroll) and pin the
  // surface to the visual viewport. Under the scroll-lock iOS can't shift the
  // page, so visualViewport.offsetTop stays 0 and the keyboard simply shrinks
  // the viewport from the bottom — shrinking the surface from h-full to vv.height
  // lifts the composer to sit directly above the keyboard. Inert on desktop
  // (vv.height never drops below the threshold) and while the panel is closed.
  const { keyboardOpen, height } = useKeyboardViewport({
    active: state.isChatOpen,
    lockBodyScroll: true,
  });
  const surfaceStyle: CSSProperties | undefined =
    keyboardOpen && height != null ? { height: `${height}px` } : undefined;

  const isMobile = useMediaQuery('(max-width: 768px)') ?? false;

  // On mobile, close the overlay when Esc is pressed (capture phase so it runs
  // before any modal Esc handlers that would also stop propagation).
  useEffect(() => {
    if (!isMobile || !state.isSidebarExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'TOGGLE_SIDEBAR' });
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isMobile, state.isSidebarExpanded, dispatch]);

  return (
    <section
      style={surfaceStyle}
      className="h-full w-full min-w-0 flex flex-col bg-background overflow-hidden"
    >
      {/* Spans the full drawer width, above sidebar|chat|panel — not nested
          inside the chat column. It always rendered inside the chat column
          before the memory panel existed, which was invisible then (chat
          WAS the whole remaining width) but became visibly wrong once the
          panel became a sibling pane: this bar has to sit above the whole
          row, matching the Story Canvas reference the panel-layout handoff
          cites as source of truth, not scoped to one pane. */}
      <ChatHeader
        isFullScreen={isFullScreen}
        onToggleFullScreen={onToggleFullScreen}
        onMenuOpen={isMobile ? () => dispatch({ type: 'TOGGLE_SIDEBAR' }) : undefined}
        onOpenMedia={handleOpenMedia}
      />

      {/* min-w-0 here (not just on the outer <section>) is load-bearing:
          ChatHero mounts inside ChatDrawerV2, a drawer capped at
          clamp(680px,50vw,1120px) — not the full viewport — with no
          overflow-hidden of its own anywhere in its ancestry. Without
          min-w-0 on every level between this row and that cap, a flex
          item's default min-width:auto lets it grow to fit its content's
          minimum (sidebar + chat's own floor + panel's own floor) even past
          w-full, and with nothing upstream to clip it, that overflow
          rendered past the drawer's right edge — off the visible viewport
          entirely, not just visually cramped. */}
      <div
        ref={panelRowRef}
        data-testid="memory-panel-row"
        className="flex flex-1 min-h-0 min-w-0 overflow-hidden"
      >
        {/* Desktop: docked sidebar. forceCollapsed shuts it to its existing
            48px icon rail while the panel is open — reusing SidebarV2's own
            already-built collapsed rendering and its existing
            transition-all duration-300 (no new rail, no new animation code
            needed here) rather than the handoff's invented 60px rail. */}
        {!isMobile && (
          <SidebarV2
            stories={stories}
            writingPrompts={WRITING_PROMPTS}
            onCreateStory={() => setBeginStoryOpen(true)}
            onInviteStory={handleInviteStory}
            onSelectPrompt={handleSelectPrompt}
            onRowAction={handleRowAction}
            starredConversationIds={starredIds}
            renamingId={renamingId ?? undefined}
            onRenameCommit={handleRenameCommit}
            onMedia={handleOpenMediaPage}
            forceCollapsed={!!openMemory || mediaOpen || !!adminStoryId}
          />
        )}

        {/* Mobile: overlay drawer — absolute resolves to ChatDrawerV2's relative body */}
        {isMobile && state.isSidebarExpanded && (
          <>
            <div className="hl-animate-sheet-left absolute inset-y-0 left-0 z-30">
              <SidebarV2
                stories={stories}
                writingPrompts={WRITING_PROMPTS}
                onCreateStory={() => setBeginStoryOpen(true)}
                onInviteStory={handleInviteStory}
                onSelectPrompt={handleSelectPrompt}
                onRowAction={handleRowAction}
                starredConversationIds={starredIds}
                renamingId={renamingId ?? undefined}
                onRenameCommit={handleRenameCommit}
                onClose={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                onMedia={() => { dispatch({ type: 'TOGGLE_SIDEBAR' }); handleOpenMediaPage(); }}
              />
            </div>
          </>
        )}

        {/* Mobile: Media opens as a bottom sheet — no third-pane host exists
            on mobile (unlike desktop), so this reuses the same hl-animate-sheet
            bottom-sheet pattern already used by SourceMenu/SaveChatCTA rather
            than inventing a new mechanism. z-40 clears the drawer's own
            z-20/z-30 in case its close animation is still resolving. */}
        {isMobile && mediaOpen && (
          <div className="absolute inset-0 z-40" role="dialog" aria-modal="true" aria-label="Media from this chat">
            <div
              className="hl-animate-fade absolute inset-0 bg-black/45"
              aria-hidden="true"
              onClick={() => setMediaOpen(false)}
            />
            <div className="hl-animate-sheet absolute left-0 right-0 bottom-0 h-[85vh] rounded-t-2xl border-t border-border overflow-hidden">
              <MediaGallery onClose={() => setMediaOpen(false)} sessionId={state.sessionId} onFlash={showToast} />
            </div>
          </div>
        )}

        {/* Mobile: memory panel is a full-screen overlay (Stage F,
            2026-08-09) — distinct from Media's partial sheet above.
            inset-0/h-[100dvh], no rounding, no border-t: unlike Media's
            85vh sheet there's no exposed background around the edges to
            dim or round off. No scrim either, for the same reason — a
            fully opaque inset-0 overlay leaves nothing behind it to dim or
            catch a dismiss-tap on (Media's scrim earns its keep on the
            visible strip above its 85vh sheet; this has no such strip).
            Reuses hl-animate-sheet as-is rather than a slower one-off
            duration, keeping one motion system app-wide. */}
        {isMobile && openMemory && (
          <div className="absolute inset-0 z-40" role="dialog" aria-modal="true" aria-label="Memory">
            <div className="hl-animate-sheet absolute inset-0 h-[100dvh] overflow-hidden">
              {liveOpenMemory && (
                <MemoryCardView
                  memory={liveOpenMemory}
                  onClose={() => setOpenMemory(null)}
                  onRetitle={(title) => memories.rename(liveOpenMemory.id, title)}
                  onRemove={() => setPendingDelete({ target: 'memory', id: liveOpenMemory.id, title: liveOpenMemory.title })}
                  onStub={handleMemoryStub}
                  onReviseBlocks={(blocks) => memories.reviseBlocks(liveOpenMemory.id, blocks)}
                  sessionImages={sessionImages}
                  stories={stories}
                  onAssignStory={(storyId) => handleAssignMemoryToStory(liveOpenMemory, storyId)}
                />
              )}
            </div>
          </div>
        )}

        {/* Mobile: admin panel is a full-screen overlay — same treatment as
            the memory panel above (inset-0/h-[100dvh], no scrim, no
            rounding), not Media's partial sheet. */}
        {isMobile && adminStory && (
          <div className="absolute inset-0 z-40" role="dialog" aria-modal="true" aria-label="Story admin">
            <div className="hl-animate-sheet absolute inset-0 h-[100dvh] overflow-hidden">
              <StoryAdminPanel
                story={adminStory}
                onClose={() => setAdminStoryId(null)}
                onDescriptionCommit={(description) => handleUpdateStoryDescription(adminStory.id, description)}
              />
            </div>
          </div>
        )}

        {/* Always flex-1 now (Stage C) — the panel claims an explicit pixel
            width of its own (below), so chat just gets whatever's left; it
            no longer needs a matching ratio to divide against. Floored at
            260px on desktop (not the plan's original 380px — that number
            protected ChatHeader's icon cluster, which no longer lives in
            this column now that ChatHeader spans the full drawer). Verified
            safe against the drawer's own 680px floor — see
            memoryPanelWidth.ts's maxPanelWidth doc comment. min-w-0 on
            mobile — chat is always flex-1 there, unaffected by any of this. */}
        <div
          className={`flex flex-1 flex-col h-full min-h-0 ${isMobile ? 'min-w-0' : 'min-w-[260px]'}`}
        >
          <div className="flex flex-col flex-1 min-h-0">
            {isGated ? (
              <GateView />
            ) : (
              <>
                {state.hasStarted ? (
                  <MessageList
                    messages={state.messages}
                    isLoading={state.isLoading}
                    errorType={errorType}
                    onOpenMemory={handleOpenMemory}
                    memories={memories}
                    onStub={handleMemoryStub}
                    sessionImages={sessionImages}
                  />
                ) : (
                  <EmptyState />
                )}

                <div className="pb-4">
                  <ChatInput />
                  <SaveChatCTA />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chat/panel divider — Stage C. Only mounted while the panel is
            open (nothing to drag otherwise). Its own border-l is what was
            the panel container's border below — one seam, not two. */}
        {!isMobile && openMemory && (
          <MemoryPanelDivider
            label="Resize the memory panel"
            onStart={() => panelWidth}
            onMove={(base, delta) => {
              const total = panelRowRef.current?.clientWidth ?? window.innerWidth;
              setPanelWidth(clampWidth(base - delta, MIN_PANEL_WIDTH, maxPanelWidth(total)));
            }}
            onReset={resetPanelWidth}
            onDragStateChange={setIsDraggingPanel}
          />
        )}

        {/* Memory panel / media pane / admin panel — shared third-pane
            wrapper since openMemory, mediaOpen, and adminStoryId are
            mutually exclusive by construction (handleOpenMedia/
            handleOpenMemory above, and adminStoryId's own setter in
            handleRowAction). Real drag-resizable pixel width now (Stage C)
            for memory; media and admin both get the same fixed
            MEDIA_PANEL_WIDTH instead (neither needs resize — the admin
            panel's own spec calls for a fixed width, same 400px media
            already uses) — flexBasis is inline style either way since
            Tailwind can't express a runtime-computed value as a static
            class; min-w-[280px] stays a class-based floor, redundant with
            the JS clamp on purpose (defense in depth, costs nothing).
            Transition suppressed while actively dragging so a live resize
            tracks the cursor instead of animating 300ms behind it. The
            wrapper stays mounted whenever !isMobile so open/close can still
            transition; content itself only renders while a memory, media,
            or admin pane is open. Desktop only — mobile media/memory/admin
            (Stage F) all use their own full-screen/sheet overlays above
            instead of this shared resizable wrapper. */}
        {!isMobile && (
          <div
            className={`h-full overflow-hidden ${isDraggingPanel ? '' : 'transition-[flex-basis,opacity] duration-300 ease-in-out'} ${
              openMemory || mediaOpen || adminStory ? 'min-w-[280px] opacity-100' : 'flex-[0] min-w-0 opacity-0'
            } ${mediaOpen || adminStory ? 'border-l border-border' : ''}`}
            style={
              openMemory
                ? { flexBasis: panelWidth, flexGrow: 0, flexShrink: 0 }
                : mediaOpen || adminStory
                ? { flexBasis: MEDIA_PANEL_WIDTH, flexGrow: 0, flexShrink: 0 }
                : undefined
            }
          >
            {liveOpenMemory && (
              <MemoryCardView
                memory={liveOpenMemory}
                onClose={() => setOpenMemory(null)}
                onRetitle={(title) => memories.rename(liveOpenMemory.id, title)}
                onRemove={() => setPendingDelete({ target: 'memory', id: liveOpenMemory.id, title: liveOpenMemory.title })}
                onStub={handleMemoryStub}
                onReviseBlocks={(blocks) => memories.reviseBlocks(liveOpenMemory.id, blocks)}
                sessionImages={sessionImages}
                stories={stories}
                onAssignStory={(storyId) => handleAssignMemoryToStory(liveOpenMemory, storyId)}
              />
            )}
            {mediaOpen && (
              <MediaGallery onClose={() => setMediaOpen(false)} sessionId={state.sessionId} onFlash={showToast} />
            )}
            {adminStory && (
              <StoryAdminPanel
                story={adminStory}
                onClose={() => setAdminStoryId(null)}
                onDescriptionCommit={(description) => handleUpdateStoryDescription(adminStory.id, description)}
              />
            )}
          </div>
        )}
      </div>

      {/* Standalone Media page (Stage 1, media_stages_08_2026) — same
          absolute-inset-0-resolves-to-the-drawer's-relative-body pattern as
          the modals below and the mobile Media/memory overlays above, just
          mounted unconditionally (not gated on isMobile) since this surface
          is identical across viewport sizes. Always rendered so its
          translate-x transition can animate; `open` controls visibility. */}
      <MediaPage open={mediaPageOpen} onClose={() => setMediaPageOpen(false)} onFlash={showToast} />

      {/* absolute inset-0 — resolves to the drawer's relative body (this
          section is static), so modals overlay the whole drawer. */}
      <BeginStoryModal
        open={beginStoryOpen}
        onClose={() => setBeginStoryOpen(false)}
        onCreate={handleCreateStory}
      />
      <InviteCollaboratorsModal
        open={!!invite}
        onClose={closeInvite}
        magicLink={inviteLink ? inviteLink.url.replace(/^https?:\/\//, '') : undefined}
        expiresLabel="Expires in 7 days"
        collaborators={inviteCollaborators}
        stories={stories}
        storyId={invite?.storyId}
        onStoryChange={handleInviteStoryChange}
        primer={invitePrimer}
        onPrimerChange={handleInvitePrimerChange}
        onCreateLink={handleCreateInviteLink}
        onResetLink={handleResetInviteLink}
      />
      <ConfirmDeleteModal
        item={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.target === 'memory') {
            // Same discard call the panel's Remove button used to fire
            // directly (memories.discard + count decrement + panel close) —
            // this dialog only adds the confirmation gate every other
            // delete in this file already has, not a new mutation path.
            // liveOpenMemory, not pendingDelete's own id/title-only shape:
            // handleRemoveMemory needs the full MemoryRow (status,
            // session_id), and the confirm dialog's scrim blocks every way
            // to change which memory is open while it's up, so this is
            // still the same memory pendingDelete was opened for.
            if (liveOpenMemory) void handleRemoveMemory(liveOpenMemory);
          } else if (pendingDelete.target === 'story') {
            // Real delete now (2026-08-09) — see handleDeleteStory above.
            void handleDeleteStory(pendingDelete.id);
          } else {
            void deleteSession(pendingDelete.id);
            showToast('Deleted');
          }
          setPendingDelete(null);
        }}
      />

      {/* Kebab action confirmation toast — fixed bottom-center, auto-dismiss 2.2s */}
      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-border shadow-lg pointer-events-none select-none"
        >
          <Check size={13} className="text-accent flex-shrink-0" />
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-text-primary">
            {toast.message}
          </span>
        </div>
      )}
    </section>
  );
}
