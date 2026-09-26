Status: Design complete, awaiting go/no-go. Not scheduled — pick up after Traffic Cop Phases 1-4 and Identity Reconciliation land. No code written.

# Clerk as Front Door Only — Investigation & Design

**Status:** design for review, revision 2 (carrier changed to an app-issued bearer token after review of rev 1). Nothing is built. Re-verified against `main` at `fd8e858` (2026-09-04).
**Proposed home once approved:** `Design Handovers/clerk_front_door_design_2026-09-04.md`, with a pointer from `System Docs/Identity System.md` §4.

**Rev 2 decision record (so it is not silently reverted later).** Rev 1 recommended a Clerk custom session claim (Option A) with an app-owned cookie (Option B) as fallback. Both were rejected on review:
- Option A stores our identity pointer inside a Clerk-proprietary feature (dashboard session-token customization + `publicMetadata`). That is *new* coupling to Clerk, not less, even though it is less code. Rejected on that basis.
- Option B's ownership model (the app defines, issues and verifies its own token; Clerk is consulted for exactly one thing — "is the underlying Clerk session still valid") is the right one, but a **cookie** is the wrong carrier for Sage's deployment shape: it runs as a widget embedded on third-party domains (`jefflougheed.ca` today, others later), which is exactly where cookies behave worst and where browser restrictions keep tightening. This is not the third-party-tracking-cookie trend (a first-party cookie would have been fine on that count); it is specifically the embedded-widget case, plus the natural fit for a possible native mobile client later. A header-carried bearer token has no same-site/cross-site distinction to break.

The result, §2 below: **an app-issued, app-verified bearer token, sent as a request header, bound to the Clerk session id, verified without a network call.**

## Context

Clerk's job is to answer one question at the door: *is this session valid, and whose is it?* Today `clerk_id` is also used as a live lookup key well past the door. The worst case is `/api/sage`, which re-resolves Clerk identity to a `members.id` on every chat turn. The goal is to resolve `clerk_id → member_id` once per session and carry `member_id` forward so the hot path never touches Clerk or `clerk_id` again.

## 1. Current state — re-verified

### 1.1 `/api/sage` — the hot path (confirmed, worse than documented)

`app/api/sage/route.ts:8-32` `resolveMemberId` runs on **every turn**, for every caller, before `streamChat` starts. For a signed-in member it costs three sequential round trips, not the one `Identity System.md` §4 lists:

| # | Call | What it is | Cost |
|---|---|---|---|
| 1 | `getCurrentUser()` → `currentUser()` (`services/auth/providers/clerk/server.ts:67-75`) | Clerk **Backend API** network call (`GET /v1/users/{id}`), not a JWT check | External HTTP, subject to Clerk rate limits |
| 2 | `resolveIsPlatformAdminFromDb` (`server.ts:29-50`), called unconditionally inside `getCurrentUser()` | `users` lookup on `clerk_id` | DB round trip, result unused by sage |
| 3 | `members` lookup `.eq('clerk_id', user.providerUserId)` (`route.ts:17-22`) | The violation §4 names | DB round trip |

Only the `providerUserId` is consumed. `getSession()` (`server.ts:57-61`, JWT-only, no network) already exists on the boundary and would supply the same value with zero calls. This is the single largest, lowest-risk win and is independent of the session-carrying mechanism decided below.

All three sit **before** the `Promise.all` at `services/chat/server/index.ts:181` — they are on the critical path to first token, not parallel with prompt assembly.

For an un-signed-in invite holder, `validateMemberToken` (`services/members/members.ts:170-187`) runs one `members.token` lookup per turn. That is not a Clerk violation but is the same "re-resolve per turn" shape and is covered by the same fix.

**Downstream consumers of `memberId`** (so a replacement must still supply it): `getMemberContext` (`member-context.ts:45-48`, fast path), `resolveMediaContext` (`index.ts:188`), `actor_type` on the media audit event (`index.ts:195`), and `handleSessionFinish` → `persistMemberName` / `recordConversionEvents` (`services/crm/session.ts:525,643,661`).

**Already-existing identity carrier on the chat path:** `chat_sessions.user_id` is written once at session creation (`app/api/sessions/route.ts:48-51` via `syncUser`). `getMemberContext`'s slow path (`member-context.ts:50-87`) already resolves session → `user_id` → `members.user_id` without touching `clerk_id`. So the chat session row is, today, a per-conversation "resolved once" identity record; `/api/sage` simply doesn't use it.

### 1.2 The five named call sites — re-verified individually

| # | Site (doc'd) | Current line | What it actually is | Frequency | Verdict |
|---|---|---|---|---|---|
| 1 | `app/api/sage/route.ts:8-32` | unchanged | `getCurrentUser()` + `members.clerk_id` per turn | **Every chat turn** | **Genuine hot-path violation — fix first** |
| 2 | `services/auth/sync-member.ts:96` | now `:110` (`members.upsert(onConflict:'clerk_id')`), plus `:72` (`users.upsert(onConflict:'clerk_id')`) | Upsert keyed on `clerk_id`. Callers: Clerk webhook (`user.created`), and `POST /api/members/sync` | Webhook: once per sign-up. `/api/members/sync`: **per mount** of `MagicLinkCard` (`:127-132`), `NameCompletionGate`, `SaveChatCTA`'s `claimAllSessions` — the "fires once post-auth" doc comment is not true in practice | **Structural, not hot-path.** `clerk_id` as the upsert conflict key at the *linking* moment is legitimate: it is the one place the Clerk subject must become a `members` row. The real problem is the *call frequency* from the client, not the key. Fix: reduce callers (Phase 6e), keep the key. |
| 3 | `services/crm/story-invites.ts:551-556` | unchanged (`:551-556`, plus `:594-598` race re-fetch) | `members.clerk_id` lookup inside `acceptStoryInvite` | Once per invite acceptance (client `chatStore.tsx:629`, and webhook `route.ts:192`) | **Legitimate one-time linking.** The caller already holds `supabaseUserId` (`accept/route.ts:45`, `webhook:190`), so the lookup could key on `user_id` instead — a cosmetic consistency change, not a violation. Low priority. |
| 4 | `services/auth/claim-membership.ts:32-35` | unchanged | `members.clerk_id` existence check | Once per signed-out→signed-in transition (`GateView.tsx:35`), D6 says 1 row ever created | **Near-dead path (D6). Not a hot-path violation.** Leave alone; retire with D6. |
| 5 | `app/api/webhooks/clerk/route.ts:246` | now `:258` (`members.update({status:'deleted'}).eq('clerk_id', …)`) | Soft-delete selector on `user.deleted` | Once per account deletion | **Legitimate.** A webhook *about* a Clerk user is inherently keyed by `clerk_id`. `findUserByClerkId` at `:250` already yields `user.id`, so `.eq('user_id', user.id)` is a one-line consistency tidy — optional. |

