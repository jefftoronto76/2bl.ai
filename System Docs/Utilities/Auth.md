# Auth Service

### Auth service (`services/auth/`)

Auth-context resolution, tenant resolution, user sync, and the Supabase client
factories live in the shared `services/auth/` layer (imported as
`@/services/auth/*`). Both `app/` and `src/` may depend on this layer; it is the
intended home for cross-cutting auth/DB plumbing.

**The provider boundary (2026-06-11).** `services/auth/` is also the
provider-agnostic auth boundary (Golden Rule, `Design Handovers/auth-service-rebuild.md`):
no file outside it imports `@clerk/*` — enforced as an ESLint `error`
(`no-restricted-imports`, override only for `services/auth/providers/clerk/**`).
Caveat: the repo-root `middleware.ts` sits outside `next lint`'s default
directories, so keep it provider-free by review. The provider is swappable by
re-pointing the entry-point re-exports at a new `providers/<name>/` folder.

Entry points (four, one per runtime context — the server barrel never exports
`'use client'` modules, same convention as `services/chat/ui/v1`):

| Entry point | Exports | Consumed by |
|-------------|---------|-------------|
| `services/auth/index.ts` (server) | `getSession()` (cheap JWT presence — `AppSession { providerUserId }`), `getCurrentUser()` (one provider backend call — normalized `AuthUser { providerUserId, email?, phone?, name?, imageUrl?, isPlatformAdmin }`), `requirePlatformAdmin()` (null unless signed-in admin), `deleteClerkUser(clerkUserId)` (irreversible — deletes the Clerk identity/sessions; caller writes the audit record and handles Supabase deletion separately), types, errors, + re-exports of the existing helpers below | API routes, server components/layouts |
| `services/auth/client.ts` (`'use client'`) | `useAuthUser()` (mirrors the provider tri-state — `isSignedIn` stays `undefined` until `isLoaded`; **never coerce while loading**, chatStore's recovery gates depend on it), `useAuthActions()` (`signOut`, `openSignIn`, `openSignUp`, `openUserProfile` — appearance passed as opaque `AuthAppearance`) | Client components (chatStore, ChatHeader, GateView, LandingNav, MessageList, MagicLinkCard, prompt-builder) |
| `services/auth/ui.tsx` (no directive — pure re-exports preserve the provider's SSR boundary markers) | `AuthProvider` (root-layout mount, stays inside `<body>`), `UserButton`, `SignInPanel`, `CaptchaSlot` (`<div id="clerk-captcha">`) | `app/layout.tsx`, admin shells, SBL sign-in page, MagicLinkCard |
| `services/auth/middleware.ts` (edge-safe leaf — never imports the index barrel) | `createAuthMiddleware` (typed passthrough; provider middleware stays outermost), `createRouteMatcher` | repo-root `middleware.ts` (whose `config.matcher` must stay a **literal** array — Next.js static analysis) |

The Clerk adapter (`services/auth/providers/clerk/`): `server.ts` (the
session/user API + `clerkAuth`/`clerkCurrentUser` re-exports for in-boundary
helpers), `client.ts` (`useAuthUser`/`useAuthActions`/`useAuthFlowAdapter`),
`ui.tsx`, `middleware.ts`, `errors.ts` (dual-channel normalization), and
`map.ts` (`mapClerkUser` + the publicMetadata `resolveIsPlatformAdmin`).
**Authorization is ours:** server-side `isPlatformAdmin` is resolved from the
Supabase `users.role` column (`resolveIsPlatformAdminFromDb` in `server.ts` —
`'platform_admin'` → true, any other role or no row → false), with a LOUD
fallback to publicMetadata if the lookup itself fails (e.g. column missing),
logging `[auth] users.role lookup failed — falling back to publicMetadata`.
Client-side `useAuthUser().user.isPlatformAdmin` still maps from
publicMetadata (browser has no service-role DB path) and gates display-only
surfaces; every privileged action is server-gated. Requires `users.role`
(text NOT NULL default `'member'`) to exist + the admin row backfilled —
Jeff's Studio work. Unit tests: `map.test.ts`, `authFlowAdapter.test.tsx`.

| Helper | File | Purpose |
|--------|------|---------|
| `getAuthContext` | `services/auth/get-auth-context.ts` | Resolves the current Clerk user to their Supabase `owner_id` and `tenant_id` via the `users.clerk_id` → `tenant_users.user_id` lookup. Multi-tenant users resolve the active tenant by request Host (falls back to `DEFAULT_ADMIN_TENANT_ID`, then the first membership). Throws `Unauthorized` / `User not found` / `Tenant not found` on failure. Used by every authenticated admin API route for tenant scoping. |
| `getTenantFromRequest` | `services/auth/get-tenant-from-request.ts` | Resolves `tenant_id` from the `Host` header of an anonymous public request. Prefers the exact host (so product subdomains like `heirloom.2bl.ai` resolve to their own tenant), then the registrable root (e.g. `app.jefflougheed.ca` → `jefflougheed.ca`), filters dev hosts (localhost, `*.local`, `127.0.0.1`), queries `tenants.domain` for a match. Returns `tenant_id` string or `null`. **`x-preview-tenant` header fallback (non-production only):** when the host doesn't resolve to a domain match, checks the `x-preview-tenant` request header (set by root `middleware.ts` from the `hl-preview` cookie, itself set when the page loaded with `?preview=<slug>`) and queries `tenants.slug` for a match — lets preview hosts address a tenant by short name. **`PREVIEW_TENANT_ID` fallback (2026-06-11):** only after the slug lookup also misses, when `PREVIEW_TENANT_ID` is set AND `VERCEL_ENV !== 'production'`, returns that id instead of null — set the var in Vercel's Preview environment ONLY (it is hard-ignored in production; a real `tenants.domain` match always wins over both fallbacks). Exists so tenant-resolved surfaces (session create, OTP E2E) are testable on `*.vercel.app` preview hosts. Unit-tested in `get-tenant-from-request.test.ts`. Used by `/api/sage/route.ts` for anonymous visitor chat — falls back to `DEFAULT_SYSTEM_PROMPT` on null. |
| `resolveTenantIdFromHost` / `normalizeHost` | `services/auth/resolve-tenant-from-host.ts` | Pure full-host exact-match helper (does NOT collapse subdomains) used by `getAuthContext` for multi-tenant host resolution. Unit-tested in `services/auth/resolve-tenant-from-host.test.ts`. |
| `syncUser` | `services/auth/sync-user.ts` | Upserts the current Clerk user into the Supabase `users` table on `clerk_id` conflict; returns the Supabase UUID or null. Called from `app/admin/layout.tsx` and from `POST /api/sessions` (to link a Heirloom session to its signed-in user). |
| `getCurrentUserId` | `services/auth/get-current-user-id.ts` | Read-only resolution of the current Clerk session to `users.id` via the `clerk_id` lookup. Unlike `getAuthContext`, requires NO `tenant_users` membership (for end-customers like Heirloom visitors, who are not admins); unlike `syncUser`, never writes. Returns null when there is no Clerk session or no matching `users` row. Used by `GET /api/sessions`. |
| `ensureClerkUser` | `services/auth/ensure-clerk-user.ts` | Upserts the current Clerk user into `users` by `clerk_id` and returns `users.id`. Unlike `syncUser`, does **not** require an email — supports phone-only Heirloom sign-ups, relying on `users.email` being nullable. Email/name/phone written only when present (`users.phone` added 2026-06-10). Leaves `syncUser`'s admin path untouched. Used by `POST /api/sessions/[id]/claim`. |
| `syncMember` | `services/auth/sync-member.ts` | Upserts a `members` row for a newly-authenticated Clerk user, syncing their name/email/phone from Clerk. Called once post-authentication; idempotent on re-auth. Resolves/creates the `users` row by `clerk_id` first (same pattern as `linkInvitedMember`), then upserts `members` on `clerk_id` conflict with `status: 'active'` and `user_id` always set to the resolved `users.id`; updates `name`/`email`/`phone` only when the caller passes them (undefined = skip column). **Fixed 2026-08-06** — previously omitted `user_id` from the `members` payload entirely, which left active, Clerk-linked members rows with a permanently null `user_id` whenever this fallback path (rather than `linkInvitedMember`/`acceptInvite`) created the row; see Known Gaps.md. Logs `member.user_resolve_failed` (`AuditAction.MEMBER_USER_RESOLVE_FAILED`) to `audit_events` if the `users` upsert fails. Returns `SyncMemberResult` (`{ ok: true; data: MemberRow } \| { ok: false; error: string }`). Exports `HEIRLOOM_TENANT_ID = '20767f1d-1148-4e43-ab73-f6da88f0ac56'`. Uses service-role client (server-only, bypasses RLS). |
| `claimMembership` | `services/auth/claim-membership.ts` | Creates a `pending` members row for a self-service visitor who has just authenticated via Clerk. **Never downgrades an existing row** — if a row already exists with any status, returns ok without writing. If no row exists, inserts with `status: 'pending'`. Called by `POST /api/heirloom/members/claim`, itself called only by `GateView.tsx`'s sign-in-transition `useEffect`. **Effectively orphaned as of 2026-08-14** (expired-invite-chat-first) — `GateView`'s invalid/expired-token branch, the one realistic path that used to drive a sign-up through this effect, was replaced by the chat-first `[ACCOUNT_CREATE: expired invite]` flow (`MagicLinkCard` → `/api/members/sync`/`syncMember`, `status: 'active'`, not this function), and `GateView` no longer even mounts for that population (`isGated` bypasses it). Left in place, not deleted — see `System Docs/Known Gaps.md`. Service-role client, server-only. |
| `getAdminClient` | `services/auth/supabase-admin.ts` | Service-role Supabase client (server-only, bypasses RLS). The most widely imported factory — used by every admin route, the public Sage routes, and `services/chat/server/*`. |
| `createClient` | `services/auth/supabase.ts` (browser) / `services/auth/supabase-server.ts` (SSR cookie-aware) | Anon-key Supabase client factories. |
| `AdminUserProvider` / `useAdminUserId` | `services/auth/admin-user-context.tsx` | `'use client'` React context exposing the synced Supabase user id to the admin tree. Mounted in `app/admin/layout.tsx`. (Moved from `src/context/admin-user.tsx`.) |
| `useAuthFlow` | `services/auth/useAuthFlow.ts` | Provider-agnostic **stage machine** for the Heirloom custom OTP sign-up/sign-in flow (refactored 2026-06-11): owns stages (`idle → sending → otp_input → verifying → success/error`), contact state, the `mountedRef` guard, the `/api/auth/magic-link` validation gate (always ordered BEFORE any provider call), resend, and reset. All provider mechanics + step-by-step `auth_events` telemetry live in `useAuthFlowAdapter` (`providers/clerk/client.ts`); failure routing follows the adapter's `terminal` flag (terminal → `error`, retryable → `otp_input`). Public `UseAuthFlowReturn` unchanged — `MagicLinkCard` is the consumer. See Core 3 API reference below. |

#### Clerk Core 3 custom OTP (`services/auth/useAuthFlow.ts`)

SDK `@clerk/nextjs@7` (Core 3). All Clerk methods return `{ error: ClerkError | null }`.

**⚠️ Dual error channel (undocumented by Clerk; observed in production, PR #86):**
`signIn.emailCode.sendCode()` / `signIn.phoneCode.sendCode()` can ALSO **throw**
on HTTP 4xx responses (e.g. `ClerkAPIResponseError`) in addition to the
documented `{ error }` return. Every sendCode call site must handle **both**
channels — wrap in try/catch and normalize the thrown shape alongside the
returned one. Do not "clean up" the defensive try/catch to match Clerk's docs;
the docs do not describe the throw path.

Authoritative reference: `.agents/skills/clerk-custom-ui/core-3/custom-sign-in.md` and `custom-sign-up.md`.

**Sign-in OTP (existing user)** — no `signIn.create()`; the identifier is passed to `sendCode` (PR #85)
```typescript
const { signIn } = useSignIn()
await signIn.emailCode.sendCode({ emailAddress })   // email
await signIn.phoneCode.sendCode({ phoneNumber })    // phone
await signIn.emailCode.verifyCode({ code })         // email
await signIn.phoneCode.verifyCode({ code })         // phone
await signIn.finalize({ navigate: () => {} })       // activate session (no-op navigate for embedded)
```

**Sign-up OTP (new user)** — note `.verifications.` namespace (NOT directly on `signUp`)
```typescript
const { signUp } = useSignUp()
await signUp.create({ emailAddress | phoneNumber })
await signUp.verifications.sendEmailCode()              // email  ← NOT signUp.sendEmailCode()
await signUp.verifications.sendPhoneCode()              // phone  ← NOT signUp.sendPhoneCode()
await signUp.verifications.verifyEmailCode({ code })    // email
await signUp.verifications.verifyPhoneCode({ code })    // phone
await signUp.finalize({ navigate: () => {} })           // activate session
```

**New-vs-existing user detection:** **error-code driven** (implemented in
`useAuthFlowAdapter`, `services/auth/providers/clerk/client.ts`).
`signUp.create({ emailAddress | phoneNumber })` is attempted first. If it
succeeds → genuine sign-up (`signUp.verifications.send*Code()`). If it fails
with `form_identifier_exists` (from EITHER error channel — "That email
address / phone number is taken") → existing user → sign in **directly** via
`signIn.emailCode.sendCode({ emailAddress })` / `phoneCode.sendCode({ phoneNumber })`.

**⚠️ Do NOT use Clerk's documented `signUp.isTransferable` /
`signIn.create({ transfer: true })` mechanism as the primary path.** Observed
in production 2026-06-11 (both email and phone): `isTransferable` stayed
`false` on the create-error path for existing identifiers, so transfer-based
detection showed existing users "That email address is taken" instead of
signing them in. The error code is the dependable signal; `isTransferable` is
honored only as a secondary belt in case Clerk starts setting it.

If create fails with any other code (rate limit, invalid identifier, network),
the error is surfaced to the user — a transient failure is never misread as
"new user" (the failure mode of the old signIn-first heuristic, replaced
2026-06-11). Because `signUp.create()` runs for every attempt, the
`#clerk-captcha` div must be present for sign-ins as well — `CaptchaSlot`
renders unconditionally in the MagicLinkCard form.

**Invite-token → Clerk `unsafeMetadata` write (added 2026-08-11, PR #351;
`heirloom_invite_token` predates this doc entry, `heirloom_story_invite_token`
is new):** on the sign-up path only (never sign-in — an existing profile is
never touched), `sendCode` (`services/auth/providers/clerk/client.ts`) writes
whichever of `contact.inviteToken`/`contact.storyInviteToken` are present
into Clerk `unsafeMetadata` as `heirloom_invite_token`/
`heirloom_story_invite_token`, in **one** `signUp.update({ unsafeMetadata })`
call — never two separate calls, since `unsafeMetadata` is a full-object
**replace**, not a merge, and a second call would silently wipe whatever the
first one wrote. Non-fatal by design, same posture as the name-attachment
write immediately above it in the same function: a failure is logged
(`logAuthStep`, step `signUp_update_invite_token`) but never blocks the
sign-up itself. The Clerk `user.created`/`user.updated` webhook
(`app/api/webhooks/clerk/route.ts`) reads these two keys back off
`unsafe_metadata` to become authoritative for the resulting `members` row —
`heirloom_invite_token` drives `linkInvitedMember` (`services/members`),
`heirloom_story_invite_token` drives `acceptStoryInvite`
(`services/crm/story-invites.ts`) directly, checked in that priority order.
See `System Docs/API Routes.md`'s `/api/webhooks/clerk` row and
`System Docs/Known Gaps.md`'s webhook-race entry for why the story-invite
half of this was added — briefly, so the webhook could stop losing a race
against the client's own accept call and falling through to a generic,
story-invite-unaware member upsert.

**Name capture (added 2026-08-14, PR #371):** both `linkInvitedMember` and
`acceptStoryInvite` now take an optional trailing `name` param and persist
it on the row they touch (previously neither ever set `members.name`). The
webhook derives one `name` const from the raw payload — `[data.first_name,
data.last_name].filter(Boolean).join(' ') || null` — and passes it to
both, the same const it already passed to its own `syncMember` call (row
above) before this fix. `acceptStoryInvite`'s other caller,
`POST /api/heirloom/story-invites/accept`, passes `user.name ?? null` from
`getCurrentUser()` instead — already Clerk-mapped via the shared
`mapClerkUser` boundary function (`[user.firstName, user.lastName]
.filter(Boolean).join(' ') || undefined`), same derivation by a different
route.

**Required in sign-up form:** `<div id="clerk-captcha" />` (Clerk bot-protection; silently fails without it).

**`middleware.ts` must include** `'/__clerk/(.*)'` in its matcher array (verification callback paths).

**Auth Known Limitations (deliberate; revisit triggers noted):**
- `finalize({ navigate: () => {} })` no-op skips two documented `navigate`
  responsibilities: session-task handling (`session.currentTask`) and Safari ITP
  URL decoration (`decorateUrl`). Not an issue while MFA and session tasks are
  disabled in the Clerk dashboard — revisit if either is enabled (verified users
  would otherwise appear signed-out when a session task is pending).
- `needs_client_trust` / `needs_second_factor` sign-in statuses are unhandled
  (they fall into the generic `status_not_complete` error path). Not triggerable
  by pure OTP flows — revisit if MFA is ever enabled.
- Next.js 16 renames `middleware.ts` → `proxy.ts`. Not relevant on Next.js 15;
  the auth boundary isolates the rename to two files when the upgrade happens.
