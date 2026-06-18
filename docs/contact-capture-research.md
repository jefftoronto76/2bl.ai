# Contact Capture — Research Report

> Read-only investigation as of 2026-06-18. No changes proposed.

---

## 1. Where Capture Lives

**Primary file:** `services/crm/session.ts` (~555 lines)
**Called from:** `services/chat/server/index.ts` — inside the Vercel AI SDK `onFinish` callback

Every time an assistant turn completes, `streamChat()` calls:

```typescript
onFinish: async ({ text, usage }) => {
  await handleSessionFinish({ sessionId, text, usage, visitorText: lastVisitorText })
}
```

`lastVisitorText` is the visitor's own typed message — extracted from the conversation before the turn starts and threaded through so the server can scan it for contact info independently of Sage's reply.

---

## 2. How AI Is Used

**There is no separate AI extraction call.** Claude IS the mechanism.

Capture is instruction-driven via the system prompt. `DEFAULT_SYSTEM_PROMPT` in `services/prompt/sage-prompt.ts` contains this block:

```
Capturing contact details:
- The first time a visitor tells you their first name, append a hidden marker on its own
  line at the very end of that message: [NAME: firstname]. Use the first name only,
  properly capitalized.
- The first time a visitor shares their email address, append a hidden marker on its own
  line at the very end of that message: [EMAIL: address]. Use the exact address they gave.
- The first time a visitor shares their phone number, append a hidden marker on its own
  line at the very end of that message: [PHONE: number]. Use the exact number they gave.
- Exception: if a MEMBER CONTEXT block is present in your context and provides a name,
  email, or phone number, emit the corresponding hidden marker(s) in your very first reply...
- These markers are stripped out before the visitor sees your reply. Never explain them,
  never repeat them in prose, and never ask for a name, email, or phone solely to emit
  a marker...
```

Claude appends `[NAME: firstname]`, `[EMAIL: address]`, or `[PHONE: number]` to its response whenever those values appear in the conversation. Server-side code then extracts them with regex and writes them to the DB.

This is structurally equivalent to a native Anthropic tool call — Claude signals structured data via a bracket protocol; the server executes the side effect — but implemented entirely in text rather than the SDK's typed `tools` mechanism.

---

## 3. Markers + Regex Fallback

Capture runs in two sequential paths per field with short-circuit logic:

### Path 1 — Marker detection (primary)

Scans Sage's reply for bracket markers emitted per system prompt instructions.

| Marker | Function | Extraction regex |
|--------|----------|-----------------|
| `[NAME: firstname]` | `detectVisitorNameMarker(text)` | `/\[NAME:\s*([^\]]*)\]/` |
| `[EMAIL: address]` | `detectVisitorEmailMarker(text)` | `/\[EMAIL:\s*([^\]]*)\]/` |
| `[PHONE: number]` | `detectVisitorPhoneMarker(text)` | `/\[PHONE:\s*([^\]]*)\]/` |

Post-extraction transforms:
- Name → titlecase; rejected by `isPlausibleName` (length 2–30, `/^[A-Z][a-zA-Z'-]+$/`, rejects EMPTY/NONE/UNKNOWN/VISITOR/USER)
- Email → lowercase; rejected by `isPlausibleEmail` (length 6–254, `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
- Phone → verbatim trim; rejected by `isPlausiblePhone` (length ≥7, must contain a digit)

### Path 2 — Regex watcher (fallback)

Scans the visitor's own typed message (`visitorText`). Only runs for a field if the marker path did not produce a successful DB write for that field.

| Field | Function | Notes |
|-------|----------|-------|
| Email | `detectEmailInText(text)` | `/[^\s@]+@[^\s@]+\.[^\s@]+/` → lowercase, strip trailing punctuation |
| Phone | `detectPhoneInText(text)` | `/\+?\d[\d\s().-]{6,}\d/` → normalized to E.164 |
| Name | `detectNameInText(text)` | `/(?:my name is|name's|call me|this is)\s+([A-Za-z][a-zA-Z'-]*)/i` |

Phone E.164 normalization:
- 10 digits bare → `+1{digits}`
- 11 digits starting with `1` → `+{digits}`
- Leading `+` → validate 8–15 digits, keep as-is
- Anything else is rejected

Name fallback runs only after the marker path finds nothing. Email and phone fallbacks each run only if their respective marker path returned `false` (no write occurred).

### Short-circuit logic

```typescript
const emailCaptured = await tryEmailMarker(text)    // returns true = wrote, false = skipped/failed
const phoneCaptured = await tryPhoneMarker(text)    // same

