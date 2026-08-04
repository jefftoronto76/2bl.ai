# Sage Prompt & Marker Architecture — Review Status
**Second Brain Labs · Session July 11, 2026**

---

## Marker Architecture — Field Guide (11 Rules)

| # | Rule | Status | Implementation Path | Notes |
|---|------|--------|-------------------|-------|
| 01 | Prefer native tool calling over in-band markers | **TODO** | CC | `ACCOUNT_CREATE` + `STORY_SAVED` are strong tool call candidates. Audit each marker. |
| 02 | XML-style tags vs bracket notation | **TODO** | Compiler | Whole prompt wrapped in XML already. Bracket notation workable for now. Revisit after Rule 01 decision — moot if those markers move to tool calls. |
| 03 | Consolidate all marker rules into one output format block, compiled last | **INFLIGHT** | Compiler | Compiler must enforce single output format block ownership. Scattered `ACCOUNT_CREATE` rules being consolidated. Check Composer prompt post-cutover. |
| 04 | Objective emission conditions — eliminate subjective triggers | **INFLIGHT** | Compiler | Compiler should lint for subjective language and warn operators. Worth audit pass after Sunday cutover. |
| 05 | AND-chained condition sequences + few-shot examples | **INFLIGHT** | Compiler | Compiler output format block template should enforce AND-chain structure. Worth investigating tightness post-cutover. |
| 06 | Markers on their own line, silent — no surrounding prose | **TODO** | Manual | Simple one-line addition to output format block. |
| 07 | Few-shot examples in output format block (incl. negative examples) | **TODO/INFLIGHT** | Compiler | Compiler should prompt/require operators to supply positive + negative examples per marker. |
| 08 | ≤5 markers per compiled prompt — split by prompt type | **INFLIGHT** | Compiler | Compiler enforces marker count limit, surfaces count visibly. Sunday work — traffic cop / prompt-type split. |
| 09 | Buffered state machine parser (not per-chunk regex) | **TODO** | CC | May already be built — CC investigation needed before assuming new build required. |
| 10 | Graceful degradation + fallback for business-critical markers | **INFLIGHT/PARTIAL** | CC | `ACCOUNT_CREATE`: turn-count CTA is client-side heuristic fallback — confirm still wired. `STORY_SAVED`: user-initiated save icon covers gap. Combine with Rule 09 CC investigation. |
| 11 | Trailing salience reminder at end of output format block | **TODO** | Compiler | Not in current docs — gap identified July 11. Compiler should auto-append trailing reminder as final line of output format block. Source: arXiv:2603.23530. |

---

## Top 10 System Prompt Guidelines (+ 1 new)

| # | Guideline | Status | Implementation Path | Notes |
|---|-----------|--------|-------------------|-------|
| 01 | Fixed section order at compile time (Identity → Knowledge → Guardrails → Process → Output Format) | **DONE** | Compiler | Compile order locked. |
| 02 | Cap active guardrails at five | **DONE** | Compiler | Guardrail count surfaced visibly in authoring UI. |
| 03 | Replace every negative instruction with a positive one | **DONE** | Compiler | Compiler lints for negative instructions, prompts rewrite. |
| 04 | Make every trigger objective and countable | **DONE** | Compiler | In the system prompt. Compiler should enforce objective trigger language. |
| 05 | Treat formatting as a reliability variable — one delimiter style throughout | **INFLIGHT** | Compiler | Compiler enforces consistent delimiter style across all blocks. Needs investigation to confirm consistency across compiled output. |
| 06 | One job per prompt | **INFLIGHT** | Compiler | Compiler enforces prompt-type separation. Traffic cop / Sunday work. |
| 07 | One block owns one behavior | **DONE** | Compiler | Compiler detects + flags when two blocks reference the same marker or behavior. |
| 08 | Build eval loop before adding prompt complexity | **INFLIGHT/TODO** | CC + Compiler | Large task — 3+ days. Part of rubric and Admin Intelligence Phase 3 work. |
| 09 | Use the model to audit its own prompt — with a rubric | **INFLIGHT** | Compiler | Rubric + UI work. ~0.5 days. Compiler calls audit on compile. |
| 10 | Treat prompt injection as an architectural problem | **INFLIGHT** | Architectural | Prompt block added. CC investigation needed: scope data access, isolate untrusted input, confirm no exfiltration channel. |
| 11 | Prompt block for handling frustrated/distressed members — warm, human response | **TODO** | Manual | Dedicated guardrail/process block. Should feel human. Tie to Chat 07.3 warm error copy. |

