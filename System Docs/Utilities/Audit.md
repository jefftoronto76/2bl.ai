# Audit Service

### Audit service (`services/audit/`)

Centralised audit and auth-event logging. Server-only. Imported as
`@/services/audit` (barrel) or `@/services/audit/types` (types only).

**Timestamp convention: all `audit_events` / `auth_events` timestamps are
stored in UTC** (`created_at timestamptz default now()` — Postgres stores the
UTC instant). Queries, reports, and any time-window filtering must convert
to/from local time explicitly; never assume rows are in the server's or
viewer's local timezone.

| File | Exports | Purpose |
|------|---------|---------|
| `types.ts` | `AuditAction` (const + type), `AuthEventType` (const + type), `AuditEventInput`, `AuthEventInput` | Typed action-name constants (`AuditAction.BLOCK_UPDATE = 'block.update'`, etc.) and input interfaces matching the DB schema. Eliminates magic strings at every call site. `AuthEventType` covers: `sign_up`, `sign_in`, `sign_in_failed`, `otp_sent`, `otp_verified`, `session_created`, `session_revoked`, `user_deleted`, `admin_access`, `admin_access_failed`. Member-lifecycle `AuditAction` constants added 2026-06-12: `MEMBER_INVITE_CREATED = 'member.invite_created'`, `MEMBER_INVITE_ACCEPTED = 'member.invite_accepted'`, `MEMBER_ROLE_UPDATED = 'member.role_updated'`, `MEMBER_STATUS_UPDATED = 'member.status_updated'`, `MEMBER_HARD_DELETED = 'user.hard_deleted'` (note: the enum key is member-scoped but the stored string value is `user.hard_deleted` — a naming holdover from when this action targeted the `users` table directly). `MEMBER_INVITE_RESENT = 'member.invite_resent'` and `MEMBER_INVITE_REVOKED = 'member.invite_revoked'` back the resend/revoke routes. `MEMBER_INVITE_OPENED = 'member.invite_opened'` (added 2026-07-11, invite-link tracking) is fired fire-and-forget with `actor_type: 'anonymous'` from the public `GET /invite/[token]` redirect route — the only `AuditAction` write with no authenticated actor. `CHAT_MEDIA_CONTEXT_RESOLVED = 'chat.media_context_resolved'` (added 2026-08-04) diagnoses whether `resolveMediaContext` (`services/chat/server/media-context.ts`) produced usable output for a chat turn — added after Heirloom guide reports of not seeing uploaded photos/files even when the DB showed `status = 'ready'`, a case the prior DB-error-only log didn't cover. Written from two sites per turn, deliberately, for visibility at both the caller and the resolver: `services/chat/server/index.ts`'s `streamChat()` logs unconditionally after its `Promise.all` resolves, with metadata `{ clientSentItems, contextLength, hasAttached, hasFailed, hasInProgress }` (booleans derived from whether the built context string contains each section header); `media-context.ts`'s `resolveMediaContext()` logs from inside itself, but only on the path that reaches its DB query (skipped by the function's early-return for no media items/tenant/member), with metadata `{ clientSentItems, readyCount, failedCount, inProgressCount, contextLength }`. Neither site ever includes `derived_content` or other extracted file content — counts and presence flags only. Media-pipeline actions added 2026-08-05 as part of the broader sweep (`System Docs/Known Gaps.md`, PRs #280/#281): `MEDIA_UPLOAD_DEDUPED = 'media.upload_deduped'` fires from `app/api/media/upload-url/route.ts` when a client-supplied `content_hash` matches an existing row for the same member+chat — metadata carries the matched item's id/status, never file content. `MEDIA_RETRY_REQUESTED = 'media.retry_requested'` / `MEDIA_RETRY_FAILED = 'media.retry_failed'` fire in pairs (sharing one `correlation_id`) from `app/api/media/[id]/retry/route.ts`, the former on successful re-dispatch to `processMediaItem`, the latter only if that fire-and-forget call itself rejects. The remaining five — `MEDIA_FILE_UPLOAD_RECEIVED` / `MEDIA_FILE_UPLOAD_FAILED`, `MEDIA_PDF_EXTRACTION_RECEIVED` / `MEDIA_PDF_EXTRACTION_FAILED`, and `MEDIA_FILE_CLEANUP_FAILED` — are logged from `services/content/assets.ts`'s Anthropic Files API helpers (`uploadFileToAnthropic`, `extractTextFromPdf`, `deleteAnthropicFile`) via `logAiMediaEvent`, gated on an optional `MediaAuditContext` the caller supplies; the admin document-upload flow (`app/api/admin/assets/upload/route.ts`) has no `media_items` row and passes no context, so it gets no logging from these five actions, unchanged from its prior behavior. These pinpoint which specific internal step of PDF extraction succeeded or failed, distinct from the bracketing `AI_MEDIA_REQUEST_SENT` / `AI_MEDIA_RESPONSE_RECEIVED` / `AI_MEDIA_REQUEST_FAILED` actions `services/media/processor.ts` logs around the whole attempt. As with `CHAT_MEDIA_CONTEXT_RESOLVED` above, none of these ever log extracted text or file content — only ids, status, byte length, and error strings. |
| `audit.ts` | `logEvent(input: AuditEventInput): Promise<void>`, `logAuthEvent(input: AuthEventInput): Promise<void>` | Thin service-role writes to `audit_events` and `auth_events` respectively. **Fire-and-forget** — all errors are caught and `console.error`'d; neither function ever throws, so a logging failure never blocks or fails the originating request. Call with `void logEvent(…)` from API routes. |
| `index.ts` | barrel | Re-exports `logEvent`, `logAuthEvent`, `AuditAction`, `AuthEventType`, and both input types. |

`logEvent` is called (with `void`) from every mutating admin API route,
every platform tenant route, every session route, and the Heirloom
membership-claim route. **Every `logEvent` / `logAuthEvent` call site passes
`tenant_id` (2026-06-11):** admin routes from `authCtx.tenant_id`, public/
anonymous surfaces (including `/api/auth/log`, the Clerk webhook, and the
`get-auth-context` admin_access_failed path) via host-based
`getTenantFromRequest` resolution; the platform tenant routes also stamp the
host-resolved id (null remains possible and still reads as platform-level). `logAuthEvent` is called from
`services/auth/get-auth-context.ts` (unauthorized-access path) and from
`app/api/auth/log/route.ts` (client-side step-by-step auth flow events via
`useAuthFlow`).

The corresponding DB tables (`audit_events`, `auth_events`) must be created by
Jeff in Supabase Studio before audit rows are written. See `System Docs/DB_CHANGELOG.md` and
the plan in `.claude/plans/` for the exact SQL. Until those tables exist, all
`logEvent` / `logAuthEvent` calls return silently (the error is swallowed).