Net: of the five, **one** is the hot-path problem (#1). #2 is a frequency problem disguised as a key problem. #3 and #5 are legitimate one-time uses. #4 is dead.

### 1.3 Sites the doc does not list — found in this pass

The `getCurrentUser()` + `.eq('clerk_id', user.providerUserId)` pattern is copy-pasted well beyond `/api/sage`. Full inventory (code only, `Design Handovers/**` scaffolds excluded):

**Hot path (A)** — same shape as sage, same fix applies:

| Route | Trigger frequency |
|---|---|
| `app/api/media/route.ts:34,60-65` | **Polled every 3 s** while any upload is pending (`chatStore.tsx:1409-1430`), plus catch-up fetch at `:1345` |
| `app/api/media/[id]/url/route.ts:15,33-38` | **Per displayed image** (`useFreshImageUrl.ts:35`, `MediaCard.tsx:161`) |
| `app/api/media/upload-url/route.ts:111,227-232` | Per attachment |
| `app/api/media/[id]/start-processing/route.ts:51,68-73` | Per upload completion |
| `app/api/media/[id]/retry/route.ts:44,81-86` | Per retry |
| `app/api/events/media/route.ts:35` | Per upload lifecycle event |
| `app/api/sessions/route.ts:47` | `syncUser()` → `currentUser()` + `users` upsert on **every new session** |
| `app/api/sessions/[id]/feedback`, `.../memories`, `.../memories/[memoryId]`, `app/api/stories/**` | `getCurrentUserId()` (JWT + `users.clerk_id`) per action; `app/api/stories/route.ts:16,77` does it **twice** in one request |

**Per page load / per mount (B):**

| Site | Notes |
|---|---|
| `app/heirloom/page.tsx:16,53-59` | `getSession()` (good) then `members.clerk_id` lookup — every Heirloom page load (`force-dynamic`) |
| `app/api/members/me/route.ts:23,31-36` | `getCurrentUser()` + `members.clerk_id`, every `NameCompletionGate` mount |
| `app/api/members/sync/route.ts:20,46` | See #2 above |
| `app/api/heirloom/invites/route.ts`, `story-invites/route.ts` (POST/GET/DELETE), `story-invites/collaborators/route.ts` | Each does the **triple**: `getCurrentUser()` + `members.clerk_id` + `getCurrentUserId()` — three identity resolutions per request |
| `app/admin/layout.tsx`, `app/(platform)/layout.tsx:24,42` | The admin layout resolves `getAuthContext()` once per render since #498. Before that, `getTenantName`/`getTenantType` each re-ran the auth chain, so it ran three times. `(platform)/layout.tsx` still has the triple-resolution bug; it was flagged and not fixed. Admin-only, out of scope for this pass but the same mechanism applies later |

A single Heirloom page load for a signed-in member therefore costs **three** independent Clerk-id→member resolutions before the first chat turn (`page.tsx`, `/api/members/me`, `/api/members/sync`).

**Setup-time (C) — legitimate, unchanged:** webhook (`findUserByClerkId` ×3, `users` upsert on `clerk_id`), `linkInvitedMember`, `acceptInvite`, `acceptStoryInvite`, `claimMembership`, `syncUser`, `ensureClerkUser`, `signUp.update({ unsafeMetadata })` invite-token carrier. These are the front door. They are supposed to touch `clerk_id`.

**Admin (D):** ~45 `getAuthContext()` call sites under `app/api/admin/**`, 14 `getCurrentUser()` under `app/api/platform/**` (9 with their own `clerk_id` lookup). Out of scope here; noted so the mechanism chosen below doesn't close the door on them.

### 1.4 Facts that constrain the design

- **`getSession()` is already the cheap primitive** (`server.ts:57-61`): JWT verified by `clerkMiddleware` at the edge, no network. `getCurrentUser()` is the expensive one and additionally does an unconditional `users.role` query. Most hot-path callers use the expensive one and discard everything but `providerUserId`.
- **`members.clerk_id` is UNIQUE globally, not per tenant** (`Database Schema.md` `members` row; reconciliation design §0). So `clerk_id → members.id` is a function, not a relation: one Clerk user resolves to at most one `members` row today. That makes "one `member_id` per session" well-defined. (If multi-tenant membership per Clerk user is ever wanted, the carried value must become per-tenant — the token carries `t` for exactly this reason, see §6.)
- **`chat_sessions.user_id`** is written once per conversation and is already what `getMemberContext`'s slow path and `GET /api/sessions` key on.
- **`sessionClaims`, `getToken`, `privateMetadata`: zero usages** in the codebase. `publicMetadata` is used only for `role === 'platform_admin'` (`map.ts:33-35`), read client-side and as the loud server fallback. `unsafeMetadata` carries the invite tokens at sign-up.
- **No route accepts a Clerk id from the request body.** Every `clerkUserId` in `app/api/**` comes from the verified session. Good.
- **`/api/sessions/[id]` (GET/PATCH) performs no auth or ownership check at all** — the session UUID is the only credential. `/api/sage` likewise never verifies the caller owns `session_id`. This is pre-existing and not created by this work, but it matters for one rejected mechanism (see §2.6, option C).
- **`services/crm/feedback.ts:49-83` `resolveMemberId` falls back to a client-supplied `member_id`** when there is no signed-in user (callers: `/api/sessions/[id]/feedback:78`, `/api/sessions/[id]/memories:117`). An anonymous caller can attribute feedback or a memory to any `members.id` it knows. Pre-existing; flagged, not in scope.
- **Golden Rule holds:** exactly 5 files import `@clerk/*`, all under `services/auth/providers/clerk/`. Any new provider read (the provider session id this design needs) must live there too.
- **A second, different `resolveMemberId` already exists:** `services/crm/feedback.ts:49-83`, used by `/api/sessions/[id]/feedback`, `/api/sessions/[id]/memories`, `/api/sessions` POST and `/api/stories`. It resolves via `getCurrentUserId()` (JWT + `users.clerk_id`) then `members.user_id` — still a per-request `clerk_id` lookup, on `users`, no Clerk network call. Two helpers with the same name and different semantics is itself a finding; the design below replaces both with one.
- **A client→server `member_id` wire is documented but not connected.** `chatStore.tsx:773-775`, `useChatSession.ts:62-67` and `types.ts:259` describe threading `getMemberId()` into every `/api/sage` body; `useChatTurn.ts:85-97` never reads it and the route never declares it. Good — the server must not trust a client-supplied member id — but the comments are misleading and should be corrected in the docs phase.
- **The only app-set cookie is `hl-preview`** (`middleware.ts:104-185`, 1 h, non-production). Its cookie→`x-preview-tenant` header pattern is the in-repo precedent for "resolve once, carry forward as a header." There is no identity cookie, no `sessionStorage`, and chat transcripts live in IndexedDB (`persistence.ts`), not localStorage.
- **Edge middleware exposes only `protect()`** (`AuthMiddlewareAuth`, `providers/clerk/middleware.ts:18-20`). The design below does not need the edge; it reads the token in route handlers.
- **The client has one `/api/sage` call site** (`services/chat/ui/v1/useChatTurn.ts:85-97`) and the Heirloom page already passes server-resolved props into the chat shell (`app/heirloom/page.tsx:168-169` → `chatStore.tsx:343-353`). Both matter for where the token is attached and delivered.
- **No JWT library is installed** (`package.json`: no `jose`, no `jsonwebtoken`; `svix` verifies webhooks only). Signing our own token is either one small dependency or ~50 lines of Web Crypto HMAC.
- **Test coverage of the exact seam is thin.** `app/api/sage/route.ts` has **no test file**. `providers/clerk/server.test.ts` covers only `updateClerkUserFirstName`, with a signed-out `auth()` stub (`{ userId: null }`). `member-context.test.ts` covers both resolution paths. The `/api/sage` request body is asserted by `chatStore.mediaItemsRace.test.tsx:71` and five siblings (body only — a new header does not break them).

---

## 2. The mechanism — an app-issued bearer identity token

### 2.1 What "resolve once per session" has to mean here

The app's *authentication* session is Clerk's: one `__session` cookie (or, cross-origin, Clerk's own bearer header), set and refreshed by the Clerk frontend SDK, verified as a JWT on every request by `clerkMiddleware` with no network call. That stays exactly as it is — it is the door check, and it is free.

What is added is an **app-owned identity token**: minted once per Clerk session by our server after the one legitimate `clerk_id → members` resolution, carried by the client, presented on every subsequent request as a header, and verified by our server with a local signature check plus one comparison against Clerk's session id. Clerk's involvement after the mint is confined to "is the Clerk session this token was minted for still the live one" — answered from Clerk's own JWT, locally.

Two rules hold regardless of carrier:

1. **The carried value is a pointer, not authority.** It replaces the *join* (`clerk_id → members.id`), never an authorization decision. Status, role and tenant membership keep coming from the DB wherever they are checked today (`app/heirloom/page.tsx:53-59` keeps its `status = 'active'` filter).
2. **Every reader has a fallback.** Missing, expired, mismatched or malformed token → today's lookup, audited. The Marker Fallback Principle applied to identity: the token is the fast path, not the only path. This is also what makes expiry and rotation non-events.

### 2.2 The token

**Format.** A compact signed JWT, HS256, signed with an app secret. Stateless — verification is a signature check plus claim checks, no DB, no Clerk API.

```
header  { alg: "HS256", typ: "JWT" }
payload {
  v:   1,                      // schema version — reject anything else
  m:   "<members.id>",         // the identity pointer
  u:   "<users.id>",           // for getCurrentUserId() callers (§8, decision 5)
  t:   "<tenant_id>",          // resolver rejects on host-tenant mismatch
  sid: "<Clerk session id>",   // binding to the auth session — see 2.3
  iat, exp                     // exp = min(24 h, remaining Clerk session)
}
```
≈ 250–300 bytes encoded. No PII (ids only), so it may appear in audit metadata by hash, never raw.

**Secret.** `IDENTITY_TOKEN_SECRET` (≥ 32 random bytes, base64) per Vercel environment. Preview and production secrets differ, so a preview token is inert on production and vice versa. **Rotation** is "change the env var": every outstanding token fails verification, every reader falls back to the lookup, every client re-mints on the next refresh signal (§2.5). No previous-secret window is needed because the fallback makes an invalid token cost one lookup, not a failure. The cron route already uses the same env-secret pattern (`app/api/cron/media-sweep/route.ts:45`, `CRON_SECRET`).

**Library.** `jose` (HS256 `SignJWT` / `jwtVerify`, Web Crypto, works in Node and edge runtimes, no native deps) — one new dependency, per "API before build." Alternative is ~50 lines of hand-rolled HMAC over base64url JSON; not recommended (§8, decision 3). All sign/verify code lives in **`services/auth/identity-token.ts`** — provider-agnostic, *not* under `providers/clerk/`, because nothing in it is Clerk-specific. The Golden Rule is untouched: the only provider read this design adds is the session id, inside `providers/clerk/server.ts`.

### 2.3 Verification — the one narrow Clerk seam

Per request, in the route handler (never at the edge):

```
1. session = getSession()                       — Clerk JWT, local, already happens today
   → { providerUserId, providerSessionId }       (providerSessionId is the one boundary addition)
2. raw = req.headers.get('X-Identity-Token')     — absent → step 5
3. claims = verifyIdentityToken(raw)             — HS256 signature, exp, v === 1; any failure → step 5 (audited)
4. claims.sid === session.providerSessionId
   AND claims.t === tenantId                     — both hold → identity = claims (source 'token'); done, zero DB
5. fallback: members lookup by clerk_id          — today's path; audited as identity.token_miss with a reason code
```

**Why `sid` binding removes the need for a revocation list.** Clerk's session JWT is short-lived (60 s by default) and is only re-issued while the Clerk session is active. Sign-out, remote revocation, ban or deletion stop re-issuance, and the frontend SDK clears the cookie on sign-out. So within ≤ 60 s of any of those, step 1 yields no session (or a different `sid` after a fresh sign-in) and the identity token is ignored — without our server keeping any state. This is exactly the semantics of Option B, carried in a header instead of a cookie.

**What "checked against Clerk's live session state" means precisely, so it isn't over-claimed:** it is Clerk's *locally verified* session JWT, which lags true server-side revocation by at most one token lifetime (60 s). A truly live per-request check (`clerkClient().sessions.getSession(sid)`) is a network call per turn — the thing this design removes. If sub-60-second remote revocation is ever a product requirement, that is a separate decision (§8, decision 7); nothing here precludes it.

**Why not `Authorization: Bearer` for our token.** Clerk's own cross-origin convention is `Authorization: Bearer <clerk session JWT>`, consumed by `clerkMiddleware` (`.agents/skills/clerk-nextjs-patterns/SKILL.md:236-238`). If our token occupied that header, Clerk's middleware would attempt to verify it as a Clerk token on every request; whether it then falls back to the cookie or reports signed-out is undocumented in the vendored skills. A dedicated header — **`X-Identity-Token`** — sidesteps the question entirely, keeps `Authorization` free for Clerk's token in a future embedded/cross-origin deployment, and makes the two tokens' roles legible in any request log. Still a bearer token in every sense that matters: no cookie semantics, no same-site rules, attached explicitly by the client.

### 2.4 Issuance — where the front door actually is

A bearer token, unlike Clerk metadata, has to be **delivered to the client**. The webhook cannot do that. So issuance moves to the two moments the client is present with a live Clerk session:

**(a) Page load — the primary front door, zero extra round trips.** `app/heirloom/page.tsx` already does the resolution once per load (`:16,53-59`, `getSession()` then `members` lookup). It gains one line: mint the token server-side from that result and pass it as a prop (`identityToken`) into the chat shell alongside the existing `inviteToken`/`memberId` props (`:168-169`). The resolution that already happens is now *the* resolution; everything after it carries the token. This also means **existing members need no backfill and no migration step**: their next page load mints their token.

**(b) Mid-session sign-in / refresh — `GET /api/auth/identity`.** A new route: requires a Clerk session (401 otherwise), resolves the member by `clerk_id` (the legitimate one-time lookup), mints, returns `{ token, exp }`. Called by the client on the signed-out→signed-in transition (`chatStore.tsx:1055-1080` already detects exactly this transition for `claimSessionsOnly`) and whenever a refresh signal arrives (§2.5). Cost: one Clerk-JWT check + one DB lookup per Clerk session, which is the target state.

**Self-heal** is inherent: a lookup-fallback on the server (§2.3 step 5) adds `X-Identity-Refresh: 1` to its response; the client re-mints on seeing it. No compare-and-write logic anywhere, no metadata drift to reconcile.

**The webhook is no longer an issuance point** — it has no client to hand a token to. It keeps doing what it does today (create/link rows), untouched by this design.

**Invite holders without a Clerk session** cannot be issued a token bound to a Clerk `sid`. They keep the one `validateMemberToken` lookup per turn (§3). Binding a token to an invite token instead of a `sid` is possible but is a second trust model for a small, pre-sign-up population — not worth it now; noted as a possible later extension.

### 2.5 Client transport and storage — worked through, not hand-waved

This is the part a cookie handled for free (auto-attach, auto-clear, survives reload). Each of those needs an explicit answer.

**Where it lives.** A small in-memory identity store in `services/auth/client.ts` (the existing `'use client'` boundary module): `{ token, exp, sid } | null`, plus `getIdentityToken()`, `setIdentityToken()`, `clearIdentityToken()`, `refreshIdentityToken()`. Seeded from the `identityToken` prop at mount (§2.4a). **Never `localStorage` or `sessionStorage`.**

Why in-memory and what it does and does not buy:
- `localStorage`/`sessionStorage` persist a bearer credential where *any* script on the origin can read it at any later time, including after the session that created it has ended, and `localStorage` is shared across tabs. That is the classic XSS-exposed token pattern and is what the review asked to avoid. In-memory state is still readable by script running *on the page during the session* — no client-side storage defeats a live XSS — but it is not persisted, not shared across tabs, and gone on unload. This matches the posture Clerk's own frontend SDK takes with its session JWT (held in memory, re-fetched as needed).
- **The `sid` binding is what makes exfiltration low-value.** A token stolen off the page and replayed from elsewhere is rejected at §2.3 step 1/4 unless the attacker can also present the live Clerk session for the same `sid` — which they cannot obtain from JS if Clerk's session cookie is `HttpOnly`. Whether Clerk's `__session` cookie is `HttpOnly` in this deployment is a fact to confirm in Phase 0 (the vendored skills do not state it). If it is not, the identity token adds no *new* exposure beyond what the Clerk cookie already has.
- Not persisting means **a reload re-mints** — which is free, because the page load is the front door (§2.4a). This is a feature: no stale token ever survives a navigation.

**How it attaches.** A single wrapper, `authedFetch(input, init)` in `services/auth/client.ts`, that adds `X-Identity-Token` when the store holds an unexpired token and forwards everything else unchanged. Phase 5 uses it at exactly one call site — `useChatTurn.ts:85` — so the `/api/sage` body stays byte-identical (the six body-asserting tests keep passing; a new test asserts the header). Phase 6 migrates the other client fetches (media polling, `/api/members/me`, etc.) to the same wrapper, one route per PR, as each server route gains the resolver. Browser navigations (page loads, `<a>` links) never carry custom headers — which is why server-rendered pages keep their own lookup and are the mint point, not a consumer.

**How it clears.**
- `isSignedIn` true→false (Clerk sign-out, observed through the existing `useAuthUser()` tri-state): `clearIdentityToken()`. Even if this is missed, the next request fails §2.3 step 1 and the token is inert.
- Clerk `session.id` changes (sign-out then sign-in as someone else in the same tab): the store compares the Clerk session id it minted under to the current one from `useAuthUser()`/`useSession()` and discards on mismatch; the server's `sid` check is the backstop.
- `exp` reached: the store treats it as absent and re-mints lazily on the next attach.

**Refresh — the answer to "no browser auto-refresh."** The token needs no background refresh loop. Three signals cover it: (1) local `exp` check before attach; (2) `X-Identity-Refresh: 1` on any response (server fell back); (3) the sign-in transition. Each triggers one `GET /api/auth/identity`. Because the server always falls back, a stale or missing token costs one lookup on one request — never a failed turn, never a visible error. Token lifetime is therefore a tuning knob, not a correctness knob (§8, decision 4); 24 h is proposed, capped by the Clerk session's own expiry so the token never outlives what it is bound to.

**Cross-origin / embedded (future, not built now).** Custom headers trigger CORS preflight; the API would need `Access-Control-Allow-Headers: X-Identity-Token` and Clerk's own cross-origin setup (its bearer header + satellite/allowed-origins config). Today every host (`heirloom.2bl.ai`, `jefflougheed.ca`, `legacy.2bl.ai`, `2bl.ai`) is served by this same Next app and calls `/api/*` same-origin (`middleware.ts` domain routing), so no CORS change is needed for any current deployment. The point of choosing a header now is that nothing in this design has to change when an embedded or native client arrives — only CORS config does.

### 2.6 Alternatives considered (rejected — recorded so they are not re-proposed)

**A — Clerk custom session claim backed by `publicMetadata`** (rev 1's recommendation). Least code, zero DB; rejected on review because it makes Clerk the carrier of our identity pointer via a Clerk-proprietary feature (dashboard session-token template + metadata writes + replace-not-merge semantics around `role`). New coupling, and every mechanic — issuance, refresh, staleness — would have been Clerk's, not ours.

**B — App-owned signed cookie.** Right ownership model, wrong carrier for an embedded widget and a possible native client (rev 2 decision record above). Also carried an unresolved question about `cookies().set()` on a streamed `Response` from `/api/sage`; the header design has no equivalent problem — the route only *reads* a header.

**C — Use `chat_sessions.user_id` as the carrier.** Still two DB hops per turn, no help for routes without a session id, and would make the un-authorized client-supplied `session_id` (§1.4) the sole basis for attribution. Rejected.

**D — Server-side cache keyed by Clerk `sid`.** Per-lambda memory is unreliable on Vercel; KV is new infra; doesn't "carry it forward." Rejected.

### 2.7 The prior objection to "pin identity to the session" — and why this design passes it

`Design Handovers/member_context_system_audit_2026-08-15.md` §4.3 rejected carrying member identity on `chat_session_context`, and set two questions any future proposal must answer: *what happens when member identity changes mid-conversation* (visitor signs up via `[ACCOUNT_CREATE:]` → `MagicLinkCard` mid-session), and *what happens when a session needs both a story and a member*.

This design keys identity to the **Clerk session**, not the chat session. A mid-conversation sign-up creates a Clerk session; the client's existing transition detector mints a token for it (§2.4b); the next turn carries it. Until then the fallback resolves by lookup — today's behaviour. Story context stays in `chat_session_context`; member identity rides the request header. The two never share a row. The audit's objection was to pinning a mutable fact at chat-session creation time; the token is minted per Clerk session, bound to it, and discarded with it.

The audit also warns against inverting `getSession()`'s "cheap JWT presence" tiering. It stays cheap: the one field added (`providerSessionId`) comes from the JWT Clerk already verified.

### 2.8 Uncertain — verify before Phase 2

Rev 1's list was mostly about Clerk's session-claim feature; all of that is now irrelevant and dropped. What remains, with the Clerk docs site blocked from this sandbox and `node_modules` absent:

| Claim | Confidence | How to verify |
|---|---|---|
| `await auth()` in `@clerk/nextjs` v7 returns `sessionId` alongside `userId` | High — present since Core 2, listed in the skills' destructuring examples as unchanged | 30 s: read the type in `node_modules/@clerk/backend/dist/tokens/authObjects.d.ts` after `pnpm install`, or the v7 `auth()` reference |
| Clerk's session JWT lifetime is 60 s with background refresh by the frontend SDK (bounds revocation lag in §2.3) | High | Clerk docs → Sessions → Session tokens; or observe `exp - iat` on a token in the browser |
| Clerk's `__session` cookie is `HttpOnly` in this deployment (strengthens, does not gate, the XSS argument in §2.5) | Medium — Clerk's production cookie is set server-side via the handshake and is `HttpOnly`; development-instance behaviour differs | Inspect the cookie in DevTools on `heirloom.2bl.ai` |
| `jose` HS256 works in the Next 15 Node route runtime with no config | High | `pnpm add jose`, run its unit tests in Phase 2 |

Nothing in this table is a dashboard setting; none of it requires Jeff to change Clerk configuration.

---

## 3. Scoped plan for `/api/sage` first

What it takes to make the route stop resolving identity per turn, concretely:

**Route change (`app/api/sage/route.ts`, ~30 lines net).** Delete the local `resolveMemberId` (`:8-32`). Replace `:78` with:

```ts
const identity = await resolveRequestIdentity(req, tenantId, { inviteToken })
const memberId = identity?.memberId ?? null
```

(`req` is passed so the resolver can read the header; today's route already has it.) Nothing else in the route or in `streamChat` changes; `memberId` keeps flowing to `getMemberContext`, `resolveMediaContext`, the audit `actor_type`, and `handleSessionFinish` exactly as today. The wire format — the request **body** — stays frozen; one request header is added by the client.

**Server-side pieces.**

| File | Change |
|---|---|
| `services/auth/types.ts` | `AppSession.providerSessionId: string` (additive); new `RequestIdentity { memberId, userId, tenantId, source }` |
| `services/auth/providers/clerk/server.ts` | `getSession()` also returns `sessionId` as `providerSessionId` — the only provider change |
| `services/auth/identity-token.ts` (new) | `mintIdentityToken(claims)`, `verifyIdentityToken(raw)`; `jose` HS256; secret from env |
| `services/auth/resolve-request-identity.ts` (new) | The resolver in §2.3; audits misses with a reason code; sets the refresh-signal header via a returned flag the route applies |
| `app/api/auth/identity/route.ts` (new) | Issuance endpoint (§2.4b) |
| `services/auth/index.ts` | export the above |
| `services/audit/types.ts` | `IDENTITY_RESOLVED` (Phase 0), `IDENTITY_TOKEN_MISS` (reason: `absent \| expired \| bad_signature \| sid_mismatch \| tenant_mismatch \| bad_version`), `IDENTITY_TOKEN_SHADOW_MISMATCH`, `IDENTITY_TOKEN_ISSUED` |

**Client-side pieces.**

| File | Change |
|---|---|
| `services/auth/client.ts` | In-memory identity store + `authedFetch` (§2.5) |
| `app/heirloom/page.tsx` | Mint from the lookup it already does; pass `identityToken` prop |
| `components/shells/membership/chatStore.tsx` | Accept the prop, seed the store; mint on the existing sign-in transition; clear on sign-out; honour `X-Identity-Refresh` |
| `services/chat/ui/v1/useChatTurn.ts:85` | `fetch` → `authedFetch` |

**Per-turn cost after cutover, signed-in member:** zero identity round trips (one Clerk JWT check that already happens, one HMAC verify in-process). Today: one Clerk backend call + two DB queries, all before prompt assembly starts.

**What does not change for `/api/sage`:**
- Pre-auth invite holders keep one `validateMemberToken` query per turn (§2.4).
- `/api/sage` does not check `members.status` today and the token path won't either (parity). Whether it *should* is a product question (§8, decision 6).
- `/api/sage` does not verify that the caller owns `session_id`. Unchanged; pre-existing gap (§1.4).

---

## 4. The other four sites — verdicts

Detailed in §1.2. Summary:

| Site | Needs fixing? | What, if anything |
|---|---|---|
| `sync-member.ts` `onConflict: 'clerk_id'` | **Not the key — the callers.** | Keep `clerk_id` as the upsert key at the linking moment (that *is* the front door). Reduce `/api/members/sync`'s per-mount callers in Phase 6e; with the token present, `NameCompletionGate` can key on `members.id`. |
| `story-invites.ts:551-556` | **No.** | One-time linking, keyed by the event subject. Optional: key on the `supabaseUserId` the caller already has. Cosmetic. |
| `claim-membership.ts:32-35` | **No.** | Dead path (D6). Retire with D6, not here. |
| `webhooks/clerk/route.ts:258` | **No.** | A webhook about a Clerk user is inherently keyed by `clerk_id`. Optional one-liner: `.eq('user_id', user.id)` since `user` is already resolved at `:250`. |

The sites that **do** need the sage treatment and weren't on the list: the six `/api/media/**` routes (one polled every 3 s), `/api/members/me`, and every `getCurrentUserId()` caller. They are Phase 6. `app/heirloom/page.tsx` is different under this design: it keeps its one lookup per load because it *is* the mint point (§2.4a).

---

## 5. Migration — phased, no big-bang

Follows the reconciliation design's discipline (`identity_reconciliation_design_2026-08-16.md` §5): build it unused → prove it read-only against live traffic → flip one path per PR in ascending blast radius → delete the old path last. Each phase is one PR, independently revertable, with the old function still present to revert to until Phase 7. The Gate 3 rule also applies: capture is structural, attribution is best-effort with a safe default — here, the fallback lookup *is* the safe default.

The carrier swap changes Phases 0, 2 and 3 materially; 1, 4, 5, 7 keep their mechanics; 6 changes one item.

| Phase | What ships | Blast radius | Gate to next |
|---|---|---|---|
| **0 — Verify & instrument** | Verify §2.8 (≈15 min, no dashboard changes). Add `IDENTITY_TOKEN_SECRET` to Vercel envs (Jeff — env config is CC's per rule 5, but the secret value should be generated and pasted by Jeff). CC adds `AuditAction.IDENTITY_RESOLVED` to `/api/sage`: `{ path: 'clerk_lookup' \| 'invite_token' \| 'anonymous', durationMs }` — no PII. Precedent: `CHAT_MEDIA_CONTEXT_RESOLVED` already logs per turn (`index.ts:192`). | None (a log line + an unused env var) | 48 h of numbers: a real baseline for how much of TTFT this is. There is **no** existing baseline (`prompt_marker_review_status July 2026.md:57` still says TODO). |
| **1 — Quick win, mechanism-independent** | `/api/sage`: `getCurrentUser()` → `getSession()`. Removes the Clerk backend call and the `users.role` query; keeps the one `members` lookup. First-ever `app/api/sage/route.test.ts`. | `/api/sage` only; one-line revert | Preview verified; `IDENTITY_RESOLVED.durationMs` drops as expected in the audit log. |
| **2 — Build it, unused** | `jose` dependency; `identity-token.ts`; `AppSession.providerSessionId`; `resolveRequestIdentity()`; audit actions; `GET /api/auth/identity` (reachable, but nothing consumes what it returns); client store + `authedFetch` (exported, un-called). **Zero product call sites read a token.** | None — a route that mints tokens nobody reads | Unit tests green: mint/verify matrix (valid / expired / bad signature / wrong `v` / `sid` mismatch / `t` mismatch / malformed header); resolver fallback ordering and reason codes; issuance route 401 without a Clerk session. |
| **3 — Deliver it to the client** | `page.tsx` mints and passes `identityToken`; `chatStore` seeds the store, mints on sign-in transition, clears on sign-out; `useChatTurn` uses `authedFetch`. **Server still ignores the header.** | Client only; the header is dead weight to the server | On preview: header present on `/api/sage` requests for a signed-in member (DevTools); absent when signed out; re-minted after a mid-session sign-in; `chatStore.mediaItemsRace.test.tsx` and siblings still green (body unchanged). |
| **4 — Prove it, read-only (shadow)** | `/api/sage` calls `resolveRequestIdentity()` in **shadow**: verifies the header, **still uses** the Phase-1 lookup, audits `IDENTITY_TOKEN_SHADOW_MISMATCH` on disagreement and hit/miss with reason on every turn; sends `X-Identity-Refresh` on miss so the client's refresh loop is exercised. | `/api/sage` behaviour unchanged; one HMAC verify per turn | ≥ 7 days or ≥ 500 signed-in turns, **zero** mismatches, token hit rate ≥ 95 % of signed-in turns, miss reasons all explained (`absent` on first turn after sign-in, `expired` at the TTL boundary). |
| **5 — Cutover `/api/sage`** | Resolver result is used; lookup only on miss. Rollback: env `IDENTITY_TOKEN_MODE=shadow` (no redeploy) or one-line revert — §8 decision 2. | The hot path | 7 days: `IDENTITY_TOKEN_MISS` rate flat and explained; no MEMBER CONTEXT regressions (name/primer still injected — `member-context.test.ts` + a preview conversation). |
| **6 — Generalize, ascending blast radius, one PR each** | (a) `/api/members/me` → resolver, client via `authedFetch`; (b) the six `/api/media/**` routes → `getSession()` + resolver, client polling via `authedFetch`; (c) `getCurrentUserId()` reads the token's `u` first (covers sessions/feedback/memories/stories) — client fetches for those routes moved to `authedFetch` first; (d) trim `/api/members/sync` per-mount callers. | Grows per step; (c) is widest | Each: preview verification + its existing route tests. (c) gated on (a)–(b) quiet for a week. |
| **7 — Delete and document** | Confirm `/api/sage`'s local resolver is gone; rename/merge `feedback.ts`'s `resolveMemberId`; fix the dead `getMemberId` comments; remove the mode flag if adopted. Docs (§9). | None | Docs merged. `Identity System.md` §4 rewritten from "target state" to "as-built, with the remaining legitimate `clerk_id` uses listed." |

**What the carrier swap removed from the plan:** the Clerk dashboard step, the webhook metadata write, the `/api/members/sync` compare-and-heal, and the backfill script and its "who runs it against production" question. Existing members are covered by their next page load.

**What it added:** a client-side phase (3) that can be verified in DevTools before the server reads anything, and a new env secret.

**Rollback posture.** Through Phase 4 rollback is "revert the PR." Phase 5 is the only phase where the old and new paths could disagree in production, and the fallback means "disagree" degrades to "today's behaviour," never to "no member context." Nothing here touches the schema — no Studio work, no migration.

---

## 6. Risks and how each is held

| Risk | Held by |
|---|---|
| Token stolen via XSS on the page | In-memory only (no persistence, no cross-tab); `sid` binding makes an off-page replay useless without the live Clerk session; TTL bounds the window. A live on-page XSS already has the Clerk session — this adds no new capability to it. §2.8 row 3 confirms the `HttpOnly` half of the argument |
| Remote revocation lag | ≤ 60 s, bounded by Clerk's own JWT lifetime; same-tab sign-out is immediate (cookie cleared + store cleared). Sub-60 s remote revocation is a product decision, §8 decision 7 |
| Token points at a member later soft-deleted/suspended | Parity with today for `/api/sage` (no status check either way). Every place that *authorizes* keeps its DB status check. Optional later: `/api/platform/members/status` can't revoke a bearer token statelessly — if this matters, shorten TTL or add a status check to the resolver (§8 decision 6) |
| Clerk user moves tenant (`syncMember` `onConflict` moves the row — reconciliation §0.1, latent) | Token carries `t`; mismatch → fallback → refresh → re-mint with the new tenant |
| Secret leaks | Forgeable tokens until rotation — but a forged token still needs a live Clerk session with a matching `sid`, so forgery requires *also* being that signed-in user. Rotate the env var; fallback + refresh make rotation invisible to users |
| Secret missing in an environment | `mintIdentityToken` throws → `page.tsx` catches, passes no token; resolver sees `absent` → fallback. Loud audit + console error; never a broken page |
| Clock skew between server instances | `exp` checked with 60 s leeway (`jose` `clockTolerance`); worst case is one early fallback |
| `X-Identity-Token` header stripped or reordered by Vercel's edge→function boundary | Custom request headers are forwarded (the app already relies on `x-correlation-id` set in middleware being readable in routes). Verified in Phase 3 on preview before the server depends on it |
| A client fetch that bypasses `authedFetch` | Falls back to lookup — correct, just slower; `IDENTITY_TOKEN_MISS` with reason `absent` on a signed-in turn is the signal to find it |
| Browser navigations carry no header | By design: server-rendered pages keep their lookup and are the mint point (§2.4a) |
| Future embedded/cross-origin client | CORS `Access-Control-Allow-Headers` + Clerk's cross-origin setup; no token or server change (§2.5) |
| Provider lock-in (Golden Rule) | Token code is provider-agnostic in `services/auth/`; the only provider addition is `providerSessionId` in `getSession()`. A provider swap must supply a stable session id — every mainstream provider does |
| No `/api/sage` test exists today | Phase 1 creates it before anything else changes |
| `jose` supply-chain / bundle | Single, widely-audited dependency; server-only import; pinned exact version per the dependency rule in `CLAUDE.md` |

---

## 7. Test plan (outline — full plan written per-phase, Format B spine + Format A sections per `Design Handovers/test-plans/`)

**Existing coverage that constrains this work:** `member-context.test.ts` (both resolution paths), `chatStore.mediaItemsRace.test.tsx:71` + five siblings (assert the `/api/sage` **body** — stays byte-identical; a header is additive), `server.test.ts` (Clerk mock shape `{ auth, currentUser, clerkClient }` — the `auth` stub must grow `sessionId`), `sync-member.test.ts` (14), `app/api/members/me|sync/route.test.ts`, `app/api/webhooks/clerk/route.test.ts`, `middleware.test.ts`, `chatStore.claimAllSessionsSyncToClerk.test.tsx` and `MessageList.authSyncToClerk.test.tsx` (the sign-in transition path the mint hooks into).

**Unit (vitest), by phase:**
- P1: `app/api/sage/route.test.ts` — signed-in → `members` lookup by `providerUserId`, no `currentUser` call; signed-out + token → `validateMemberToken`; neither → `memberId: null`; body handling unchanged.
- P2: `identity-token.test.ts` — round-trip; expired; tampered payload; wrong secret; `v: 2` rejected; missing claims rejected; `clockTolerance` boundary. `resolve-request-identity.test.ts` — token wins only when `sid` and `t` match; each miss reason audited once; invite-token path unchanged; anonymous → null. `app/api/auth/identity/route.test.ts` — 401 without session; mints with the resolved ids; `IDENTITY_TOKEN_ISSUED` audited (hash, not raw).
- P3: `services/auth/client.test.ts` — store seeds from prop; `authedFetch` adds the header only when unexpired; clears on sign-out; discards on Clerk session-id change; `X-Identity-Refresh` triggers exactly one re-mint. `chatStore.identityToken.test.tsx` — header present on `/api/sage` after sign-in transition, absent before.
- P4/5: resolver mode matrix (`shadow` uses lookup + audits; `on` uses token); MEMBER CONTEXT still resolves via the fast path with a token-supplied id.
- P6: each route's existing test file gains "no `currentUser` call" and "token path" cases.

**Not unit-testable:** Clerk's token lifetime and cookie flags; Vercel header forwarding; actual XSS posture. These are live checks in Phase 0/3.

**Live-data invariants (Supabase, before Phase 3 and after Phase 5):**
```sql
-- every active clerk-linked member has a users row (the token's `u`)
select count(*) from members m where m.status='active' and m.clerk_id is not null and m.user_id is null;   -- expect 0
-- one members row per clerk_id (the token is a function, not a relation)
select clerk_id, count(*) from members where clerk_id is not null group by 1 having count(*)>1;             -- expect 0 rows
```
**Live-data signals (audit_events):** `IDENTITY_RESOLVED` durations P0→P1; `IDENTITY_TOKEN_SHADOW_MISMATCH` = 0 through P4; `IDENTITY_TOKEN_MISS` reasons explained after P5; `IDENTITY_TOKEN_ISSUED` ≈ one per page load + one per sign-in transition, not per turn.

**Manual on preview (each phase from 3):** signed-in member sends a turn → header present, MEMBER CONTEXT present (name/primer); invite-holder turn → no header, primer present; anonymous turn → nothing; sign-up mid-conversation → header appears on the next turn, context follows; sign out → header gone, next turn anonymous; reload → fresh token, no visible change.

---

## 8. Decisions needed from Jeff before Phase 2

Re-answered for rev 2. Decided: the carrier (bearer token, header-carried). Dropped: the backfill runner question (no backfill exists in this design).

1. **Header name:** `X-Identity-Token` as proposed, keeping `Authorization` free for Clerk's own cross-origin bearer (§2.3)? Or `Authorization: Bearer` for ours and accept the need to verify Clerk's header-precedence behaviour first?
2. **Rollback style for Phase 5:** env `IDENTITY_TOKEN_MODE` (flip in Vercel without redeploy, removed in Phase 7) vs the repo's no-flag "one-line revert" precedent. I lean env flag for the hot path only.
3. **`jose` dependency** (recommended, pinned) vs hand-rolled Web Crypto HMAC (no dependency, ~50 lines, our own crypto to maintain).
4. **Token TTL:** 24 h capped by Clerk session expiry (proposed). Shorter (1 h) costs one extra mint per hour of active use and tightens the stolen-token window; longer buys nothing since reloads re-mint anyway.
5. **Carry `users.id` (`u`)** so `getCurrentUserId()` callers benefit in Phase 6c, or keep the token to `members.id` only?
6. **Status check on `/api/sage`:** keep parity (no `members.status` check, as today) or stop injecting MEMBER CONTEXT for suspended/deleted members? Behaviour change — its own PR if wanted. Note a bearer token cannot be revoked statelessly on a status change; this decision also sets how much the TTL matters.
7. **Revocation lag:** is ≤ 60 s (Clerk's own JWT lifetime) acceptable for remote sign-out/ban? If sub-60 s is required, that is one Clerk network call per request and should be scoped separately.
8. **Phase 6 order:** media routes (3 s poll) could take the Phase-1 `getSession()` one-liner immediately as Phase 1b, ahead of the token work. Include?

---

## 9. Documentation to update when this ships (per phase, not at the end)

- `System Docs/Identity System.md` §4 — rewrite from "target state / current violations" to as-built; list the remaining legitimate `clerk_id` uses (webhook, linking, page-load mint) so nobody re-flags them; add the audit actions to §1.4; change log entry.
- `System Docs/Utilities/Auth.md` — `AppSession.providerSessionId`, `identity-token.ts`, `resolveRequestIdentity`, `GET /api/auth/identity`, the client store and `authedFetch`; an explicit "prefer `getSession()`; `getCurrentUser()` only when profile fields are needed" rule (absent today); the header name and refresh signal as a contract.
- `System Docs/Utilities/Chat Server.md` — MEMBER CONTEXT section's description of how `memberId` reaches `streamChat`.
- `System Docs/Utilities/Chat UI.md` — `authedFetch` on the `/api/sage` call; the request header as part of the (otherwise frozen) wire contract.
- `System Docs/API Routes.md` — `/api/auth/identity` (new), `/api/sage`, `/api/members/me` identity resolution notes.
- `System Docs/App Structure and Routing.md` — note that custom request headers, not cookies, carry app identity, and why (embedded-widget rationale from the decision record).
- `System Docs/Known Gaps.md` — record the two pre-existing gaps found here (no session-ownership check on `/api/sessions/[id]` and `/api/sage`; `feedback.ts` client-supplied `member_id` fallback), and close the "TTFT baseline" TODO once Phase 0 numbers exist.
- `services/chat/ui/v1/core/useChatSession.ts:62-67`, `chatStore.tsx:773-775`, `types.ts:259` — correct the comments describing a `member_id` wire that is not connected.
- `CLAUDE.md` — Stack → Auth bullet: one sentence that `services/auth` issues a header-carried identity token bound to the provider session and product code must not re-resolve from `providerUserId`; and the new env var in whatever env inventory exists.
- This document → `Design Handovers/clerk_front_door_design_2026-09-04.md`, with the rev 2 decision record kept at the top and a status header updated per phase, matching `identity_reconciliation_design_2026-08-16.md`'s convention.
