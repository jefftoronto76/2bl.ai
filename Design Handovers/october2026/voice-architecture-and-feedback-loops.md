# Voice Architecture: From Prompt Blocks to Feedback-Driven Flexibility

*Design reflection — capturing current direction, not a spec. Written to be revisited once search/lookup lands.*

## Where this started

Early framing of Sage's differentiation leaned on "legible knobs" — the idea that a founder should have discrete, addressable control over how an AI represents them, instead of the raw-textbox prompt editing most COTS tools offer. On paper, that's a fine pitch. In practice, held up against the actual architecture, it turned out to be too narrow a claim: a "knob" implies a fixed, enumerable set of levers. What's actually being built is closer to a **composable system** — and, more importantly, one meant to **improve from feedback over time** rather than only from manual editing.

## Where it actually is

The master prompt is not a single blob. It's **built in blocks, by block type**, with:

- **Inline callers** — blocks that can invoke logic inline rather than just supplying static text
- **Tools** — a working set that handle specific, well-scoped behaviors today
- **More deterministic tooling** — in progress, moving certain behaviors from "the model infers this from prompt text" to "this is resolved by code, reliably, every time"
- **Robust lookup/search** — landing this weekend; the retrieval layer that block composition and tool calls will lean on

Separately, at the data layer, `master_prompt_history` already gives versioning/diffability, and single-purpose tables like `do_not_engage` show the pattern of pulling one clear behavior out of prose and into structured, addressable data. The direction is consistent: fewer things live as buried instructions inside a paragraph; more things live as composable, individually-testable units.

## The reframe: knobs → flexibility

"Knobs" imprecisely described this. A knob is something a person manually finds and turns. What block composition + tools + deterministic logic + lookup actually buys is **flexibility** — the ability to change *how* a given situation is handled (swap a block, add a tool, make a previously-inferred behavior deterministic) without re-litigating the whole prompt. That's a more accurate and more defensible claim than "you get fine-grained dials," because it's about the *system's capacity to be reshaped* rather than the *number of dials exposed*.

## The harder, more interesting piece: feedback loops

The part of this that matters most isn't the composition architecture — it's what sits on top of it: **an LLM's actual leverage is that it can be told, repeatedly, what was good and what was bad, and apply that going forward** — provided that's paired with clear goals and a way to know when a goal was actually achieved. That combination (feedback + goal clarity + goal-achievement signal) is what turns "a well-composed prompt" into something that keeps getting better without every improvement being a manual edit.

This is also, honestly, the least solved part of the system right now. Block composition and deterministic tooling are engineering problems with known shapes. A feedback loop that reliably shifts future behavior — without drifting off-voice, without one correction quietly breaking an unrelated behavior — is a much less mature problem, for Sage and for the field generally. It's reasonable that this is the part that "gets" you: it's where the payoff is highest and the tooling is thinnest.

## Open questions worth sitting with

- What does a "feedback signal" concretely look like once lookup/search lands — a flagged transcript turn, a structured correction, something else?
- Does a correction become a new block, an edit to an existing block, or a signal that adjusts something more like weighting/selection among existing blocks?
- How do you tell the difference between "this correction generalized well" and "this correction just patched one transcript and didn't stick"?
- Is goal-achievement tracked anywhere today, or is that itself part of what needs building alongside the feedback mechanism?

None of this needs answering now — it's here so the direction (and the gap) is legible the next time this gets picked back up.
