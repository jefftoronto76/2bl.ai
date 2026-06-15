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
  TextInput,
} from '@mantine/core'
import { IconClipboard, IconCheck, IconArrowsRightLeft, IconCopy } from '@tabler/icons-react'
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

function MessageBubble({ msg }: { msg: Message }) {
  const [hovered, setHovered] = useState(false)
  const [msgCopied, setMsgCopied] = useState(false)

  const parsed = msg.role === 'assistant' ? parseBookingCards(msg.content) : null
  const proseText = parsed ? parsed.prose : msg.content
  const cards: BookingCardData[] = parsed?.cards ?? []

  function handleMsgCopy() {
    if (!proseText) return
    navigator.clipboard.writeText(proseText).catch(() => {})
    setMsgCopied(true)
    setTimeout(() => setMsgCopied(false), 2000)
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{ maxWidth: '80%' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
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
          <div style={{ position: 'relative' }}>
            <div
              style={{
                padding: '12px 14px',
                background: msg.role === 'user' ? '#2d6a4f' : 'white',
                color: msg.role === 'user' ? 'white' : 'var(--mantine-color-dark-8)',
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
            {(hovered || msgCopied) && (
              <Tooltip
                label={msgCopied ? 'Copied!' : 'Copy'}
                position={msg.role === 'user' ? 'left' : 'right'}
                withArrow
              >
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color={msgCopied ? 'green' : 'gray'}
                  onClick={handleMsgCopy}
                  aria-label={msgCopied ? 'Message copied' : 'Copy message'}
                  style={{ position: 'absolute', top: 4, right: 4 }}
                >
                  {msgCopied ? <IconCheck size={10} /> : <IconCopy size={10} />}
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        )}

        {cards.length > 0 && (
          <Stack gap="xs" mt={proseText ? 'xs' : 0}>
            {cards.map((card, i) => (
              <Card key={`${msg.id}-booking-${i}`} withBorder padding="sm" radius="md">
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
}

export interface SessionDrawerProps {
  session: ChatSession | null
  onClose: () => void
}

export function SessionDrawer({ session, onClose }: SessionDrawerProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const messages = parseMessages(session?.messages ?? null)
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
      <Drawer
        opened={session !== null}
        onClose={onClose}
        position="right"
        size="50%"
        withOverlay={false}
        trapFocus
        returnFocus
        title={
          <TextInput
            value={session?.visitor_name ?? ''}
            placeholder="Anonymous"
            readOnly
            variant="unstyled"
            styles={{
              input: {
                fontFamily: 'var(--mantine-font-family)',
                fontSize: 'var(--mantine-font-size-lg)',
                fontWeight: 600,
                padding: 0,
                height: 'auto',
                minHeight: 'auto',
              },
            }}
          />
        }
        styles={{
          content: {
            display: 'flex',
            flexDirection: 'column',
          },
          body: {
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          },
        }}
      >
        {/* Metadata */}
        <div style={{ padding: 'var(--mantine-spacing-md)', paddingBottom: 0 }}>
          {session?.email && (
            <Anchor
              href={`mailto:${session.email}`}
              size="sm"
              mb="xs"
              style={{
                display: 'block',
                fontFamily: 'var(--mantine-font-family-monospace)',
                wordBreak: 'break-all',
                color: '#2d6a4f',
              }}
            >
              {session.email}
            </Anchor>
          )}
          {session && (
            <Group gap="xs" wrap="wrap" mb="md">
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
          )}
        </div>

        {/* Scrollable transcript */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--mantine-spacing-md)', paddingTop: 0 }}>
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
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </Stack>
          )}
        </div>

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
            <Button
              size="sm"
              variant={copied ? 'filled' : 'subtle'}
              color={copied ? 'green' : 'gray'}
              leftSection={copied ? <IconCheck size={14} /> : <IconClipboard size={14} />}
              onClick={handleCopy}
              disabled={messages.length === 0}
            >
              {copied ? 'Copied!' : 'Copy transcript'}
            </Button>
          </Group>
        </div>
      </Drawer>

      {session && (
        <TransferModal
          opened={transferOpen}
          sessionId={session.id}
          visitorName={session.visitor_name}
          onClose={() => setTransferOpen(false)}
          onSuccess={handleTransferSuccess}
        />
      )}
    </>
  )
}
