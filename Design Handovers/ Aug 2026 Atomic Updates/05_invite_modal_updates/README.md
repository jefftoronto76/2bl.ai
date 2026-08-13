# Phase 5 — Invite modal: create/copy flow, custom greeting, member roster, invalidation alert

Source: `production-reference/chat-widget-canvas.jsx` (the `InviteModal` component), `production-reference/icons.jsx` (adds one icon, see below). Builds on `02_invites_collaboration` — read that first for the story picker and the z-index fix; this package covers everything added to the same modal since.

## What changed, in the order you'd hit it

**1. Creating the link is now a deliberate second step, not automatic.** Opening the modal no longer hands you a link immediately. The magic-link row at the bottom reads "Not created yet" with a **Create** button. Nothing is generated until you click it. Once you do, that button's spot is replaced by **Copy**, and the expiry / "Reset link" row appears underneath it for the first time. Reset link (once a link exists) regenerates it the same way Create did the first time — same underlying action, different label because the context is different.

**2. A custom greeting field.** Below the story picker, there's now a plain text area labeled "Custom message" — a personal note the story's owner can add that goes out with the invite. It has no length limit in this prototype and no character counter.

**3. The "already invited" list is now "Existing members," and every row is someone who's already joined.** There used to be a live count next to the section header ("1 joined · 2 pending") and a mix of "joined"/"pending" badges per person. Both are gone. The header is now just the label, no count. There's no "pending" state left to show at all — the mock roster is three people who have all joined, and each row's badge is now a plain sentence: **"Joined [date] · [N] memories"** (singular "memory" when it's exactly one), replacing the old status word.

**4. Changing the story or the custom message after a link already exists now asks first.** Before this, editing either field once a link was live either changed nothing about the link (leaving you with a link and copy that quietly disagreed) or silently blanked the link back to "not created" depending on which build you were looking at. Now, doing either while a link exists pops a small warning dialog on top of the invite modal:

> **This will invalidate the current link**
> Anyone holding the existing magic link will no longer be able to use it to join. You'll need to share the new link once it's created.

with **Cancel** (closes the warning, the edit never happened — the field's value is untouched) and **Continue** (applies the edit, the old link is invalidated and the magic-link row drops back to the "Not created yet" / Create state from step 1). If there's no link yet, editing either field is instant, same as always — the warning only appears when there's something real to lose. The warning reuses the same visual style as the rest of the app's confirmation dialogs (icon in a soft accent circle, heading, one line of body copy, two right-aligned buttons) — it uses the accent color, not a red/destructive one, since nothing is being deleted, just invalidated.

## Known-knowns
- The story picker itself, and the fact that switching stories re-labels the modal's intro copy, are unchanged from `02_invites_collaboration` — this package only changes what happens to the *link* when you do that.
- The magic-link mechanics underneath — the token format, the 7-day expiry countdown, copy-to-clipboard — are unchanged. Create and Reset link both call the exact same regeneration logic; only the button's label and the row's prior state differ.
- The new warning dialog is local to the invite modal only. It does not touch or reuse the app's delete-confirmation dialog, even though they look similar by design.

## Unknown-knowns
- Whether the custom message is meant to actually get sent/attached to a real invite, or is prototype-only decoration, still hasn't been settled (carried over from `02_invites_collaboration`).
- Whether the same "this will invalidate your link" warning should also apply to hitting Reset link directly — right now it doesn't, on the reasoning that "Reset link" already says what it's about to do in its own label. Worth confirming that reasoning holds.
- The roster is still invented sample data (three people, all joined, made-up dates and memory counts) — there's no real system yet for tracking who's actually joined a story or how many memories they've added. Nothing here should be assumed to match how that would really be modeled or stored.
- Whether invalidating a link should also revoke it somewhere real (so the old URL truly stops working) or is purely a UI state change until a new one is created, is not answered by this prototype.
