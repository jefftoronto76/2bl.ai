# Known-knowns / unknown-knowns \u2014 Media handover

## Known-knowns (decided, built, confirmed working)
- Media is independent of chat: the standalone page (Sidebar \u2192 "Media") shows every file across the account/stories, not scoped to any one conversation. Confirmed via live click-test.
- A separate in-chat Media panel (chat header icon, next to the bookmark/Memories icon) exists and IS scoped to the current session \u2014 a deliberately different, narrower view from the standalone page.
- "Add to memory" is a self-contained slide-in panel from the right of the Media page itself (reusing `SessionMemoriesPanel`'s select-multiple surface) \u2014 it does NOT hand off to the chat drawer. Confirmed via scoped click-test after an earlier wiring mistake was caught and fixed.
- Delete requires a confirmation dialog (reused `ConfirmDeleteModal`, generalized with `heading`/`body`/`confirmLabel` props).
- Card layout is a flex-wrap container (not CSS grid) so columns scale by available width; container capped at 780px, tuned so exactly 3 columns show at max width.
- Upload action in the Media page header is an explicit stub (toast only) \u2014 no upload flow built yet.
- Edit action per card is an explicit stub (toast only).

## Unknown-knowns (flagged gaps, not yet verified or decided)
- **Mobile visual verification is incomplete.** The layout code has no mobile-specific exclusions and should render responsively (see stage 4), but this has not been confirmed with an actual screenshot \u2014 the device-frame mobile prototype nests an iframe that our screenshot tooling can't capture through. Needs a manual check.
- **No real data model.** `SEED_MEDIA_ITEMS` is hardcoded mock data (id, type, filename, status, classification, size, date, optional sessionId/derived_content/photoSrc). There is no schema decision yet for how this maps to a real backend \u2014 that mapping is not part of this handover.
- **Download button was removed** per explicit request (not a gap, but flag for the next person: production's real `MediaGallery.tsx` (main branch) DOES have a Download button \u2014 this prototype deliberately diverges here now).
- **In-chat panel and standalone page share one "Add to memory" panel implementation** (`SessionMemoriesPanel` in select mode, rendered as a right-side overlay from within `MediaItemsList`). Whether that's the right long-term architecture (vs. two distinct flows) hasn't been discussed \u2014 flagging so it isn't assumed settled.
- **Retry/processing state transitions are simulated with `setTimeout`**, not any real polling/webhook \u2014 fine for a prototype, but not a functional spec.
