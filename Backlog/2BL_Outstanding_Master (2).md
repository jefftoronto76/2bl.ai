# Sage / 2BL — Project Status

**Second Brain Labs · Compiled July 24, 2026 · Rebuilt July 28, 2026**

---

## What actually shipped in July

**The entire front-end chat experience is done.** Scroll anchoring, mobile keyboard handling on both surfaces, delivery states, stop/regenerate, thumbs feedback, buffered markdown, error classification, IndexedDB persistence, ARIA live regions — 30+ individual guideline items, all closed, all live. This was the single biggest block of outstanding work at the start of the month and it's gone.

**The prompt system went from "we don't actually know what's being served" to a real, working platform.** At the start of this stretch: no type taxonomy in use, no enforcement against two prompts both claiming to be live, a dead version counter silently lying in the admin UI, and a resolver that only worked by accident because no tenant had ever tested the edge case. Now: a working type system (Base/Sales/Onboarding/Editor) with correct platform-vs-tenant scoping, a Status field that can no longer be flipped live with zero compile behind it, a Compile & Publish flow that requires a real release note and enforces exactly one live prompt per tenant per type, and both production tenants correctly tagged. One dedicated session away from the actual read-side cutover — everything that session needs already exists and is verified.

**Stream recovery went from "wrong protocol" to "wrong protocol plus two invisible bugs, all three fixed."** The original scope was a known protocol mismatch for Sonnet 4.6. Along the way: found that clicking Stop before any text streamed silently deleted the message with zero trace anywhere — no error, no record, nothing to debug from. Found a role-alternation bug in the fix itself before it shipped, via a second pass, not by accident. Diagnosed — with real evidence, not a guess — that the server-side abort mechanism the whole industry assumes works (`req.signal`) doesn't reliably fire behind this app's middleware, and replaced it with a mechanism that doesn't depend on that platform behavior. One retest remains to close it out completely.

**A real new feature — Memories — went from a design doc to a scoped, buildable spec**, including catching that the original schema plan (`story_chats`, templates) didn't fit the actual product once "memories are the foundation, stories are just the canvas" reframed it. That's not backlog, that's active design work completed this session.

---

## What's actually left, sized honestly

**One session's worth of work stands between where we are and the prompt system being fully correct:** the `getSystemPrompt` cutover itself. Everything upstream of it — schema, types, publish gates — is done and confirmed. This is the highest-leverage single thing left.

**One short retest closes out stream recovery completely:** click Stop mid-stream on the current merged code, confirm the new server-side confirmation column populates. Everything else in that fix is already verified.

**Memories is a real build, not a small one** — schema, three capture surfaces, an archivist prompt that needs to go through the same pipeline as everything else, sidebar integration. Scoped and ready, not started.

**Latency work hasn't been touched yet** — in-memory caching, prompt caching, cache pre-warming, the `effort` parameter. All small, well-understood, none started. This is real backlog, not discovery.

**A handful of small UI items** — touch targets, a scroll nudge, some cosmetic cleanup — genuinely minor, mostly waiting on a design decision rather than engineering time.

**Deliberately parked, by mutual agreement, not neglect:** the eval loop, the golden eval set, the traffic cop, batch eval processing. These were explicitly sequenced to August because building them before the prompt system was stable would have been premature. That was the right call, not a missed one.

---

## Reference — full item tracking

Kept for detail and follow-up, not as the headline. Status key: 🔴 Not started · 🟡 Implemented, not tested · 🟢 Tested & confirmed · 🔵 Needs a decision · ⚪ Deferred to August by agreement.

### Prompt System Cutover

| # | Item | Status |
|---|---|---|
| 2.A | Type assignment UI + Status lockdown | 🟢 Tested & confirmed |
| 2.B | Both tenants tagged `Base` | 🟢 Tested & confirmed |
| 2.C | 🟡 Compile & Publish gates — exercised for real tonight, but only the INSERT path (first-ever publish, nothing to retire). The retire/demote-sibling logic is unit-tested but has never actually fired against real production data — no second publish to any (tenant, type) slot has happened since the RPC went live. Confirm this specifically the next time any prompt gets republished. | Insert path confirmed. Retire path: tested, not yet exercised for real. |
| 2.D | `compiled_prompts_history` — is it ever read? | 🔴 Not started |
| 2.E | 🟢 `getSystemPrompt` cutover — filters by `status='live'` instead of highest-version, confirmed via test + behavior-neutral check, merged before tonight's composer work started. Composer going live tonight is further proof the read path works correctly. | Done |
| 2.F | Session-level prompt traceability | 🔴 Not started, blocked on 2.E (now unblocked) |

