// services/shared/rollout.ts
//
// Dependency-free — no `server-only`, no `getAdminClient` — same constraint
// as services/shared/identity.ts, for the same reason: it backs both a
// server route (app/api/members/me) and a client component
// (components/shells/membership/NameCompletionGate.tsx), which independently
// evaluate the same gate condition from the same raw data.

/**
 * Cutover instant for the item-3b name-completion interstitial
 * (Design Handovers/heirloom-signup-signin-fixes-proposal.md, section 3b).
 * A `members` row is only ever subject to the name-completion gate when its
 * `created_at` is on or after this timestamp — permanent grandfathering for
 * every row that already existed at ship time, by construction, not a
 * temporary rollout flag.
 */
export const NAME_REQUIRED_SINCE = '2026-09-03T00:00:00Z'
