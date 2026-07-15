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
  Loader,
} from '@mantine/core'
import {
  IconClipboard,
  IconCheck,
  IconArrowsRightLeft,
  IconCopy,
  IconAlertTriangle,
  IconThumbUpFilled,
  IconThumbDownFilled,
} from '@tabler/icons-react'
import {
  parseBookingCards,
  type BookingCardData,
} from '@/services/chat/ui/v1/parseBookingCards'
import { reviveUIMessage } from '@/services/chat/ui/v1/message'
import type { UIMessage } from '@/services/chat/ui/v1/types'
import type { ChatSession } from '@/services/crm/inbound'
import type { MessageFeedbackRow } from '@/services/crm/feedback'
import { formatTokens, formatCost } from '@/services/crm/formatting'
import { FeedbackCounts } from '@/components/admin/lib/primitives'
import { TransferModal } from './TransferModal'

// message_index must align with message_feedback.message_index, which counts
// position in the raw chat_sessions.messages array (0-indexed, both roles).
type DrawerMessage = UIMessage & { message_index: number }

function reviveSessionMessages(raw: unknown[] | null): DrawerMessage[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry, i) => ({ ...reviveUIMessage(entry), message_index: i }))
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

function formatTranscript(messages: DrawerMessage[]): string {
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

function MessageBubble({
  msg,
  feedback,
  ttftMs,
}: {
  msg: DrawerMessage
  feedback?: MessageFeedbackRow
  ttftMs: number | null
}) {
  const [hovered, setHovered] = useState(false)
  const [msgCopied, setMsgCopied] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const parsed = msg.role === 'assistant' ? parseBookingCards(msg.content) : null
  const proseText = parsed ? parsed.prose : msg.content
  const cards: BookingCardData[] = parsed?.cards ?? []

  // Non-null assertions below are guarded by hasRating, which is only true
  // when `feedback` is defined and has a rating.
  const hasRating = !!feedback && feedback.rating !== null
  const hasTrailingRow =
    msg.role === 'assistant' &&
    (ttftMs != null || !!msg.stopped || !!(msg.versions && msg.versions.length > 0) || hasRating)

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

        {/* Delivery status — user messages only, absent/'sent' renders nothing. */}
        {msg.role === 'user' && msg.status && msg.status !== 'sent' && (
          <Group gap={6} justify="flex-end" mt={4} wrap="nowrap">
            {msg.status === 'sending' ? (
              <>
                <Loader size={12} />
                <Text
                  size="xs"
                  c="dimmed"
                  style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
                >
                  Sending…
                </Text>
              </>
            ) : (
              <>
                <IconAlertTriangle size={12} style={{ color: 'var(--mantine-color-orange-7)' }} />
                <Text
                  size="xs"
                  c="orange.7"
                  style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
                >
                  Not delivered
                </Text>
              </>
            )}
          </Group>
        )}

        {/* TTFT (last assistant message only) → Stopped → version indicator → thumb. */}
        {hasTrailingRow && (
          <Group gap={8} justify="flex-end" mt={4} wrap="nowrap">
            {ttftMs != null && (
              <Text
                size="xs"
                c="dimmed"
                style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
              >
                ↩ {ttftMs}ms
              </Text>
            )}
            {msg.stopped && (
              <Badge size="xs" variant="light" color="gray" tt="none">
                Stopped
              </Badge>
            )}
            {msg.versions && msg.versions.length > 0 && (
              <Text
                size="xs"
                c="dimmed"
                style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
              >
                v{(msg.versionIdx ?? 0) + 1}/{msg.versions.length + 1} shown
              </Text>
            )}
            {hasRating && (
              <ActionIcon
                size="xs"
                variant="subtle"
                color={feedback!.rating === 'up' ? 'green' : 'orange'}
                onClick={() => setFeedbackOpen((v) => !v)}
                aria-label={feedbackOpen ? 'Hide feedback detail' : 'Show feedback detail'}
                aria-expanded={feedbackOpen}
              >
                {feedback!.rating === 'up' ? (
                  <IconThumbUpFilled size={12} />
                ) : (
                  <IconThumbDownFilled size={12} />
                )}
              </ActionIcon>
            )}
          </Group>
        )}

        {feedbackOpen && hasRating && (
          <div
            style={{
              marginTop: 6,
              padding: '8px 10px',
              borderRadius: 8,
              background:
                feedback!.rating === 'up'
                  ? 'var(--mantine-color-green-0)'
                  : 'var(--mantine-color-orange-0)',
            }}
          >
            {feedback!.tags.length > 0 && (
              <Group gap={6} wrap="wrap" mb={feedback!.detail ? 6 : 0}>
                {feedback!.tags.map((tag) => (
                  <Badge
                    key={tag}
                    size="xs"
                    variant="light"
                    color={feedback!.rating === 'up' ? 'green' : 'orange'}
                    tt="none"
                  >
                    {tag}
                  </Badge>
                ))}
              </Group>
            )}
            {feedback!.detail && (
              <Text size="xs" fs="italic" c="dimmed">
                &ldquo;{feedback!.detail}&rdquo;
              </Text>
            )}
          </div>
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

  const messages = reviveSessionMessages(session?.messages ?? null)
  const transcriptText = formatTranscript(messages)
  const feedbackByIndex = new Map<number, MessageFeedbackRow>(
    (session?.feedback ?? []).map((f) => [f.message_index, f]),
  )
  // TTFT is a single session-level value (see services/crm/inbound.ts) — it
  // only ever corresponds to the most recent assistant turn, so the badge
  // renders on that message alone rather than fabricating per-turn numbers.
  const lastAssistantIndex = messages.reduce(
    (acc, m) => (m.role === 'assistant' ? m.message_index : acc),
    -1,
  )
  const hasFeedback = (session?.feedback_counts?.up ?? 0) + (session?.feedback_counts?.down ?? 0) > 0

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
                {formatTokens(session.input_tokens, session.output_tokens)} tokens
              </Text>
              <Text
                size="xs"
                c="dimmed"
                style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
              >
                {formatCost(session.input_tokens, session.output_tokens)}
              </Text>
              <Text
                size="xs"
                c="dimmed"
                style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
              >
                {session.ttft_ms != null ? `${session.ttft_ms}ms response` : '— response'}
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
              <Group justify="space-between" align="center">
                <Text
                  size="xs"
                  c="dimmed"
                  fw={600}
                  tt="uppercase"
                  style={{ letterSpacing: '0.08em', fontFamily: 'var(--mantine-font-family-monospace)' }}
                >
                  Transcript
                </Text>
                {hasFeedback && session && (
                  <FeedbackCounts up={session.feedback_counts.up} down={session.feedback_counts.down} />
                )}
              </Group>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  feedback={feedbackByIndex.get(msg.message_index)}
                  ttftMs={
                    msg.role === 'assistant' && msg.message_index === lastAssistantIndex
                      ? session?.ttft_ms ?? null
                      : null
                  }
                />
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
