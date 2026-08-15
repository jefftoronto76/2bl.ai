# Content Service

### Content service (`services/content/`)

Content / asset / topic business logic (server-only). Backs the admin
content-family routes as thin consumers (auth + parsing + required-field
validation + response mapping). Functions return a discriminated
`ContentResult<T>` (`{ ok: true; data } | { ok: false; status; error }`).

| File | Exports | Purpose |
|------|---------|---------|
| `assets.ts` | `extractText`, `createDocumentAsset`, `ACCEPTED_TYPES`, `MAX_FILE_SIZE` (+ `CreateDocumentAssetInput`, `DocumentAsset`, `MediaAuditContext`) | Document ingestion. `extractText(buffer, mimeType, ctx?)` extracts raw text (PDF via the Anthropic `/v1/messages` document API — uploaded first through the Files API and deleted again in a `finally`, DOCX via mammoth, TXT via Buffer; throws on failure). The optional third `ctx: MediaAuditContext` (`tenant_id`, `member_id`, `media_item_id`, `correlation_id`) attributes the PDF Files-API upload/extraction/cleanup steps to a real `media_items` row via `services/media`'s `isMediaAuditEnabled`/`logAiMediaEvent`, logging `MEDIA_FILE_UPLOAD_RECEIVED`/`MEDIA_FILE_UPLOAD_FAILED`, `MEDIA_PDF_EXTRACTION_RECEIVED`/`MEDIA_PDF_EXTRACTION_FAILED`, and `MEDIA_FILE_CLEANUP_FAILED` — omitted (as it is by the admin document-upload route below, which has no `media_items` row) simply yields no audit logging for these steps. `createDocumentAsset` inserts the `content` row (`type: 'document'`), uploads the original binary to the Storage `assets` bucket at `{tenant_id}/{content_id}/{filename}`, and stamps `storage_path` — the storage steps are non-fatal (logged, not failed). Backs `POST /api/admin/assets/upload` (route owns multipart parse + size/type validation, calls `extractText` without a `ctx`). |
| `content.ts` | `createContent`, `getContent` (+ `CreateContentInput`) | `content`-row structured create + single-row tenant-scoped read. Back `POST /api/admin/content` and `GET /api/admin/content/[id]` (404 on miss). |
| `topics.ts` | `listTopics`, `createTopic` (+ `CreateTopicInput`) | `topics`-row list (ordered by name) + create, tenant-scoped. Back `GET`/`POST /api/admin/topics`. |
| `types.ts` | `AuthScope`, `ContentResult` | Shared contracts for the service. |
| `index.ts` | barrel | Re-exports the public surface above. |
