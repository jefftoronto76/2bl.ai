# Handover — Composer Conversation Drawer (persistence)

**2BL.AI Platform · branch `claude/awesome-cray-cwfio7` · `/admin/prompt-builder`**
Next.js App Router · Supabase · services-layer pattern. Status: **chrome shipped,
backend pending — this package closes it.**

> **Scope:** the one remaining capability from the Composer redesign — making the
> conversation-history drawer **real**. The drawer UI, its state, and the
> mount-time list fetch are already on the branch and degrade gracefully to an
> empty drawer. What's missing is **persistence**: a table, a service, four route
> handlers, and three small `page.tsx` wirings. Everything else in the Composer
> (streaming chat, file upload, safety check, save-to-Supabase, prompt-set
> picker) is done and **must not regress**.

---

## 1. Where the drawer is today (branch state)

**Done (presentational + state):**
- `ConversationSidebar` renders a grouped list (Today / This week / Earlier), a
  `New` button, an empty state, and an active-row highlight. Overlay drawer
  (280px) + scrim + Esc-to-close, toggled by the top-bar hamburger.
- `page.tsx` holds `conversations`, `activeConversationId`, `sidebarOpen`, and
  fetches `GET /api/admin/conversations` on mount **with an empty fallback**.
- The top-bar title already follows the active conversation when one is loaded.

**Stubbed / blocked (this package):**
| Gap | Today | Fix lives in |
|-----|-------|--------------|
| List/create/read/append API | endpoints **don't exist** → drawer always empty | `app/api/admin/conversations/*` |
| Storage | no table | `migrations/0001_prompt_conversations.sql` |
| Selecting a thread | `onSelect={() => {}}` — inert | `page-wiring.md` §2 |
| Saving a thread | no write path — nothing persists | `page-wiring.md` §3 |
| `New` button | leaves stale `activeConversationId` (bug) | `page-wiring.md` §1 |
| Titles | always `New conversation` | `page-wiring.md` §3 (`deriveTitle`) |

---

## 2. What's in this package

```
drawer/
  handover.md                                  ← this file
  page-wiring.md                               ← exact page.tsx edits (3 changes, no engine touch)
  migrations/
    0001_prompt_conversations.sql              ← table + index + updated_at trigger
  services/prompt/
    conversations.ts                           ← list / get / create / update (house Result pattern)
  app/api/admin/conversations/
    route.ts                                   ← GET (list) + POST (create)
    [id]/route.ts                              ← GET (hydrate) + PATCH (append/rename)
```

These are **production-shaped skeletons** — drop them at the mirrored repo paths,
verify imports (`@/services/auth`, `@/services/auth/supabase-admin`,
`@/services/prompt/conversations`), and adjust to the real `tenants` FK / RLS
posture. They mirror `topics` (`services/content/topics.ts` +
`app/api/admin/topics/route.ts`) line-for-line in structure.

---

## 3. Data model

One row per conversation, tenant- **and** owner-scoped (the owner is the access
guard, same as the rest of the admin API).

```ts
// DB (snake_case)                     // client shape returned by the service (camelCase)
prompt_conversations {                 ConversationSummary {   // list view
  id            uuid pk                   id: string
  tenant_id     uuid                      title: string
  owner_id      uuid                      preview: string | null
  title         text                      updatedAt: number     // epoch ms
  preview       text                    }
  messages      jsonb   // [{role,content,timestamp}]
  prompt_set_id uuid?                   ConversationFull extends ConversationSummary {
  created_at    timestamptz               messages: ChatMessage[]
  updated_at    timestamptz               promptSetId: string | null
}                                       }
```

**Shape mapping is deliberate.** The client `Conversation` type already uses
`updatedAt` as epoch ms and the page does `setConversations(data)` with no
transform — so the **service maps `updated_at` → `updatedAt` (ms)**, not the
client. The list query omits `messages`; they hydrate only on open.

---

## 4. The flow, end to end

1. **Mount** → `GET /api/admin/conversations` → grouped list in the drawer.
2. **First send of a fresh draft** (`activeConversationId === null`) →
   `persistConversation` POSTs a new row (title derived from the first user
   message), sets `activeConversationId`, prepends it to the list.
3. **Every subsequent completed turn** → PATCH the row with the full transcript +
   new preview; the row bumps to the top (trigger refreshes `updated_at`).
4. **Selecting a row** → `GET /…/:id` hydrates `chatMessages`; the thread reopens.
5. **`New`** → clears chat **and** `activeConversationId` → next send starts a new
   row.

Persistence is **best-effort and isolated**: `persistConversation` is
fire-and-forget with its own try/catch, called once at the end of
`sendChatMessage`'s success path. A persistence failure can never break a chat
turn that already streamed.

---

## 5. Open decisions (carried from main handover §7)

1. **`sessionStartIndex` on load** — the wiring sets it to `0`, so a reopened
   thread counts its *own* exchanges toward the limit (a 10-exchange thread
   reopens at the limit). Alternative: set to `messages.length` to grant a fresh
   budget per reopen. **Recommend `0`** (the limit is about thread length).
2. **Create timing** — lazily on first send (chosen), so empty drafts never
   persist. Confirm.
3. **Titles** — first-user-message slice (≤48 chars) now; AI-generated titles are
   a later nicety (the column is already there to backfill).
4. **`New` semantics** — discards the current unsent draft and opens blank
   (matches the prototype). Confirm.
5. **Append granularity** — the client sends the **full** `messages` array each
   turn (simple, the page already holds it). If transcripts get large, switch to
   an append-delta endpoint later; the table doesn't change.
6. **Audit** — add `CONVERSATION_CREATE` / `CONVERSATION_UPDATE` to
   `AuditAction` if you want parity with `blocks/save` (commented stubs in the
   route). Optional.
7. **RLS** — match the sibling tables. The service uses the service-role client
   and filters `tenant_id` + `owner_id` on every query; mirror `topics`/`blocks`
   policy posture in the migration.

---

## 6. Ship order

1. Apply the migration; log it in `DB_CHANGELOG.md`.
2. Land `services/prompt/conversations.ts` + the two route files. Smoke-test with
   `curl`/Postman: list (empty `[]`), create, get, patch.
3. Apply the three `page.tsx` wirings (`page-wiring.md`). The drawer goes live.
4. (Optional) audit actions + AI titles.

Each step is independently safe: until step 3, the page still degrades to an empty
drawer; step 3 only adds a fire-and-forget call + a select handler.

---

## 7. Do-not-regress

The chat engine is untouched. Verify after wiring:
- [ ] A typed turn still streams; drafts still render and save.
- [ ] File upload + auto-trigger still works.
- [ ] Exchange counter (warn 8 / limit 10) unchanged for a fresh thread.
- [ ] `prompt_set_id` still sent on block save (already wired).
- [ ] Persistence failure (e.g. routes 500) does **not** break the chat turn —
      the reply still appears; only the drawer doesn't update.

---

## 8. QA checklist (drawer)

- [ ] Fresh load → drawer lists existing threads, newest first, grouped.
- [ ] Send a first message → a row appears at the top of the list with a title
      derived from that message.
- [ ] Send more → the same row stays one row, bumps to top, preview updates.
- [ ] Click a past thread → it reopens with full history; title shows in top bar.
- [ ] `New` → chat clears, drawer closes; next send creates a *new* row (old one
      intact).
- [ ] Reload → all threads still present (persistence confirmed).
- [ ] Reopen a thread, send again → appends to that thread, not a new one.
- [ ] Cross-owner isolation → another owner cannot fetch this owner's thread by id.
