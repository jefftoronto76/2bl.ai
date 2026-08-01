# Draft block — Attachment Awareness (Heirloom)

**Status:** draft, not yet in Blocks. For Jeff's review before pasting into
Prompt Studio.

**Why this exists:** the media processing plumbing (`ATTACHED MEDIA:` /
`ATTACHMENT IN PROGRESS:`, injected by `services/chat/server/media-context.ts`
into the system prompt) has been live since PR #241 (2026-07-31), but no block
in Heirloom's compiled prompt tells the guide what those sections mean or how
to react to them. Confirmed via codebase search — zero mentions of
image/photo/attachment/upload/vision anywhere in `services/prompt/` or the
fallback `DEFAULT_SYSTEM_PROMPT`. Without an instruction, the guide falls back
to a generic capability disclaimer ("Images aren't something I can see just
yet") whenever it notices attachment-shaped content it wasn't told how to use.

**Suggested title:** Attachment Awareness (Photos, Audio, Documents)

**Suggested type:** `process` (compiles 3rd, after guardrail/identity —
consistent with it being about how to react in the moment, not a hard
constraint on behavior)

**Suggested body** (matches the AND-chain / positive-instruction style the
MEMBER CONTEXT block uses — conditional on a labeled section being present,
chained instructions, no bare "don't" lists):

---

When `ATTACHED MEDIA:` appears in your context, treat its contents exactly as
if you had seen the photo, heard the recording, or read the document
yourself, and reference specific details from the caption, transcript, or
extracted text naturally in your reply, and never say you can't see images,
hear audio, or read documents — by the time this section is present, the
content has already been captured and described for you.

When `ATTACHMENT IN PROGRESS:` appears instead, acknowledge naturally that
you've received it and are still taking it in, and keep the conversation
moving on whatever the visitor already said rather than stalling to wait on
it, and never promise a specific amount of time before you'll have looked at
it — you have no way to know how long that will actually take.

If neither section is present, say nothing about attachments, images, audio,
or documents — don't volunteer disclaimers about capabilities you weren't
told you have or lack.

---

**Open question for Jeff:** whether "attachment IN PROGRESS forever" should
also be called out (a permanently-`failed` item still reads as "still
processing" to the model today — see the media-pipeline race fix in this same
branch; once that's out, stuck-in-progress items should become rarer, but the
prompt has no way to distinguish a slow item from one that's actually failed,
since `resolveMediaContext` only ever emits `ATTACHMENT IN PROGRESS`, never an
explicit failed state). Left out of this draft since it's a plumbing gap, not
a wording gap — flagging in case you want it addressed together.

**Confirmed, 2026-08-01 (following up on the open question above):**

1. **`resolveMediaContext`'s query doesn't select `error_message` or `status`
   at all** (`services/chat/server/media-context.ts:35-42` — selects only
   `id, original_filename, type, derived_content`). It's not just that failed
   and processing collapse into the same wording — the code has no access to
   *why* something failed even if it wanted to say so. Building the
   failed-item distinction means adding both columns to the select and
   branching failed items into their own section carrying the real
   `error_message`, not a generic flag — so the guide is simplifying a true
   reason rather than inventing a plausible one. One catch for whoever builds
   that: today's `error_message` values are raw technical strings (vendor API
   errors, internal storage paths) — they'd need sanitizing or an explicit
   "summarize, don't quote" instruction before injection, not straight
   pass-through.

2. **There is no retry mechanism a member can actually reach today.**
   `MediaGallery.tsx` (the component with the working "Try again" →
   `POST /api/media/{id}/retry` button) is not imported or rendered anywhere
   except itself — verified by a repo-wide search. The only door to it,
   `SidebarV2`'s "Media" nav button (`onMedia` prop), is never wired: both
   places `SidebarV2` is mounted (`ChatHero.tsx`, desktop + mobile) omit
   `onMedia`, so the button renders permanently disabled. The only thing a
   member actually sees on a failed attachment is `MessageList.tsx`'s inline
   "Processing failed" badge — a label, no button, no action. Re-attaching a
   fresh file is always available (no lockout tied to a prior failure), so
   the guide's spoken suggestion to try a different format or describe it
   verbally is a real, working path — but retrying the *same* failed upload
   is not possible anywhere in the product right now. Don't write this block
   (or plan the failed-item follow-up) assuming a fallback retry UI exists to
   point the member toward — there isn't one yet.
