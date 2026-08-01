2BL.AI — Media Items Spec  ·  June 2026  
   
\*\*Media Items\*\*  
   
Feature Spec · 2BL.AI Platform  
   
June 2, 2026  ·  Second Brain Labs  
   
\#\# \*\*Overview\*\*  
   
When a member uploads a file in chat, the platform should identify what the file is and take meaningful action based on that — without interrupting the conversation. Processing happens in the background. The guide acknowledges the upload immediately, keeps the conversation moving, and notifies the member inline when the file is ready.  
   
This spec covers the data model, background job architecture, guide prompt behaviour, and the Media section in member navigation. Artifacts (prior concept) are ignored — this is a clean design.  
   
\#\# \*\*Member Experience\*\*  
   
\#\#\# \*\*Upload\*\*  
   
Member taps the attach button in chat and selects a file. The guide responds immediately to the act of uploading — it does not wait for processing.  
   
| \*"\*\*Got it — I\*\*'\*\*m working through that recording now. While that\*\*'\*\*s happening, tell me: what made you decide to capture that memory when you did?\*\*"\* |  
| \--- |  
   
The guide does not block on processing. The conversation continues.  
   
\#\#\# \*\*Background Processing\*\*  
   
A background job picks up the file and runs the appropriate processing pipeline based on type. The member sees no loading state in the main chat — processing is invisible.  
   
\#\#\# \*\*Completion Alert\*\*  
   
When processing completes, a persistent event appears inline in the chat thread. This is not a toast — it stays in the thread and is actionable.  
   
| \*"\*\*✓ Your recording is ready. I\*\*'\*\*ve pulled out the key moments — want me to weave them into the story, or would you rather read the transcript first?\*\*"\* |  
| \--- |  
   
This re-engagement hook is the guide picking the conversation back up. The member clicks in or responds naturally.  
   
\#\#\# \*\*Failure Handling\*\*  
   
If processing fails, the guide surfaces it plainly without technical language.  
   
| \*"\*\*I wasn\*\*'\*\*t able to process that file — it may be in a format I can\*\*'\*\*t read yet. You could try a different format, or just describe what\*\*'\*\*s in it and we\*\*'\*\*ll work from that.\*\*"\* |  
| \--- |  
   
\#\# \*\*Supported File Types \*\*\*\*&\*\*\*\* Actions\*\*  
   
\#\#\# \*\*Audio\*\*  
   
\- Formats: .m4a (iPhone Voice Memos), .mp3, .wav  
   
\- Processing: Deepgram transcription (already stubbed — needs end-to-end wiring)  
   
\- Derived content: transcription text stored on record  
   
\- Guide response after processing: reads transcript content, responds to what was said — not just that a file arrived  
   
\- E.g. "You mentioned your dad called it his proudest moment — tell me more about that."  
   
\#\#\# \*\*Image\*\*  
   
\- Formats: .jpg, .jpeg, .png, .heic, .webp  
   
\- Processing: Claude vision pass — describe, classify, extract any visible text  
   
\- Derived content: AI-generated caption and classification stored on record  
   
\- Guide response after processing: describes what it sees, asks for the story behind it  
   
\- E.g. "This looks like it's from the 70s — who's the woman in the blue dress?"  
   
\#\#\# \*\*Document\*\*  
   
\- Formats: .pdf, .docx, .txt  
   
\- Processing: text extraction, then Claude classification pass (what kind of document is this?)  
   
\- Derived content: extracted text \+ classification stored on record  
   
\- Guide response after processing: identifies document type, confirms with member, treats as raw material  
   
\- E.g. "This reads like something written for a service — is this a eulogy? I'd love to use your own words."  
   
\#\# \*\*Data Model\*\*  
   
\#\#\# \*\*media\_items table\*\*  
   
New table. Clean design — does not extend or reference the artifacts table. Jeff creates this in Supabase Studio.  
   
