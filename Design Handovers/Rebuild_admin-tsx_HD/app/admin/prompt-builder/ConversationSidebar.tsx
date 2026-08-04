'use client'

// Composer · conversation sidebar — grouped thread list (Today / This week / Earlier)
// with inline rename and a per-thread actions menu. Collapses to zero width.

import { useState } from 'react'
import { ActionIcon, Box, Button, Group, Menu, Text } from '@mantine/core'
import { IconChevronLeft, IconDots, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'

const MIN = 60000, HOUR = 3600000, DAY = 86400000
export const GROUPS = ['Today', 'This week', 'Earlier'] as const

export interface ChatMessage { role: 'user' | 'assistant'; content: string; timestamp: number }
export interface Thread {
  id: string
  title: string
  group: (typeof GROUPS)[number]
  preview?: string
  ts: number
  draft?: boolean
  messages: ChatMessage[]
}

const relTime = (ts: number) => {
  const d = Date.now() - ts
  if (d < HOUR) return Math.max(1, Math.round(d / MIN)) + 'm'
  if (d < DAY) return Math.round(d / HOUR) + 'h'
  return Math.round(d / DAY) + 'd'
}

interface ConversationSidebarProps {
  open: boolean
  threads: Thread[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onClose: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export function ConversationSidebar({ open, threads, activeId, onSelect, onNew, onClose, onRename, onDelete }: ConversationSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const commitRename = (id: string, value: string) => {
    const name = value.trim()
    if (name) onRename(id, name)
    setRenamingId(null)
  }
  return (
    <aside style={{ width: open ? 264 : 0, flex: `0 0 ${open ? 264 : 0}px`, overflow: 'hidden', transition: 'width 180ms ease, flex-basis 180ms ease', borderRight: open ? '1px solid var(--mantine-color-gray-2)' : 'none', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: 264, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Group justify="space-between" align="center" p="sm" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <Text fw={600} size="sm">Conversations</Text>
          <Group gap={4}>
            <Button size="compact-xs" variant="light" color="brand" leftSection={<IconPlus size={14} />} onClick={onNew}>New</Button>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose} aria-label="Hide"><IconChevronLeft size={16} /></ActionIcon>
          </Group>
        </Group>
        <Box style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {GROUPS.map((g) => {
            const items = threads.filter((t) => t.group === g)
            if (!items.length) return null
            return (
              <div key={g}>
                <Text c="dimmed" tt="uppercase" fw={600} px={8} py={6} style={{ fontSize: 10, letterSpacing: '0.08em' }}>{g}</Text>
                {items.map((t) => {
                  const activeRow = t.id === activeId
                  return (
                    <div key={t.id} style={{ position: 'relative', borderRadius: 8, background: activeRow ? 'var(--mantine-color-gray-1)' : 'transparent', marginBottom: 2 }}>
                      {renamingId === t.id ? (
                        <input
                          autoFocus defaultValue={t.title} onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(t.id, e.currentTarget.value); else if (e.key === 'Escape') setRenamingId(null) }}
                          onBlur={(e) => commitRename(t.id, e.currentTarget.value)}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--mantine-color-brand-6)', borderRadius: 8, font: 'inherit', fontSize: 13, outline: 'none' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <button onClick={() => onSelect(t.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mantine-color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                              <span style={{ fontSize: 11, color: 'var(--mantine-color-gray-5)', flex: '0 0 auto' }}>{t.draft ? 'now' : relTime(t.ts)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--mantine-color-dimmed)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{t.draft ? 'New conversation' : t.preview}</div>
                          </button>
                          <Menu position="bottom-end" withinPortal shadow="md" width={160}>
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" size="sm" mr={4} aria-label="Conversation actions"><IconDots size={15} /></ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenamingId(t.id)}>Rename</Menu.Item>
                              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onDelete(t.id)}>Delete</Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </Box>
      </div>
    </aside>
  )
}
