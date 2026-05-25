import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'
import {
  deriveSessionStatus,
  type SessionStatusThresholds,
} from '@/services/crm/status'
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg) => (
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
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
        </div>
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