if (visitorText) {
  if (!phoneCaptured) await tryPhoneFallback(visitorText)
  if (!emailCaptured) await tryEmailFallback(visitorText)
}
```

Once a field is written to the DB, neither path can overwrite it — the persist helpers self-guard via a `SELECT` before writing.

---

## 4. DB Writes

**Table:** `chat_sessions`

| Column | Written by | Notes |
|--------|-----------|-------|
| `visitor_name` | `persistVisitorName(sessionId, name)` | Marker-only; no free-text fallback for name in practice |
| `email` | `persistVisitorEmail(sessionId, email)` | Marker or free-text fallback |
| `phone` | `persistVisitorPhone(sessionId, phone)` | Marker or free-text fallback; E.164 from regex path, verbatim from marker path |

All three persist functions follow the same pattern:
1. `SELECT` the existing value for the session
2. If already set, return `false` (no overwrite)
3. `UPDATE chat_sessions SET <column> = $value WHERE id = sessionId`
4. Return `true` on success, `false` on error

The service-role Supabase client bypasses RLS for these writes. All three columns are `text, nullable` — added progressively in 2025–2026; the anonymous write path is unaffected for sessions created before the columns existed.

---

## 5. Distance from Native Tool Calls

The current implementation is a **hand-rolled equivalent** of Anthropic's native tool call mechanism. Here is the mapping:

| Anthropic native tool call | Current implementation |
|---------------------------|----------------------|
| `tools: [{ name, description, input_schema }]` | System prompt text instructions for marker syntax |
| Claude returns `tool_use` content block with structured JSON | Claude appends `[NAME: x]` / `[EMAIL: x]` / `[PHONE: x]` to its text reply |
| `onFinish` receives `toolCalls` array | `onFinish` receives raw `text`; regex extracts values |
| SDK validates input against `input_schema` | `isPlausibleName` / `isPlausibleEmail` / `isPlausiblePhone` validate manually |
| Tool result sent back in next turn (if needed) | One-way — no acknowledgement turn |
| Streamed as a distinct content type | Appended inline to prose; registry strips them from display |

### What would change for a native tool call migration

1. **`services/chat/server/stream.ts`** — add `tools` array to the `streamText()` call:
   ```typescript
   tools: {
     capture_name: { description: '...', parameters: z.object({ name: z.string() }) },
     capture_email: { description: '...', parameters: z.object({ email: z.string() }) },
     capture_phone: { description: '...', parameters: z.object({ phone: z.string() }) },
   }
   ```

2. **`services/chat/server/index.ts`** / `onFinish` — switch from scanning `text` for markers to reading `toolCalls` from the `onFinish` result.

3. **System prompt** — remove the bracket marker capture instructions; the tool descriptions replace them.

4. **`services/crm/session.ts`** — the `detect*Marker` functions would become unnecessary; the persist helpers stay unchanged.

5. **`services/chat/ui/v1/registry.ts`** — `NAME_MARKER`, `EMAIL_MARKER`, `PHONE_MARKER` marker definitions (dispatch `'server'`) would be retired; the client-side strip pass for those markers would no longer be needed (tool call content is never streamed into prose).

6. **Free-text regex fallback** — would likely stay as a belt-and-suspenders layer for values the visitor types without Claude extracting them via a tool call.

The `dispatch: 'server'` architecture in the marker registry already anticipates this separation — it just implements it in text rather than SDK types.

---

## 6. Full Code Path: Member Message → Name Captured → DB Written

```
Visitor sends message
        │
        ▼
