# Traffic Cop / Prompt Work — Sprint Plan

Reorganized from a flat punch list into dependency-ordered sprints. Each sprint lists what it unblocks, so wide-reach/foundational work sits earlier even when it isn't the most exciting item.

---

## Sprint 0 — Unblock everything downstream

The narrowest, highest-leverage work. Nothing else in this plan can safely proceed past Phase 2 without this.

- **Kick off Phase 2 (shadow mode).** Wire `resolveTurnPrompt` alongside the existing assembly, compare outputs, log `shadow: true`. Zero user-visible risk. Runs ~7 days once started — start this as early as possible since it's calendar time, not effort, and every later phase (3a, 3b, 4, all new providers) waits on it.
- **Decide §9.7** (suspended/deleted member status filter — bundle into 3b or ship separate). Small decision, but Phase 3b can't be scoped cleanly until it's made.
- **Resolve the `prompt_types.tenant_id` schema conflict** in Supabase Studio. Doesn't block Phase 2, but blocks Phase 4 — cheap to resolve now while it's fresh, expensive to rediscover later.

*Unblocks: everything else in this document.*

---

## Sprint 1 — Prove the situational-slot pattern (cheap, real precedent)

- **Wire member-status into traffic cop rule 4.** The rung already exists, dormant. Guest vs. member picks a different slot. Cheapest real item on the whole list, and it's the first time the "a situation picks a slot" pattern gets exercised for real, not just scaffolded — de-risks every other situational rule that follows (mode, create-memory, etc.).

*Depends on: Phase 3a/4 being live enough for slot selection to matter (can be built/tested earlier, just won't do anything observable until then).*
*Unblocks: confidence in the pattern used by Memory Review's slot switch (Sprint 3) and any future situational rule.*

---

## Sprint 2 — Extend the provider contract for visible output

- **Add a chip/visible-output shape to the `ContextProvider` contract**, alongside the existing text-block shape (§5.5). This is infrastructure, not a feature — nothing user-facing ships from this sprint alone.

*Depends on: nothing new — can happen anytime after Sprint 0.*
*Unblocks: both items below. This is the widest-reach item on the list after Sprint 0 — two separate features are stalled behind it.*

---

## Sprint 3 — Memory Review routine

Corrected sequence (supersedes the earlier evaluate-before-save framing):
1. Member clicks "save memory" (existing manual trigger).
2. Memory runs through a **deterministic element checklist** and saves immediately — capture is never gated on review.
3. Checklist's computed gaps get surfaced as **prompt-chips** — optional, one per potential improvement.
4. Clicking a chip runs a scoped "improve" pass based on that specific gap.

Also explicitly supersedes the July 29 reversal of the original dedicated archivist prompt — this avoids that design's mistake (no silent rewriting, member-initiated) but is still a real evaluative step worth tracking as new, not a continuation.

**Open decisions, not yet made:**
- What's actually on the element checklist (deliberately deferred — worth its own short session)
- Hardcoded checklist vs. admin-editable (leaning editable, not decided)
- Does "improve" edit the saved memory in place, or create a comparable second draft?
- UI/UX for the whole routine — not designed, needs reconciling against the existing card-states/rewrite-flow UI

*Depends on: Sprint 2 (chips need the visible-output contract) for step 3–4. Steps 1–2 (checklist + immediate save) have no dependency and could start earlier if you want to decouple them.*

---

## Sprint 4 — NPS survey, traffic-cop-gated

- Build the deterministic gating provider: visit count, days since last survey, etc. — same shape as the "notifications" provider already sketched (§5.10).
- Decide the execution mechanism: tool call vs. marker, still open.

*Depends on: Sprint 0 only. Independent of Sprints 1–3 — can run in parallel if you have the capacity.*

---

## Sprint 5 — Inbound Chats visibility

- Build the actual UI (nothing renders today).
- Add the `compiledPromptId` → human-readable `prompt_set` name lookup.
- Show provider presence/status (checkmark-style, no PII, no full prompt text) plus which slot was used — always shown, not conditional on change (per your simplification).

*Depends on: Phase 3a (real data has to be flowing through the live audit record before there's anything to show).*

---

## Sprint 6 — Prompt caching

- Emit the prompt as separate static/dynamic segments the API can mark with `cache_control`, instead of one joined string.
- Bump the AI SDK version (current one predates stable `cache_control` support).

*Depends on: Phases 1–4 landed — the priority ordering that makes caching viable only exists once the traffic cop is actually live, not just built.*

---

## Sprint 7 — Prompt language review ("item 3")

- Review/rewrite the compiled-prompt language that references injected context (MEMBER CONTEXT, etc.) so prompts actually make good use of what's being delivered — not just receive it correctly. Phase 3b already flags this language as previously brittle.
- Editorial/craft work, not architecture — best done once the phases it's reacting to have stabilized.

*Depends on: Phase 3b shipped, so there's stable, real prompt language to review rather than a moving target.*

---

## Sprint 8 — Product knowledge, scoped down from full RAG

Original "product knowledge / context base" idea deliberately narrowed. Full RAG (semantic search over a growing document library) is explicitly **not** the starting point — `pgvector` is confirmed not installed on the live database, and there's no retrieval mechanism of any kind today. This sprint is the buildable baseline instead, sequenced deliberately: prove the manual version works before automating any of it.

**8a — Landing page copy → a provider.** The marketing copy (hero text, positioning, "how I work" cards) lives as static text in the Next.js codebase, not a database — small, rarely changes. Same shape as the existing `base-prompt` provider: find where it lives, inject it into the system prompt. No retrieval infrastructure needed.

**8b — Write the "how this works" knowledge document, manually, once.** Distinct from landing page copy: this is functional explanation ("how does saving a memory work," "what happens after account creation") that currently only exists as behavior in code, never written down in plain language. CC drafts from the actual implementation, Jeff reviews for accuracy. Done as a one-time, hands-on pass — not automated yet. This is the real bottleneck, not any plumbing.

**8c — Run it manually for a while before automating anything.** Update the doc by hand as the product changes, and pay attention to the actual workflow that produces a good update: what triggers noticing something changed, what gets checked, what "done" looks like. The goal of this stretch is to end up with a real, lived process to describe — not to guess at one up front.

**8d — Only once 8c has a working manual flow, hand it to an agent.** Describe the proven manual process as the agent's job, rather than designing the automation from scratch. New scope, not implied by 8a–8b: needs its own shape once it's time — what triggers a review (schedule? every merge? manual nudge?), what it's allowed to change unattended vs. flag for review, where the doc actually lives (repo file vs. `content` table vs. something else). All of that gets easier to answer honestly after 8c than before it.

**Once the doc exists and is real (after 8b):** whether it eventually needs full RAG (`pgvector`, chunking, semantic search) or can just stay injected directly like the landing page copy depends entirely on how long it grows to be — a page or two stays a simple provider; a real FAQ library is when retrieval earns its complexity. Not decided, and doesn't need to be yet.

*Depends on: nothing from Sprints 0–7 — fully independent, could start anytime. Internally sequential: 8a and 8b can run in either order or in parallel; 8c requires 8b done; 8d requires 8c actually run for a while, not just planned.*
*Unblocks: any future move to full RAG, since a real, current knowledge doc is the actual raw material retrieval would search over.*

---

## Suggested order if running these sequentially

0 → 1 → 2 → 3 → (4 in parallel with 2/3) → 5 → 6 → 7

Sprint 0 is non-negotiable first. After that, 1 and 2 are both cheap and independent of each other — either could go first. 4 doesn't depend on 1, 2, or 3, so it's a good candidate to run in parallel if there's more than one thread of work available.
