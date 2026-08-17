// services/shared/identity.ts
//
// The single rule for reading and writing identity fields (name / email /
// phone) across `users`, `members`, and anything downstream of them.
//
// Dependency-free — no `server-only`, no `getAdminClient`, no service imports —
// so the same module backs the server-side write paths (`services/auth/*`,
// `services/members/*`), the chat server (`services/chat/server/*`), and client
// components (`app/admin/TransferModal.tsx`). Same constraint, and the same
// reason, as `services/media/errorCopy.ts`.
//
// Why this exists rather than a guard at each call site: the identity defects
// D1, D4, and D5 (see `System Docs/Identity System.md`) were each an
// independently-written guard that got the null/empty case subtly wrong, and D2
// was the display-name precedence rule written out three times with one copy
// disagreeing. Per-call-site correctness is the failure mode; this module is
// the fix.

/**
 * Normalises a supplied identity value into "a value to write" or "nothing to
 * write".
 *
 * **Hard invariant: a name already in the database is never deleted unless it
 * is being replaced by another actual name.** `undefined`, `null`, `''`, and
 * whitespace-only all mean *"the caller has no value"* — never *"clear the
 * column"*. They are indistinguishable at this boundary on purpose: treating
 * `null` as an explicit clear is exactly the D1 defect, where
 * `/api/members/sync` sent `null` for an empty name field and `syncMember`'s
 * `if (name !== undefined)` guard let it through onto `members.name`.
 *
 * Returns the trimmed string when there is something to write, or `undefined`
 * when the column must be left untouched. `undefined` is the only skip signal,
 * so payloads built through `setIdentityField` below cannot carry a null into a
 * column by accident.
 *
 * No path currently needs to deliberately clear an identity field. If one ever
 * does, it must do so explicitly and visibly — not by routing an empty value
 * through here.
 */
export function identityValue(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * `identityValue` plus the email normalisation every write path should have
 * been applying. Lowercases, so `users.email` / `members.email` are written
 * one way regardless of caller.
 *
 * Before this existed, the Clerk webhook wrote `users.email` raw-cased
 * (`app/api/webhooks/clerk/route.ts`) and `linkInvitedMember` lowercased it
 * (`services/members/members.ts`) — two writes with two normalisations inside a
 * single request. Matching `createMemberInvite`, which already lowercased.
 */
export function identityEmail(raw: string | null | undefined): string | undefined {
  const value = identityValue(raw)
  return value === undefined ? undefined : value.toLowerCase()
}

/**
 * Assigns an identity field onto an upsert/update payload, honouring the
 * invariant above. The sanctioned way to put name/email/phone into a payload —
 * a bare `payload.name = x` bypasses the rule and reintroduces D1.
 *
 * Leaves the key absent entirely when there is no value, which is what makes a
 * Postgres upsert leave the existing column alone rather than overwrite it.
 */
export function setIdentityField(
  payload: Record<string, unknown>,
  column: string,
  raw: string | null | undefined,
): void {
  const value = identityValue(raw)
  if (value !== undefined) payload[column] = value
}

/** `setIdentityField` for email columns — normalises via `identityEmail`. */
export function setIdentityEmail(
  payload: Record<string, unknown>,
  column: string,
  raw: string | null | undefined,
): void {
  const value = identityEmail(raw)
  if (value !== undefined) payload[column] = value
}

/**
 * Display-name precedence — the single source of truth for "what is this
 * member called".
 *
 * `members.name` is the member's current name. `members.invited_name` is
 * invite-creation metadata, written once by `createMemberInvite` and never
 * updated by anything, so it is only ever a fallback: it goes stale the moment
 * the member's real name changes, and is null entirely for anyone who did not
 * arrive via an admin invite.
 *
 * Empty/whitespace `name` falls through to `invited_name` rather than
 * resolving to an empty display name, since both fields route through
 * `identityValue`.
 *
 * This rule previously lived in three places
 * (`services/chat/server/member-context.ts`,
 * `app/api/admin/sessions/[id]/transfer/route.ts`,
 * `app/admin/TransferModal.tsx`) and the first one disagreed with the other two
 * — reading `invited_name` alone and never `name`. That was D2: 12 members whose
 * name was in the database but invisible to the AI on every chat turn.
 */
export function resolveMemberName(row: {
  name?: string | null
  invited_name?: string | null
}): string | null {
  return identityValue(row.name) ?? identityValue(row.invited_name) ?? null
}