POST /api/sage/route.ts
  → resolves tenant from Host header
  → calls streamChat(req) [services/chat/server/index.ts]
        │
        ▼
streamChat()
  → normalizes conversation messages
  → captures lastVisitorText = last user-role message content
  → fetches system prompt, booking cards, member primer in parallel
  → calls runChatStream({ ..., onFinish }) [services/chat/server/stream.ts]
        │
        ▼
runChatStream()
  → calls Vercel AI SDK streamText({
       model: anthropic('claude-sonnet-4-6'),
       system: <compiled system prompt with marker instructions>,
       messages: conversationMessages,
       onFinish: async ({ text, usage }) => { ... }
     })
  → streams tokens back to client
        │
        ▼
Claude generates response
  → sees "Capturing contact details" block in system prompt
  → visitor said "My name is Sarah" → appends [NAME: Sarah] at end
  → streams response tokens
        │
        ▼
Stream completes → onFinish fires
  → calls handleSessionFinish({
       sessionId,
       text: "<full assistant reply including [NAME: Sarah]>",
       usage: { inputTokens, outputTokens },
       visitorText: "My name is Sarah"
     })
        │
        ▼
handleSessionFinish() [services/crm/session.ts]
  1. Guard: sessionId is null? return early
  2. persistTokenUsage (always)
  3. scanForCalendarOffer(text) → persistCalendarOffered if hit
  4. detectVisitorEmailMarker(text) → null (no [EMAIL:] in reply)
     emailCaptured = false
  5. detectVisitorPhoneMarker(text) → null (no [PHONE:] in reply)
     phoneCaptured = false
  6. visitorText exists:
     - !phoneCaptured → detectPhoneInText("My name is Sarah") → null
     - !emailCaptured → detectEmailInText("My name is Sarah") → null
  7. SELECT visitor_name FROM chat_sessions WHERE id = sessionId
     → null (not yet set)
  8. detectVisitorNameMarker(text)
     → regex /\[NAME:\s*([^\]]*)\]/ matches "[NAME: Sarah]"
     → extracted: "Sarah"
     → titlecase: "Sarah"
     → isPlausibleName("Sarah") → true
     → persistVisitorName(sessionId, "Sarah")
          → SELECT visitor_name WHERE id = sessionId → null
          → UPDATE chat_sessions SET visitor_name = 'Sarah' WHERE id = sessionId
          → returns true
     nameCaptured = true
  9. visitorText && !nameCaptured → skipped (nameCaptured = true)
        │
        ▼
chat_sessions.visitor_name = 'Sarah'
```

### Client-side strip (parallel, separate path)

While the server runs `onFinish`, the streamed tokens have already reached the client. The client-side registry (`createDefaultRegistry()`, used by `SageReply` / `parseBookingCards`) strips `[NAME: Sarah]` from the displayed prose before render — the marker is never shown to the visitor.

---

## 7. Summary

| Dimension | Current approach |
|-----------|-----------------|
| AI role | Claude emits bracket markers per system prompt instructions — no separate extraction call |
| Marker detection | Regex on the full assistant reply inside `onFinish` |
| Fallback | Regex scan of the visitor's own message, field-by-field, short-circuited by marker success |
| DB writes | `persistVisitorName/Email/Phone` → `chat_sessions.visitor_name/email/phone`; self-guarded |
| Client display | Registry strips server-dispatch markers from prose; visitor never sees them |
| Architecture gap vs. native tools | SDK validation, typed tool_use blocks, and model-managed tool selection vs. hand-parsed text |