### Stream Recovery

| # | Item | Status |
|---|---|---|
| 1.1 | Protocol fix + silent-stop bug + role-alternation bug + server-abort redesign — all merged. **Final retest (does `server_abort_confirmed_at` populate) not yet run.** | 🟡 Implemented, final confirmation pending |
| 1.2 | Prompt caching | 🔴 Not started |
| 1.3 | Compaction — decision made (own build, not Anthropic's beta), design documented | 🔴 Not started |

### Memories (Heirloom)

**Built and shipped tonight (Jul 28–29), branch `claude/memories-handoff-review-3xtzwr`, PR opened.** Full plan (3 revisions, CD design → CC analysis → final approval) — architecture: rows in the existing `artifacts` table (`type='memory'`), not a new table; parallel collection keyed to `anchor_message_id`, not a new message role.

| # | Item | Status |
|---|---|---|
| 1A.1 | Schema — 3 new columns on `artifacts` (`anchor_message_id`, `source_kind`, `member_id`) + 1 on `media_items` (`artifact_id`). No new tables. `artifacts` reuse confirmed, not `stories`/`memories` from scratch. | 🟢 Built |
| 1A.2 | **Manual bookmark path only** — shipped. Offer chips ("Offered") and model-invoked ("Auto") explicitly deferred, see below. | 🟢 Built (Manual) / 🔴 Offered, Auto not started |
| 1A.3 | Archivist — **⚠️ decision reversed Jul 29, needs rework tomorrow.** Phase 1 built a dedicated `memory-archivist-prompt.ts` + separate one-shot API call — that's now considered over-engineered. Real framing: memory capture is a *selection* step, not a generation step. The guide's own message already IS the memory candidate — the conversation exists specifically to produce memory-worthy passages, that's its purpose, not a side effect to extract afterward. Tomorrow needs a decision: verbatim capture (tag and save the guide's message as-is, no transformation), or a light cleanup pass done by the guide itself with no separate prompt/persona. Either way, the dedicated archivist prompt + route from Phase 1 likely gets removed, not extended — this also permanently resolves the "does archivist need its own prompt_type" question that bounced around for days. | 🟡 Built, but wrong shape — rework tomorrow |
| 1A.4 | Card states + Rewrite flow — built. Real simplification found along the way: no `artifacts` row is ever created until the archivist call actually succeeds, so the entire "stuck running row" reconciliation-bug class the original handoff had to guard against doesn't exist here. | 🟢 Built |
| 1A.5 | Sidebar integration — built. Bonus find: a "Memories" section header already existed in `SidebarV2.tsx`, pre-built and unused; wired real counts onto it rather than duplicating. | 🟢 Built |
| 1A.6 | Read view / export | 🔴 Not started |

**Explicitly deferred, not built:**
- **Offered path** (guide proactively suggests writing a memory) — blocked on Heirloom having its own compiled prompt to add the instruction to (currently falls back to jefflougheed's shared `DEFAULT_SYSTEM_PROMPT` — editing that would leak Heirloom-only behavior cross-tenant). Unblocks via tomorrow's Heirloom base-prompt rebuild.
- **Auto path** (model decides on its own to fire the save) — blocked on tool-calling infrastructure, which doesn't exist in the chat server at all. Folded into tomorrow's tool-calling scope (see below), not Memories-specific.
- Stories — fully decoupled by design decision. Memory-saving never blocks on a story; no story schema shipped this pass. When story-linking is built, it's many-to-many, not a column on `artifacts` (noted now so it isn't rediscovered later).

**Tool-calling infrastructure — real scope, not Memories-specific.** Same underlying gap blocks multiple features, not just the Auto path. Candidates identified Jul 28: Calendar/Booking (`BOOKING` marker, already a hybrid) and Accounts Create/Save (`ACCOUNT_CREATE` marker) — both already open under Marker Rule 01 since the original audit — plus Memories/artifacts and Stories/collections, new as of tonight. Build once against the full list, not one feature at a time.

Open: ships for jefflougheed.ca too, or Heirloom-only.

Future idea, not scoped: a tool call for a survey system.

### Latency & Cost

