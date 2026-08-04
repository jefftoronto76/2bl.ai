'use client'

// ConversationSidebar — UPDATED (adds per-row Rename + Delete). Still
// presentational: it renders the list and the row-action UI, and calls back
// (onRename / onDelete) into page.tsx, which owns persistence (handover §3).
//
// Row actions: a kebab (⋯) reveals on hover / when its menu is open → a small
// menu with Rename and Delete. Rename swaps the row to an inline input
// (Enter commits, Esc/blur cancels). Delete asks for an inline confirm first.

import { useEffect, useState } from 'react'
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
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export function ConversationSidebar({
  open,
  conversations,
  activeId,
  onSelect,
  onNew,
  onClose,
  onRename,
  onDelete,
}: ConversationSidebarProps) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // Click anywhere else closes an open menu / confirm.
  useEffect(() => {
    if (!menuId && !confirmId) return
    const close = () => { setMenuId(null); setConfirmId(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuId, confirmId])

  function commitRename(id: string, value: string) {
    const name = value.trim()
    if (name) onRename(id, name)
    setRenamingId(null)
  }

  const now = Date.now()
  const grouped: Record<ConversationGroup, Conversation[]> = {
    Today: [], 'This week': [], Earlier: [],
  }
  for (const c of conversations) {
    grouped[c.draft ? 'Today' : groupFor(c.updatedAt, now)].push(c)
  }

  return (
    <aside className={`${styles.side} ${open ? '' : styles.collapsed}`} aria-hidden={!open}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.title}>Conversations</span>
          <div className={styles.headActions}>
            <button type="button" className={styles.newBtn} onClick={onNew}>
              <PlusIcon />
              New
            </button>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Hide conversations" title="Hide">
              <ChevronRightIcon className={styles.flip} />
            </button>
          </div>
        </div>

        <div className={styles.threads}>
          {conversations.length === 0 && <p className={styles.empty}>No conversations yet.</p>}
          {CONVERSATION_GROUPS.map(group => {
            const items = grouped[group]
            if (items.length === 0) return null
            return (
              <div key={group}>
                <div className={styles.groupLabel}>{group}</div>
                {items.map(c => {
                  const isRenaming = renamingId === c.id
                  const isMenu = menuId === c.id
                  const isConfirm = confirmId === c.id
                  return (
                    <div
                      key={c.id}
                      className={`${styles.thread} ${c.id === activeId ? styles.active : ''} ${(isMenu || isConfirm) ? styles.menuOpen : ''}`}
                    >
                      {isRenaming ? (
                        <input
                          className={styles.rename}
                          autoFocus
                          defaultValue={c.title}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename(c.id, e.currentTarget.value)
                            else if (e.key === 'Escape') setRenamingId(null)
                          }}
                          onBlur={e => commitRename(c.id, e.currentTarget.value)}
                        />
                      ) : (
                        <button type="button" className={styles.threadMain} onClick={() => onSelect(c.id)}>
                          <span className={styles.row}>
                            <span className={styles.threadTitle}>{c.title}</span>
                            <span className={styles.time}>{c.draft ? 'now' : relTime(c.updatedAt, now)}</span>
                          </span>
                          <span className={styles.sub}>{c.draft ? 'New conversation' : c.preview}</span>
                        </button>
                      )}

                      {!isRenaming && (
                        <button
                          type="button"
                          className={styles.kebab}
                          aria-label="Conversation actions"
                          aria-haspopup="menu"
                          onClick={e => { e.stopPropagation(); setConfirmId(null); setMenuId(isMenu ? null : c.id) }}
                        >
                          <DotsIcon />
                        </button>
                      )}

                      {isMenu && (
                        <div className={styles.menu} role="menu" onClick={e => e.stopPropagation()}>
                          <button type="button" className={styles.menuItem} role="menuitem" onClick={() => { setMenuId(null); setRenamingId(c.id) }}>
                            <PencilIcon />Rename
                          </button>
                          <button type="button" className={`${styles.menuItem} ${styles.danger}`} role="menuitem" onClick={() => { setMenuId(null); setConfirmId(c.id) }}>
                            <TrashIcon />Delete
                          </button>
                        </div>
                      )}

                      {isConfirm && (
                        <div className={`${styles.menu} ${styles.confirm}`} role="menu" onClick={e => e.stopPropagation()}>
                          <span className={styles.confirmQ}>Delete this conversation?</span>
                          <div className={styles.confirmActions}>
                            <button type="button" className={styles.confirmBtn} onClick={() => setConfirmId(null)}>Cancel</button>
                            <button type="button" className={`${styles.confirmBtn} ${styles.confirmDanger}`} onClick={() => { setConfirmId(null); onDelete(c.id) }}>Delete</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

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
function DotsIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}
function PencilIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4l10.5-10.5a2.828 2.828 0 1 0-4-4L4 16v4" /><path d="M13.5 6.5l4 4" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </svg>
  )
}