| \*\*Column\*\* | \*\*Type\*\* | \*\*Notes\*\* |  
| \--- | \--- | \--- |  
| id | uuid | Primary key, gen\_random\_uuid() |  
| tenant\_id | uuid | FK → tenants.id — required for RLS |  
| member\_id | uuid | FK → members/users table — who uploaded |  
| chat\_id | uuid | FK → chat\_sessions.id — originating chat |  
| story\_id | uuid | FK → stories.id — nullable, linked after story exists |  
| type | text | enum: audio │ image │ document |  
| storage\_path | text | Supabase Storage path |  
| original\_filename | text | Preserved from upload for display |  
| file\_size\_bytes | int8 | Stored at upload time |  
| status | text | enum: pending │ processing │ ready │ failed |  
| classification | text | AI-assigned: voice\_memo │ photo │ letter │ etc. |  
| derived\_content | text | Transcription, extracted text, or caption |  
| error\_message | text | Nullable — set on failure |  
| created\_at | timestamptz | Default now() |  
| processed\_at | timestamptz | Nullable — set when status → ready or failed |  
   
\#\#\# \*\*Status lifecycle\*\*  
   
| \*\*Status\*\* | \*\*Meaning\*\* |  
| \--- | \--- |  
| pending | Record created, file uploaded to storage, job not yet started |  
| processing | Background job running |  
| ready | Processing complete, derived\_content populated |  
| failed | Job failed — error\_message populated |  
   
\#\#\# \*\*Storage\*\*  
   
Supabase Storage bucket: media-items (private, RLS enforced). Path structure:  
   
{tenant\_id}/{member\_id}/{media\_item\_id}/{original\_filename}  
   
Files are never public. All access goes through signed URLs generated server-side.  
   
\#\# \*\*Background Job Architecture\*\*  
   
\#\#\# \*\*Trigger\*\*  
   
A Supabase Database Webhook fires on INSERT into media\_items where status \= pending. The webhook calls a Vercel background function (not an Edge Function — processing times for audio can exceed Edge limits).  
   
\#\#\# \*\*Job flow\*\*  
   
\- Job receives media\_item\_id  
   
\- Updates status → processing  
   
\- Fetches file from Supabase Storage via signed URL  
   
\- Runs processing pipeline based on type (audio → Deepgram, image → Claude vision, document → extraction \+ Claude classify)  
   
\- Writes derived\_content \+ classification back to record  
   
\- Updates status → ready (or failed \+ error\_message)  
   
\- Status change triggers Supabase Realtime event on the chat channel  
   
\#\#\# \*\*Realtime alert\*\*  
   
The chat UI is already subscribed to a Supabase Realtime channel for the active chat\_id. The background job's status update (step 7\) is picked up by this subscription. The UI renders the completion event as an inline chat message — styled distinctly from guide and member messages, but within the thread.  
   
The completion message is then passed into the guide's context so it can respond conversationally, picking up from where the upload acknowledgement left off.  
   
\#\#\# \*\*Timeout / retry\*\*  
   
Vercel background functions have a maximum execution time of 15 minutes (Pro plan). Deepgram transcription for typical voice memos should complete well within this. If a job exceeds the limit or throws, status is set to failed and error\_message is populated. No automatic retry in V1 — failed items surface in the Media section with a retry option.  
   
\#\# \*\*Guide Prompt Additions\*\*  
   
\#\#\# \*\*Upload acknowledgement block\*\*  
   
Added to the guide's system prompt. Fires when a file upload event is detected in the conversation context.  
   
| \*When a member uploads a file, acknowledge it warmly and immediately — do not wait for processing. Keep the conversation moving with a question. Do not describe what you\*\*'\*\*re doing technically. Never say \*\*"\*\*I\*\*'\*\*m uploading\*\*"\*\* or \*\*"\*\*processing\*\*"\*\* — just \*\*"\*\*I\*\*'\*\*m working through that\*\*"\*\* or similar. One sentence acknowledgement, one question.\* |  
| \--- |  
   
\#\#\# \*\*Completion re-engagement block\*\*  
   
