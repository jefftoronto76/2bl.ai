# Heirloom Bug-Fix Batch — Pre-Merge Test Plan

Branch: `claude/wonderful-mendel-59lgnj` · Nine commits: docs + eight bug
fixes (Clerk profile name, account menu phone, reactive Recent sidebar,
localStorage lifecycle, sign-in copy, ghost-row guard, `users.status`
maintenance). **Nothing merges to main until every section below passes on
the Vercel preview deployment for this branch.**

How to use this document: sections are ordered so one continuous walkthrough
covers everything with the fewest sign-in/sign-out cycles. Each section names
the commit it verifies. Static checks (tsc, lint, 286/286 unit tests) already
pass in the sandbox — everything below is **manual, on preview**.

Preview URL placeholder: `https://<preview>` = the Vercel preview deployment
for the latest push to this branch. Run the Heirloom checks on
`https://<preview>/heirloom` (preview hosts don't resolve `heirloom.2bl.ai`;
`PREVIEW_TENANT_ID` must be armed in Vercel's Preview env — it already was
for the auth-boundary plan).

## Prerequisites

- [ ] Invite gate OFF for the Heirloom tenant (Admin → Invites → toggle), or
      have a valid invite link — otherwise the chat interior renders GateView
      and the Save CTA / claim flows can't be reached.
- [ ] A test phone number that can receive SMS and a test email inbox, both
      **not yet registered** in Clerk (delete leftovers from previous runs in
      Clerk dashboard first).
- [ ] Clerk dashboard access (verify profile name, delete test users).
- [ ] Supabase Studio access (verify `users` / `members` / `chat_sessions`).
- [ ] DevTools open throughout: Console, Network, and
      Application → Local Storage (filter keys on `heirloom:chat:v1`).

---

## §1 Anonymous reload starts fresh — bug 5 (`e23030d`)

1. [ ] Open `https://<preview>/heirloom` **signed out**. Open the chat. Send
       2–3 messages and let the replies finish.
2. [ ] Local Storage: a `heirloom:chat:v1:session:<id>` (or `:draft`) key and
       a `heirloom:chat:v1:index` entry exist.
