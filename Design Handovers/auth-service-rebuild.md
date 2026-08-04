# Auth Service Rebuild

**2BL.AI Platform — Project Summary**
June 4, 2026 · Second Brain Labs

> Converted to markdown from `authservicerebuild_3.pdf` for in-repo reference.

---

## The Golden Rule

**No product code may import an auth provider directly.
All authentication access must flow through `services/auth`.**

This rule is non-negotiable. It applies to every product, every route, every
component, every future build. If a file outside `services/auth/` contains an
import from an auth provider, it is a violation.

---

## 1. Overall Goal

Build a clean, provider-agnostic authentication service at the 2bl.ai platform
level serving all products — Heirloom, Sage, jefflougheed.ca, and any future
product. One login, one identity, per-product authorization. Auth is a platform
service, not a product feature.

## 2. Problems We Are Trying to Solve

- **Auth doesn't work.** Sign-up on Heirloom has never successfully created a
  Supabase record end to end.
- **Clerk is woven into the product layer.** Components, layouts, API routes,
  and the store all import Clerk directly.
- **No visibility.** When auth fails, there is no log showing where or why.
- **Dual column complexity.** The `clerk_id_dev` workaround added an OR query
  to every auth lookup.
- **Schema drift.** `users` and `members` have no FK between them. RLS policies
  are missing.

## 3. How Did This Happen

- **Built auth wrong from the start.** Clerk leaked into components instead of
  staying behind a service boundary.
- **Built custom flows without reading the docs.** `useAuthFlow.ts` — 330
  lines — was built from assumptions, not documented examples.
- **Added features on top of a broken foundation.** Save CTA, invites, stream
  fixes all built before auth was verified.
- **Patched instead of fixed.** `clerk_id_dev` was a band-aid.
- **No logging from day one.** Every failure required guessing.

## 4. Options Considered — Why Auth0

- **Option A — Fix Clerk custom flow.** Ruled out. Same architectural problem
  persists.
- **Option B — Clerk prebuilt `<SignIn />`.** Ruled out. Clerk stays in
  product layer.
- **Option C — Supabase Auth.** Ruled out. Less mature OAuth, less flexible
  for multi-product.
- **Option D — Auth0 (chosen).** Mature, full OAuth, SMS support, excellent
  logs. Forces correct service boundary.

### Provider Comparison

| Capability | Clerk | Auth0 | Supabase Auth | Firebase Auth | Winner |
|---|---|---|---|---|---|
| Multi-product support | Limited | Strong | Moderate | Moderate | Auth0 |
| OAuth providers | Google, Apple, FB | 50+ providers | Google, Apple, FB | Google, Apple, FB | Auth0 |
| SMS OTP | Yes (complex) | Yes (native)\* | Limited | Yes | Auth0 |
| Native logging | Minimal | Full stream | Basic | Basic | Auth0 |
| Cost | Free to $25/mo+ | Free to $23/mo+ | Included | Free tier large | Tie |
| Migration complexity | Already here | Moderate | Low | Moderate | Supabase |

\* Headless SMS OTP must be verified in Phase 1 before any code is written.

### Supported Sign-In Paths

- **Email:** Name + Email + Password. Standard.
- **Phone:** Name + Phone → SMS OTP. Stays in session, reliable.
- **Social:** Google, Facebook via OAuth.

Note: Email OTP and magic links are not used. Email OTP is friction-heavy;
magic links break session continuity on mobile.

## 5. How We Re-Wire Existing Capabilities

- **`services/auth/` becomes the boundary.** Clean interface: `getSession()`,
  `getCurrentUser()`, `signUp()`, `signIn()`, `verifyOtp()`, `signOut()`,
  `useAuthUser()`.
- **`users.clerk_id` becomes `users.auth0_id`.** One column, no dual-column
  workaround.
- **ClerkProvider replaced with Auth0 provider** in root layout.
- **`useAuthFlow.ts` deleted** after full behavior inventory confirmed
  (Section 15).
- **Admin routes read `users.role` from Supabase,** not Clerk publicMetadata.

## 6. How We Ensure It's Working

Auth logging scoped to lifecycle events: signUp, signIn, signOut, role change,
account deletion. Auth0 native log stream handles routine session checks.

End-to-end checklist — nothing merges to main until all pass:

- [ ] New user signs up on preview → Auth0 identity created
- [ ] `users` row created in Supabase
- [ ] `members` row created with correct `tenant_id`
- [ ] Chat session claimed to new user
- [ ] Existing admin can access 2bl.ai admin
- [ ] jefflougheed.ca unaffected
- [ ] Sign out and sign back in works
- [ ] Session persists on page refresh
- [ ] Hard refresh with active session — user remains signed in
      (`useAuthUser()` hydration must be verified with Auth0 token refresh)

Preview only until all checks pass. Nothing merges to main until the checklist
is complete.

## 7. Migration Plan

### Studio (before any code ships)

- Add `users.role`: text NOT NULL default `'member'`
- Backfill admin: `UPDATE users SET role = 'platform_admin' WHERE clerk_id =
  '[admin_clerk_id]'`
- Add `users.auth0_id` column
- Backfill `auth0_id` by email match from Auth0
- **Run orphaned data migration script first — hard prerequisite.** Match
  `clerk_id` rows to `auth0_id` by email, update all FKs, flag/purge unmatched.
- **Only then** add FK: `members.user_id` → `users.id`. Database rejects this
  if any `members` rows have null `user_id`.
- Remove `clerk_id_dev` column
- Add RLS policies to all tables

### Environment and Deployment

- Add Auth0 domain, client ID, client secret for dev and prod
- Keep Clerk env vars until migration verified, then remove
- Preview deploy → full checklist → merge to main
- Monitor auth_logs 24 hours post-deploy

## 8. Side Effects

- **Existing Clerk users.** Handled by orphaned data migration script. Low
  risk given invite-only access.
- **Admin access.** Role moves from Clerk publicMetadata to `users.role`.
  Studio backfill before code deploys.
- **`useUser()` in components.** All components reading
  `publicMetadata.role` or `isSignedIn` break when Clerk is removed.
- **Session recovery.** `isSignedIn` effect in chatStore must be tested with
  Auth0. Token refresh mechanics differ — `useAuthUser()` must hydrate
  correctly on hard refresh.

## 9. If Something Breaks

- **Admin locked out.** Cause: `users.role` backfill not done. Fix: set role
  in Studio, redeploy.
- **Sessions not claiming.** Cause: `auth0_id` not populated. Fix: check
  auth_logs, verify Supabase write.
- **Auth0 callback mismatch.** Fix: add heirloom.2bl.ai to Auth0 allowed
  callbacks.
- **RLS blocking requests.** Fix: verify service-role bypass, check policy
  conditions.
- **jefflougheed.ca admin broken.** Fix: verify all Clerk imports removed
  from that route tree.

## 10. Unit Test Plan

### Auth Service Functions

- `signUp(email, password)` — Auth0 user created, `users` row written,
  auth_logs written
- `signUp(phone)` — Auth0 user created, SMS OTP sent, auth_logs written
- `signIn(email, password)` — session activated, auth_logs written
- `verifyOtp(code)` — correct: session activated; wrong: error returned.
  Both logged.
- `getSession()` — authenticated returns user; unauthenticated returns null
- `signOut()` — session cleared
- `useAuthUser()` — hydrates correctly on hard refresh with active Auth0
  session

### Integration Tests

- Email sign-up → session → Supabase record → claim sessions
- Phone sign-up → SMS OTP → session → Supabase record → claim sessions
- Google OAuth → session → Supabase record
- Admin role gate — `platform_admin` passes, `member` blocked
- Tenant scoping — user can only access their own tenant's data

## 11. What We Learned

- **Read the docs before building.** Start from documented working examples.
- **Auth is infrastructure, not a feature.** Build it first, test completely,
  lock behind a service boundary.
- **Logs are not optional.** Scoped to lifecycle events. Part of the feature
  from day one.
- **Service boundaries matter.** Every third-party service behind
  `services/[name]/`. Nothing outside imports from it.
- **Don't patch, fix.** When a patch feels wrong, it is wrong.
- **Test end to end before building on top.** Foundation must work before
  the house goes up.
- **Provider choice matters less than boundary.** Get the boundary right.
  The provider is swappable.

## 12. Implementation Phases and Effort Estimates

| Phase | Work | Effort | Blocker |
|---|---|---|---|
| Phase 1 — Auth boundary | Verify Auth0 headless SMS OTP. Create `services/auth/` interface and types. Wrap all Clerk calls. Nothing changes externally. | 1–2 days | Auth0 SMS confirmed |
| Phase 2 — Auth0 integration | Auth0 account. Replace Clerk provider. Build `auth0Adapter.ts`. Wire all service functions. | 2–3 days | Phase 1 complete |
| Phase 3 — Data migration | Studio schema. Backfill `users.role` + `auth0_id`. Orphaned data script. FK constraint. RLS policies. | 1–2 days | Phase 2 verified |
| Phase 4 — Validation + rollout | Full checklist on preview including hard-refresh test. Monitor auth_logs. Merge to main. 24hr watch. | 1 day | Phase 3 done |

## 13. Rollback Plan

### Rollback Triggers

- Sign-ups failing in production for more than 15 minutes
- Admin locked out of 2bl.ai or jefflougheed.ca
- auth_logs showing >10% error rate on signIn events
- Any Supabase data integrity issue

