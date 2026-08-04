'use client'

// ConversationSidebar — NEW. The inner conversation-history drawer for the
// Composer screen. Presentational only: it renders the list and calls back.
// Persistence + the conversation list live in page.tsx (see handover §3).
//
// Overlay drawer (not docked): 280px, slides in over the thread column with a
// scrim, toggled by the hamburger in the Composer top bar. Same component on
// mobile (full overlay).

import {
  Conversation,
  CONVERSATION_GROUPS,
  ConversationGroup,
  groupFor,
  relTime,
} from './types'
import styles from './ConversationSidebar.module.css'

interface ConversationSidebarProps {
  open: boolean
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onClose: () => void
}

export function ConversationSidebar({
  open,
  conversations,
  activeId,
  onSelect,
  onNew,
  onClose,
}: ConversationSidebarProps) {
  const now = Date.now()
  const grouped: Record<ConversationGroup, Conversation[]> = {
    Today: [],
    'This week': [],
    Earlier: [],
  }
  for (const c of conversations) {
    grouped[c.draft ? 'Today' : groupFor(c.updatedAt, now)].push(c)
  }

  return (
    <aside
      className={`${styles.side} ${open ? '' : styles.collapsed}`}
      aria-hidden={!open}
    >
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.title}>Conversations</span>
          <div className={styles.headActions}>
            <button type="button" className={styles.newBtn} onClick={onNew}>
              <PlusIcon />
              New
            </button>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Hide conversations"
              title="Hide"
            >
              <ChevronRightIcon className={styles.flip} />
            </button>
          </div>
        </div>

        <div className={styles.threads}>
          {conversations.length === 0 && (
            <p className={styles.empty}>No conversations yet.</p>
          )}
          {CONVERSATION_GROUPS.map(group => {
            const items = grouped[group]
            if (items.length === 0) return null
            return (
              <div key={group}>
                <div className={styles.groupLabel}>{group}</div>
                {items.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`${styles.thread} ${c.id === activeId ? styles.active : ''}`}
                    onClick={() => onSelect(c.id)}
                  >
                    <span className={styles.row}>
                      <span className={styles.threadTitle}>{c.title}</span>
                      <span className={styles.time}>
                        {c.draft ? 'now' : relTime(c.updatedAt, now)}
                      </span>
                    </span>
                    <span className={styles.sub}>
                      {c.draft ? 'New conversation' : c.preview}
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

// ── Inline icons (match the prototype; swap for @tabler/icons-react if preferred)
function PlusIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
