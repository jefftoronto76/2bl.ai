# Media \u2014 handover package

Four atomic stages, each independently reviewable, covering the Media feature built this session: a standalone top-level page (Sidebar \u2192 "Media") plus an in-chat panel (chat header icon), both backed by one shared implementation in `production-reference/chat-widget-canvas.jsx`.

## Stages
1. `stage-1-media-page-layout/` \u2014 page shell, header, flex-wrap card grid, container widths.
2. `stage-2-card-anatomy-icons/` \u2014 per-type tile treatment, status badges, thumbnail vs. icon fallback.
3. `stage-3-icon-actions-workflows/` \u2014 add-to-memory panel, edit stub, delete + confirm, upload stub.
4. `stage-4-mobile/` \u2014 responsiveness notes and open verification gap.

Each stage folder has its own `README_stage.md` \u2014 read those for the specifics. This root README is the map; `KNOWN_UNKNOWNS.md` is the single source of truth for what's confirmed vs. not yet verified across all four.

## Files
- `production-reference/chat-widget-canvas.jsx` \u2014 the whole prototype; Media-related code lives roughly at lines 141\u20131290 (data + components) and 2340\u20132400 (standalone page render, App-level state). Line numbers will drift as the file is edited further \u2014 search for the function names cited in each stage doc instead of trusting line numbers verbatim.
- `production-reference/icons.jsx` \u2014 not directly used by Media (chat-widget-canvas.jsx has its own inline icon path map, separate from this file) \u2014 included for reference only since other parts of the prototype use it. See stage 2 for the icon-name gotcha this caused.

## Scope note
This is a design/interaction prototype, not production code. Nothing here is wired to real uploads, storage, or a media API \u2014 `SEED_MEDIA_ITEMS` is static mock data. See `KNOWN_UNKNOWNS.md`.