### Rollback Procedure

1. Revert main to last known good commit via Vercel dashboard — instant
2. Verify Clerk env vars still in place
3. Confirm admin access restored on 2bl.ai and jefflougheed.ca
4. Check auth_logs for data written during failed deployment
5. Post-mortem before re-deploying

Expected recovery time: under 5 minutes via Vercel instant rollback.

## 14. Dependency Inventory — Every Clerk Touchpoint

| File | Current Clerk Usage | Replacement |
|---|---|---|
| `app/layout.tsx` | ClerkProvider wraps entire app | Auth0Provider |
| `middleware.ts` | `clerkMiddleware`, `auth.protect()` | Auth0 session check middleware |
| `app/(platform)/layout.tsx` | `currentUser()` + `publicMetadata.role` | `services/auth/getSession()` + `users.role` |
| `app/(platform)/platform/admin/page.tsx` | `currentUser()` + `publicMetadata.role` | `services/auth/getSession()` + `users.role` |
| `app/api/platform/tenants/route.ts` | `currentUser()` platform_admin gate | `services/auth/isPlatformAdmin()` |
| `app/api/platform/tenants/[id]/route.ts` | `currentUser()` platform_admin gate | `services/auth/isPlatformAdmin()` |
| `app/api/transcribe/route.ts` | `auth()` presence check | `services/auth/getSession()` |
| `app/api/members/sync/route.ts` | `currentUser()` reads clerk.id, email, phone | `services/auth/getCurrentUser()` |
| `app/secondbrainlabs/sign-in/` | Clerk `<SignIn />` component | Auth0 Universal Login or custom form |
| `AdminShell.tsx` / `PlatformShell.tsx` | UserButton (avatar, sign-out) | Custom menu → `services/auth/signOut()` |
| `app/admin/prompt-builder/page.tsx` | `useUser()` greeting + isPlatformAdmin gate | Server prop `isPlatformAdmin` from `users.role` |
| `ChatHeader.tsx` | `useUser()` identity, `useClerk()` signOut | `services/auth/useAuthUser()`, `signOut()` |
| `MagicLinkCard.tsx` | `useUser()` isLoaded/isSignedIn | `services/auth/useAuthUser()` |
| `chatStore.tsx` | `useUser()` gates session recovery, isMember | `services/auth/useAuthUser()` |
| `services/auth/get-auth-context.ts` | `auth()` → clerkId → `users.clerk_id` | Auth0 session → `users.auth0_id` |
| `services/auth/get-current-user-id.ts` | `auth()` → clerkId → `users.clerk_id` | Auth0 session → `users.auth0_id` |
| `services/auth/sync-user.ts` | `currentUser()` upserts users on `clerk_id` | Auth0 user upserts users on `auth0_id` |
| `services/auth/ensure-clerk-user.ts` | `currentUser()` upserts users, phone-safe | Merged into `services/auth/syncUser()` |
| `services/auth/useAuthFlow.ts` | 330-line OTP sign-up/sign-in flow | Deleted after behavior inventory confirmed |
| Schema: `users.clerk_id` | FK bridge Clerk → Supabase | `users.auth0_id` |
| Schema: `members.clerk_user_id` | Clerk user id on members | `members.user_id` FK → `users.id` |

## 15. useAuthFlow.ts — Behavior Inventory Before Deletion

**Phase 1 gate:** Before any code is written, confirm Auth0's React SDK
supports headless SMS OTP without redirecting to Universal Login. If not,
Universal Login becomes the phone sign-up path and the UI approach changes.

| Behavior | Current Implementation | Auth0 Replacement |
|---|---|---|
| Email OTP send | Non-standard, broken. Not used. | Not needed — email uses password |
| Phone OTP send | Non-standard Clerk method | Auth0 SMS passwordless — verify headless support first |
| OTP verification | `signUp.verifications.verifyPhoneCode()` | `services/auth/verifyOtp()` behind boundary |
| Sign-up vs sign-in detection | Try `signUp.create()`, catch existing, fall back | Auth0 signUpIfMissing pattern |
| Session activation | `signUp.finalize()` / `signIn.finalize()` | Auth0 handles automatically on verify |
| Error extraction | `extractErrorMessage()` reads ClerkAPIResponseError | New helper for Auth0 error shape |
| OTP retry / resend | `resendOtp()` calls sendCode again | Auth0 resend endpoint |
| Stage machine | idle → sending → otp_input → verifying → success/error | Same stages, same UI. Internal only. |
| Mounted ref guard | `mountedRef` prevents setState after unmount | Keep — provider-agnostic pattern |
| Invite token mark-used | Called from `claimAllSessions` after `finalize()` | Keep — fires after Auth0 session confirmed |
| Session claiming | `claimAllSessions(name)` after success stage | Keep — unchanged, provider-agnostic |