---

## Top 12 Chat Implementation Guidelines (+ 1 new)

| # | Guideline | Status | Implementation Path | Notes |
|---|-----------|--------|-------------------|-------|
| 01 | Streaming + intelligent scroll anchoring | **TODO** | CC | |
| 02 | Local persistence + resumable streams (IndexedDB, not localStorage) | **TODO** | CC | |
| 03 | Mobile virtual keyboard — iOS safe area + VisualViewport JS fallback | **INFLIGHT** | CC | Was implemented, believed to be broken. Needs investigation + fix. |
| 04 | Explicit error states — 4 distinct classes, inline not toast | **TODO** | CC | |
| 05 | Buffered streaming markdown renderer | **TODO** | CC | |
| 06 | ARIA live regions (role=log, aria-live=polite, debounced) | **TODO/INFLIGHT** | CC | |
| 07.1 | Cognitive load — 18px minimum font size | **TODO** | CC | Not currently implemented. Would love to do this. |
| 07.2 | Cognitive load — 48px minimum touch targets | **TODO/INFLIGHT** | CC | Maybe in place — needs verification. |
| 07.3 | Cognitive load — warm error copy, no jargon | **TODO** | Manual + CC | Not done. Ties to Prompt Guideline 11. |
| 08 | Delivery state indicators — 3-tick model + tap-to-resend on failure | **TODO** | CC | |
| 09 | Stop generation + one-click retry/regenerate carousel | **TODO** | CC | |
| 10 | TTFT baseline measurement + production monitoring | **TODO** | CC | |
| 11 | Constrain the Composer — non-technical operators need structure not flexibility | **TODO** | Compiler | |
| 12.1 | Signal uncertainty — prompt block (ground responses, flag inferences, no false confidence) | **INFLIGHT** | Manual | Guardrail/process block to be written. Pairs with Prompt Guideline 11. |
| 12.2 | Signal uncertainty — UI confirmation step before saving in Editor flow | **TODO** | CC | "Does this sound right?" confirmation before STORY_SAVED commits to storage. |
| 13 | Thumbs up / thumbs down feedback on AI responses | **TODO** | CC | Per-message feedback UI. Part of Composer UX sprint. Feeds into eval loop (Prompt Guideline 08) and block suggestions. |

---

## CC Investigation Items (queued)
- **Marker Rule 09 + 10:** Check streaming client for existing state machine parser; check `handleSessionFinish` for existing fallback handlers; confirm turn-count CTA is still active; confirm review pipeline is wired.
- **Prompt Guideline Rule 10:** Architectural injection audit — (1) confirm member data access is scoped to current task only; (2) confirm user input is isolated from trusted system context in context window construction; (3) confirm no exfiltration channel exists (external URLs, email sending, data export paths accessible to model).
- **Chat Guideline 03:** Mobile virtual keyboard — investigate what was previously implemented, identify what broke, and fix. VisualViewport API + iOS Safari safe area. Verify on real iOS Safari at 390px.

## Sunday Dependencies
- Marker Rule 08 + Prompt Guideline 06: Prompt-type split — traffic cop / Success agent design + implementation
- Composer Prompt Set cutover → enables post-cutover audit of Marker Rules 03, 04, 05
