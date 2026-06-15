'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Drawer,
  Stack,
  Group,
  Button,
  ActionIcon,
  Tooltip,
  Badge,
  Anchor,
  Card,
  Text,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconClipboard, IconCheck, IconArrowsRightLeft } from '@tabler/icons-react'
import {
  parseBookingCards,
  type BookingCardData,
} from '@/services/chat/ui/v1/parseBookingCards'
import type { ChatSession } from '@/services/crm/inbound'
import { TransferModal } from './TransferModal'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

function isMessage(m: unknown): m is Message {
  if (typeof m !== 'object' || m === null) return false
  const msg = m as Record<string, unknown>
  return (
    typeof msg.id === 'string' &&
    (msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string'
  )
}

function parseMessages(raw: unknown[] | null): Message[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isMessage)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatTranscript(messages: Message[]): string {
  return messages
    .map((msg) => {
      const prose = parseBookingCards(msg.content).prose.trim()
      if (!prose) return null
      const label = msg.role === 'user' ? 'Visitor' : 'Sage'
      return `${label}: ${prose}`
    })
    .filter((line): line is string => line !== null)
    .join('\n\n')
}

const STATUS_COLORS: Record<string, string> = {
  in_progress: 'green',
  active: 'yellow',
  abandoned: 'gray',
}

interface SessionDrawerBodyProps {
  session: ChatSession
  onClose: () => void
}

function SessionDrawerBody({ session, onClose }: SessionDrawerBodyProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const messages = parseMessages(session.messages)
  const transcriptText = formatTranscript(messages)

  function handleCopy() {
    if (!transcriptText) return
    navigator.clipboard.writeText(transcriptText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleTransferSuccess() {
    setTransferOpen(false)
    onClose()
    router.refresh()
  }

  return (
    <>
      <Drawer.Body
        p="md"
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}
      >
        {/* Session metadata */}
        <Stack gap="xs" mb="lg">
          {session.email && (
            <Anchor
              href={`mailto:${session.email}`}
              size="sm"
              style={{
                fontFamily: 'var(--mantine-font-family-monospace)',
                wordBreak: 'break-all',
                color: '#2d6a4f',
              }}
            >
              {session.email}
            </Anchor>
          )}
          <Group gap="xs" wrap="wrap">
            <Badge
              variant="light"
              color={STATUS_COLORS[session.derived_status] ?? 'gray'}
              size="sm"
              radius="sm"
            >
              {session.derived_status}
            </Badge>
            <Text
              size="xs"
              c="dimmed"
              style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
            >
              {messages.length} messages
            </Text>
            <Text
              size="xs"
              c="dimmed"
              style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
            >
              Started {formatDate(session.created_at)}
            </Text>
            {session.updated_at && session.updated_at !== session.created_at && (
              <Text
                size="xs"
                c="dimmed"
                style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
              >
                Last active {formatDate(session.updated_at)}
              </Text>
            )}
          </Group>
        </Stack>

        {/* Transcript */}
        {messages.length === 0 ? (
          <Text
            size="sm"
            c="dimmed"
            style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
          >
            No messages in this session.
          </Text>
        ) : (
          <Stack gap="md">
            {messages.map((msg) => {
              const parsed = msg.role === 'assistant' ? parseBookingCards(msg.content) : null
              const proseText = parsed ? parsed.prose : msg.content
              const cards: BookingCardData[] = parsed?.cards ?? []

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{ maxWidth: '80%' }}>
                    <div
                      style={{
                        fontFamily: 'var(--mantine-font-family-monospace)',
                        fontSize: '10px',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--mantine-color-dimmed)',
                        marginBottom: '4px',
                        textAlign: msg.role === 'user' ? 'right' : 'left',
                      }}
                    >
                      {msg.role === 'user' ? 'Visitor' : 'Sage'}
                    </div>

                    {proseText && (
                      <div
                        style={{
                          padding: '12px 14px',
                          background: msg.role === 'user' ? '#2d6a4f' : 'white',
                          color:
                            msg.role === 'user' ? 'white' : 'var(--mantine-color-dark-8)',
                          border:
                            msg.role === 'user'
                              ? 'none'
                              : '1px solid var(--mantine-color-default-border)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          lineHeight: 1.7,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {proseText}
                      </div>
                    )}

                    {cards.length > 0 && (
                      <Stack gap="xs" mt={proseText ? 'xs' : 0}>
                        {cards.map((card, i) => (
                          <Card
                            key={`${msg.id}-booking-${i}`}
                            withBorder
                            padding="sm"
                            radius="md"
                          >
                            <Text
                              size="xs"
                              c="green.7"
                              fw={600}
                              tt="uppercase"
                              style={{
                                letterSpacing: '0.12em',
                                fontFamily: 'var(--mantine-font-family-monospace)',
                              }}
                            >
                              Booking Card
                            </Text>
                            {card.label && (
                              <Text fw={600} size="sm" mt={4}>
                                {card.label}
                              </Text>
                            )}
                            {card.description && (
                              <Text size="xs" c="dimmed" mt={2}>
                                {card.description}
                              </Text>
                            )}
                            {card.url && (
                              <Anchor
                                href={card.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                size="xs"
                                mt={4}
                                style={{ display: 'inline-block', wordBreak: 'break-all' }}
                              >
                                {card.url}
                              </Anchor>
                            )}
                          </Card>
                        ))}
                      </Stack>
                    )}
                  </div>
                </div>
              )
            })}
          </Stack>
        )}
      </Drawer.Body>

      {/* Sticky footer */}
      <div
        style={{
          padding: 'var(--mantine-spacing-md)',
          borderTop: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
        }}
      >
        <Group justify="space-between">
          <Button
            size="sm"
            color="green"
            variant="filled"
            leftSection={<IconArrowsRightLeft size={14} />}
            onClick={() => setTransferOpen(true)}
          >
            Transfer
          </Button>
          <Tooltip label={copied ? 'Copied!' : 'Copy transcript'} position="left">
            <ActionIcon
              variant="subtle"
              color={copied ? 'green' : 'gray'}
              size="md"
              onClick={handleCopy}
              aria-label={copied ? 'Transcript copied' : 'Copy transcript'}
              disabled={messages.length === 0}
            >
              {copied ? <IconCheck size={16} /> : <IconClipboard size={16} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>

      <TransferModal
        opened={transferOpen}
        sessionId={session.id}
        visitorName={session.visitor_name}
        onClose={() => setTransferOpen(false)}
        onSuccess={handleTransferSuccess}
      />
    </>
  )
}

export interface SessionDrawerProps {
  session: ChatSession | null
  onClose: () => void
}

export function SessionDrawer({ session, onClose }: SessionDrawerProps) {
  const isMobile = useMediaQuery('(max-width: 48em)')
  const opened = session !== null
  const title = session?.visitor_name ?? 'Anonymous'

  if (!isMobile) {
    return (
      <Drawer.Root
        opened={opened}
        onClose={onClose}
        position="right"
        size="lg"
        trapFocus
        returnFocus
      >
        <Drawer.Overlay />
        <Drawer.Content style={{ display: 'flex', flexDirection: 'column' }}>
          <Drawer.Header>
            <Drawer.Title
              style={{
                fontFamily: 'var(--mantine-font-family)',
                fontSize: 'var(--mantine-font-size-lg)',
                fontWeight: 600,
              }}
            >
              {title}
            </Drawer.Title>
            <Drawer.CloseButton />
          </Drawer.Header>
          {session && <SessionDrawerBody session={session} onClose={onClose} />}
        </Drawer.Content>
      </Drawer.Root>
    )
  }

  return (
    <Drawer.Root
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="86%"
      radius="md"
      trapFocus
      returnFocus
    >
      <Drawer.Overlay />
      <Drawer.Content style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          aria-hidden
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 8,
            paddingBottom: 4,
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'var(--mantine-color-gray-4)',
            }}
          />
        </div>
        <Drawer.Header>
          <Drawer.Title
            style={{
              fontFamily: 'var(--mantine-font-family)',
              fontSize: 'var(--mantine-font-size-lg)',
              fontWeight: 600,
            }}
          >
            {title}
          </Drawer.Title>
          <Drawer.CloseButton />
        </Drawer.Header>
        {session && <SessionDrawerBody session={session} onClose={onClose} />}
      </Drawer.Content>
    </Drawer.Root>
  )
}
