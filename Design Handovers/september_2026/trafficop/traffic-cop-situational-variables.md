# Situational variables — addition to the Traffic Cop design

Design work from a Sept 11 session that was never written into a document.
Extends section 5.4 (Job #1 — deterministic slot selection) and section
5.6 (priority tiers) of traffic_cop_design_2026-09-05.md. This is the
answer to "what does the traffic cop actually branch on" beyond the five
rules already in the design doc.

---

## The 11 deterministic variables

Always-resolvable fields — each one is a real `if/else`-able fact, not a
summary the model would have to generate. Grouped by what they measure:

**Temporal**
1. Time of day
2. Day of week
3. Days since last visit

**Identity / state**
4. Name (if known)
5. Status — member vs. visitor
6. Tenant / surface (which product: Heirloom, jefflougheed.ca, future tenants)
7. Entry point — how they arrived (organic, invite link, referral)

**History / engagement**
8. Visit / session count (numeric) — e.g. "this is their third session"
9. In-session message count — e.g. "3 exchanges in"
10. Last milestone reached — the furthest state this person has hit
    (account created, story started, booking made) — a lookup, not a summary
11. Current thread/story state — in-progress story status
    (active / on_hold / closed)

One explicit non-variable, decided the same session: "what did we recently
discuss" fails the trigger-objectivity test (Top 10 doc) — it's a summary
a model would have to generate, not a fact you look up. The resolvable
version of "recency of content" is #10 (last milestone) or "last prompt
type served," not a narrative summary.

## Story name vs. session history — different jobs

Two things that look similar but aren't interchangeable:

- **Session/visit history** (count, recency, milestones) — a decision
  variable. What the traffic cop branches on to pick a prompt slot or an
  injected instruction. Countable, comparable, passes the if/else test.
- **Story name** — content, not a decision variable. Never `if story_name
  == X`. It's something the model needs to know and reference ("let's get
  back to 'My Trip to Italy'") — injected context, carried along once a
  slot is picked, not something that picks the slot.
- **The one exception:** story *status* (#11 above) genuinely is a
  decision variable — "resume an active story" vs. "this one's closed,
  ask if they want a new one" is a real branch.

## Launch context — one pattern, not three link-handling systems

A link carries a token. The token resolves to a payload. The payload
feeds the traffic cop. That's the whole pattern, and three things
collapse into it instead of needing separate handling:

- **Invite link** → resolves to member identity + primer (already built)
- **Story collaborator link** → resolves to story-scoped access (stub, V1)
- **On-page CTA link** → resolves to a conversational objective
  ("this button said 'Ask about pricing,' open the chat already knowing
  that's the topic")

A CTA link's payload is a fixed, pre-authored objective (one config per
link, set once when the page is built) — closer to a manual annotation
than a decision variable. Open question, not yet decided: does a CTA
link's payload stay fixed-per-link, or does it ever need to carry
something dynamic (e.g. which article the visitor was reading)?
Fixed-per-link is a simple lookup table; dynamic is a different, bigger
shape.

## NPS — a real correction worth keeping

The decision of *when* to fire the NPS survey is 100% traffic cop, 0%
model discretion — not a tool the model decides to call on its own
judgment. Same shape as the "notifications" provider already scoped in
the design doc's section 5.10: a deterministic condition (visit count
crosses a threshold, no survey shown in the last 30 days, whatever
criteria are chosen) computed every turn, and when true, injects an
unambiguous instruction — "Launch the NPS survey now," not a suggestion.
The *execution* (rendering the survey UI, capturing the response) is
still probably tool- or marker-shaped; the *decision of when* is not.

## Still open

- Whether CTA-link payloads are ever dynamic, not just fixed-per-link.
- Prompt pills — raised at the end of the Sept 11 session, not yet
  designed.
