# Members Service

### Members service (`services/members/`)

Member invite and lifecycle operations for the `members` table. Server-only. The `invites` table is retired — invite state now lives on `members` directly via `token` / `used_at` / `invited_name` / `status = 'invited'`. Token generation uses `crypto.randomBytes(24).toString('base64url')` (32-char URL-safe string).

| File | Exports | Purpose |
|------|---------|---------|
| `members.ts` | `createMemberInvite`, `validateMemberToken`, `linkInvitedMember`, `acceptInvite`, `hardDeleteMember` (+ `MemberInviteRow`, `MembersResult`, `HEIRLOOM_TENANT_ID`) | `createMemberInvite(tenantId, actorId, invitedName?, email?, phone?)` — inserts a members row with status='invited', generates token, writes email/phone when supplied (for contact-lock invites), stamps `invited_by = actorId` for provenance (null actor = column left unset), fires `MEMBER_INVITE_CREATED` audit. `validateMemberToken(token)` — returns the members row when the token exists and `used_at IS NULL`. `linkInvitedMember(clerkId, email)` — called on `user.created` webhook: upserts the users row, finds an invited row by email (case-insensitive), updates it with `clerk_id`, `user_id`, `status='active'`, `source='invite'`, `used_at=now()`. `acceptInvite(token, clerkUserId, supabaseUserId)` — accepts an invite by token after Clerk sign-up: finds the invited row, deletes any orphan active row that `syncMember` created (invited row had `clerk_id=null` → no upsert conflict → new active row inserted by webhook), stamps `clerk_id`, `user_id`, `status='active'`, `source='invite'`, `used_at=now()` on the original invited row. `hardDeleteMember(userId, actorId, tenantId)` — writes `MEMBER_HARD_DELETED` audit first, then deletes the users row (DB cascade removes members). |
| `index.ts` | barrel | Re-exports the public surface above. |

**Retired:** `services/invites/` (deleted). All callers updated to use `services/members` equivalents.