3. [ ] Reload the page → chat shows the **empty greeting** ("What's a story
       worth keeping?"). The old conversation does NOT reappear.
4. [ ] Local Storage after reload: the `index` key still lists the session id;
       the `session:<id>` **transcript key is gone** (scrubbed on exit, index
       kept for the later claim — §3 depends on this).

## §2 Phone sign-up: name → Clerk, correct copy, menu shows phone — bugs 1, 6, 2 (`56ab002`, `643decb`, `8760d07`)

1. [ ] Still signed out, chat until ≥4 messages so the **"Save this chat"**
       CTA appears. Click it.
2. [ ] Fill name **"Jane Doe"** (two words), Phone tab, the unregistered test
       phone → send → enter OTP.
3. [ ] Confirmation message in-chat reads **"You're now a member — your story
       is saved."** (sign-up copy — bug 6's other half is §5).
4. [ ] Clerk dashboard → Users → the new user has **First name "Jane", Last
       name "Doe"** (bug 1 — this was empty before).
5. [ ] Account menu (top-right in chat header): initials **JD** render; the
       dropdown shows the name and the **phone number** beneath it where
       email users see their email (bug 2 — this line was blank before).
6. [ ] Studio: `users` row for this Clerk id has `name = 'Jane Doe'`, `phone`
       set, `status = 'active'`; `members` row exists with phone.
7. [ ] Console shows no errors from the auth flow (warnings about
       `signUp_update_name` would mean the name attribute is disabled in the
       Clerk dashboard — flag it; sign-up itself must still have completed).

## §3 localStorage cleared after claim — bug 4 (`1307cbc`)

Immediately after §2's sign-up completes (same page session):

1. [ ] Network tab: one `POST /api/sessions/<id>/claim` per indexed session,
       all 200.
2. [ ] Local Storage: the claimed `heirloom:chat:v1:session:<id>` keys AND
       their `index` entries are **gone**; the `draft` slot is gone.
3. [ ] Studio: those `chat_sessions` rows now have `user_id` set.
4. [ ] Send one more message while signed in → a session key MAY reappear at
       the turn boundary. **Expected** — buffering stays on for signed-in
       users by design (their DB-recovery layer).

## §4 Recent sidebar updates without reload — bug 3 (`fbf09a2`)

Still signed in:

1. [ ] Expand the sidebar. The conversation from §2/§3 is listed under
       **Recent** — without any reload having happened since it was claimed.
2. [ ] Sidebar → **New Chat** → send one message, let the reply finish → the
       new session appears at the **top** of Recent the moment the reply
       completes, and is highlighted as active. No reload.
3. [ ] Click the older Recent entry → it loads; send a message in it → it
       moves back to the top of the list.

## §5 Signed-in reload + returning-user copy — bugs 5, 6 (`e23030d`, `643decb`)

1. [ ] Reload while signed in → the latest conversation **restores** (local
       buffer or DB recovery — either source is fine; this is the regression
       guard on the bug-5 gate).
2. [ ] Sign out (account menu). Chat to ≥4 messages, "Save this chat", enter
       the **same phone from §2** (type a different name — e.g. "Janet") →
       OTP → confirmation reads **"Welcome back — your story is saved."**
       (bug 6).
3. [ ] Clerk dashboard: the profile name is **unchanged** ("Jane Doe") — the
       sign-in path never writes the name (bug 1's exclusion rule).

## §6 users.status maintained on delete — bug 8 (`470a4a7`)

1. [ ] Clerk dashboard → delete the §2 test user.
2. [ ] Studio (allow a few seconds for the webhook): that `users` row has
       `deleted_at` set **and** `status = 'deleted'`; the `members` row has
       `status = 'deleted'`.

## §7 Ghost-row guard — bug 7 (`6c2a493`) [observational]

No natural trigger exists on demand; verify the guard is armed and nothing
regressed:

1. [ ] Studio, after this whole walkthrough:
       `SELECT * FROM users WHERE email IS NULL AND phone IS NULL AND created_at > '<walkthrough start, UTC>'`
       returns **zero rows**.
2. [ ] Normal sign-ups (§2, §5) all produced complete rows — the guard did
       not block legitimate traffic.
3. [ ] (Optional) Vercel logs: no `[webhook/clerk] ghost-row guard` lines —
       OR, if one appears, `auth_events` has the matching row with
       `metadata->>'ghost_guard_skipped' = 'true'` and **no** users row was
       created for that Clerk id. Either outcome passes; a guard line plus a
       new identifier-less row fails.
4. [ ] Reminder (Jeff, Studio): cleanup of **pre-existing** ghost rows is
       manual data work — delete unreferenced rows, set `status = 'deleted'`
       on referenced ones.

## §8 Email-tab spot check — bugs 1, 6 (`56ab002`, `643decb`)

The phone path got the full pass above; the email path shares the code:

1. [ ] Signed out → "Save this chat" → name + **Email tab** with the
       unregistered test email → OTP → "You're now a member…" and the Clerk
       profile has the name.
2. [ ] Account menu shows the **email** (email wins over phone when both
       exist — bug 2's precedence rule).

## §9 Cross-surface regression [regression-only]

1. [ ] `https://<preview>/` (jefflougheed.ca): hero chat sends/streams
       normally; booking cards render. (Shared `useChatTurn` engine was not
       modified; this confirms it.)
2. [ ] `/admin` loads; Settings and Invites pages render. (Auth boundary
       server paths untouched; webhook + client-flow changes only.)
3. [ ] MagicLinkCard's other entry point: ChatHeader → Sign in (signed out)
       opens the prebuilt modal as before, and an in-chat `[ACCOUNT_CREATE:]`
       card (if Sage emits one) still renders.

---

## Sign-off

- [ ] All sections pass on preview → branch is ready for PR/merge.
- Failures land here with section number + symptom:
