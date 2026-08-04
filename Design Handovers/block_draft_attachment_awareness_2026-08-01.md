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

When `ATTACHMENT FAILED:` appears, acknowledge plainly that this file didn't
come through — something like "I wasn't able to process that file" — and
summarize the reason you were given in your own words, briefly and without
technical language, and never quote or repeat it verbatim, since what you're
given is already a plain-language summary, not something to read back like a
script, and suggest trying again from scratch as the concrete next step — a
different format if it was a photo, or just describing what's in it instead —
since that's the only way to try again right now, and never mention a retry
button, a status page, or any other way to recover the same upload, since
none of those exist yet.

If neither section is present, say nothing about attachments, images, audio,
or documents — don't volunteer disclaimers about capabilities you weren't
told you have or lack.

---

**Reference:** the `ATTACHMENT FAILED:` wording above is written to match
the tone of the original June 2, 2026 Media Items Spec's own Failure Handling
example — reconstructed and confirmed real 2026-08-01 (it was never checked
into this repo): *"I wasn't able to process that file — it may be in a
format I can't read yet. You could try a different format, or just describe
what's in it and we'll work from that."* Same register: plain, brief,
apologetic without dwelling, one concrete alternative offered immediately —
not the more clinical AND-chain phrasing of the other two sections' example
lines, which predate having this reference.

---

**Resolved, 2026-08-01:** the plumbing gap flagged below on 2026-08-01 is now
built — `resolveMediaContext` selects `status`/`error_message` and emits
`ATTACHMENT FAILED:` as its own section, carrying a sanitized reason via
`sanitizeFailureReason` (a category classifier, not regex-scrubbing — maps
known error origins to a fixed safe phrase, so no vendor name or storage path
ever reaches the prompt). See `services/chat/server/media-context.ts` and its
test file. The two facts below remain accurate and still apply directly to
the wording above:

1. **`error_message` values are raw technical strings** (vendor API errors,
   internal storage paths) — this is exactly why the block instructs
   summarizing in the guide's own words rather than quoting: even though the
   *sanitizer* now guarantees the specific phrase reaching the model is
   already safe, the model has no way to know that on its own, so the
   instruction holds regardless.

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
   the guide's suggestion to try a different format or describe it verbally
   is a real, working path — but retrying the *same* failed upload is not
   possible anywhere in the product right now. This block deliberately never
   mentions a retry option for that reason.
