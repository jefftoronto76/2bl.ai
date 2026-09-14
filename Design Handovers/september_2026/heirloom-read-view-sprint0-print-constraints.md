# Heirloom Read View — Sprint 0: Lulu Print Constraints

**Status:** Investigation complete. Docs-only — no app code touched.
**Source:** Live queries against the real Lulu sandbox API (`api.sandbox.lulu.com`,
authenticated via `LULU_CLIENT_KEY_SB`/`LULU_CLIENT_SECRET_SB`) plus cross-checks
against Lulu's published print documentation. Every number under "Confirmed via
live sandbox API" below came back from a real, authenticated `POST` to
`/print-job-cost-calculations/` or `/cover-dimensions/` in this session — not
inferred from docs. Numbers under "From published documentation" could not be
pulled live (see Access note) and should get a final doc check before CD locks
pixel dimensions.

**Access note:** This environment's network policy blocks `lulu.com`/`help.lulu.com`
generally; only `api.sandbox.lulu.com` is reachable, via a per-host credential
attached at the environment level (the proxy performs the OAuth exchange and
attaches the resulting bearer token — no raw client key/secret ever reached this
session). That's sufficient for real catalog/pricing/dimension data, but not for
fetching Lulu's help-center articles directly, so the bleed/safety-margin/DPI
figures below are corroborated via search rather than a direct fetch of the
source pages. Recommend a quick human click-through of the linked articles
before treating those specific numbers as final.

---

## 1. Trim sizes — real catalog data (confirmed via live sandbox API)

Tested by POSTing real `pod_package_id` values to `/print-job-cost-calculations/`
at page counts in the 24–30 range and reading the catalog's own
accept/`"Pod Package does not exist"` response — this is Lulu's actual sellable
SKU list, not a spec sheet guess.

Format tested: `[Trim].FC.STD.[Binding].060UW444.[Finish]` — full color interior,
standard quality, 60# uncoated white interior paper (a reasonable default for a
photo-forward memory book; premium quality (`PRE`) is also valid and costs more —
worth a product call, not an engineering one).

| Trim (W×H) | Casewrap (`CW`) | Linen w/ Dust Jacket (`LW`) |
|---|---|---|
| 5×8 | ✅ valid | not tested\* |
| 6×6 (square) | ❌ does not exist | ❌ does not exist |
| 6×8 | ❌ does not exist | ❌ does not exist |
| 6×9 | ✅ valid | ✅ valid |
| 7×10 | ✅ valid | ❌ does not exist |
| 8×8 (square) | ❌ does not exist | ❌ does not exist |
| 8×10 | ❌ does not exist | ❌ does not exist |
| 8.5×8.5 (square) | ✅ valid | ❌ does not exist |
| 8.5×11 | ✅ valid | ✅ valid |
| 9×7 (landscape) | ✅ valid | ❌ does not exist |
| 11×8.5 (landscape) | ✅ valid | ❌ does not exist |

\*Not every possible trim was brute-forced — this is the set relevant to
Heirloom's Novel/Landscape layouts, not an exhaustive catalog dump.

**This is the headline finding for CD:** Casewrap comes in both portrait and
landscape orientations across several trims. **Linen with Dust Jacket only
validated as a real SKU in two portrait trims (6×9 and 8.5×11) — no landscape
or square variant exists in the catalog.** Since the sprint plan has Landscape
(wide, photo-forward) shipping first, this is a real constraint, not a
hypothetical: if Heirloom wants to offer Linen w/ Dust Jacket as a print option
for a book built in the Landscape layout, Lulu's catalog doesn't have that SKU.
Options are (a) restrict Linen to books using the Novel/portrait layout, (b)
offer Linen only in the two portrait trims regardless of on-screen reading
layout (print trim need not equal screen aspect ratio), or (c) drop Linen as a
launch option and revisit later. This needs a product decision before CD
finalizes which formats are offered at print time — flagging now, per Sprint 0's
whole purpose.

## 2. Page count floor (confirmed via live sandbox API)

Both bindings rejected every page count below 24 with an explicit, structured
error: `"page_count must be in range 24-800"`. Confirmed by sweeping 2, 10, 20,
22, 23 (all rejected) and 24, 25, 30 (all accepted) against a real cost
calculation call.

