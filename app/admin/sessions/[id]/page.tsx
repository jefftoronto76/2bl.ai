import { Anchor, Card, Stack, Text } from '@mantine/core'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'
import { getCurrentUser } from '@/services/auth'
import {
  deriveSessionStatus,
  type SessionStatusThresholds,
} from '@/services/crm/status'
import {
  parseBookingCards,
  type BookingCardData,
} from '@/services/chat/ui/v1/parseBookingCards'
import { CopyTranscriptButton } from './CopyTranscriptButton'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

const DEFAULT_THRESHOLDS: SessionStatusThresholds = {
  chat_in_progress_idle_seconds: 300,
  chat_active_idle_seconds: 86400,
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// Shown to platform_admin users only — never to tenant admins. Renders the raw
// marker bracket text the registry stripped from displayed prose (same idea as
// the Heirloom MessageList DebugPill, restyled for the admin palette).
function DebugPill({ raw }: { raw: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 10px',
        borderRadius: '4px',
        background: '#1a1917',
        border: '1px solid rgba(255,255,255,0.1)',
        width: 'fit-content',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
          userSelect: 'none',
        }}
      >
        debug
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'rgba(255,255,255,0.75)',
          wordBreak: 'break-all',
        }}
      >
        {raw}
      </span>
    </div>
  )
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