| # | Item | Status |
|---|---|---|
| 3.1 | In-memory cache for `getSystemPrompt` | 🔴 Not started (~2 hrs) |
| 3.2 | Prompt caching (see 1.2) | 🔴 Not started |
| 3.3 | Cache pre-warming | 🔴 Not started, after 1.2 |
| 3.4 | `effort` parameter evaluation | 🔴 Not started (~2 hrs) |
| 3.5 | Session creation on first turn | 🔴 Deferred, revisit if needed |

### Chat UI — small items

| # | Item | Status |
|---|---|---|
| 4.1 | Message actions inconsistency | 🔵 Needs decision |
| 4.2 | Confirmation before `STORY_SAVED` | 🔴 Not started (~3 hrs) |
| 4.3 | SidebarV2 touch target | 🔵 Needs decision |
| 4.4 | SourceMenu row spacing | 🔵 Needs decision |
| 4.5 | Scroll-to-bottom nudge | 🔵 Needs CD input |
| 4.6 | `touch-action: manipulation` | 🔴 Not started (~30 min) |
| 4.7 | Safe area inset, Safari | 🟢 Tested & confirmed |
| 4.8 | Header icon bleed | 🔴 Not started (~1 hr) |
| 4.9 | Diagnostic logging | 🟢 Tested & confirmed |
| 4.10 | `message_feedback` pre-auth attribution | 🔴 Not started (~1 hr) |
| 4.11 | MessageList cosmetic issue, jefflougheed.ca only | 🔴 Not started, needs investigation |

### Model Upgrade Readiness

| # | Item | Status |
|---|---|---|
| 5.1 | Tokeniser change on newer models | 🔴 Not started |
| 5.2 | Structured migration evaluation process | 🔴 Not started |
| 5.3 | Token counting API as pre-send tool | 🔴 Not started |

### Deferred to August, by agreement

| # | Item |
|---|---|
| 6.1 | Eval loop — also the correctness safety net for business-critical markers |
| 6.2 | Golden evaluation set |
| 6.3 | Rubric audit |
| 6.4 | Batch processing for eval (ZDR question for Heirloom needs a call) |
| 6.5 | Traffic cop / Success Lead — blocked on 2.E. **Architecture clarified Jul 28: this is not just session-signal routing (session count/surface/member state) — it's the general job of deciding which prompt type a given trigger should request, full stop.** A tool call firing, a milestone, a button click — all the same category of decision as the session-signal case, just simpler instances of it. `getSystemPrompt` gaining a type parameter was step one; the traffic cop is meant to *own or augment* the call to it, not sit beside it as a separate system. **Tonight's archivist wiring (Memories) hardcodes `create_memory` → `archivist` type directly at the call site, as an explicit, temporary shortcut to unblock Heirloom** — not the intended long-term shape. That call site is meant to be torn out and routed through the traffic cop once it exists, not left as permanent scattered logic. |
| 6.6 | Compiler conflict detection |
| 6.7 | Constrain the Composer |

---

## Session end, Jul 29 — final state

**Composer is live, for real, for the first time.** DB-confirmed: `326987be` (Composer Prompt) is `status='live'`, `prompt_type_id`=Base, version 1. It's running its actual authored content — not the `BLOCKS_COMPOSER_SYSTEM` hardcoded fallback that had silently served it since June.