Heirloom's ~25–30 page target sits safely above this floor, but the floor itself
should be enforced as a hard validation before checkout — a book with fewer than
24 pages will fail at Lulu regardless of anything upstream, and that failure
should never be the first time a member learns about it.

## 3. Cover dimensions (confirmed via live sandbox API, `/cover-dimensions/`)

Queried at 24, 28, and 30 pages — **the cover/jacket dimensions did not change
across that range** for either binding (spine-thickness difference at this page
count is too small to move the rounding). Practical implication: CD can lock
exact cover/jacket pixel dimensions for the ~25–30 page target now, without
waiting on the final page count per book.

| SKU | Full cover/jacket size (flat, unfolded) |
|---|---|
| Casewrap 6×9 | 14.0in × 10.75in |
| Casewrap 8.5×11 | 19.0in × 12.75in |
| Linen w/ Jacket 6×9 | 20.0in × 9.75in |
| Linen w/ Jacket 8.5×11 | 25.0in × 11.75in |

The Linen numbers are much wider than Casewrap at the same trim because this is
the **dust jacket**, not just the board wrap — it includes front/back flaps in
addition to front, spine, and back panels. This is cover/jacket-print
territory (Sprint 4 build-out), not the interior reader pages, but it confirms
Linen is a materially different print asset, not just a different cover
finish on the same file.

## 4. Interior bleed & safety margin (from published documentation — verify before lock)

Lulu's help-center content (via search, not direct fetch — see Access note)
states:

- **Bleed:** 0.125in (3.175mm) on all sides, standard across products — content
  meant to run to the edge must extend into this zone.
- **Safety margin, standard:** 0.5in inside the trim edge for regular products.
- **Safety margin, hardcover Casewrap:** explicitly called out as larger —
  **0.75in**, due to spine curvature/gutter behavior specific to hardcover
  binding.
- **Linen w/ Dust Jacket** isn't explicitly called out with its own number in
  what search surfaced, but it shares the same case-binding mechanics as
  Casewrap (the difference is the cover surface material, not the interior
  binding), so treating it with the same 0.75in safety margin as a working
  assumption is reasonable. **This specific point — whether Linen's interior
  safety margin is documented separately at 0.75in or something else — is the
  one number in this doc I'd flag for a human to confirm directly against
  `help.lulu.com` before CD treats it as locked**, since I could not fetch that
  page directly in this environment.

Concrete numbers for the target trims (trim + bleed = full page size a
print-ready PDF page should be sized to):

| Trim | Page size incl. bleed | Safe content area (0.75in margin) |
|---|---|---|
| 6×9 | 6.25in × 9.25in | 4.5in × 7.5in centered |
| 8.5×11 | 8.75in × 11.25in | 7.0in × 9.5in centered |

## 5. PDF page canvas size in pixels (the reader/print canvas itself)

This is the actual canvas size the Sprint 1+ page-flip reader/interior-PDF
generator needs to render to — not photo placement inside it, the page itself.
Pixel size = (trim + bleed, from §4) × 300 DPI, since a print-ready PDF page is
sized in real-world units but the raster canvas backing it needs a pixel
dimension:

| Trim | Page size incl. bleed | **Canvas @ 300 DPI (floor)** | Canvas @ 600 DPI (ceiling) |
|---|---|---|---|
| 6×9 | 6.25in × 9.25in | **1875 × 2775 px** | 3750 × 5550 px |
| 8.5×11 | 8.75in × 11.25in | **2625 × 3375 px** | 5250 × 6750 px |

Use the 300 DPI column as the target render/export canvas size for interior
pages — 600 DPI is a ceiling Lulu accepts, not a target to build toward by
default (4x the pixel area for no visible print-quality gain per §6). If the
on-screen reader itself renders at a lower resolution for performance (likely,
for a web page-flip UI), that's fine — this pixel size only governs the
print-export path, not the live DOM/canvas size during reading.

For reference, the cover/jacket files from §3 would need their own canvas at
300 DPI if built as a flat image before PDF wrapping (Sprint 4 concern, not
Sprint 1): Casewrap 6×9 → 4200×3225px; Casewrap 8.5×11 → 5700×3825px; Linen
6×9 jacket → 6000×2925px; Linen 8.5×11 jacket → 7500×3525px.