// Render the conversation as clean "Visitor:/Sage:" transcript text for the
// copy button. Every message is run through parseBookingCards, whose prose has
// all registered markers stripped ([NAME:], [EMAIL:], [PHONE:], [BOOKING:]), so
// no bracket syntax leaks into the copied text. Marker-only messages (empty
// prose after stripping) are dropped so the output has no blank turns.
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

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let tenantId: string
  try {
    const authCtx = await getAuthContext()
    tenantId = authCtx.tenant_id
  } catch (err) {
    console.error('[admin/sessions/[id]] auth failed:', err instanceof Error ? err.message : err)
    notFound()
  }

  // Debug pills are platform_admin-only (resolved server-side from users.role
  // via the auth boundary). The page itself stays accessible to tenant admins —
  // only the marker debug view is gated.
  const currentUser = await getCurrentUser()
  const showDebugMarkers = currentUser?.isPlatformAdmin === true

  const supabase = getAdminClient()

  const [{ data: session, error }, { data: tenant, error: tenantError }] = await Promise.all([
    supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('tenants')
      .select('chat_in_progress_idle_seconds, chat_active_idle_seconds')
      .eq('id', tenantId)
      .maybeSingle(),
  ])

  if (error || !session) {
    notFound()
  }

  if (tenantError) {
    console.error('[admin/sessions/[id]] tenant fetch error:', tenantError)
  }

  const thresholds: SessionStatusThresholds =
    tenant &&
    typeof tenant.chat_in_progress_idle_seconds === 'number' &&
    typeof tenant.chat_active_idle_seconds === 'number'
      ? {
          chat_in_progress_idle_seconds: tenant.chat_in_progress_idle_seconds,
          chat_active_idle_seconds: tenant.chat_active_idle_seconds,
        }
      : DEFAULT_THRESHOLDS

  const derivedStatus = deriveSessionStatus({
    updatedAt: session.updated_at ?? session.created_at,
    thresholds,
    now: new Date(),
  })

  const messages: Message[] = Array.isArray(session.messages) ? session.messages : []
  const transcriptText = formatTranscript(messages)

  return (
    <div style={{ maxWidth: '800px' }}>
      {/* Back link */}
      <Link
        href="/admin"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '32px',
        }}
      >
        ← Inbound Chats
      </Link>

      {/* Session header */}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(24px, 2.5vw, 36px)',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: 'var(--color-text-primary)',
          marginBottom: '12px',
        }}>
          {session.visitor_name ?? 'Anonymous'}
        </h1>

        {session.email && (
          <a
            href={`mailto:${session.email}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: '#2d6a4f',
              textDecoration: 'none',
              display: 'inline-block',
              marginBottom: '12px',
              wordBreak: 'break-all',
            }}
          >
            {session.email}
          </a>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: derivedStatus === 'in_progress' ? '#2d6a4f' : 'var(--color-text-muted)',
          }}>
            {derivedStatus}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-text-dim)',
          }}>
            {messages.length} messages
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-text-dim)',
          }}>
            Started {formatDate(session.created_at)}
          </span>
          {session.updated_at !== session.created_at && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--color-text-dim)',
            }}>
              Last active {formatDate(session.updated_at)}
            </span>
          )}
        </div>
      </div>

      {/* Transcript */}
      {messages.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-text-dim)' }}>
          No messages in this session.
        </p>
      ) : (
        <>
          <CopyTranscriptButton transcript={transcriptText} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg) => {
            // Assistant messages may carry [BOOKING: ...] markers (see Booking
            // Card Syntax). Parse them so the transcript shows a readable card
            // instead of the raw bracket text the public chat renders from.
            const parsed = msg.role === 'assistant' ? parseBookingCards(msg.content) : null
            const proseText = parsed ? parsed.prose : msg.content
            const cards: BookingCardData[] = parsed?.cards ?? []
            // Every marker the registry stripped from prose (NAME, EMAIL,
            // PHONE, BOOKING, ACCOUNT_CREATE) — debug view is purely additive.
            const debugMarkers = showDebugMarkers ? (parsed?.markers ?? []) : []

            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{ maxWidth: '75%' }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-dim)',
                    marginBottom: '4px',
                    textAlign: msg.role === 'user' ? 'right' : 'left',
                  }}>
                    {msg.role === 'user' ? 'Visitor' : 'Sage'}
                  </div>

                  {proseText && (
                    <div style={{
                      padding: '14px 16px',
                      background: msg.role === 'user' ? '#2d6a4f' : 'white',
                      color: msg.role === 'user' ? 'white' : 'var(--color-text-primary)',
                      border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '15px',
                      lineHeight: 1.7,
                      fontFamily: 'var(--font-body)',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {proseText}
                    </div>
                  )}

                  {cards.length > 0 && (
                    <Stack gap="xs" mt={proseText ? 'xs' : 0}>
                      {cards.map((card, i) => (
                        <Card key={`${msg.id}-booking-${i}`} withBorder padding="md" radius="md">
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
                            <Text fw={600} mt={4}>
                              {card.label}
                            </Text>
                          )}
                          {card.description && (
                            <Text size="sm" c="dimmed" mt={2}>
                              {card.description}
                            </Text>
                          )}
                          {card.url && (
                            <Anchor
                              href={card.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="sm"
                              mt={6}
                              style={{ display: 'inline-block', wordBreak: 'break-all' }}
                            >
                              {card.url}
                            </Anchor>
                          )}
                        </Card>
                      ))}
                    </Stack>
                  )}

                  {debugMarkers.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginTop: proseText || cards.length > 0 ? '8px' : 0,
                      }}
                    >
                      {debugMarkers.map((m, idx) => (
                        <DebugPill key={`${msg.id}-marker-${idx}`} raw={m.raw} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          </div>
        </>
      )}

      {/*
        TODO(reinforcement-loop): this reads chat_sessions.corrective_feedback
        which is non-canonical. Wire to chat_corrections table when
        reinforcement loop sprint ships. Do not delete — preserves UI intent.
      */}
      {/* Corrective feedback (Step 5) */}
      {session.corrective_feedback && (
        <div style={{
          marginTop: '48px',
          padding: '20px',
          background: 'white',
          border: '1px solid var(--color-border)',
          borderLeft: '3px solid #b45309',
        }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#b45309',
            marginBottom: '8px',
          }}>
            Corrective Feedback
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--color-text-primary)',
            lineHeight: 1.6,
          }}>
            {typeof session.corrective_feedback === 'string'
              ? session.corrective_feedback
              : JSON.stringify(session.corrective_feedback)}
          </p>
        </div>
      )}
    </div>
  )
}
