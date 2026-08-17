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

**Logging convention gap, deliberate to note rather than silently fix:** this
service logs to `console.error` / `console.log`, not `audit_events` — see
CLAUDE.md's logging convention, which calls for `AuditAction` for anything
worth debugging later. There is no `AuditAction` for transcription today, so
the failure detail (status, `requestId`, `attempts`) lives only in Vercel's
short log retention. Recorded in `System Docs/Known Gaps.md`.