## 6. Lulu's actual PDF file requirements

Mixed live/documented, called out per line — this is exactly the kind of thing
Sprint 0 exists to pin down before Sprint 1 builds against an assumption.

**Confirmed live, from real sandbox `print-jobs` submissions (not docs):**

- **Single multi-page interior PDF + single-page cover PDF is a structural
  fact of the API, not just a doc recommendation.** The `print-jobs` request/
  response schema itself has exactly one `interior.source_url` (one file, all
  interior pages) and one `cover.source_url` (one file, the entire flat
  wraparound cover/jacket as a single page) per line item — there's no
  per-page file array. Confirmed by inspecting the live schema of three real
  probe jobs submitted to the sandbox during this investigation (job IDs
  334946, 334947, 334948 — all harmless: no payment attached, sandbox-only,
  all now sitting `REJECTED`).
- **Lulu's backend actually fetches and inspects the interior file's real page
  count** — it isn't just trusting whatever page count our app declares. Job
  334948 submitted a real, valid, publicly-hosted 1-page PDF against the 6×9
  Casewrap package and came back with a precise, real, structured rejection:
  `"Page Count: We found 1 pages in your PDF. For the the book design you
  selected, the page range must be between 2 and 800 pages."` Two things worth
  noting: (a) this confirms content-level validation happens, not just
  metadata trust; (b) the "2 and 800" range in *this specific* error is a
  generic system-wide sanity bound, distinct from the package-specific 24-page
  floor confirmed in §2 via `/print-job-cost-calculations/` — both checks
  exist, and the stricter one (24, for this SKU) is the one to build our own
  pre-submission validation against, not the generic message's "2."
- A malformed/unreachable `source_url` produces a clean structured error too
  (`"Unexpected Http response... Status code: 404"`), confirming the intake
  pipeline is a straightforward "we fetch your URL, then validate the file,"
  not an upload-and-forget black box.

**From published documentation (via search, not direct fetch — see Access
note; flagging clearly per the "check help.lulu.com directly" fallback):**

- **PDF/X standard:** search turned up **no mention of a PDF/X requirement**
  anywhere in Lulu's PDF creation docs. Given how prominently PDF/X gets
  called out by print vendors that *do* require it (e.g. IngramSpark), its
  absence here reads as a real "no" rather than a gap in what search surfaced
  — but this is the one item in this section worth a direct human confirmation
  against `help.lulu.com`'s PDF Creation Settings article, since I can't fetch
  it myself in this environment to be fully certain.
- **Font embedding:** fonts must be **embedded, or converted to outlines** —
  either is acceptable. Text does not need to be rasterized to an image as
  long as one of those two is true.
- **Flattening:** applies to **transparency layers and vector objects**
  (rasterize vector art, flatten transparency effects) — this is not a
  blanket "flatten all text to images" rule, it's specifically about
  transparency/vector content that can render inconsistently otherwise.
- **Max file size:** documented as a recommended ceiling of **500MB** — very
  generous relative to a ~25-30 page photo book; unlikely to be a real
  constraint for Heirloom's use case, but noting it since it was asked.
- **No password/security protection** on submitted PDFs.

## 7. Photo/image requirements

- **Resolution:** 300 PPI minimum, 600 PPI ceiling (no visible print-quality
  gain above 600 PPI, just larger files). This matches the sprint plan's prior
  research — confirmed, not revised.
- **File format:** Lulu's Print API does not accept individual photo uploads at
  all — it takes one fully-composited, multi-page **interior PDF** and one
  single-page **cover PDF**. This matters for the UX spec below: **Lulu has no
  mechanism to reject or even see an individual low-resolution photo** — it only
  ever receives our already-rendered PDF and prints whatever is in it. A blurry
  photo doesn't fail the print job; it just prints blurry. Any resolution
  gate has to live entirely in our own pipeline, before PDF generation.
- **Color space — correction to the sprint plan's assumption:** the prior note
  ("we send sRGB, Lulu converts to CMYK") has the direction backwards. Per
  Lulu's current documentation, **their full-color print pipeline is native
  sRGB**. If a CMYK (or other non-sRGB) file is submitted, *that* gets converted
  to sRGB, not the other way around — and that conversion is flagged as a
  source of unexpected color shifts. Recommendation: keep sending sRGB as
  planned, but update any docs/comments that describe Lulu as "converting to
  CMYK" — that's not what happens.

