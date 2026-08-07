/**
 * The archivist call, seeded from a photo instead of a transcript.
 *
 * Distinct from createMemory.ts (design_handoff_memories) in one way: there is
 * no conversation to summarize, and — as of this pass — NO IMAGE DATA either.
 * This asks the model to write an inviting placeholder caption blind, which is
 * why the copy is deliberately open ("who's in this, where was it") rather than
 * descriptive. If a real multimodal caption pipeline (a model that actually
 * SEES the photo) ships later, it replaces this function's body — the draft
 * card and everything downstream is unchanged either way.
 */

const PHOTO_CAPTION_SYSTEM = [
  'You are the archivist inside Heirloom, a private memory-keeping app.',
  'Someone just shared a photograph with you and wants to keep it as a memory. You have no details about it yet.',
  'Write a short, warm placeholder caption inviting them to fill in the specifics — who is in it, where it was, what was happening.',
  'Respond with STRICT JSON only, no prose around it: {"title": "...", "passage": "..."}',
  'Title is 2-6 words, like a chapter name. Passage is 2-3 sentences, first person, warm and plain.',
].join(' ');

type Draft = { title: string; passage: string };

const FALLBACK: Draft = {
  title: 'A photograph, kept',
  passage:
    'I don\u2019t have the details written down yet \u2014 who\u2019s in it, where it was, what was happening just before or after. But I wanted to hold onto it. I\u2019ll come back and fill this in properly.',
};

export async function writePhotoCaption(): Promise<Draft> {
  try {
    const raw = await callModel({ system: PHOTO_CAPTION_SYSTEM, maxTokens: 300, message: 'Write the caption now.' });
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed?.title && parsed?.passage) {
        return { title: String(parsed.title).trim(), passage: String(parsed.passage).trim() };
      }
    }
  } catch {
    // fall through to the canned draft — never block the card on a caption failure
  }
  return FALLBACK;
}

declare function callModel(args: { system: string; maxTokens: number; message: string }): Promise<string>;