Fires when a media\_item status change event appears in the conversation context. The guide receives the derived\_content (transcription, caption, or extracted text) and responds to the actual content.  
   
| \*When a file finishes processing, respond to what\*\*'\*\*s in it — not just that it\*\*'\*\*s ready. Reference specific details from the derived content. Offer a clear next step: incorporate it, review it, or build from it. The member should feel like you read it, not just received it.\* |  
| \--- |  
   
\#\#\# \*\*Classification values\*\*  
   
The classification field is set by the AI during processing and stored on the record. The guide prompt includes a mapping so it knows how to frame each type:  
   
\- voice\_memo → treat as spoken memory, transcribe faithfully, reflect the person's own voice back  
   
\- interview\_recording → treat as source material, pull key quotes and themes  
   
\- photo → anchor in time and place, ask for the story behind it  
   
\- scanned\_document → read carefully, identify document type before acting  
   
\- letter → read for emotional content, offer to incorporate the writer's voice  
   
\- eulogy → handle with care, ask permission before incorporating directly  
   
\- journal\_entry → treat as private source, paraphrase rather than quote directly  
   
\- other → describe what you see, ask the member what they'd like to do with it  
   
\#\# \*\*Media Section — Navigation\*\*  
   
\#\#\# \*\*Concept\*\*  
   
The Media section is a gallery of everything a member has shared — not a file manager. It's organised by story, not by file type. The emotional framing: "the source material shelf."  
   
\#\#\# \*\*Layout\*\*  
   
\- Nav item: Media (icon: paperclip or grid, between Chats and Stories)  
   
\- Default view: grouped by story — each story has a strip of thumbnails/file rows below its title  
   
\- Files without a story\_id (not yet linked) appear under "Unassigned" at the bottom  
   
\- Each item shows: thumbnail or file type icon, original\_filename, classification badge, date, and the chat it came from (tappable — navigates back to that chat)  
   
\- Status badge: processing items show a spinner, failed items show a retry option  
   
\- Tapping an item opens a detail view: full derived\_content (transcript, caption, extracted text), plus the original file (signed URL download)  
   
\#\#\# \*\*What it is not\*\*  
   
\- Not a file manager — no folders, no rename, no delete in V1  
   
\- Not a search surface in V1 — browsing only  
   
\- Not a shared library — scoped to the member, not the story collaborators (V2)  
   
\#\# \*\*Build Sequence\*\*  
   
This is the recommended order. Each step is independently shippable.  
   
\- \*\*Schema — Jeff creates media\_items table in Supabase Studio\*\*  
   
\- \*\*Storage — create media-items bucket, configure RLS\*\*  
   
\- \*\*ChatInput — wire the TODO(2bl) attach button, upload to Storage, insert media\_items record at status=pending, insert acknowledgement message into chat\*\*  
   
\- \*\*Background function — Vercel function that handles audio, image, and document pipelines. Webhook trigger on insert.\*\*  
   
\- \*\*Realtime — subscribe to media\_items status changes on chat channel, render completion event inline in thread\*\*  
   
\- \*\*Guide prompt — add upload acknowledgement and completion re-engagement blocks\*\*  
   
\- \*\*Media nav section — gallery view, grouped by story\*\*  
   
\#\# \*\*Open Questions\*\*  
   
\- Deepgram vs Whisper for audio transcription — Deepgram is already stubbed; confirm before build  
   
\- File size limits — what's the max we want to accept? Recommend 50MB for V1.  
   
\- Retry UX — failed items show a retry button in Media section; does retry re-trigger the same job or require re-upload?  
   
\- story\_id linkage — when does a media\_item get linked to a story? On upload (if story exists) or lazily? Recommend: on upload if chat has an active story, otherwise null until member or guide links it.  
   
\- Collaborator access to media — V2 decision, but the data model should support it from day one (RLS will need a collaborator policy)  
   
\*Second Brain Labs  ·  2bl.ai  ·  Confidential\*  
   
Second Brain Labs  ·  2bl.ai  ·  Confidential