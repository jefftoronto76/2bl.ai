# Transcription Service

### Transcription service (`services/transcription/`)

Speech-to-text for voice chat input. Server-only. Imported as
`@/services/transcription` (barrel). Its single consumer is
`app/api/transcribe/route.ts` — see `System Docs/API Routes.md`.

Deliberately provider-shaped: the barrel re-exports one active provider and
nothing else, so swapping vendors is a one-line import change rather than a
call-site migration. Deepgram is the only provider implemented today.

| File | Exports | Purpose |
|------|---------|---------|
| `index.ts` | `transcribeAudio`, `TranscriptionResult` (type re-export) | Barrel and provider selector. The comment above the import — *"Active transcription provider — swap this import to change providers"* — is the whole switching mechanism; there is no registry or runtime provider resolution. |
| `types.ts` | `TranscriptionResult` | `{ text: string; requestId?: string; attempts: number }`. `attempts` is always populated (1 or 2) so callers can see whether a retry was needed; `requestId` is Deepgram's own id, carried through for support correlation. |
| `providers/deepgram/index.ts` | `transcribeAudio(audioBuffer, contentType, apiKey)` | Posts the audio to Deepgram's `/v1/listen` (`model=nova-3`, `smart_format=true`). **Retries exactly once**, after a fixed 1s wait, and only on `429` or `5xx` — a `4xx` other than 429 is not retried. Each attempt sends `audioBuffer.slice(0)`, a fresh copy, because `fetch` may transfer/detach the original and would otherwise leave the retry path with a detached buffer. Throws on a non-OK final response (`Deepgram returned <status>`) and rethrows fetch-level failures; an empty transcript is **not** an error — it returns `{ text: '' }` and logs. |

**Logging convention gap — failure paths only, deliberate to note rather than
silently fix:** four transcription `AuditAction`s do exist
(`transcription.requested` / `.succeeded` / `.empty` / `.failed` in
`services/audit/types.ts`) and `app/api/transcribe/route.ts` emits all four,
so the success and empty paths are durably recorded: `requestId` and
`attempts` come back in `TranscriptionResult` and land in the audit row
alongside `durationMs` (and `charCount` on success). The gap is on failure.
This provider throws, and a thrown `Error` carries only a message, so the
`requestId`, `attempts` and response body in its `console.error` calls never
reach `audit_events` — `TRANSCRIPTION_FAILED` gets only the message string
`Deepgram returned <status>`, and the two fetch-level branches don't
distinguish the first attempt from the retry. Closing it means widening what the failure path can
hand the route, not adding an `AuditAction`. Recorded in
`System Docs/Known Gaps.md`.