## 16. Implementation Architecture: The Adapter Pattern

Using Auth0 for SMS delivery is the right pragmatic call — it conserves
engineering bandwidth for core product features. The adapter pattern ensures
that if Auth0's SMS delivery ever becomes too expensive or inflexible, you
change one file. The rest of the application never knows.

This is the structural enforcement of the Golden Rule: the only file in the
entire codebase that imports from `@auth0/nextjs-auth0` is the adapter. Every
other file imports from `services/auth` only.

### Step 1 — Define the Interface (The Contract)

Before writing any Auth0-specific code, define what the application needs from
an auth provider. Frontend components only ever know about this shape.

```typescript
// services/auth/types.ts

export interface AppSession {
  userId:           string;     // maps from Auth0 'sub'
  email?:           string;
  phone?:           string;
  name?:            string;
  isPlatformAdmin:  boolean;    // resolved from users.role
}

export interface AuthResult {
  session: AppSession;
}

export interface AuthService {
  getSession:  () => Promise<AppSession | null>;
  sendOtp:     (phoneNumber: string) => Promise<void>;
  verifyOtp:   (phoneNumber: string, code: string) => Promise<AuthResult>;
  signIn:      (email: string, password: string) => Promise<AuthResult>;
  signUp:      (params: SignUpParams) => Promise<AuthResult>;
  signOut:     () => Promise<void>;
}
```

### Step 2 — Standardize the Data Shape (Normalization)

Auth0 uses `'sub'` for user ID and `'app_metadata'` for roles. The application
should never deal with those quirks. When the adapter fetches data from Auth0,
it maps it into `AppSession` before returning it. Switching providers means
writing a new mapper — nothing else changes.

### Step 3 — Translate the Errors

Auth0 throws errors like `'invalid_grant'` or `'auth0_rule_failed'`. These
must never reach React components. The adapter catches provider-specific
errors and throws generic application errors instead.

```typescript
// services/auth/errors.ts

export class OtpExpiredError    extends Error {}
export class InvalidCodeError   extends Error {}
export class AccountLockedError extends Error {}
export class AuthProviderError  extends Error {}

// UI components handle only these — never Auth0-specific codes
```

### Step 4 — Create the Adapter

This is the only file in the codebase that imports from `@auth0/nextjs-auth0`.
It fulfills the `AuthService` contract. Everything Auth0-specific is contained
here.

```typescript
// services/auth/providers/auth0Adapter.ts
import { getSession, handleLogin } from '@auth0/nextjs-auth0'; // ONLY HERE
import { AuthService, AppSession } from '../types';
import { OtpExpiredError, InvalidCodeError } from '../errors';

export const auth0Adapter: AuthService = {
  getSession: async () => {
    const session = await getSession();
    if (!session) return null;
    return mapAuth0SessionToAppSession(session); // normalize here
  },

  sendOtp: async (phoneNumber) => {
    // Calls Auth0 passwordless start endpoint
    // To switch to Twilio later: change only this method
  },

  verifyOtp: async (phoneNumber, code) => {
    try {
      // Auth0 verify call
    } catch (err) {
      if (err.code === 'invalid_grant') throw new InvalidCodeError();
      if (err.code === 'otp_expired')   throw new OtpExpiredError();
      throw new AuthProviderError(err.message);
    }
  },
  // ... signIn, signUp, signOut
};
```

### Step 5 — The Single Point of Export

The index file exports the active adapter. Switching providers means changing
one line.

```typescript
// services/auth/index.ts
import { auth0Adapter } from './providers/auth0Adapter';

// To switch providers later, change only this line:
// import { twilioAdapter } from './providers/twilioAdapter';

export const authService = auth0Adapter;

// Re-export types so consumers never import from providers directly
export type { AppSession, AuthService } from './types';
export * from './errors';
```

### How This Protects the SMS Decision

UI components call `authService.sendOtp('+16472988252')`. They do not know or
care how the message is sent. If Auth0 SMS becomes too expensive, a new
adapter calls Twilio. The implementation changes inside the boundary. The
frontend continues working without a single line of UI code changing.

---

## Additional Notes

- **The platform thesis is sound.** Chat, prompts, tenants, sessions, stream
  parsing are solid. Auth was the one broken piece.
- **Invite-only is the right call for now.** Protects real users while auth
  is being rebuilt.
- **Auth0 logging is genuinely better.** Full event stream combined with
  auth_logs gives complete visibility.
- **The schema is closer to correct than it felt.** The gaps are RLS
  policies, the missing FK, and removing `clerk_id_dev`.