## 8. UX spec: flagging a low-resolution photo before submission (spec only, not built)

Given finding in §7 above — Lulu's API can't catch this for us — the check has to
be ours, and it has to account for *where* the photo lands, not just its raw
pixel count:

**The core problem:** a photo's "print resolution" isn't a fixed property of the
file — it's pixel dimensions ÷ the physical size it's placed at. A 3000×2000px
photo is comfortably above 300 PPI as a half-page image, but under 300 PPI as a
full-bleed two-page spread. So the check must run against the actual placement
in the actual page layout (Landscape or Novel), not just at upload time in
isolation.

**Proposed two-point check, mirroring the marker-fallback principle in
CLAUDE.md (a soft signal early, a hard gate late — never one point of failure):**

1. **Soft signal, at layout/edit time:** the moment a photo is placed into a
   page slot (in the read-view/page-flip editor being built in Sprint 1+),
   compute effective PPI = min(image width px / slot width in, image height px
   / slot height in). If effective PPI is under 300, show a small inline badge
   on that photo's thumbnail (e.g. "Low resolution — may look soft when
   printed") right where the member is already looking. This lets them swap
   the photo or resize the layout immediately, at the point of least friction —
   the same reasoning as the marker-fallback pattern's client-side path
   (a visible, low-friction nudge instead of a silent failure downstream).
2. **Hard gate, at print submission:** re-run the same check across every
   placed photo in the finished book as part of the "order a printed copy"
   flow (Sprint 4 territory). Any photo still under 300 PPI at its placed size
   blocks checkout with a specific, per-photo list ("These 2 photos will print
   blurry at their current size — replace or shrink them to continue"), not a
   generic error. This is the server-side-equivalent fallback: even if the
   member ignored or never saw the soft signal, the hard gate is the one thing
   that must fire before a real dollar gets spent on a print job that will
   disappoint them.

Two-tier framing (not a strict block below 300, since it's a real photo memory
book and members may reasonably choose to accept some softness):
- **≥300 PPI:** no warning.
- **150–299 PPI:** warn, don't block ("may look soft") — let the member decide.
- **<150 PPI:** treat as a hard block at the print-submission gate — this is the
  range where a printed photo would be visibly, obviously bad, not just soft.

Reference thresholds computed directly from the real trim + bleed numbers in
§4/§5 (pixel dimensions needed for a full-bleed photo at 300 PPI floor / 600 PPI
ceiling):

| Trim, full bleed page | 300 PPI floor | 600 PPI ceiling |
|---|---|---|
| 6×9 (6.25×9.25in incl. bleed) | 1875 × 2775 px | 3750 × 5550 px |
| 8.5×11 (8.75×11.25in incl. bleed) | 2625 × 3375 px | 5250 × 6750 px |

This is spec only — no editor UI, no upload-pipeline code, and no
`AuditAction` logging changes are part of this sprint. It's meant to give CD
enough to design the badge/warning treatment and CC enough to scope the
effective-PPI calculation as real work items in a later sprint (most likely
folding into Sprint 1's on-device verification pass, since it needs the real
page-layout dimensions Sprint 1 finalizes).

## Reference

- Sprint plan: `Design Handovers/september_2026/heirloom-read-view-sprint-plan.md`
- Lulu sandbox credentials: environment-level API credential proxy for
  `api.sandbox.lulu.com` (this session never saw the raw client key/secret —
  the proxy performed the OAuth client-credentials exchange and attached the
  bearer token transparently).
- Endpoints exercised: `POST /print-job-cost-calculations/`,
  `POST /cover-dimensions/`, `GET /print-jobs/` (used only to confirm the
  credential proxy was live before spending calls on catalog probing), and
  `POST /print-jobs/` + `GET /print-jobs/{id}/status/` (three real sandbox
  print-job submissions — IDs 334946, 334947, 334948 — used to observe Lulu's
  real file-fetch and content-validation behavior for §6; all rejected during
  validation, no payment attached, sandbox-only, harmless).