**Everything built and merged tonight, in order:**
1. **Composer family system** — `is_composer_prompt` correctly scoped as its own independent axis (not overloaded, not routed through the type taxonomy), platform-wide exclusivity via a rescoped unique index, explicit composer-clear step in the write path.
2. **`retired` status** — third state distinct from `draft`, for rows that were live and got superseded. 10 files touched (type widenings, sort-order bug, a real 400-on-save bug), all found and fixed before shipping.
3. **Master-prompt Save/Revert path retired** — Composer activation now happens exactly one way: Edit pencil → Blocks → Compile & Publish. No second, thinner write path anymore.
4. **Tenant-resolution fix** — 6 call sites, closes the "platform admin lands on the wrong tenant's prompt" bug, confirmed real via trace.
5. **isPlatformAdmin gate** — composer-family sets require it at the Blocks-screen level, not just at the platform-route level.
6. **Two duplicated picker components consolidated into one** — `PromptSetPicker.tsx` deleted, `PromptSetSelect` generalized with backward-compatible optional props. This was flagged debt from day one that finally bit; paid down properly, not patched.
7. **Atomic publish** — `publish_compiled_prompt` Postgres RPC, single transaction, `pg_advisory_xact_lock` on `(tenant_id, prompt_type_id)` plus a second platform-wide lock for composer exclusivity, optimistic concurrency (`expected_version`, actually wired to the modal's displayed version — not just present-but-unused).
8. **Missing schema found and fixed** — `release_summary`/`release_why`/`release_changed_block_ids` were documented as migrated on July 27, genuinely weren't, on both `compiled_prompts` and `compiled_prompts_history`. Real gap between changelog and live schema — first evidence that document can drift from reality.
9. **Publish modal — honest success/failure.** Previously: a decorative animation ran on an independent timer and always showed "success" regardless of what actually happened. Now: gated on the real request. Success → real refresh (`router.refresh()`, closes the "card doesn't update" bug found tonight). Failure → its own screen with the actual error, **Try again** (resubmits, note preserved) or **Okay** (back to editing, note preserved). Toast kept as backup.

**Everything above is DB-confirmed or test-confirmed, not assumed.** Multiple things tonight were documented as done and weren't (the release-note columns; the master-prompt route's actual write behavior) — worth carrying that skepticism into tomorrow rather than trusting any status claim, including in this doc, without a quick direct check first.

## Next week (Tuesday+) — the pile

Out of time after tomorrow/Friday. Everything here needs a real, uninterrupted block — none of it fits in a fragment, so don't start any of it early just because there's a spare 20 minutes.

- **Friday's load-testing target** — the whole reason it's on the calendar: verify the scale gaps flagged Jul 29 (stop-detection poll under real concurrent volume, publish behavior under load) instead of assuming safe.
- **Tool-calling infrastructure** — real, cross-feature scope: Calendar/Booking, Accounts Create/Save (both already flagged under Marker Rule 01), plus Memories' Auto path and Stories/collections. Build once against the full candidate list, not per-feature.
- **Heirloom/Legacy lander** — Legacy tenant `d4006c45`, been on the list since the original CriticalPath doc.
- **Clerk migration (the barrel stuff)** — PM work, important plumbing, no urgency pressure.
- **Memories: Offered path** — guide proactively suggests writing a memory. Unblocked once tomorrow's Heirloom prompt ships (needs Heirloom's own compiled prompt to add the instruction to).
- **1A.6 — Memories read view / export** — not started at all yet.
- **`media_items.artifact_id` wiring** — connects existing photos to memory cards, not done.
- **Changelog-vs-reality audit** — real gap found Jul 29 (migrations documented as run that genuinely weren't). Worth a proper pass comparing `DB_CHANGELOG.md` against actual live schema, not urgent but real.
- **Composer/Blocks screen cosmetic gaps** — publish-modal loading state (may already be closed by tonight's honest-modal work, confirm), Blocks status card refresh (should be closed by tonight's `router.refresh()` fix, confirm).

## Tomorrow's plan — confirmed

1. **Confirm Composer is working as designed** — quick sanity pass, not a deep dive.
2. **Build the Heirloom prompt (+ necessary tools)** — the actual focus. Memories reframed as a lighter-weight feature (see below), so this may fold in more of what Memories needs than originally scoped separately.
3. **Test and confirm Memories** — end to end, against the real prompt from step 2.

**Memories scope correction, decided tonight:** memory capture is not a generation step, it's a *selection* step. The guide already writes good passages in normal conversation; the memory card should grab what's already been said, not run a separate archivist authoring pass. This walks back Phase 1's dedicated `memory-archivist-prompt.ts` + one-shot API call — needs a decision tomorrow: verbatim capture (memory = the guide's message, tagged and saved as-is), or a light cleanup pass done by the guide itself, no separate prompt/persona. Either kills the "does archivist need its own prompt_type" question that's been open for days.

**If Composer isn't clean in step 1:** skip straight to the Heirloom prompt — that's the actual barrier to Memories working, more important than any remaining Composer polish today.

**Also still open, connects to step 3:** `media_items.artifact_id` exists as a column, nothing wired to use it yet — blocks memory cards from showing photos. Worth resolving in the same pass as testing Memories, not separately.

**If time remains after the three items above:** prompt caching (1.2/3.2) — squeeze in later tomorrow, or Friday AM if not. Real latency win (up to 85% reduction per vendor numbers), genuinely separate from the three main items, good use of leftover time rather than starting something bigger.

