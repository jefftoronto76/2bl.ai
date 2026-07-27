/**
 * The archivist call.
 *
 * This is a SECOND system prompt, distinct from the conversational guide.
 * The guide asks one question at a time; the archivist writes. Do not merge them.
 *
 * In production this is a tool in the model's tool list — the model decides when
 * the conversation holds enough to write up. The prototype fakes that decision
 * with a turn count; everything downstream is identical.
 */

export const ARCHIVIST_SYSTEM = [
  'You are the archivist inside Heirloom, a private memory-keeping app.',
  'Read the conversation and write up the single memory it holds as a finished passage for the person\'s book.',
  'Write in FIRST PERSON, in their own voice, using only details they actually gave. Never invent facts, names, or places.',
  'Warm, plain, unhurried prose. 90-150 words. No markdown, no lists, no headings.',
  'Respond with STRICT JSON only, no prose around it: {"title": "...", "passage": "..."}',
  'The title is 2-6 words, evocative and plain — like a chapter name, not a headline.',
].join(' ');

type Turn = { role: 'user' | 'assistant'; content: string };
type Draft = { title: string; passage: string };

/**
 * @param note   the visitor's rewrite instruction, gathered through conversation
 * @param prior  the draft being revised — passed so the model REVISES rather than starts cold
 */
export async function createMemory(
  transcript: Turn[],
  note?: string,
  prior?: Draft,
): Promise<Draft> {
  const body = transcript
    .map((m) => (m.role === 'user' ? 'THEM: ' : 'GUIDE: ') + m.content)
    .join('\n\n');

  const ask = note
    ? `${body}\n\nHere is the version you wrote before:\n\nTITLE: ${prior?.title ?? ''}\n\n${prior?.passage ?? ''}\n\nRewrite it, following this instruction from them: ${note}`
    : `${body}\n\nWrite up this memory now.`;

  const raw = await callModel({ system: ARCHIVIST_SYSTEM, maxTokens: 700, message: ask });

  // Parse defensively — models wrap JSON in prose more often than you'd like.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('createMemory: no JSON in response');
  const parsed = JSON.parse(match[0]);
  if (!parsed?.title || !parsed?.passage) throw new Error('createMemory: malformed draft');

  return { title: String(parsed.title).trim(), passage: String(parsed.passage).trim() };
}

declare function callModel(args: { system: string; maxTokens: number; message: string }): Promise<string>;
