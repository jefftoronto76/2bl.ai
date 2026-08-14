/* ────────────────────────────────────────────────────────────────────────
   Legacy — "Start Your Story" chat drawer.

   A self-mounting recreation of the production Heirloom chat widget
   (ChatDrawerV2 + ChatHero): right-anchored drawer, docked sidebar, the
   "What's a story worth keeping?" empty state, writing prompts, a rich
   composer, and a live conversation. Opens when any CTA dispatches the
   'legacy-open-chat' window event.

   Live responses come from window.claude.complete; when that isn't available
   (or errors) a scripted biographer fallback keeps the demo flowing offline.

   Styled with the lander's --hl-* tokens + inline styles (the lander has no
   Tailwind). Loaded AFTER React via <script type="text/babel" src>.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;

  /* ── Icons (lucide subset) ─────────────────────────────────────────── */
  const P = {
    feather: ['M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z', 'M16 8 2 22', 'M17.5 15H9'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    max: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
    min: ['M8 3v4a1 1 0 0 1-1 1H3', 'M21 8h-4a1 1 0 0 1-1-1V3', 'M3 16h4a1 1 0 0 1 1 1v4', 'M16 21v-4a1 1 0 0 1 1-1h4'],
    menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
    chevron: ['m6 9 6 6 6-6'],
    search: ['M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'm20 20-3.4-3.4'],
    pen: ['M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.4 2.6a2.1 2.1 0 0 1 3 3l-9 9-4 1 1-4z'],
    share: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'm8.6 13.5 6.8 4', 'm15.4 6.5-6.8 4'],
    book: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
    plus: ['M5 12h14', 'M12 5v14'],
    spark: ['M9.94 14.66A2 2 0 0 0 8.5 13.2l-5.2-1.34a.4.4 0 0 1 0-.78L8.5 9.74A2 2 0 0 0 9.94 8.3l1.35-5.2a.4.4 0 0 1 .77 0l1.35 5.2A2 2 0 0 0 15.2 9.74l5.2 1.34a.4.4 0 0 1 0 .78L15.2 13.2a2 2 0 0 0-1.44 1.46l-1.35 5.2a.4.4 0 0 1-.77 0z', 'M20 3v4', 'M22 5h-4'],
    arrowUp: ['m5 12 7-7 7 7', 'M12 19V5'],
    mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
    user: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6.2 18.8A4 4 0 0 1 10 16h4a4 4 0 0 1 3.8 2.8'],
    camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z', 'M12 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
    image: ['M18 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3Z', 'M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z', 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21'],
    file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
    folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
    bookmark: ['m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
    check: ['M20 6 9 17l-5-5'],
    pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497Z', 'm15 5 4 4'],
    imagePlus: ['M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7', 'M16 5h6', 'M19 2v6', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21', 'M9 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0z'],
    trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    star: ['M11.5 2.3a.53.53 0 0 1 .95 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.01a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .29-.9l5.17-.76a2.12 2.12 0 0 0 1.6-1.16z'],
    userPlus: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M19 8v6', 'M22 11h-6'],
    folderMinus: ['M4 20a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z', 'M9 13h6'],
    link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
    copy: ['M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
    clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6v6l4 2'],
    refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M3 21v-5h5'],
    shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
    bookOpen: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
    heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
    mail: ['M22 6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
    thumbsUp: ['M7 10v12', 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z'],
    thumbsDown: ['M17 14V2', 'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z'],
    alertTriangle: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z', 'M12 9v4', 'M12 17h.01'],
    chevronLeft: ['m15 18-6-6 6-6'],
    chevronRight: ['m9 18 6-6-6-6'],
    stop: ['M5 5h14v14H5z'],
    play: ['m6 3 14 9-14 9z'],
    users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    video: ['m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.94a.5.5 0 0 0-.78-.42L16 11', 'M2 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z'],
    scan: ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2', 'M7 12h10'],
    crop: ['M6 2v14a2 2 0 0 0 2 2h14', 'M18 22V8a2 2 0 0 0-2-2H2'],
    mapPin: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z', 'M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  };
  function Icon({ n, name, s, size, sw = 1.75, fill = 'none', style }) {
    const key = n || name; const sz = size || s || 18;
    return (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
        strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        {(P[key] || []).map((d, i) => <path key={i} d={d} />)}
      </svg>
    );
  }

  /* ── Content ────────────────────────────────────────────────────────── */
  const PROMPTS = [
    'What’s a smell that takes you straight back to childhood?',
    'Tell me about a meal you’ll never forget.',
    'What did your first home look like?',
    'Who taught you something you still carry?',
  ];
  const SEED = [
    { id: 's-seed-1', title: 'The summer we drove to the coast', starred: true },
    { id: 's-seed-2', title: 'Grandpa’s workshop', starred: false },
  ];
  const SEED_MEMORIES = [
    { id: 'k-seed-1', title: 'The morning we left', sessionId: 's-seed-1', storyId: 'st-life', kind: 'conversation', date: 'March 4', version: 1,
      passage: 'We left before the light came up, the car still cold, everything we thought we needed piled in the back. My father had the route written on the back of an envelope and would not look at it in front of us. I sat behind him with my coat over my knees and watched the streetlights go out one at a time as we came up out of the valley.' },
    { id: 'k-seed-2', title: 'Salt air, before the water', sessionId: 's-seed-1', storyId: 'st-life', kind: 'conversation', date: 'March 4', version: 1,
      passage: 'You smell it a long while before you see it. Somewhere past the last of the farms the air changed and my mother rolled her window down without saying anything about it. That was the moment the trip turned into a holiday. The water itself was another hour and by then we had all stopped asking how much longer.' },
    { id: 'k-seed-3', title: 'The smell of cedar shavings', sessionId: 's-seed-2', storyId: 'st-bell', kind: 'photo', date: 'March 11', version: 1, photoSrc: 'assets/chat-photo-1.jpg',
      passage: 'His workshop was half the garage and entirely his. Cedar shavings on the floor deep enough to walk through, and a coffee tin of screws he would not let anybody sort. He is in this one with his back to the camera, which is the only way anybody ever got a picture of him.' },
    { id: 'k-seed-4', title: 'Nana at the piano', sessionId: 's-seed-2', storyId: 'st-bell', kind: 'audio', date: 'March 18', version: 1,
      passage: 'Two minutes of a hymn she had played since she was a girl, recorded on a phone propped against the sugar bowl. She stops twice to correct herself and carries on both times without comment. You can hear the kettle going in the background.' },
    { id: 'k-seed-5', title: 'The line for the ferry', sessionId: 's-seed-1', storyId: 'st-life', kind: 'photo', date: 'March 4', version: 1, photoSrc: 'assets/chat-photo-2.jpg',
      passage: 'We were the ninth car back and nobody minded. My mother had the radio on low and my father stood outside leaning on the door, talking to the man in the truck ahead of us like they had known each other for years.' },
    { id: 'k-seed-6', title: 'Nana\u2019s kitchen, the last morning', sessionId: 's-seed-2', storyId: 'st-bell', kind: 'video', date: 'March 20', version: 1, photoSrc: 'assets/chat-photo-3.jpg',
      passage: 'Twelve seconds of her buttering toast and telling someone off-camera to sit down before it gets cold. It is the only video anyone thought to take that whole visit.' },
    { id: 'k-seed-7', title: 'First look at the coast', sessionId: 's-seed-1', storyId: 'st-life', kind: 'photo', date: 'March 5', version: 1, photoSrc: 'assets/chat-photo-4.jpg',
      passage: 'Everyone got out of the car at once, even though we still had an hour of driving left after this stop. My brother said it looked exactly like the postcard and nobody argued with him.' },
  ];
  const SYSTEM = [
    'You are the story guide inside Legacy, a warm, private memory-keeping app.',
    'You interview the person like a patient, gifted biographer helping them capture a memory worth keeping forever.',
    'Ask exactly ONE thoughtful, specific follow-up question at a time. Draw out sensory and emotional detail — who was there, what it felt like, the smells and sounds, the small moment that mattered most.',
    'Be warm, curious, and unhurried. Never lecture, never use lists or markdown. Keep replies to 2–4 short sentences and always end with a single gentle question.',
  ].join(' ');
  const FALLBACKS = [
    'That’s a beautiful place to begin. Who was there with you — and what were they doing when you picture that moment?',
    'I can almost see it. What’s one small detail you’ve never forgotten — a smell, a sound, something someone said?',
    'That stays with a person. How did it feel right then — and what do you think that moment taught you?',
    'Tell me more about that. What was happening just before — how did the day lead you there?',
    'There’s a whole story in this. If you could keep one single line from this memory forever, what would it say?',
    'Thank you for trusting me with that. What happened next — where does this memory go from here?',
  ];

  async function askGuide(messages, turn) {
    try {
      if (window.claude && typeof window.claude.complete === 'function') {
        const text = await window.claude.complete({
          system: SYSTEM,
          max_tokens: 400,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        if (text && text.trim()) return text.trim();
      }
    } catch (e) { /* fall through to scripted */ }
    await new Promise((r) => setTimeout(r, 700));
    return FALLBACKS[Math.min(turn, FALLBACKS.length - 1)];
  }

  const CHAT_PHOTOS = ['assets/chat-photo-1.jpg', 'assets/chat-photo-2.jpg', 'assets/chat-photo-3.jpg', 'assets/chat-photo-4.jpg'];

  /* Media — every file ever attached across the account, independent of
     whether it was ever kept as a memory. Mirrors production's MediaItem
     shape (services/media/types.ts) closely enough for the gallery below. */
  const SEED_MEDIA_ITEMS = [
    { id: 'md-1', type: 'image', original_filename: 'workshop-01.jpg', status: 'ready', classification: 'photo', file_size_bytes: 2_340_000, created_at: '2026-03-11T14:20:00Z', sessionId: 's-seed-2', photoSrc: 'assets/chat-photo-1.jpg' },
    { id: 'md-2', type: 'audio', original_filename: 'nana-piano.m4a', status: 'ready', classification: 'voice_memo', file_size_bytes: 1_180_000, created_at: '2026-03-18T09:05:00Z', sessionId: 's-seed-2', derived_content: 'Two minutes of a hymn she had played since she was a girl, recorded on a phone propped against the sugar bowl.' },
    { id: 'md-3', type: 'image', original_filename: 'ferry-line.jpg', status: 'ready', classification: 'photo', file_size_bytes: 3_010_000, created_at: '2026-03-04T11:40:00Z', sessionId: 's-seed-1', photoSrc: 'assets/chat-photo-2.jpg' },
    { id: 'md-4', type: 'document', original_filename: 'dads-letter-scan.pdf', status: 'processing', file_size_bytes: 860_000, created_at: '2026-03-22T16:12:00Z' },
    { id: 'md-5', type: 'image', original_filename: 'coastline.jpg', status: 'failed', error_message: 'Upload interrupted \u2014 the file may be corrupted.', file_size_bytes: 4_450_000, created_at: '2026-03-05T08:30:00Z', sessionId: 's-seed-1' },
    { id: 'md-6', type: 'video', original_filename: 'nanas-kitchen.mov', status: 'ready', classification: 'video', file_size_bytes: 8_920_000, created_at: '2026-03-20T10:02:00Z', sessionId: 's-seed-2', photoSrc: 'assets/chat-photo-3.jpg' },
  ];

  /* Memory kinds — the card adapts to what the memory is being saved around. */
  const MEMORY_KINDS = {
    conversation: { icon: 'feather', eyebrow: 'A memory, written up', running: 'Gathering this memory…', media: null, slots: true, extra: [] },
    photo: { icon: 'image', eyebrow: 'A photograph, remembered', running: 'Looking at this photograph…', media: 'still', slots: false, extra: [['users', 'Who’s in this?'], ['imagePlus', 'Add another']] },
    video: { icon: 'video', eyebrow: 'A moment on film', running: 'Watching this back…', media: 'video', slots: false, extra: [['crop', 'Choose a still']] },
    audio: { icon: 'mic', eyebrow: 'In your own voice', running: 'Listening to this…', media: 'audio', slots: true, extra: [['mic', 'Keep the recording']] },
    document: { icon: 'file', eyebrow: 'From your papers', running: 'Reading this over…', media: 'page', slots: true, extra: [['scan', 'Check the transcription']] },
  };
  const kindOf = (m) => MEMORY_KINDS[m && m.kindKey] || MEMORY_KINDS.conversation;
  /* Ticker copy for the uploading state — cycles while writeMemory resolves,
     one line per kind so it always names what's actually happening. */
  const UPLOAD_TICKER = {
    conversation: ['Gathering this memory', 'Finding the words', 'Almost there'],
    photo: ['Uploading your photo', 'Looking closely', 'Remembering the moment', 'Almost there'],
    video: ['Uploading your video', 'Watching it back', 'Finding the moment', 'Almost there'],
    audio: ['Uploading your recording', 'Listening in', 'Catching every word', 'Almost there'],
    document: ['Uploading your document', 'Reading it over', 'Making sense of the page', 'Almost there'],
  };
  const REWRITE_OPTIONS = ['Make it shorter', 'Add more detail', 'Change the tone', 'Start somewhere else'];
  const UPLOAD_DEFAULT_TITLE = { photo: 'A photograph, kept', video: 'A moment on film, kept', audio: 'A voice, kept', document: 'A paper, kept' };

  /* Sample drafts — used by the Tweaks demo hook so each card type can be
     inspected without waiting on the model. */
  const SAMPLE_DRAFTS = {
    conversation: { title: 'The summer we drove to the coast', passage: 'We left before the light came up, the car still cold, everything we thought we needed piled in the back. I remember the road going quiet the further out we got, and the way the air changed before we ever saw the water — that salt smell arriving first, like it had come out to meet us. Nobody said much. When we came over the last rise and the whole grey shine of it opened up, my mother put her hand flat against the window and left it there. I think about that hand more than I think about the sea.' },
    photo: { title: 'Marty on the back step', passage: 'He always sat on that step, never the grass — something about the warmth coming up through the concrete in the late afternoon. You can see the gap in the fence behind him that he never once used, though he could have. Fourteen years and he never left the yard. I took this the summer before he started slowing down, and I didn’t know at the time that it would be the one I kept.' },
    video: { title: 'Dad singing in the kitchen', passage: 'Forty seconds of him not knowing the camera was on, still in his work shirt, doing the harmony part badly and not caring. You can hear the extractor fan going and my mother laughing somewhere off to the left. This is the only recording I have of his voice. I have watched it more times than I would admit to anyone.' },
    audio: { title: 'Nan’s recipe, in her words', passage: 'She never wrote any of it down, so I sat her at the table with the phone recording and asked her to talk me through it. Four minutes. She keeps saying “a bit of” and “until it looks right,” which used to frustrate me and now seems like the whole point. Near the end you can hear her get distracted by something out the window and lose her place.' },
    document: { title: 'The letter he never sent', passage: 'Found folded inside the back of his address book, dated March 1968, addressed to his brother and never posted. Two pages in that careful hand he used for anything official. He apologises for something he doesn’t name, then spends the rest of it talking about the weather and a car he was thinking of buying. I have read it a dozen times trying to work out what it was about.' },
  };

  const MEMORY_SYSTEM = [
    'You are the archivist inside Legacy, a private memory-keeping app.',
    'Read the conversation and write up the single memory it holds as a finished passage for the person\'s book.',
    'Write in FIRST PERSON, in their own voice, using only details they actually gave. Never invent facts, names, or places.',
    'Warm, plain, unhurried prose. 90-150 words. No markdown, no lists, no headings.',
    'Respond with STRICT JSON only, no prose around it: {"title": "...", "passage": "..."}',
    'The title is 2-6 words, evocative and plain — like a chapter name, not a headline.',
  ].join(' ');

  const MEMORY_FALLBACK = {
    title: 'The summer we drove to the coast',
    passage: 'We left before the light came up, the car still cold, everything we thought we needed piled in the back. I remember the road going quiet the further out we got, and the way the air changed before we ever saw the water — that salt smell arriving first, like it had come out to meet us. Nobody said much. There was a song on that none of us liked enough to change. When we finally came over the last rise and the whole grey shine of it opened up, my mother put her hand flat against the window and left it there. I think about that hand more than I think about the sea.',
  };

  async function writeMemory(messages, note, prior) {
    const transcript = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    try {
      if (window.claude && typeof window.claude.complete === 'function') {
        const body = transcript.map((m) => (m.role === 'user' ? 'THEM: ' : 'GUIDE: ') + m.content).join('\n\n');
        const ask = note
          ? body + '\n\nHere is the version you wrote before:\n\nTITLE: ' + (prior ? prior.title : '') + '\n\n' + (prior ? prior.passage : '') + '\n\nRewrite it, following this instruction from them: ' + note
          : body + '\n\nWrite up this memory now.';
        const text = await window.claude.complete({ system: MEMORY_SYSTEM, max_tokens: 700, messages: [{ role: 'user', content: ask }] });
        const match = text && text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed && parsed.title && parsed.passage) return { title: String(parsed.title).trim(), passage: String(parsed.passage).trim() };
        }
      }
    } catch (e) { /* fall through */ }
    await new Promise((r) => setTimeout(r, 1400));
    const firstUser = transcript.find((m) => m.role === 'user');
    if (!firstUser) return MEMORY_FALLBACK;
    const said = transcript.filter((m) => m.role === 'user').map((m) => m.content.trim()).join(' ');
    const words = firstUser.content.trim().replace(/[.,;:!?—-]+$/, '').split(/\s+/).slice(0, 6).join(' ');
    return {
      title: words.charAt(0).toUpperCase() + words.slice(1),
      passage: said.length > 260 ? said : said + ' ' + MEMORY_FALLBACK.passage.slice(0, 300) + '…',
    };
  }

  /* Photo bookmark — no transcript to draw on, so this asks for a short,
     open caption a person can fill in with the real detail (who/where/when). */
  async function writePhotoCaption() {
    try {
      if (window.claude && typeof window.claude.complete === 'function') {
        const ask = 'Someone just shared a photograph with you and wants to keep it as a memory. You have no details about it yet. Write a short, warm placeholder caption inviting them to fill in the specifics — who is in it, where it was, what was happening. Respond with STRICT JSON only, no prose around it: {"title": "...", "passage": "..."}. Title is 2-6 words, like a chapter name. Passage is 2-3 sentences, first person, warm and plain.';
        const text = await window.claude.complete({ system: MEMORY_SYSTEM, max_tokens: 300, messages: [{ role: 'user', content: ask }] });
        const match = text && text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed && parsed.title && parsed.passage) return { title: String(parsed.title).trim(), passage: String(parsed.passage).trim() };
        }
      }
    } catch (e) { /* fall through */ }
    await new Promise((r) => setTimeout(r, 1300));
    return SAMPLE_DRAFTS.photo;
  }

  /* ── Stories / collaborators / share (from the production widget) ────── */
  const STORIES_SEED = [
    { id: 'st-life', name: 'A Life in Full', tagline: 'The long arc — childhood to now.' },
    { id: 'st-bell', name: 'The Bell Family', tagline: 'Where we came from, and how.' },
    { id: 'st-letters', name: 'Letters to the Grandchildren', tagline: 'The things I want them to keep.' },
  ];
  const SEED_COLLABS = [
    { name: 'Eleanor Hayes', rel: 'Daughter', status: 'joined', joinedDate: 'Aug 3', memoryCount: 4 },
    { name: 'Marcus Bell', rel: 'Brother', status: 'joined', joinedDate: 'Jul 22', memoryCount: 1 },
    { name: 'Sofia Russo', rel: 'Granddaughter', status: 'joined', joinedDate: 'Jul 15', memoryCount: 7 },
  ];
  const initials = (n) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const LINK_BASE = 'heirloom.life/join/';
  const makeToken = () => {
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const g = (k) => Array.from({ length: k }, () => a[Math.floor(Math.random() * a.length)]).join('');
    return g(4) + '-' + g(4) + '-' + g(4);
  };
  const SHARE_URL = 'https://heirloom.life';
  const SHARE_MSG = 'Every life deserves to be told. I’m using Heirloom to turn memories into a real, lasting book — you have to see this.';
  const SHARE_CHANNELS = [
    { key: 'x', label: 'X', glyph: 'X', href: (u, m) => 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(m) + '&url=' + encodeURIComponent(u) },
    { key: 'fb', label: 'Facebook', glyph: 'f', href: (u) => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(u) },
    { key: 'li', label: 'LinkedIn', glyph: 'in', href: (u) => 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(u) },
    { key: 'mail', label: 'Email', icon: 'mail', href: (u, m) => 'mailto:?subject=' + encodeURIComponent('A story worth keeping') + '&body=' + encodeURIComponent(m + '\n\n' + u) },
  ];

  const LS = 'legacy.story.canvas.v1';
  const REASON_UP = ['Felt personal', 'Great question', 'Nice pacing', 'Other'];
  const REASON_DOWN = ['Too generic', 'Off tone', 'Repetitive', 'Missed the point', 'Other'];
  const loadState = () => {
    try {
      const r = JSON.parse(localStorage.getItem(LS) || '{}');
      if (Array.isArray(r.messages)) {
        r.messages = r.messages.map((m) => {
          if (m.role === 'tool') {
            // running AND draft are both stale on reload — an unreconciled draft
            // persists forever and (via keepDisabled/hasMemory) kills every path
            // to making a new memory.
            return (m.state === 'running' || m.state === 'draft' || m.state === 'ready' || m.state === 'error') ? { ...m, state: 'discarded' } : m;
          }
          if (m.streaming) return { ...m, streaming: false, stopped: !m.content ? m.stopped : true };
          if (m.status === 'sending') return { ...m, status: 'failed' };
          return m;
        }).filter((m) => !(m.role === 'assistant' && !m.content))
          // Drop reconciled cards entirely rather than leaving a stack of
          // "Memory discarded" lines in a restored transcript.
          .filter((m) => !(m.role === 'tool' && m.state === 'discarded'));
      }
      return r;
    } catch (e) { return {}; }
  };

  /* ── Small styled primitives ──────────────────────────────────────────── */
  const iconBtn = { display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 9, background: 'transparent', border: 'none', color: 'var(--hl-muted)', cursor: 'pointer', transition: 'background .15s,color .15s' };
  function IconBtn({ n, s = 18, label, onClick, style }) {
    return (
      <button type="button" aria-label={label} title={label} onClick={onClick} style={{ ...iconBtn, ...style }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
        <Icon n={n} s={s} />
      </button>
    );
  }

  /* ── Sidebar ──────────────────────────────────────────────────────────── */
  function Sidebar({ sessions, activeId, onNew, onSelect, onPrompt, onRowAction, onStoryRowAction, onCreateStory, onInvite, onOpenStory, onOpenMediaPage, stories, memories, onClose, onToggleCollapse, query, setQuery, width }) {
    const [convOpen, setConvOpen] = useState(true);
    const [menuId, setMenuId] = useState(null);
    const [storyMenuId, setStoryMenuId] = useState(null);
    const [storyMenuOpen, setStoryMenuOpen] = useState(false);
    const [storiesOpen, setStoriesOpen] = useState(true);
    const [selectedStoryId, setSelectedStoryId] = useState(null);
    useEffect(() => { if (selectedStoryId && !stories.find((s) => s.id === selectedStoryId)) setSelectedStoryId(null); }, [stories]);
    const showSearch = sessions.length >= 6;
    const mems = memories || [];
    const memCount = (sessionId) => mems.filter((k) => k.sessionId === sessionId).length;
    const storyCount = (storyId) => mems.filter((k) => k.storyId === storyId).length;
    const sessionStoryId = (sessionId) => { const k = mems.find((m) => m.sessionId === sessionId); return k ? k.storyId : null; };
    const inStory = sessions.filter((s) => !selectedStoryId || sessionStoryId(s.id) === selectedStoryId || sessionStoryId(s.id) == null);
    const q = query ? query.toLowerCase() : '';
    const sessionMatches = (s) => !q || s.title.toLowerCase().includes(q) || mems.some((k) => k.sessionId === s.id && ((k.title || '').toLowerCase().includes(q) || (k.passage || '').toLowerCase().includes(q)));
    const filteredUnsorted = q ? inStory.filter(sessionMatches) : inStory;
    const filtered = activeId ? [...filteredUnsorted].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0)) : filteredUnsorted;
    const storyMatches = (st) => !q || st.name.toLowerCase().includes(q) || (st.tagline || '').toLowerCase().includes(q) || mems.some((k) => k.storyId === st.id && ((k.title || '').toLowerCase().includes(q) || (k.passage || '').toLowerCase().includes(q)));
    const filteredStories = q ? stories.filter(storyMatches) : stories;
    const selectedStory = stories.find((s) => s.id === selectedStoryId);
    const sectionLabel = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    const navRow = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', borderRadius: 10, background: 'transparent', border: 'none', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background .15s' };
    const hov = (e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)');
    const unhov = (e) => (e.currentTarget.style.background = 'transparent');
    if (width && width <= 60) {
      return (
        <aside style={{ width, minWidth: width, maxWidth: width, flex: '0 0 auto', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'var(--hl-surface-2)', padding: '14px 0' }}>
          {onToggleCollapse && <IconBtn n="chevronRight" s={17} label="Expand menu" onClick={onToggleCollapse} />}
          <button aria-label="New chat" title="New chat" onClick={onNew} style={{ ...iconBtn, color: 'var(--hl-accent)' }}><Icon n="pen" s={17} /></button>
          <div style={{ width: 22, height: 1, background: 'var(--hl-border)', margin: '8px 0' }} />
          <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%' }}>
            {stories.map((st) => {
              const n = storyCount(st.id);
              return (
                <button key={st.id} title={st.name + (n ? ' \u2014 ' + n + (n === 1 ? ' memory' : ' memories') : '')} onClick={() => onOpenStory(st.id)}
                  style={{ position: 'relative', width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <Icon n="bookOpen" s={16} />
                  {n > 0 && <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 7, background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-mono)', fontSize: 9, lineHeight: '14px', textAlign: 'center' }}>{n}</span>}
                </button>
              );
            })}
          </div>
        </aside>
      );
    }
    return (
      <aside style={{ width: width || 264, minWidth: width || 264, maxWidth: width || 264, flex: '0 0 auto', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--hl-surface-2)', borderRight: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 10px 10px 12px', minHeight: 28, borderBottom: '1px solid var(--hl-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--hl-border)', background: 'var(--hl-surface)' }}>
            <Icon n="search" s={15} style={{ color: 'var(--hl-faint)', flexShrink: 0 }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memories & stories" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-text)' }} />
          </div>
          {onClose ? (
            <IconBtn n="x" s={18} label="Close menu" onClick={onClose} />
          ) : (
            <IconBtn n="chevronLeft" s={17} label="Collapse menu" onClick={onToggleCollapse} />
          )}
        </div>

        <div style={{ padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button style={navRow} onClick={onNew} onMouseEnter={hov} onMouseLeave={unhov}><Icon n="pen" s={17} style={{ color: 'var(--hl-accent)' }} /> New Chat</button>
          <button style={{ ...navRow, color: 'var(--hl-muted)' }} onClick={() => onOpenMediaPage && onOpenMediaPage()} onMouseEnter={hov} onMouseLeave={unhov}><Icon n="image" s={17} style={{ color: 'var(--hl-muted)' }} /> Media</button>
          <button style={{ ...navRow, color: 'var(--hl-faint)', cursor: 'default' }}><Icon n="share" s={17} style={{ color: 'var(--hl-faint)' }} /> Share Heirloom</button>
        </div>

        <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 12px 16px' }}>
          <button onClick={() => setConvOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 6px 8px', width: '100%' }}>
            <Icon n="bookmark" s={12} style={{ color: 'var(--hl-faint)' }} />
            <span style={sectionLabel}>Memories</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--hl-accent)' }}>{selectedStoryId ? storyCount(selectedStoryId) : mems.length}</span>
            <Icon n="chevron" s={12} style={{ marginLeft: 'auto', transform: convOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .2s', color: 'var(--hl-faint)' }} />
          </button>
          {convOpen && filtered.map((s) => {
            const n = memCount(s.id);
            return (
            <div key={s.id} style={{ position: 'relative', paddingLeft: 10, marginLeft: 6, borderLeft: '1px solid var(--hl-border)' }}>
              <button onClick={() => onSelect(s.id)} onMouseEnter={hov} onMouseLeave={unhov}
                style={{ ...navRow, fontWeight: s.id === activeId ? 600 : 400, background: s.id === activeId ? 'color-mix(in srgb, var(--hl-accent) 12%, transparent)' : 'transparent', paddingRight: n ? 58 : 34 }}>
                {s.starred && <Icon n="star" s={12} fill="var(--hl-accent)" style={{ color: 'var(--hl-accent)', flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
              </button>
              {n > 0 && (
                <span title={n + (n === 1 ? ' memory kept' : ' memories kept')} style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', gap: 3, pointerEvents: 'none', color: 'var(--hl-accent)' }}>
                  <Icon n="bookmark" s={11} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1 }}>{n}</span>
                </span>
              )}
              <button aria-label="More" onClick={() => setMenuId(menuId === s.id ? null : s.id)} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--hl-faint)', cursor: 'pointer' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><i style={dot} /><i style={dot} /><i style={dot} /></span>
              </button>
              {menuId === s.id && (
                <div style={{ position: 'absolute', right: 6, top: '100%', zIndex: 5, marginTop: 2, width: 210, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 12, boxShadow: '0 18px 44px -18px var(--hl-shadow)', padding: 6 }}>
                  {[['star', s.starred ? 'Unstar' : 'Star', 'star'], ['pen', 'Rename', 'rename'], ['userPlus', 'Invite collaborators', 'invite'], ['folder', 'Move to story', 'move'], ['folderMinus', 'Remove from story', 'remove']].map(([ic, lbl, act]) => (
                    <button key={act} onClick={() => { setMenuId(null); onRowAction(s.id, act); }} style={{ ...menuItem, whiteSpace: 'nowrap' }} onMouseEnter={hov} onMouseLeave={unhov}>
                      <Icon n={ic} s={15} style={{ color: 'var(--hl-muted)', flexShrink: 0 }} /> {lbl}
                    </button>
                  ))}
                  <div style={{ height: 1, background: 'var(--hl-border)', margin: '6px 8px' }} />
                  <button onClick={() => { setMenuId(null); onRowAction(s.id, 'delete'); }} style={{ ...menuItem, whiteSpace: 'nowrap', color: 'var(--hl-danger, #B0432F)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-danger, #B0432F) 14%, transparent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <Icon n="trash" s={15} style={{ color: 'var(--hl-danger, #B0432F)', flexShrink: 0 }} /> Delete
                  </button>
                </div>
              )}
            </div>
            );
          })}

          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '18px 6px 10px' }}>
            <Icon n="bookOpen" s={13} style={{ color: 'var(--hl-faint)' }} />
            <span style={sectionLabel}>Stories</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
              <button aria-label="Create a new story" title="Create a new story" onClick={onCreateStory}
                style={{ ...iconBtn, width: 24, height: 24, color: 'var(--hl-accent)' }}><Icon n="plus" s={14} /></button>
              <button aria-label={storiesOpen ? 'Collapse stories' : 'Expand stories'} onClick={() => setStoriesOpen((v) => !v)}
                style={{ ...iconBtn, width: 24, height: 24 }}><Icon n="chevron" s={12} style={{ transform: storiesOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .2s', color: 'var(--hl-faint)' }} /></button>
            </span>
          </div>
          <div style={{ display: storiesOpen ? 'flex' : 'none', flexDirection: 'column', gap: 1, marginBottom: 8, paddingBottom: 8 }}>
            {filteredStories.map((st) => (
              <div key={st.id} title={st.tagline || st.name} onClick={() => onOpenStory(st.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 8px 8px 10px', borderRadius: 9, background: st.id === selectedStoryId ? 'color-mix(in srgb, var(--hl-accent) 10%, transparent)' : 'transparent', color: 'var(--hl-text)', cursor: 'pointer', transition: 'background .18s' }}>
                <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: 'var(--hl-accent)', opacity: 0.55 }} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 15.5, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.name}</span>
                {storyCount(st.id) > 0 && (
                  <span title={storyCount(st.id) + (storyCount(st.id) === 1 ? ' memory' : ' memories')} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--hl-accent)' }}>
                    <Icon n="bookmark" s={11} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1 }}>{storyCount(st.id)}</span>
                  </span>
                )}
                <button aria-label={'Invite collaborators to ' + st.name} title="Invite collaborators" onClick={(e) => { e.stopPropagation(); onInvite(st.id); }}
                  style={{ ...iconBtn, width: 22, height: 22, flexShrink: 0, color: 'var(--hl-faint)' }}
                  onMouseEnter={(e) => { e.stopPropagation(); e.currentTarget.style.color = 'var(--hl-accent)'; }}
                  onMouseLeave={(e) => { e.stopPropagation(); e.currentTarget.style.color = 'var(--hl-faint)'; }}><Icon n="userPlus" s={12} /></button>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button aria-label="More" onClick={(e) => { e.stopPropagation(); setStoryMenuId(storyMenuId === st.id ? null : st.id); }}
                    style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--hl-faint)', cursor: 'pointer' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><i style={dot} /><i style={dot} /><i style={dot} /></span>
                  </button>
                  {storyMenuId === st.id && (
                    <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: '100%', zIndex: 5, marginTop: 2, width: 190, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 12, boxShadow: '0 18px 44px -18px var(--hl-shadow)', padding: 6 }}>
                      {[['star', st.starred ? 'Unstar' : 'Star', 'star'], ['pen', 'Rename', 'rename'], ['shield', 'Admin', 'admin']].map(([ic, lbl, act]) => (
                        <button key={act} onClick={() => { setStoryMenuId(null); onStoryRowAction(st.id, act); }} style={{ ...menuItem, whiteSpace: 'nowrap' }} onMouseEnter={hov} onMouseLeave={unhov}>
                          <Icon n={ic} s={15} style={{ color: 'var(--hl-muted)', flexShrink: 0 }} /> {lbl}
                        </button>
                      ))}
                      <div style={{ height: 1, background: 'var(--hl-border)', margin: '6px 8px' }} />
                      <button onClick={() => { setStoryMenuId(null); onStoryRowAction(st.id, 'delete'); }} style={{ ...menuItem, whiteSpace: 'nowrap', color: 'var(--hl-danger, #B0432F)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-danger, #B0432F) 14%, transparent)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <Icon n="trash" s={15} style={{ color: 'var(--hl-danger, #B0432F)', flexShrink: 0 }} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '18px 6px 8px' }}><span style={sectionLabel}>Writing prompts</span></div>          {PROMPTS.map((p, i) => (
            <button key={i} onClick={() => onPrompt(p)} onMouseEnter={hov} onMouseLeave={unhov}
              style={{ ...navRow, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, color: 'var(--hl-muted)' }}>
              <Icon n="spark" s={14} style={{ color: 'var(--hl-accent)', flexShrink: 0, marginTop: 2 }} /><span>{p}</span>
            </button>
          ))}
        </div>
      </aside>
    );
  }
  const dot = { width: 3, height: 3, borderRadius: 9, background: 'currentColor', display: 'block' };
  const menuItem = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 13.5, cursor: 'pointer', textAlign: 'left' };

  /* ── Messages ─────────────────────────────────────────────────────────── */
  function Avatar() {
    return <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 99, background: 'var(--hl-accent)', display: 'grid', placeItems: 'center', color: 'var(--hl-on-accent)', marginTop: 2 }}><Icon n="feather" s={17} /></span>;
  }

  function ActBtn({ label, icon, onClick, active, disabled, tone }) {
    const activeColor = tone === 'danger' ? 'var(--hl-danger, #B0432F)' : 'var(--hl-accent)';
    const activeBg = tone === 'danger' ? 'color-mix(in srgb, var(--hl-danger, #B0432F) 14%, transparent)' : 'var(--hl-accent-soft)';
    return (
      <button onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={!!active} style={{
        width: 28, height: 28, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: active ? activeBg : 'transparent', color: active ? activeColor : 'var(--hl-muted)',
        opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer', transition: 'background .15s, color .15s',
        animation: active ? 'hl-pop .28s ease' : 'none',
      }}
        onMouseEnter={(e) => { if (!disabled && !active) { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; } }}
        onMouseLeave={(e) => { if (!disabled && !active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; } }}>
        <Icon n={icon} s={14} />
      </button>
    );
  }

  function Bubble({ message, onResend, onRegenerate, onVersion, onRate, onCopy, onFeedback, onEdit, onRetry, onKeep, keepDisabled }) {
    const [hover, setHover] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(message.content);
    const editRef = useRef(null);
    useEffect(() => {
      if (!editing) return;
      const el = editRef.current;
      if (!el) return;
      el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';
      el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    }, [editing]);
    const startEdit = () => { setDraft(message.content); setEditing(true); };
    const cancelEdit = () => setEditing(false);
    const saveEdit = () => { const t = draft.trim(); setEditing(false); if (t && t !== message.content) onEdit(t); };
    const [popover, setPopover] = useState(null); // null | 'up' | 'down'
    const [reasons, setReasons] = useState([]);
    const [note, setNote] = useState('');
    const popRef = useRef(null);

    useEffect(() => {
      if (!popover) return;
      const onDoc = (e) => { if (popRef.current && !popRef.current.contains(e.target)) closePopover(); };
      const onKey = (e) => { if (e.key === 'Escape') closePopover(); };
      window.addEventListener('mousedown', onDoc);
      window.addEventListener('keydown', onKey);
      const raf = requestAnimationFrame(() => {
        const el = popRef.current;
        if (!el) return;
        let node = el.parentElement;
        let container = null;
        while (node) { if (node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) { container = node; break; } node = node.parentElement; }
        if (!container) return;
        const elRect = el.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        if (elRect.bottom > contRect.bottom) container.scrollTop += (elRect.bottom - contRect.bottom) + 16;
        else if (elRect.top < contRect.top) container.scrollTop -= (contRect.top - elRect.top) + 16;
      });
      return () => { window.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); cancelAnimationFrame(raf); };
    }, [popover]);

    const closePopover = () => { setPopover(null); setReasons([]); setNote(''); };
    const toggleReason = (r) => setReasons((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
    const clickThumb = (val) => {
      if (message.rating === val) { onRate(val); closePopover(); return; }
      onRate(val);
      setReasons([]); setNote('');
      setPopover(val);
    };
    const submitFeedback = () => { onFeedback && onFeedback(reasons, note); closePopover(); };
    const isUser = message.role === 'user';
    const failed = isUser && message.status === 'failed';
    const sending = isUser && message.status === 'sending';
    const hasVersions = !isUser && message.versions && message.versions.length > 1;
    const showActions = !isUser && !message.streaming && message.content;
    const showUserActions = isUser && !editing && message.status !== 'sending' && message.status !== 'failed';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 5 }}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div style={{ display: 'flex', gap: 12, justifyContent: isUser ? 'flex-end' : 'flex-start', width: '100%' }}>
          {!isUser && <Avatar />}
          {isUser && editing ? (
            <div style={{ width: '100%', maxWidth: '86%', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 18, borderBottomRightRadius: 5, padding: 12 }}>
              <textarea ref={editRef} value={draft}
                onChange={(e) => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); } }}
                rows={1}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'none', overflow: 'hidden', border: 'none', background: 'transparent', outline: 'none', padding: 0, fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.62, color: 'var(--hl-text)' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={cancelEdit} style={{ padding: '7px 13px', borderRadius: 9, border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveEdit} disabled={!draft.trim()} style={{ padding: '7px 15px', borderRadius: 9, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, cursor: draft.trim() ? 'pointer' : 'not-allowed', opacity: draft.trim() ? 1 : 0.5 }}>Send</button>
              </div>
            </div>
          ) : (
          <div onClick={failed ? onResend : undefined} role={failed ? 'button' : undefined} tabIndex={failed ? 0 : undefined}
            style={{
              maxWidth: '76%', borderRadius: 18, padding: isUser ? '12px 16px' : '2px 0',
              fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.62, color: 'var(--hl-text)', whiteSpace: 'pre-wrap',
              background: isUser ? (failed ? 'color-mix(in srgb, var(--hl-danger, #B0432F) 10%, var(--hl-surface))' : 'var(--hl-surface)') : 'transparent',
              border: isUser ? (failed ? '1px solid color-mix(in srgb, var(--hl-danger, #B0432F) 45%, transparent)' : '1px solid var(--hl-border)') : 'none',
              borderBottomRightRadius: isUser ? 5 : 18,
              borderBottomLeftRadius: isUser ? 18 : 5,
              opacity: sending ? 0.55 : 1,
              cursor: failed ? 'pointer' : 'default',
              transition: 'opacity .2s',
              animation: failed ? 'hl-shake .32s ease' : 'none',
            }}>
            {message.content}
            {!isUser && message.streaming && (
              <span style={{ display: 'inline-block', width: 2, height: 15, marginLeft: 3, verticalAlign: '-2px', background: 'var(--hl-accent)', animation: 'hl-blink 1s step-start infinite' }} />
            )}
          </div>
          )}
        </div>

        {showUserActions && (
          <div className="hl-acts" style={{ display: 'flex', alignItems: 'center', gap: 1, paddingRight: 2, opacity: hover ? 1 : 0, transition: 'opacity .15s' }}>
            {message.edited && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--hl-faint)', marginRight: 5 }}>Edited</span>}
            {onKeep && !keepDisabled && <ActBtn label="Keep this as a memory" icon="bookmark" active={message.suggestKeep} onClick={onKeep} />}
            <ActBtn label="Edit message" icon="pencil" onClick={startEdit} />
            <ActBtn label="Copy" icon="copy" onClick={onCopy} />
            <ActBtn label="Send again" icon="refresh" onClick={onRetry} />
            <span style={{ width: 1, height: 14, background: 'var(--hl-border)', margin: '0 5px' }} />
            <ActBtn label="Good response" icon="thumbsUp" active={message.rating === 'up'} onClick={() => clickThumb('up')} />
            <ActBtn label="Bad response" icon="thumbsDown" tone="danger" active={message.rating === 'down'} onClick={() => clickThumb('down')} />
          </div>
        )}

        {isUser && (sending || failed) && (
          <div onClick={failed ? onResend : undefined} style={{
            display: 'flex', alignItems: 'center', gap: 5, paddingRight: 4, fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '.03em', color: failed ? 'var(--hl-danger, #B0432F)' : 'var(--hl-faint)', cursor: failed ? 'pointer' : 'default',
          }}>
            {sending
              ? <React.Fragment><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--hl-faint)', animation: 'lgBounce 1s ease-in-out infinite' }} />Sending…</React.Fragment>
              : <React.Fragment><Icon n="alertTriangle" s={12} />Not delivered · Tap to retry</React.Fragment>}
          </div>
        )}

        {showActions && (
          <div className="hl-acts" style={{ display: 'flex', alignItems: 'center', gap: 1, paddingLeft: 44, opacity: (hover || message.rating || (message.suggestKeep && !keepDisabled)) ? 1 : 0.5, transition: 'opacity .15s' }}>
            {message.stopped && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--hl-faint)', marginRight: 5 }}>Stopped</span>}
            {onKeep && !keepDisabled && <ActBtn label="Keep this as a memory" icon="bookmark" active={message.suggestKeep} onClick={onKeep} />}
            <ActBtn label="Copy" icon="copy" onClick={onCopy} />
            <ActBtn label="Regenerate response" icon="refresh" onClick={onRegenerate} />
            {hasVersions && (
              <React.Fragment>
                <ActBtn label="Previous version" icon="chevronLeft" onClick={() => onVersion(-1)} disabled={message.versionIdx === 0} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hl-faint)', minWidth: 30, textAlign: 'center' }}>{message.versionIdx + 1}/{message.versions.length}</span>
                <ActBtn label="Next version" icon="chevronRight" onClick={() => onVersion(1)} disabled={message.versionIdx === message.versions.length - 1} />
              </React.Fragment>
            )}
            <span style={{ width: 1, height: 14, background: 'var(--hl-border)', margin: '0 5px' }} />
            <ActBtn label="Good response" icon="thumbsUp" active={message.rating === 'up'} onClick={() => clickThumb('up')} />
            <ActBtn label="Bad response" icon="thumbsDown" tone="danger" active={message.rating === 'down'} onClick={() => clickThumb('down')} />
          </div>
        )}

        {popover && (
          <div ref={popRef} style={{ width: '100%', maxWidth: 340, paddingLeft: 44, animation: 'hl-modal-in .18s cubic-bezier(.22,1,.36,1)' }}>
            <div style={{ position: 'relative', background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 14, padding: 12, boxShadow: '0 18px 44px -18px var(--hl-shadow)', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <button onClick={closePopover} aria-label="Close" style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
                <Icon n="x" s={14} />
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--hl-faint)', paddingRight: 20 }}>{popover === 'up' ? 'What worked?' : 'What went wrong?'}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(popover === 'up' ? REASON_UP : REASON_DOWN).map((r) => {
                  const on = reasons.includes(r);
                  return (
                    <button key={r} onClick={() => toggleReason(r)} style={{
                      padding: '6px 11px', borderRadius: 99, fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
                      border: '1px solid', borderColor: on ? 'var(--hl-accent)' : 'var(--hl-border)',
                      background: on ? 'var(--hl-accent-soft)' : 'transparent', color: on ? 'var(--hl-accent)' : 'var(--hl-muted)',
                    }}>{r}</button>
                  );
                })}
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add detail (optional)" rows={2}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'none', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--hl-border)', background: 'var(--hl-surface-2)', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={closePopover} style={{ padding: '7px 13px', borderRadius: 9, border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Skip</button>
                <button onClick={submitFeedback} style={{ padding: '7px 15px', borderRadius: 9, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Send feedback</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Memory tool ──────────────────────────────────────────────────────── */
  /* The uploading state — same card shape/position as the resolved memory
     card below (gutter + 520px body), so the swap from “uploading” to
     “written” reads as one card settling in place, never a jump. A pulsing
     thumbnail/icon up top, a crossfading status ticker, and a progress bar
     tied to the same steps — not an unrelated spinner. */
  function UploadingCard({ K, steps }) {
    const [i, setI] = useState(0);
    useEffect(() => {
      setI(0);
      const id = setInterval(() => setI((v) => (v < steps.length - 1 ? v + 1 : v)), 1300);
      return () => clearInterval(id);
    }, [steps]);
    const progress = Math.round(((i + 1) / steps.length) * 92);
    const label = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    const visual = K.media;
    return (
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ width: 32, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, maxWidth: 520, border: '1px solid var(--hl-border-strong)', borderRadius: 16, background: 'var(--hl-surface)', boxShadow: '0 18px 44px -26px var(--hl-shadow)', overflow: 'hidden', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--hl-border)' }}>
            <Icon n={K.icon} s={12} style={{ color: 'var(--hl-accent)' }} />
            <span style={label}>{K.eyebrow}</span>
          </div>
          {(visual === 'still' || visual === 'video') && (
            <div style={{ position: 'relative', aspectRatio: visual === 'video' ? '16 / 9' : '16 / 10', display: 'grid', placeItems: 'center', background: 'var(--hl-surface-2)', borderBottom: '1px solid var(--hl-border)', overflow: 'hidden' }}>
              <span className="up-glow" aria-hidden="true" style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', background: 'var(--hl-accent)' }} />
              <span className="up-hum" style={{ position: 'relative', color: 'var(--hl-accent)' }}><Icon n={K.icon} s={26} /></span>
            </div>
          )}
          {(visual === 'audio' || visual === 'page') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--hl-border)', background: 'var(--hl-surface-2)' }}>
              <span style={{ position: 'relative', flexShrink: 0, width: 34, height: 34 }}>
                <span className="up-glow" aria-hidden="true" style={{ position: 'absolute', inset: -9, borderRadius: '50%', background: 'var(--hl-accent)' }} />
                <span className="up-hum" style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><Icon n={K.icon} s={16} /></span>
              </span>
              <span className="up-shimmer-bar" style={{ flex: 1, height: 10, borderRadius: 99 }} />
            </div>
          )}
          <div style={{ padding: '15px 18px 16px' }}>
            <div style={{ position: 'relative', height: 18, overflow: 'hidden' }}>
              <span key={i} className="up-ticker" style={{ position: 'absolute', inset: 0, fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-muted)' }}>{steps[i]}…</span>
            </div>
            <div style={{ marginTop: 11, height: 3, borderRadius: 99, background: 'var(--hl-border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: progress + '%', borderRadius: 99, background: 'var(--hl-accent)', transition: 'width 1.15s cubic-bezier(.4,0,.2,1)' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  function MemoryCard({ message, stories, onSave, onRewrite, onDiscard, onOpen, onExtra, onRetry, onOpenMedia }) {
    const [storyId, setStoryId] = useState(message.storyId || (stories[0] && stories[0].id) || '');
    const st = message.state;
    const K = kindOf(message);
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(message.title);
    useEffect(() => { setTitleDraft(message.title); }, [message.title]);
    const commitTitle = () => {
      const trimmed = titleDraft.trim();
      setEditingTitle(false);
      if (trimmed && trimmed !== message.title) onRetitle(trimmed);
      else setTitleDraft(message.title);
    };
    const label = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    const ghost = { padding: '8px 13px', borderRadius: 9, border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', transition: 'color .15s, border-color .15s' };

    if (st === 'running') {
      return <UploadingCard K={K} steps={UPLOAD_TICKER[message.kindKey] || UPLOAD_TICKER.conversation} />;
    }

    if (st === 'discarded') {
      return (
        <div style={{ paddingLeft: 44, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>Memory discarded</div>
      );
    }

    if (st === 'saved') {
      const story = stories.find((s) => s.id === message.storyId);
      return (
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ width: 32, flexShrink: 0 }} />
          <button onClick={onOpen} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '11px 14px', borderRadius: 13, border: '1px solid var(--hl-border)', background: 'var(--hl-surface)', cursor: 'pointer', transition: 'border-color .18s' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--hl-border-strong)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--hl-border)')}>
            {message.photoSrc ? (
              <img src={message.photoSrc} alt="" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, objectFit: 'cover', border: '1px solid var(--hl-border)' }} />
            ) : (
              <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><Icon n={K.icon} s={12} /></span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 15.5, lineHeight: 1.25, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{message.title}</span>
              <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--hl-faint)', marginTop: 2 }}>Kept in {story ? story.name : 'your book'}</span>
            </span>
          </button>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ width: 32, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, maxWidth: 520, border: '1px solid var(--hl-border-strong)', borderRadius: 16, background: 'var(--hl-surface)', boxShadow: '0 18px 44px -26px var(--hl-shadow)', overflow: 'hidden', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--hl-border)' }}>
            <Icon n={K.icon} s={12} style={{ color: 'var(--hl-accent)' }} />
            <span style={label}>{K.eyebrow}</span>
          </div>
          {K.media && <MemoryMedia kind={K.media} photoSrc={message.photoSrc} onOpen={onOpenMedia && (() => onOpenMedia(K.media, message.title, message.photoSrc))} />}
          <div style={{ padding: '16px 18px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              {editingTitle ? (
                <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={commitTitle}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTitle(); } if (e.key === 'Escape') { e.preventDefault(); setTitleDraft(message.title); setEditingTitle(false); } }}
                  aria-label="Memory title"
                  style={{ margin: 0, flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 23, lineHeight: 1.16, letterSpacing: '-.01em', color: 'var(--hl-text)' }} />
              ) : (
                <React.Fragment>
                  <h4 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 23, lineHeight: 1.16, letterSpacing: '-.01em', color: 'var(--hl-text)', textWrap: 'pretty' }}>{message.title}</h4>
                  <button onClick={() => { setTitleDraft(message.title); setEditingTitle(true); }} aria-label="Edit title"
                    style={{ flexShrink: 0, marginTop: 4, border: 'none', background: 'transparent', color: 'var(--hl-faint)', cursor: 'pointer', padding: 2, display: 'grid', placeItems: 'center' }}><Icon n="pencil" s={13} /></button>
                </React.Fragment>
              )}
            </div>
            <p style={{ margin: '11px 0 0', fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.68, color: 'var(--hl-muted)', textWrap: 'pretty' }}>{message.passage}</p>

            {(K.slots || K.media) && (
              <React.Fragment>
                <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={label}>{K.media ? 'Media' : 'Photos'}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--hl-faint)' }}>— add more whenever you find them</span>
                </div>
                <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                  {K.media && (
                    <span title="The media you shared" style={{ width: 52, height: 52, borderRadius: 10, border: '1px solid var(--hl-border-strong)', display: 'grid', placeItems: 'center', color: 'var(--hl-accent)', background: 'var(--hl-accent-soft)' }}><Icon n={K.icon} s={17} /></span>
                  )}
                  {Array.from({ length: K.media ? 2 : 3 }).map((_, i) => (
                    <span key={i} style={{ width: 52, height: 52, borderRadius: 10, border: '1px dashed var(--hl-border-strong)', display: 'grid', placeItems: 'center', color: 'var(--hl-faint)', background: 'var(--hl-surface-2)' }}><Icon n="imagePlus" s={15} /></span>
                  ))}
                </div>
              </React.Fragment>
            )}

            <div style={{ marginTop: 18 }}><span style={label}>Keep it in</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {stories.map((s) => {
                const on = s.id === storyId;
                return (
                  <button key={s.id} onClick={() => setStoryId(s.id)} style={{
                    padding: '6px 12px', borderRadius: 99, fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
                    border: '1px solid', borderColor: on ? 'var(--hl-accent)' : 'var(--hl-border)',
                    background: on ? 'var(--hl-accent-soft)' : 'transparent', color: on ? 'var(--hl-accent)' : 'var(--hl-muted)',
                  }}>{s.name}</button>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 18, paddingTop: 15, borderTop: '1px solid var(--hl-border)' }}>
              {K.extra.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {K.extra.map(([ic, lbl]) => (
                    <button key={lbl} onClick={onExtra} style={{ ...ghost, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', fontSize: 12 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hl-text)'; e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.borderColor = 'var(--hl-border)'; }}>
                      <Icon n={ic} s={13} />{lbl}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => onSave(storyId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hl-accent)')}>
                  <Icon n="bookmark" s={13} />Keep this
                </button>
                <button onClick={onRewrite} style={{ ...ghost, whiteSpace: 'nowrap' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hl-text)'; e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.borderColor = 'var(--hl-border)'; }}>Rewrite</button>
                <button onClick={onDiscard} style={{ ...ghost, border: 'none', marginLeft: 'auto', color: 'var(--hl-faint)', whiteSpace: 'nowrap' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-danger, #B0432F)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-faint)')}>Discard</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* UploadThumb — the real production pattern (UploadThumbnail.tsx): the
     upload renders inline as part of the visitor's own message, not a
     separate card. One persistent element per attachment; shimmer overlay
     while uploading, a small retry badge on failure, tap-to-enlarge once a
     ready photo. No eyebrow, no quick actions, no story chips, no
     Keep/Discard footer — none of that exists in production anymore. */
  function UploadThumb({ kindKey, filename, photoSrc, status, gps, onRetry, onEnlarge, onBookmark, onAddToMemory }) {
    const K = MEMORY_KINDS[kindKey] || MEMORY_KINDS.photo;
    const isImage = kindKey === 'photo';
    const isUploading = status === 'uploading';
    const isFailed = status === 'failed';
    const isReady = status === 'ready';
    const canEnlarge = isImage && isReady && !!onEnlarge;
    const [hover, setHover] = useState(false);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid var(--hl-border)', borderRadius: 16, borderBottomRightRadius: 5, background: 'var(--hl-surface)', ...(isImage ? { width: 192 } : { display: 'flex', alignItems: 'center', gap: 10, maxWidth: '75%', padding: '10px 14px' }) }}>
          {isImage ? (
            <div onClick={canEnlarge ? () => onEnlarge('still', filename, photoSrc) : undefined}
              style={{ width: 192, height: 144, display: 'grid', placeItems: 'center', background: 'var(--hl-surface-2)', color: 'var(--hl-faint)', cursor: canEnlarge ? 'zoom-in' : 'default', overflow: 'hidden' }}>
              {photoSrc ? <img src={photoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon n="image" s={26} style={{ opacity: 0.45 }} />}
            </div>
          ) : (
            <React.Fragment>
              <span style={{ flexShrink: 0, color: 'var(--hl-accent)' }}><Icon n={K.icon} s={16} /></span>
              <span style={{ minWidth: 0, flex: 1, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--hl-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</span>
            </React.Fragment>
          )}
          {isUploading && (
            <span aria-hidden="true" className="up-shimmer-bar" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
          )}
          {isFailed && (
            <button aria-label={'Retry — ' + filename} title="Couldn't finish uploading — retry" onClick={onRetry}
              style={{ position: 'absolute', bottom: 6, right: 6, width: 24, height: 24, borderRadius: 99, border: 'none', background: 'var(--hl-danger, #B0432F)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Icon n="alertTriangle" s={12} />
            </button>
          )}
        </div>
        {isImage && isReady && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div className="hl-acts" style={{ display: 'flex', alignItems: 'center', gap: 1, paddingRight: 2, opacity: hover ? 1 : 0, transition: 'opacity .15s' }}>
              <ActBtn label="Bookmark as a memory" icon="bookmark" onClick={onBookmark} />
              <ActBtn label="Add to a memory" icon="plus" onClick={onAddToMemory} />
            </div>
            {gps && <span title="GPS data found" aria-label="GPS data found" style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)' }}><Icon n="mapPin" s={14} /></span>}
          </div>
        )}
      </div>
    );
  }

  function SessionMemoriesPanel({ memories, stories, onClose, onOpen, selectMode, onConfirm }) {
    const [checked, setChecked] = useState([]);
    const [saved, setSaved] = useState(false);
    const toggle = (id) => setChecked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
    const save = () => {
      setSaved(true);
      onConfirm(checked);
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--hl-border)' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, color: 'var(--hl-text)' }}>{selectMode ? 'Add photo to which memories?' : 'Memories from this chat'}</h3>
            <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>{selectMode ? 'Select one or more' : memories.length + ' kept this session'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 6 }}><Icon n="x" s={18} /></button>
        </header>
        <div className="lg-scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 20, overflowY: 'auto' }}>
          {memories.map((k) => {
            const story = stories.find((s) => s.id === k.storyId);
            const K = MEMORY_KINDS[k.kind] || MEMORY_KINDS.conversation;
            const on = checked.includes(k.id);
            return (
              <button key={k.id} onClick={() => selectMode ? toggle(k.id) : onOpen(k.id)} disabled={saved}
                style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', border: '1px solid ' + (on ? 'var(--hl-accent)' : 'var(--hl-border)'), borderRadius: 14, background: on ? 'var(--hl-accent-soft)' : 'var(--hl-surface)', padding: '14px 16px', cursor: saved ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 14, opacity: saved && !on ? 0.5 : 1, transition: 'border-color .15s, background .15s, opacity .15s' }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; }} onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = 'var(--hl-border)'; }}>
                <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><Icon n={K.icon} s={16} /></span>                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 16, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.title}</span>
                    <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.05em', color: 'var(--hl-faint)' }}>{k.date}</span>
                  </span>
                  {story && <span style={{ display: 'block', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.05em', color: 'var(--hl-accent)' }}>Featured in {story.name}</span>}
                  <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.4, color: 'var(--hl-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.passage}</span>
                </span>
                {!selectMode && <Icon n="chevronRight" s={16} style={{ flexShrink: 0, color: 'var(--hl-faint)' }} />}
              </button>
            );
          })}
        </div>
        {selectMode && checked.length > 0 && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--hl-border)', background: 'var(--hl-surface)' }}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-text)' }}>{checked.length} memor{checked.length === 1 ? 'y' : 'ies'} selected</span>
            <button onClick={save} disabled={saved} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: saved ? 'default' : 'pointer', opacity: saved ? 0.7 : 1 }}>
              <Icon n={saved ? 'check' : 'bookmark'} s={14} />{saved ? 'Saved' : 'Save'}
            </button>
          </div>
        )}
      </div>
    );
  }

  function StoryAdminPanel({ story, collaborators, onClose, onRename, onRemoveMember }) {
    const [desc, setDesc] = useState(story.tagline || '');
    const [pendingRemove, setPendingRemove] = useState(null); // member name
    useEffect(() => setDesc(story.tagline || ''), [story.id]);
    const commitDesc = () => { const t = desc.trim(); if (t !== (story.tagline || '')) onRename(t); };
    const label = { display: 'block', marginBottom: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--hl-border)' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, color: 'var(--hl-text)' }}>Admin · {story.name}</h3>
            <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>Members &amp; description</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 6 }}><Icon n="x" s={18} /></button>
        </header>
        <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div>
            <label style={label} htmlFor="story-admin-desc">Description</label>
            <textarea id="story-admin-desc" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={commitDesc} rows={3} placeholder="What is this story about?"
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: '1px solid var(--hl-border)', borderRadius: 10, background: 'var(--hl-surface)', padding: '10px 12px', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-text)', lineHeight: 1.5, outline: 'none' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={label}>Members</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--hl-faint)' }}>{collaborators.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {collaborators.length === 0 && <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-faint)', fontStyle: 'italic' }}>No members yet.</p>}
              {collaborators.map((c) => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--hl-border)' }}>
                  <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{initials(c.name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}{c.rel ? ' · ' + c.rel : ''}</span>
                    <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--hl-faint)' }}>Joined {c.joinedDate} · {c.memoryCount} {c.memoryCount === 1 ? 'memory' : 'memories'}</span>
                  </span>
                  <button onClick={() => setPendingRemove(c.name)} style={{ flexShrink: 0, border: 'none', background: 'transparent', color: 'var(--hl-faint)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.04em', padding: '6px 8px', borderRadius: 7 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hl-danger, #B0432F)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-danger, #B0432F) 10%, transparent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hl-faint)'; e.currentTarget.style.background = 'transparent'; }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        {pendingRemove && (
          <div role="dialog" aria-modal="true" style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'rgba(26,21,15,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ width: '100%', maxWidth: 320, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 14, padding: 20, boxShadow: '0 24px 60px -20px var(--hl-shadow)' }}>
              <p style={{ margin: '0 0 16px', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-text)', lineHeight: 1.5 }}>Remove <strong>{pendingRemove}</strong> from this story? They’ll lose access immediately.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setPendingRemove(null)} style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => { onRemoveMember(pendingRemove); setPendingRemove(null); }} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--hl-danger, #B0432F)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Remove</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function AddMemoriesToStoryPanel({ memories, stories, storyId, onClose, onConfirm }) {
    const [checked, setChecked] = useState([]);
    const [saved, setSaved] = useState(false);
    const toggle = (id) => setChecked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
    const save = () => { setSaved(true); onConfirm(checked); };
    const candidates = memories.filter((k) => k.storyId !== storyId);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--hl-border)' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, color: 'var(--hl-text)' }}>Select memories to add to your story</h3>
            <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>Select one or more</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 6 }}><Icon n="x" s={18} /></button>
        </header>
        <div className="lg-scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 20, overflowY: 'auto' }}>
          {candidates.length === 0 && <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-faint)', fontStyle: 'italic' }}>Every memory is already in this story.</p>}
          {candidates.map((k) => {
            const story = stories.find((s) => s.id === k.storyId);
            const K = MEMORY_KINDS[k.kind] || MEMORY_KINDS.conversation;
            const on = checked.includes(k.id);
            return (
              <button key={k.id} onClick={() => toggle(k.id)} disabled={saved}
                style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', border: '1px solid ' + (on ? 'var(--hl-accent)' : 'var(--hl-border)'), borderRadius: 14, background: on ? 'var(--hl-accent-soft)' : 'var(--hl-surface)', padding: '14px 16px', cursor: saved ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 14, opacity: saved && !on ? 0.5 : 1, transition: 'border-color .15s, background .15s, opacity .15s' }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; }} onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = 'var(--hl-border)'; }}>
                <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><Icon n={K.icon} s={16} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 16, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.title}</span>
                    <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.05em', color: 'var(--hl-faint)' }}>{k.date}</span>
                  </span>
                  {story && <span style={{ display: 'block', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.05em', color: 'var(--hl-accent)' }}>Featured in {story.name}</span>}
                  <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.4, color: 'var(--hl-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.passage}</span>
                </span>
              </button>
            );
          })}
        </div>
        {checked.length > 0 && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--hl-border)', background: 'var(--hl-surface)' }}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-text)' }}>{checked.length} memor{checked.length === 1 ? 'y' : 'ies'} selected</span>
            <button onClick={save} disabled={saved} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: saved ? 'default' : 'pointer', opacity: saved ? 0.7 : 1 }}>
              <Icon n={saved ? 'check' : 'bookOpen'} s={14} />{saved ? 'Added' : 'Add to story'}
            </button>
          </div>
        )}
      </div>
    );
  }

  function MemoryMedia({ kind, photoSrc, onOpen }) {
    const zoomable = onOpen && (kind === 'still' || kind === 'video' || kind === 'page');
    const frame = { position: 'relative', display: 'grid', placeItems: 'center', background: 'var(--hl-surface-2)', borderBottom: '1px solid var(--hl-border)', color: 'var(--hl-faint)', cursor: zoomable ? 'zoom-in' : undefined };
    const zoomHint = zoomable && (
      <span aria-hidden="true" style={{ position: 'absolute', top: 9, left: 10, display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 99, background: 'color-mix(in srgb, var(--hl-text) 55%, transparent)', color: 'var(--hl-bg)', opacity: 0, transition: 'opacity .15s' }} className="mm-zoom-hint"><Icon n="scan" s={13} /></span>
    );
    const badge = { position: 'absolute', bottom: 9, right: 10, padding: '3px 7px', borderRadius: 6, background: 'color-mix(in srgb, var(--hl-text) 62%, transparent)', color: 'var(--hl-bg)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.04em' };
    if (kind === 'audio') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--hl-border)', background: 'var(--hl-surface-2)' }}>
          <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', paddingLeft: 2 }}><Icon n="play" s={13} fill="currentColor" /></span>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3, height: 26 }}>
            {[9, 16, 22, 13, 25, 18, 11, 24, 15, 20, 8, 17, 23, 12, 19, 26, 14, 10, 21, 16, 9, 18, 13, 22].map((h, i) => (
              <i key={i} style={{ flex: 1, height: h, borderRadius: 2, background: 'var(--hl-accent)', opacity: i < 9 ? 0.75 : 0.24 }} />
            ))}
          </span>
          <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hl-faint)' }}>4:12</span>
        </div>
      );
    }
    if (kind === 'video') {
      return (
        <div className="mm-zoom-frame" style={{ ...frame, aspectRatio: '16 / 9' }} onClick={onOpen} role={zoomable ? 'button' : undefined} tabIndex={zoomable ? 0 : undefined} aria-label={zoomable ? 'View larger' : undefined}
          onKeyDown={zoomable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}>
          <span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 99, background: 'color-mix(in srgb, var(--hl-text) 70%, transparent)', color: 'var(--hl-bg)', paddingLeft: 3 }}><Icon n="play" s={17} fill="currentColor" /></span>
          <span style={badge}>1:38</span>
          {zoomHint}
        </div>
      );
    }
    if (kind === 'page') {
      return (
        <div className="mm-zoom-frame" style={{ ...frame, aspectRatio: '16 / 7', background: 'color-mix(in srgb, #C8A96A 9%, var(--hl-surface-2))' }} onClick={onOpen} role={zoomable ? 'button' : undefined} tabIndex={zoomable ? 0 : undefined} aria-label={zoomable ? 'View larger' : undefined}
          onKeyDown={zoomable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}>
          <Icon n="file" s={26} style={{ opacity: 0.5 }} />
          <span style={badge}>2 pages</span>
          {zoomHint}
        </div>
      );
    }
    return (
      <div className="mm-zoom-frame" style={{ ...frame, aspectRatio: '16 / 10', overflow: 'hidden' }} onClick={onOpen} role={zoomable ? 'button' : undefined} tabIndex={zoomable ? 0 : undefined} aria-label={zoomable ? 'View larger' : undefined}
        onKeyDown={zoomable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}>
        {photoSrc ? <img src={photoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon n="image" s={26} style={{ opacity: 0.45 }} />}
        {zoomHint}
      </div>
    );
  }

  function Lightbox({ data, onClose }) {
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    if (!data) return null;
    const big = { display: 'grid', placeItems: 'center', width: '100%', height: '100%', background: 'var(--hl-surface-2)', color: 'var(--hl-faint)' };
    return (
      <div onClick={onClose} role="dialog" aria-modal="true" aria-label={data.title || 'Media'}
        style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, background: 'rgba(20,16,10,0.82)', backdropFilter: 'blur(6px)', animation: 'hl-fade .2s ease' }}>
        <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, width: 38, height: 38, borderRadius: 99, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon n="x" s={18} /></button>
        <div onClick={(e) => e.stopPropagation()} className="sc-slide-up" style={{ width: 'min(560px, 92vw)', maxHeight: '78vh', borderRadius: 16, overflow: 'hidden', boxShadow: '0 40px 80px -30px rgba(0,0,0,0.6)' }}>
          <div style={{ ...big, aspectRatio: data.kind === 'video' ? '16 / 9' : data.kind === 'page' ? '16 / 7' : '16 / 10' }}>
            {data.src ? <img src={data.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon n={data.kind === 'video' ? 'video' : data.kind === 'page' ? 'file' : 'image'} s={48} style={{ opacity: 0.45 }} />}
          </div>
        </div>
        {data.title && <p onClick={(e) => e.stopPropagation()} style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'rgba(255,255,255,0.75)', textAlign: 'center', maxWidth: 480 }}>{data.title}</p>}
      </div>
    );
  }

  function MemoryOffer({ onAccept, onDecline }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 44, animation: 'hl-modal-in .2s ease' }}>
        <button onClick={onAccept} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 99, border: '1px solid var(--hl-accent)', background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <Icon n="bookmark" s={13} />Write it up
        </button>
        <button onClick={onDecline} style={{ padding: '7px 12px', borderRadius: 99, border: 'none', background: 'transparent', color: 'var(--hl-faint)', fontFamily: 'var(--font-body)', fontSize: 12.5, cursor: 'pointer' }}>Not yet</button>
      </div>
    );
  }

  /* Pills offered after a memory action — rewrite direction, or the
     start-a-story nudge after a first save. Free text always still works;
     these are shortcuts, not the only path. */
  function MemoryFollowup({ options, skipLabel, onPick, onSkip }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingLeft: 44, animation: 'hl-modal-in .2s ease' }}>
        {options.map((opt) => (
          <button key={opt} onClick={() => onPick(opt)} style={{ padding: '7px 14px', borderRadius: 99, border: '1px solid var(--hl-accent-line)', background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{opt}</button>
        ))}
        {onSkip && <button onClick={onSkip} style={{ padding: '7px 12px', borderRadius: 99, border: 'none', background: 'transparent', color: 'var(--hl-faint)', fontFamily: 'var(--font-body)', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{skipLabel}</button>}
      </div>
    );
  }

  function Messages({ messages, loading, stories, keepDisabled, onKeep, onResend, onRegenerate, onVersion, onRate, onCopy, onFeedback, onEdit, onRetry, onMemRetry, onMemSave, onMemRewrite, onMemDiscard, onMemOpen, onMemRetitle, onOffer, onRewriteOption, onStoryPrompt, onOpenMedia, onRetryUpload, onBookmarkUpload, onAddUploadToMemory }) {
    const scrollRef = useRef(null);
    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, loading]);
    const [atBottom, setAtBottom] = useState(true);
    const handleScroll = () => {
      const el = scrollRef.current; if (!el) return;
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
    };
    const scrollToBottom = () => { if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); };
    return (
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
      <div ref={scrollRef} className="lg-scroll" onScroll={handleScroll} style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '26px 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {messages.map((m) => (
            m.role === 'tool' ? (
              <MemoryCard key={m.id} message={m} stories={stories} onOpenMedia={onOpenMedia}
                onSave={(storyId) => onMemSave(m.id, storyId)}
                onRewrite={() => onMemRewrite(m.id)}
                onDiscard={() => onMemDiscard(m.id)}
                onOpen={() => onMemOpen(m.id)}
                onExtra={() => onMemOpen(m.id)}
                onRetry={(kindKey) => onMemRetry(m.id, kindKey)}
                onRetitle={(title) => onMemRetitle(m.id, title)} />
            ) : m.upload ? (
              <UploadThumb key={m.id} kindKey={m.upload.kindKey} filename={m.upload.filename} photoSrc={m.upload.photoSrc} status={m.upload.status} gps={m.upload.gps}
                onRetry={() => onRetryUpload(m.id)}
                onEnlarge={(kind, title, src) => onOpenMedia(kind, title, src)}
                onBookmark={() => onBookmarkUpload(m.id)}
                onAddToMemory={() => onAddUploadToMemory(m.id)} />
            ) : (
            <React.Fragment key={m.id}>
            <Bubble message={m}
              onResend={() => onResend(m.id)}
              onRegenerate={() => onRegenerate(m.id)}
              onVersion={(dir) => onVersion(m.id, dir)}
              onRate={(v) => onRate(m.id, v)}
              onCopy={() => onCopy(m.content)}
              onEdit={(text) => onEdit(m.id, text)}
              onRetry={() => onRetry(m.id)}
              onKeep={() => onKeep(m.id)}
              keepDisabled={keepDisabled}
              onFeedback={(reasons, note) => onFeedback(m.id, reasons, note)}
            />
            {m.offer && !m.streaming && <MemoryOffer onAccept={() => onOffer(m.id, true)} onDecline={() => onOffer(m.id, false)} />}
            {m.rewriteOptions && !m.streaming && <MemoryFollowup options={REWRITE_OPTIONS} skipLabel="I’ll just type" onPick={(t) => onRewriteOption(m.id, t)} onSkip={() => onRewriteOption(m.id, null)} />}
            {m.storyPrompt && !m.streaming && <MemoryFollowup options={['Start a story with this']} skipLabel="Not now" onPick={() => onStoryPrompt(m.id, true)} onSkip={() => onStoryPrompt(m.id, false)} />}
            </React.Fragment>
            )
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: 12 }}>
              <Avatar />
              <div style={{ background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 18, borderBottomLeftRadius: 5, padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 9, background: 'var(--hl-faint)', animation: `lgBounce 1.1s ${i * 0.15}s infinite ease-in-out` }} />)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {!atBottom && (
        <button onClick={scrollToBottom} aria-label="Scroll to latest" title="Scroll to latest"
          style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', width: 36, height: 36, borderRadius: 99, border: '1px solid var(--hl-border)', background: 'var(--hl-surface)', color: 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 10px 26px -10px var(--hl-shadow)', animation: 'hl-modal-in .18s cubic-bezier(.22,1,.36,1)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hl-text)'; e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.borderColor = 'var(--hl-border)'; }}>
          <Icon n="chevron" s={16} />
        </button>
      )}
      </div>
    );
  }

  /* ── Composer ─────────────────────────────────────────────────────────── */
  const SOURCES = [['camera', 'Take a photo', 'photo'], ['image', 'Photo library', 'photo'], ['video', 'Record a video', 'video'], ['file', 'Scan a document', 'document'], ['mic', 'Record audio', 'audio'], ['folder', 'Browse files', 'document']];
  function Composer({ onSend, disabled, showStop, onStop, onAttach }) {
    const [text, setText] = useState('');
    const [srcOpen, setSrcOpen] = useState(false);
    const taRef = useRef(null);
    const grow = () => { const el = taRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; };
    const submit = () => { const t = text.trim(); if (!t || disabled) return; onSend(t); setText(''); requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = 'auto'; }); };
    return (
      <div style={{ boxSizing: 'border-box', maxWidth: 680, margin: '0 auto', width: '100%', padding: '0 16px' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 22, padding: '8px 8px 8px 8px', boxShadow: '0 8px 24px -16px var(--hl-shadow)' }}>
          <div style={{ position: 'relative' }}>
            <button aria-label="Add to your story" onClick={() => setSrcOpen((v) => !v)} style={{ ...iconBtn, width: 38, height: 38, color: srcOpen ? 'var(--hl-accent)' : 'var(--hl-muted)' }}><Icon n="plus" s={20} /></button>
            {srcOpen && (
              <>
                <div onClick={() => setSrcOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />
                <div style={{ position: 'absolute', bottom: 'calc(100% + 12px)', left: 0, zIndex: 2, width: 232, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 16, boxShadow: '0 22px 60px -18px var(--hl-shadow)', padding: 6 }}>
                  {SOURCES.map(([ic, lbl, kindKey]) => (
                    <button key={lbl} onClick={() => { setSrcOpen(false); if (onAttach) onAttach(kindKey); }} style={menuItem} onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 7%, transparent)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <Icon n={ic} s={18} style={{ color: 'var(--hl-accent)' }} /> {lbl}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <textarea ref={taRef} rows={1} value={text} placeholder="Share a memory…"
            onChange={(e) => { setText(e.target.value); grow(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            style={{ flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.5, color: 'var(--hl-text)', padding: '9px 2px', maxHeight: 160 }} />
          <button aria-label="Record voice" style={{ ...iconBtn, width: 38, height: 38 }}><Icon n="mic" s={19} /></button>
          {showStop ? (
            <button aria-label="Stop generating" title="Stop generating" onClick={onStop}
              style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 99, border: 'none', display: 'grid', placeItems: 'center', background: 'var(--hl-text)', color: 'var(--hl-bg)', cursor: 'pointer' }}>
              <Icon n="stop" s={14} />
            </button>
          ) : (
            <button aria-label="Send" onClick={submit} disabled={!text.trim() || disabled}
              style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 99, border: 'none', display: 'grid', placeItems: 'center', background: (text.trim() && !disabled) ? 'var(--hl-accent)' : 'color-mix(in srgb, var(--hl-accent) 30%, transparent)', color: 'var(--hl-on-accent)', cursor: (text.trim() && !disabled) ? 'pointer' : 'default', transition: 'background .2s' }}>
              <Icon n="arrowUp" s={19} sw={2.2} />
            </button>
          )}
        </div>
        <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.04em', color: 'var(--hl-faint)', margin: '10px 0 0' }}>Legacy keeps your stories private. Press Enter to send.</p>
      </div>
    );
  }

  /* ── Save-chat bar (appears after a few exchanges) ────────────────────── */
  function SaveBar({ onSave }) {
    return (
      <div style={{ boxSizing: 'border-box', maxWidth: 680, margin: '14px auto 0', padding: '0 16px', width: '100%' }}>
        <button onClick={onSave} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 11, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hl-accent)')}>
          <Icon n="bookmark" s={15} /> Save this chat
        </button>
      </div>
    );
  }

  function prettySize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
  const MEDIA_TILE_BG = { image: 'color-mix(in srgb, var(--hl-accent) 8%, var(--hl-surface-2))', video: 'color-mix(in srgb, var(--hl-accent) 8%, var(--hl-surface-2))', audio: 'color-mix(in srgb, var(--hl-accent) 5%, var(--hl-surface-2))', document: 'color-mix(in srgb, var(--hl-accent) 3%, var(--hl-surface-2))' };
  function MediaTypeIcon({ type, s = 16 }) {
    const n = type === 'audio' ? 'mic' : type === 'video' ? 'video' : type === 'image' ? 'image' : 'file';
    return <Icon n={n} s={s} style={{ color: 'var(--hl-accent)' }} />;
  }
  function StatusBadge({ status }) {
    const badge = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em' };
    if (status === 'ready') return <span style={{ ...badge, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><Icon n="check" s={9} />Ready</span>;
    if (status === 'failed') return <span style={{ ...badge, background: 'color-mix(in srgb, var(--hl-danger, #B0432F) 15%, transparent)', color: 'var(--hl-danger, #B0432F)' }}><Icon n="x" s={9} />Failed</span>;
    return <span style={{ ...badge, background: 'color-mix(in srgb, var(--hl-muted) 15%, transparent)', color: 'var(--hl-muted)' }}><Icon n="refresh" s={9} style={{ animation: 'hl-spin 1s linear infinite' }} />Processing</span>;
  }
  function MediaThumb({ src }) {
    return <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  function MediaCard({ item, onRetry, onAddToMemory, onEdit, onDelete, onRename }) {
    const [retrying, setRetrying] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [draftName, setDraftName] = useState(item.original_filename);
    const date = new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const hasThumb = (item.type === 'image' || item.type === 'video') && item.photoSrc;
    const commitRename = () => {
      const trimmed = draftName.trim();
      if (trimmed && trimmed !== item.original_filename) onRename && onRename(item.id, trimmed);
      setRenaming(false);
    };
    return (
      <div style={{ flex: '1 1 220px', minWidth: 180, maxWidth: 320, border: '1px solid var(--hl-border)', borderRadius: 14, background: 'var(--hl-surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', aspectRatio: '16 / 10', background: hasThumb ? 'var(--hl-surface-2)' : MEDIA_TILE_BG[item.type] || 'var(--hl-surface-2)', display: 'grid', placeItems: 'center' }}>
          {hasThumb ? <MediaThumb src={item.photoSrc} /> : (
            <span style={{ width: 56, height: 56, borderRadius: 99, background: 'var(--hl-accent-soft)', display: 'grid', placeItems: 'center' }}><MediaTypeIcon type={item.type} s={24} /></span>
          )}
          {item.type === 'video' && hasThumb && <span style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 99, background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon n="video" s={12} /></span>}
          <span style={{ position: 'absolute', top: 8, left: 8 }}><StatusBadge status={item.status} /></span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {renaming ? (
            <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)} onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraftName(item.original_filename); setRenaming(false); } }}
              style={{ margin: 0, width: '100%', boxSizing: 'border-box', padding: '3px 6px', borderRadius: 6, border: '1px solid var(--hl-accent)', background: 'var(--hl-surface-2)', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none' }} />
          ) : (
            <button onClick={() => { setDraftName(item.original_filename); setRenaming(true); }} title="Rename file"
              style={{ all: 'unset', cursor: 'text', display: 'flex', alignItems: 'center', gap: 5, width: '100%' }}>
              <p style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-text)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.original_filename}</p>
              <Icon n="pen" s={11} style={{ flexShrink: 0, color: 'var(--hl-faint)' }} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {item.classification && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--hl-faint)', textTransform: 'capitalize' }}>{item.classification.replace(/_/g, ' ')}</span>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--hl-faint)' }}>{item.status === 'processing' ? `Uploaded ${date} · Processing` : `${prettySize(item.file_size_bytes)} · Uploaded ${date}`}</span>
          </div>
          {item.derived_content && (
            <div style={{ borderTop: '1px solid var(--hl-border)', paddingTop: 8 }}>
              <button onClick={() => setExpanded((v) => !v)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--hl-muted)' }}>
                {expanded ? 'Hide' : 'Show'} content
              </button>
              {expanded && <p style={{ margin: '8px 0 0', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--hl-text)', lineHeight: 1.5 }}>{item.derived_content}</p>}
            </div>
          )}
          {item.status === 'failed' && <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--hl-danger, #B0432F)', lineHeight: 1.4 }}>{item.error_message || 'Processing failed. You can try again below.'}</p>}
          {item.status === 'failed' && (
            <button onClick={() => { setRetrying(true); setTimeout(() => { setRetrying(false); onRetry(item.id); }, 500); }} disabled={retrying}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 9, border: 'none', background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', fontFamily: 'var(--font-body)', fontSize: 11.5, cursor: 'pointer', alignSelf: 'flex-start' }}>
              <Icon n="refresh" s={12} style={retrying ? { animation: 'hl-spin 1s linear infinite' } : undefined} />{retrying ? 'Retrying\u2026' : 'Try again'}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderTop: '1px solid var(--hl-border)', paddingTop: 8, marginTop: 2 }}>
            <button onClick={() => onAddToMemory(item)} aria-label="Add to a memory" title="Add to a memory"
              style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}><Icon n="plus" s={14} /></button>
            <button onClick={() => onEdit(item)} aria-label="Edit" title="Edit"
              style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}><Icon n="pen" s={14} /></button>
            <button onClick={() => onDelete(item.id)} aria-label="Delete" title="Delete"
              style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer', marginLeft: 'auto' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-danger, #B0432F) 14%, transparent)'; e.currentTarget.style.color = 'var(--hl-danger, #B0432F)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}><Icon n="trash" s={14} /></button>
          </div>
        </div>
      </div>
    );
  }
  function MediaCardSkeleton() {
    return (
      <div style={{ flex: '1 1 220px', minWidth: 180, maxWidth: 320, border: '1px solid var(--hl-border)', borderRadius: 14, background: 'var(--hl-surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="up-shimmer-bar" style={{ aspectRatio: '16 / 10', borderRadius: 0 }} />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="up-shimmer-bar" style={{ width: '70%', height: 12, borderRadius: 99 }} />
          <span className="up-shimmer-bar" style={{ width: '45%', height: 9, borderRadius: 99 }} />
        </div>
      </div>
    );
  }
  function MediaItemsList({ sessionId, onEditStub, memories, stories, flash }) {
    const [items, setItems] = useState(sessionId ? SEED_MEDIA_ITEMS.filter((it) => it.sessionId === sessionId) : SEED_MEDIA_ITEMS);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [addTarget, setAddTarget] = useState(null);
    const [listLoading, setListLoading] = useState(true);
    useEffect(() => { const t = setTimeout(() => setListLoading(false), 700); return () => clearTimeout(t); }, []);
    const handleRetry = (id) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: 'processing' } : it)));
    if (listLoading) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }} aria-busy="true" aria-label="Loading media">
          {Array.from({ length: 6 }).map((_, i) => <MediaCardSkeleton key={i} />)}
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, textAlign: 'center' }}>
          <Icon n="image" s={26} style={{ color: 'var(--hl-faint)', opacity: 0.6 }} />
          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-muted)' }}>{sessionId ? 'No media in this chat yet.' : 'No media yet. Attach a photo, audio file, or document to a message to get started.'}</p>
        </div>
      );
    }
    return (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {items.map((item) => <MediaCard key={item.id} item={item} onRetry={handleRetry} onDelete={(id) => setPendingDelete(items.find((it) => it.id === id))}
            onAddToMemory={(it) => setAddTarget(it)} onEdit={onEditStub || (() => {})}
            onRename={(id, name) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, original_filename: name } : it)))} />)}
        </div>
        {pendingDelete && (
          <ConfirmDeleteModal item={pendingDelete} onClose={() => setPendingDelete(null)}
            heading="Delete this file?"
            body={<><span style={{ color: 'var(--hl-text)', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16 }}>&ldquo;{pendingDelete.original_filename}&rdquo;</span> will be permanently removed. This can&rsquo;t be undone.</>}
            onConfirm={() => { setItems((prev) => prev.filter((it) => it.id !== pendingDelete.id)); setPendingDelete(null); }} />
        )}
        <div onClick={() => setAddTarget(null)} aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 65, background: 'rgba(26,21,15,0.4)', opacity: addTarget ? 1 : 0, pointerEvents: addTarget ? 'auto' : 'none', transition: 'opacity .25s ease' }} />
        <div role="dialog" aria-modal="true" aria-label="Add to memory" inert={!addTarget ? '' : undefined}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 66, width: 'min(400px, 100vw)', background: 'var(--hl-bg-2)', borderLeft: '1px solid var(--hl-border)', boxShadow: '-20px 0 60px -20px rgba(26,21,15,0.4)', transform: addTarget ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .35s cubic-bezier(.22,1,.36,1)', pointerEvents: addTarget ? 'auto' : 'none' }}>
          {addTarget && (
            <SessionMemoriesPanel memories={memories || []} stories={stories || []} selectMode
              onClose={() => setAddTarget(null)} onOpen={() => {}}
              onConfirm={(ids) => { if (flash) flash(ids.length === 1 ? 'Added to 1 memory' : 'Added to ' + ids.length + ' memories'); setTimeout(() => setAddTarget(null), 700); }} />
          )}
        </div>
      </>
    );
  }
  function MediaGallery({ onClose, sessionId, onBackToChat, backLabel, onEditStub, memories, stories, flash }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--hl-bg-2)' }}>
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--hl-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {onBackToChat && (
              <button onClick={onBackToChat} aria-label="Back to chat" title="Back to chat" style={{ ...iconBtn, flexShrink: 0 }}><Icon n="chevronLeft" s={17} /></button>
            )}
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 16, color: 'var(--hl-text)' }}>Media</h2>
              {backLabel && <p style={{ margin: '1px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--hl-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{backLabel}</p>}
            </div>
          </div>
          <button aria-label="Close media gallery" onClick={onClose} style={iconBtn}><Icon n="x" s={18} /></button>
        </header>
        <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          <MediaItemsList sessionId={sessionId} onEditStub={onEditStub} memories={memories} stories={stories} flash={flash} />
        </div>
      </div>
    );
  }

  /* ── Modals (Begin story / Save) ──────────────────────────────────────── */
  function Modal({ children, onClose, label }) {
    useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k, true); return () => document.removeEventListener('keydown', k, true); }, [onClose]);
    return (
      <div role="dialog" aria-modal="true" aria-label={label} style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', padding: 20 }}>
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(26,21,15,0.42)', backdropFilter: 'blur(3px)' }} />
        <div style={{ position: 'relative', width: '100%', maxWidth: 400, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 20, padding: 26, boxShadow: '0 30px 80px -30px var(--hl-shadow)' }}>{children}</div>
      </div>
    );
  }
  const field = { width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--hl-border)', background: 'var(--hl-bg)', fontFamily: 'var(--font-body)', fontSize: 14.5, color: 'var(--hl-text)', outline: 'none', marginTop: 8 };
  const btnPrimary = { padding: '11px 20px', borderRadius: 11, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' };
  const btnGhost = { padding: '11px 20px', borderRadius: 11, border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 500, cursor: 'pointer' };

  function BeginStory({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    return (
      <Modal onClose={onClose} label="Begin a story">
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 24, margin: '0 0 4px', color: 'var(--hl-text)' }}>Begin a story</h3>
        <p style={{ fontSize: 13.5, color: 'var(--hl-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>A story gathers related memories into one book you can share and publish.</p>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>Name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onCreate(name.trim(), desc.trim())} placeholder="e.g. Dad’s life in his own words" style={field} />
        <label style={{ display: 'block', marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>Description <span style={{ textTransform: 'none', letterSpacing: 0 }}>(shown on hover)</span></label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" style={field} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={{ ...btnPrimary, opacity: name.trim() ? 1 : 0.5, cursor: name.trim() ? 'pointer' : 'default' }} disabled={!name.trim()} onClick={() => onCreate(name.trim(), desc.trim())}>Create story</button>
        </div>
      </Modal>
    );
  }

  function SaveModal({ onClose }) {
    const [done, setDone] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    return (
      <Modal onClose={onClose} label="Save your story">
        {done ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 48, height: 48, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', marginBottom: 12 }}><Icon n="check" s={24} sw={2.4} /></span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 23, margin: '0 0 6px', color: 'var(--hl-text)' }}>Your story is saved.</h3>
            <p style={{ fontSize: 14, color: 'var(--hl-muted)', margin: '0 0 20px', lineHeight: 1.55 }}>We’ll email you a link to pick up right where you left off.</p>
            <button style={btnPrimary} onClick={onClose}>Back to your story</button>
          </div>
        ) : (
          <>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 24, margin: '0 0 4px', color: 'var(--hl-text)' }}>Save your story</h3>
            <p style={{ fontSize: 13.5, color: 'var(--hl-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>Create a free account to keep this conversation and pick up any time.</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={field} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" type="email" style={field} />
            <button style={{ ...btnPrimary, width: '100%', marginTop: 18, opacity: (name.trim() && email.trim()) ? 1 : 0.5 }} disabled={!(name.trim() && email.trim())} onClick={() => setDone(true)}>Save my story</button>
          </>
        )}
      </Modal>
    );
  }

  /* ── Share Heirloom modal ─────────────────────────────────────────────── */
  function ShareModal({ onClose }) {
    const [copied, setCopied] = useState(false);
    const [native, setNative] = useState(false);
    const copyTimer = useRef(0);
    useEffect(() => {
      setNative(typeof navigator !== 'undefined' && !!navigator.share);
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => { window.removeEventListener('keydown', onKey); clearTimeout(copyTimer.current); };
    }, [onClose]);
    const openIntent = (ch) => { try { window.open(ch.href(SHARE_URL, SHARE_MSG), '_blank', 'noopener,noreferrer'); } catch (e) {} };
    const copy = async () => {
      try { await navigator.clipboard.writeText(SHARE_URL); } catch (e) {}
      setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1900);
    };
    const shareNative = async () => { try { await navigator.share({ title: 'Heirloom', text: SHARE_MSG, url: SHARE_URL }); } catch (e) {} };
    const sectionLabel = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    const cleanUrl = SHARE_URL.replace(/^https?:\/\//, '');
    return (
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(26,21,15,0.55)', backdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
        <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share Heirloom" style={{ position: 'relative', width: 'min(440px, 100%)', maxHeight: '92%', overflowY: 'auto', background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20, boxShadow: '0 40px 100px -24px var(--hl-shadow)', padding: '28px 28px 24px', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)', textAlign: 'center' }}>
          <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
            <Icon name="x" size={18} />
          </button>
          <div style={{ width: 50, height: 50, margin: '0 auto 16px', borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)' }}>
            <Icon name="share" size={22} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 27, lineHeight: 1.1, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>Share Heirloom</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '9px auto 0', maxWidth: 340, textWrap: 'pretty' }}>Know someone with a story worth keeping? Pass it on. Every share helps another life become a book.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 24 }}>
            {SHARE_CHANNELS.map((ch) => (
              <button key={ch.key} onClick={() => openIntent(ch)} aria-label={'Share on ' + ch.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 4px 11px', borderRadius: 14, background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', cursor: 'pointer', transition: 'all .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.background = 'var(--hl-accent-soft)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border)'; e.currentTarget.style.background = 'var(--hl-surface-2)'; e.currentTarget.style.transform = 'none'; }}>
                <span style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-text)' }}>
                  {ch.icon ? <Icon name={ch.icon} size={19} /> : <span style={{ fontFamily: ch.key === 'x' ? 'var(--font-body)' : 'var(--font-display)', fontWeight: 700, fontSize: ch.key === 'li' ? 16 : 20, lineHeight: 1 }}>{ch.glyph}</span>}
                </span>
                <span style={{ fontSize: 12, color: 'var(--hl-muted)', fontWeight: 500 }}>{ch.label}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 20, textAlign: 'left' }}>
            <div style={sectionLabel}>Or copy the link</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, padding: '6px 6px 6px 13px', background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', borderRadius: 13 }}>
              <span style={{ flexShrink: 0, display: 'flex', color: 'var(--hl-accent)' }}><Icon name="link" size={16} /></span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanUrl}</span>
              <button onClick={copy} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 15px', borderRadius: 9, border: 'none', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: copied ? 'var(--hl-accent-soft)' : 'var(--hl-accent)', color: copied ? 'var(--hl-accent)' : 'var(--hl-on-accent)', transition: 'all .2s' }}
                onMouseEnter={(e) => { if (!copied) e.currentTarget.style.background = 'var(--hl-accent-hover)'; }}
                onMouseLeave={(e) => { if (!copied) e.currentTarget.style.background = 'var(--hl-accent)'; }}>
                <Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          {native && (
            <button onClick={shareNative} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 12, padding: '12px', borderRadius: 12, border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.background = 'var(--hl-accent-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; e.currentTarget.style.background = 'transparent'; }}>
              <Icon name="share" size={16} /> More ways to share…
            </button>
          )}
          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 7, margin: '22px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>
            <span style={{ display: 'flex', color: 'var(--hl-accent)' }}><Icon name="heart" size={12} /></span> Made to be passed down
          </p>
        </div>
      </div>
    );
  }

  /* ── Invite collaborators modal ───────────────────────────────────────── */
  function InviteModal({ onClose, link, expiry, onRegenerate, collaborators, context, stories, storyId, onStoryChange, note, onNoteChange }) {
    const [copied, setCopied] = useState(false);
    const [flashOn, setFlashOn] = useState(false);
    const [pendingEdit, setPendingEdit] = useState(null); // { type: 'story'|'note', value }
    const applyPendingEdit = () => { if (!pendingEdit) return; if (pendingEdit.type === 'story') onStoryChange && onStoryChange(pendingEdit.value); else onNoteChange && onNoteChange(pendingEdit.value); setPendingEdit(null); };
    const copyTimer = useRef(0);
    const flashTimer = useRef(0);
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    useEffect(() => () => { clearTimeout(copyTimer.current); clearTimeout(flashTimer.current); }, []);
    const copy = async () => {
      try { await navigator.clipboard.writeText('https://' + link); } catch (e) {}
      setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1900);
    };
    const regen = () => { onRegenerate(); setCopied(false); setFlashOn(true); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlashOn(false), 1500); };
    const expDate = new Date(expiry || Date.now());
    const expLabel = 'Expires in 7 days · ' + expDate.toLocaleString('en-US', { month: 'short' }) + ' ' + expDate.getDate();
    const joinedCount = collaborators.filter((c) => c.status === 'joined').length;
    const sectionLabel = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(26,21,15,0.55)', backdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
        <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Invite collaborators" style={{ position: 'relative', width: 'min(462px, 100%)', maxHeight: '92%', display: 'flex', flexDirection: 'column', background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20, boxShadow: '0 40px 100px -24px var(--hl-shadow)', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)', overflow: 'hidden' }}>
          <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px 28px 20px' }}>
          <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
            <Icon name="x" size={18} />
          </button>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 16 }}>
            <Icon name="userPlus" size={21} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 27, lineHeight: 1.1, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>Invite collaborators</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '9px 0 0', textWrap: 'pretty' }}>
            {context
              ? <React.Fragment>Bring the people who shared <span style={{ color: 'var(--hl-text)', fontStyle: 'italic', fontFamily: 'var(--font-display)', fontSize: 16 }}>"{context}"</span> into the book. Anyone with this private link can join and add their memories in their own voice.</React.Fragment>
              : 'Bring the people who lived these stories alongside you. Anyone with this private link can join your book and add their memories in their own voice.'}
          </p>
          {stories && stories.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={sectionLabel}>Story</div>
              <select value={storyId || ''} onChange={(e) => { const v = e.target.value; if (link) setPendingEdit({ type: 'story', value: v }); else onStoryChange && onStoryChange(v); }}
                style={{ width: '100%', marginTop: 8, padding: '10px 12px', borderRadius: 11, border: '1px solid var(--hl-border)', background: 'var(--hl-surface-2)', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none' }}>
                {stories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <div style={sectionLabel}>Custom message</div>
            <textarea value={note} onChange={(e) => { const v = e.target.value; if (link) setPendingEdit({ type: 'note', value: v }); else onNoteChange && onNoteChange(v); }} placeholder="Add a personal note to include with the invite…" rows={3}
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '11px 13px', borderRadius: 12, border: '1px solid var(--hl-border)', background: 'var(--hl-surface-2)', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5, outline: 'none', resize: 'vertical' }} />
          </div>
          <div style={{ height: 1, background: 'var(--hl-border)', margin: '20px 0 16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
            <span style={sectionLabel}>Existing members</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {collaborators.map((c, i) => {
              const joined = c.status === 'joined';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--hl-accent)' }}>{initials(c.name)}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                    <span style={{ fontSize: 14.5, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--hl-faint)' }}>{c.rel}</span>
                  </span>
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: joined ? '.02em' : '.1em', textTransform: joined ? 'none' : 'uppercase', background: joined ? 'var(--hl-accent-soft)' : 'color-mix(in srgb, var(--hl-text) 7%, transparent)', color: joined ? 'var(--hl-accent)' : 'var(--hl-muted)', border: '1px solid', borderColor: joined ? 'var(--hl-accent-line)' : 'transparent' }}>
                    {joined ? <React.Fragment><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--hl-accent)' }} />{'Joined ' + c.joinedDate + ' · ' + c.memoryCount + (c.memoryCount === 1 ? ' memory' : ' memories')}</React.Fragment> : c.status}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--hl-border)' }}>
            <span style={{ flexShrink: 0, display: 'flex', color: 'var(--hl-faint)', marginTop: 1 }}><Icon name="shield" size={13} /></span>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--hl-faint)', textWrap: 'pretty' }}>You stay the author. Collaborators can read and add their own memories — they can never edit or overwrite yours.</p>
          </div>
          </div>
          <div style={{ flexShrink: 0, padding: '18px 28px 24px', borderTop: '1px solid var(--hl-border)', background: 'var(--hl-surface)' }}>
            <div style={sectionLabel}>Magic link</div>
            <div key={link || 'empty'} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, padding: '6px 6px 6px 13px', background: 'var(--hl-surface-2)', border: '1px solid', borderColor: flashOn ? 'var(--hl-accent-line)' : 'var(--hl-border)', borderRadius: 13, transition: 'border-color .3s', animation: flashOn ? 'hl-fade .35s ease' : 'none' }}>
              <span style={{ flexShrink: 0, display: 'flex', color: link ? 'var(--hl-accent)' : 'var(--hl-faint)' }}><Icon name="link" size={16} /></span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: link ? 'var(--hl-text)' : 'var(--hl-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '.01em' }}>{link || 'Not created yet'}</span>
              {link ? (
                <button onClick={copy} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 15px', borderRadius: 9, border: 'none', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: copied ? 'var(--hl-accent-soft)' : 'var(--hl-accent)', color: copied ? 'var(--hl-accent)' : 'var(--hl-on-accent)', transition: 'all .2s' }}
                  onMouseEnter={(e) => { if (!copied) e.currentTarget.style.background = 'var(--hl-accent-hover)'; }}
                  onMouseLeave={(e) => { if (!copied) e.currentTarget.style.background = 'var(--hl-accent)'; }}>
                  <Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copied' : 'Copy'}
                </button>
              ) : (
                <button onClick={regen} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 15px', borderRadius: 9, border: 'none', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', transition: 'all .2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-accent-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hl-accent)'; }}>
                  <Icon name="plus" size={15} />Create
                </button>
              )}
            </div>
            {link && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 11 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--hl-faint)', letterSpacing: '.02em' }}>
                <Icon name="clock" size={12} /> {expLabel}
              </span>
              <button onClick={regen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 8, border: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, color: 'var(--hl-muted)', cursor: 'pointer', transition: 'all .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hl-accent)'; e.currentTarget.style.background = 'var(--hl-accent-soft)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.background = 'transparent'; }}>
                <Icon name="refresh" size={13} /> Reset link
              </button>
            </div>}
          </div>
        </div>
        {pendingEdit && (
          <div onClick={() => setPendingEdit(null)} style={{ position: 'absolute', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(26,21,15,0.55)', backdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
            <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label="This will invalidate the current link" style={{ position: 'relative', width: 'min(400px, 100%)', background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20, boxShadow: '0 40px 100px -24px var(--hl-shadow)', padding: '28px 28px 24px', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)' }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 16 }}>
                <Icon name="alertTriangle" size={20} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 25, lineHeight: 1.12, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>This will invalidate the current link</h2>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '9px 0 0', textWrap: 'pretty' }}>Anyone holding the existing magic link will no longer be able to use it to join. You'll need to share the new link once it's created.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                <button autoFocus onClick={() => setPendingEdit(null)} style={{ padding: '11px 18px', borderRadius: 11, border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>Cancel</button>
                <button onClick={applyPendingEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 11, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-accent-hover)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hl-accent)'; }}>Continue</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Create story modal ───────────────────────────────────────────────── */
  function CreateStoryModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    const canCreate = name.trim().length > 0;
    const submit = () => { if (canCreate) onCreate(name.trim(), desc.trim()); };
    const sectionLabel = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    const field = { width: '100%', boxSizing: 'border-box', marginTop: 9, padding: '11px 13px', background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', borderRadius: 12, color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14.5, outline: 'none', transition: 'border-color .2s' };
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(26,21,15,0.55)', backdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
        <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create a story" style={{ position: 'relative', width: 'min(462px, 100%)', background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20, boxShadow: '0 40px 100px -24px var(--hl-shadow)', padding: '28px 28px 24px', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)' }}>
          <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
            <Icon name="x" size={18} />
          </button>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 16 }}>
            <Icon name="bookOpen" size={21} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 27, lineHeight: 1.1, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>Begin a new story</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '9px 0 0', textWrap: 'pretty' }}>Give it a name and a line about what it holds. The description appears when you hover the story later.</p>
          <div style={{ marginTop: 22 }}>
            <div style={sectionLabel}>Name</div>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="e.g. A Life in Full" style={field}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--hl-accent-line)')} onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hl-border)')} />
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={sectionLabel}>Description <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-body)', color: 'var(--hl-faint)' }}>&middot; optional, shown on hover</span></div>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="The long arc &mdash; childhood to now." style={{ ...field, resize: 'none', lineHeight: 1.5 }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--hl-accent-line)')} onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hl-border)')} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <button onClick={onClose} style={{ padding: '11px 18px', borderRadius: 11, border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>Cancel</button>
            <button onClick={submit} disabled={!canCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 11, border: '1px solid', borderColor: canCreate ? 'var(--hl-accent)' : 'var(--hl-border)', background: canCreate ? 'var(--hl-accent)' : 'color-mix(in srgb, var(--hl-text) 8%, transparent)', color: canCreate ? 'var(--hl-on-accent)' : 'var(--hl-faint)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: canCreate ? 'pointer' : 'not-allowed', transition: 'all .2s' }}
              onMouseEnter={(e) => { if (canCreate) e.currentTarget.style.background = 'var(--hl-accent-hover)'; }} onMouseLeave={(e) => { if (canCreate) e.currentTarget.style.background = 'var(--hl-accent)'; }}>
              <Icon name="plus" size={15} /> Create story
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Delete confirmation ──────────────────────────────────────────────── */
  function ConfirmDeleteModal({ item, onClose, onConfirm, heading, body, confirmLabel }) {
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    const danger = 'var(--hl-danger, #B0432F)';
    const dangerSoft = 'color-mix(in srgb, var(--hl-danger, #B0432F) 14%, transparent)';
    const dangerLine = 'color-mix(in srgb, var(--hl-danger, #B0432F) 34%, transparent)';
    return (
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(26,21,15,0.55)', backdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
        <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={heading || 'Delete chat'} style={{ position: 'relative', width: 'min(418px, 100%)', background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20, boxShadow: '0 40px 100px -24px var(--hl-shadow)', padding: '28px 28px 24px', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)' }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: dangerSoft, border: '1px solid ' + dangerLine, display: 'flex', alignItems: 'center', justifyContent: 'center', color: danger, marginBottom: 16 }}>
            <Icon name="trash" size={20} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 25, lineHeight: 1.12, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>{heading || 'Delete this chat?'}</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '9px 0 0', textWrap: 'pretty' }}>
            {body || (<React.Fragment><span style={{ color: 'var(--hl-text)', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16 }}>&ldquo;{item.title}&rdquo;</span> and every memory it holds will be permanently removed. This can&rsquo;t be undone.</React.Fragment>)}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <button autoFocus onClick={onClose} style={{ padding: '11px 18px', borderRadius: 11, border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>Cancel</button>
            <button onClick={onConfirm} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 11, border: '1px solid ' + danger, background: danger, color: '#fff', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.92)'; }} onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}>
              <Icon name="trash" size={15} /> {confirmLabel || 'Delete'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Root ─────────────────────────────────────────────────────────────── */
  function StoryChat() {
    const saved = loadState();
    const [open, setOpen] = useState(true);
    const [full, setFull] = useState(true);
    const [mobileNav, setMobileNav] = useState(false);
    const [messages, setMessages] = useState(saved.messages || []);
    const [loading, setLoading] = useState(false);
    const [sessions, setSessions] = useState(saved.sessions || SEED);
    const [activeId, setActiveId] = useState(saved.activeId || null);
    const [stories, setStories] = useState(STORIES_SEED);
    // NOTE: [] is truthy — must check length, or a session that persists an empty
    // list permanently suppresses the seeded memories and the sidebar section.
    const [memories, setMemories] = useState(() => {
      const base = Array.isArray(saved.memories) && saved.memories.length ? saved.memories : [];
      const known = new Set(base.map((k) => k.id));
      return base.concat(SEED_MEMORIES.filter((k) => !known.has(k.id)));
    });
    const memoryDeclinedRef = useRef(false);
    const rewritePendingRef = useRef(null);
    const pendingStoryAttachRef = useRef(null);
    const [query, setQuery] = useState('');
    const [beginOpen, setBeginOpen] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [invite, setInvite] = useState(null);            // null | { context } | { storyId, note }
    const [addMemToStory, setAddMemToStory] = useState(null); // null | storyId
    const [adminStoryId, setAdminStoryId] = useState(null); // null | storyId
    const [adminCollabs, setAdminCollabs] = useState(SEED_COLLABS);
    const [confirmDel, setConfirmDel] = useState(null);    // session pending deletion
    const [inviteLink, setInviteLink] = useState(null);
    const [inviteExpiry, setInviteExpiry] = useState(() => Date.now() + 7 * 864e5);
    const [toast, setToast] = useState(null);
    const [lightbox, setLightbox] = useState(null);
    const [isMobile, setIsMobile] = useState(false);
    const streamTimerRef = useRef(null);
    const failCountRef = useRef(0);
    const cancelledRef = useRef(false);
    const [streamingId, setStreamingId] = useState(null);
    const messagesRef = useRef([]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    const activeIdRef = useRef(null);
    useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
    const memoriesRef = useRef([]);
    useEffect(() => { memoriesRef.current = memories; }, [memories]);
    const pendingMemRef = useRef(null);
    const uploadFailRef = useRef(0);
    const [canvas, setCanvas] = useState({ open: false, storyId: null, memId: null, menu: false });
    const [sideW, setSideW] = useState(() => { try { return Number(localStorage.getItem('hl.sideW')) || 264; } catch (e) { return 264; } });
    const [storySideW, setStorySideW] = useState(53);
    const bodyRef = useRef(null);
    const [bodyW, setBodyW] = useState(1280);
    useEffect(() => {
      const el = bodyRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => setBodyW(el.clientWidth));
      ro.observe(el); setBodyW(el.clientWidth);
      return () => ro.disconnect();
    }, []);
    useEffect(() => { try { localStorage.setItem('hl.sideW', String(sideW)); } catch (e) {} }, [sideW]);
    /* Both curtains clamp against the live body width so the transcript can never
       be squeezed below a readable column. */
    const paneMax = (other) => {
      const total = bodyRef.current ? bodyRef.current.clientWidth : window.innerWidth;
      return Math.max(240, total - other - 380);
    };
    const [pinnedMemId, setPinnedMemId] = useState(null);

    useEffect(() => {
      const mq = window.matchMedia('(max-width: 768px)');
      const on = () => setIsMobile(mq.matches); on();
      mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
    }, []);

    // Persist transcript + sessions
    useEffect(() => {
      try { localStorage.setItem(LS, JSON.stringify({ messages, sessions, activeId, memories })); } catch (e) {}
    }, [messages, sessions, activeId, memories]);

    // Open on CTA event
    const [promptContext, setPromptContext] = useState(null);
    useEffect(() => {
      const openIt = (e) => { setOpen(true); if (e && e.detail && e.detail.context) setPromptContext(e.detail.context); };
      window.addEventListener('legacy-open-chat', openIt);
      const openStoryIt = () => openStoryMenu();
      window.addEventListener('legacy-open-story', openStoryIt);
      return () => { window.removeEventListener('legacy-open-chat', openIt); window.removeEventListener('legacy-open-story', openStoryIt); };
    }, []);

    /* Tweaks demo hook — retypes the newest open card if there is one, so the
       tweak reads as "show this memory as a photo / video / audio / document".
       Falls back to spawning a sample card when the transcript has none. */
    useEffect(() => {
      window.__hlMemoryDemo = (kindKey, state) => {
        setOpen(true);
        const s = SAMPLE_DRAFTS[kindKey] || SAMPLE_DRAFTS.conversation;
        setMessages((m) => {
          const openIdx = [...m].reverse().findIndex((x) => x.role === 'tool' && x.state !== 'discarded');
          if (openIdx !== -1 && !state) {
            const i = m.length - 1 - openIdx;
            const cur = m[i];
            const next = m.slice();
            // Retype in place. Keep author-written copy unless it came from a sample.
            const wasSample = Object.values(SAMPLE_DRAFTS).some((d) => d.passage === cur.passage);
            next[i] = { ...cur, kindKey, title: wasSample ? s.title : cur.title, passage: wasSample ? s.passage : cur.passage };
            return next;
          }
          const base = m.length ? m : [
            { id: 'u-demo', role: 'user', content: 'I want to keep something before I forget it.', status: 'sent' },
            { id: 'a-demo', role: 'assistant', content: 'Then let’s put it somewhere safe. Tell me what it is, and start wherever feels natural.', turn: 0, streaming: false, versions: [], versionIdx: 0, rating: null },
          ];
          return [...base.filter((x) => !x.demo), {
            id: 'mem-demo-' + Date.now(), role: 'tool', kind: 'memory', demo: true,
            kindKey, state: state || 'draft', title: s.title, passage: s.passage,
            storyId: state === 'saved' ? (stories[0] && stories[0].id) : undefined,
          }];
        });
      };
      return () => { delete window.__hlMemoryDemo; };
    }, [stories]);

    // Esc closes (drawer level; modals register their own capture handlers first)
    useEffect(() => {
      const k = (e) => {
        if (e.key !== 'Escape' || !open) return;
        if (beginOpen || saveOpen || shareOpen || invite || confirmDel) return;
        if (isMobile && mobileNav) { setMobileNav(false); return; }
        setOpen(false);
      };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, [open, beginOpen, saveOpen, shareOpen, invite, confirmDel, isMobile, mobileNav]);

    const flash = useCallback((m) => { setToast({ m, k: Date.now() }); }, []);
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2000); return () => clearTimeout(t); }, [toast]);

    const streamText = useCallback((id, full, onDone) => {
      const words = full.split(' ');
      let i = 0;
      clearInterval(streamTimerRef.current);
      setStreamingId(id);
      streamTimerRef.current = setInterval(() => {
        i += 1;
        const chunk = words.slice(0, i).join(' ');
        setMessages((m) => m.map((x) => x.id === id ? { ...x, content: chunk } : x));
        if (i >= words.length) {
          clearInterval(streamTimerRef.current);
          setStreamingId(null);
          setMessages((m) => m.map((x) => x.id === id ? { ...x, streaming: false } : x));
          if (onDone) onDone();
        }
      }, 32);
    }, []);

    const runMemory = useCallback((existingId, note, prior, kindKey, photoSrc) => {
      const seed = messagesRef.current;
      let id = existingId;
      if (id) {
        setMessages((m) => m.map((x) => x.id === id ? { ...x, state: 'running' } : x));
      } else {
        id = 'mem' + Date.now();
        setMessages((m) => [...m, { id, role: 'tool', kind: 'memory', kindKey: kindKey || 'conversation', state: 'running', photoSrc }]);
      }
      const source = kindKey === 'photo' && !note ? writePhotoCaption() : writeMemory(seed, note, prior);
      source.then((mem) => {
        setMessages((m) => m.map((x) => x.id === id ? { ...x, state: 'draft', title: mem.title, passage: mem.passage } : x));
      });
    }, []);

    const memRetry = useCallback((id, kindKey) => { runMemory(id, '', null, kindKey); }, [runMemory]);

    /* Bookmark a shared photo — same draft-card flow as "Keep this as a
       memory", just seeded with a photo caption instead of the transcript. */
    const bookmarkUpload = useCallback((uploadId) => {
      const up = messagesRef.current.find((x) => x.id === uploadId);
      runMemory(null, '', null, 'photo', up && up.upload && up.upload.photoSrc);
    }, [runMemory]);

    /* Add a shared photo into a memory already in progress — reuses the same
       memory-canvas panel the header bookmark icon opens, just in a pick-one
       selection mode instead of read/open. */
    const [addToMemoryUpload, setAddToMemoryUpload] = useState(null);
    const onAddUploadToMemory = useCallback((uploadId) => {
      if (memoriesRef.current.length === 0) { flash('Bookmark a memory first'); return; }
      setAddToMemoryUpload(uploadId);
      setSessionListOpen(true);
    }, [flash]);
    const confirmAddToMemory = useCallback((uploadId, memIds) => {
      if (!memIds || !memIds.length) return;
      setMemories((p) => p.map((x) => memIds.includes(x.id) ? { ...x, photoCount: (x.photoCount || 0) + 1 } : x));
      const names = memIds.map((id) => { const k = memoriesRef.current.find((x) => x.id === id); return k && k.title; }).filter(Boolean);
      flash(names.length === 1 ? 'Added to \u201c' + names[0] + '\u201d' : 'Added to ' + names.length + ' memories');
      setTimeout(() => { setAddToMemoryUpload(null); setSessionListOpen(false); }, 700);
    }, [flash]);

    // Real production pattern: uploads are inline attachments on the visitor's
    // own message, not a memory-tool card. No caption — nothing to write a
    // memory from, so no bookmark/actions render either (see Messages below).
    const UPLOAD_FILENAMES = { photo: 'Photo.jpg', video: 'Video.mov', audio: 'Recording.m4a', document: 'Scan.pdf' };
    const settleUpload = useCallback((id) => {
      const fail = uploadFailRef.current++ % 5 === 4;
      setTimeout(() => {
        setMessages((m) => m.map((x) => x.id === id ? { ...x, upload: { ...x.upload, status: fail ? 'failed' : 'ready', gps: !fail && x.upload.kindKey === 'photo' } } : x));
      }, 1400 + Math.random() * 900);
    }, []);
    const photoIdxRef = useRef(0);
    const attachUpload = useCallback((kindKey) => {
      const id = 'u' + Date.now();
      const filename = UPLOAD_FILENAMES[kindKey] || 'File';
      const photoSrc = kindKey === 'photo' ? CHAT_PHOTOS[photoIdxRef.current++ % CHAT_PHOTOS.length] : undefined;
      setMessages((m) => [...m, { id, role: 'user', content: '', status: 'sent', upload: { kindKey, filename, photoSrc, status: 'uploading' } }]);
      settleUpload(id);
    }, [settleUpload]);
    const retryUpload = useCallback((id) => {
      setMessages((m) => m.map((x) => x.id === id ? { ...x, upload: { ...x.upload, status: 'uploading' } } : x));
      settleUpload(id);
    }, [settleUpload]);

    const memSave = useCallback((id, storyId) => {
      const msg = messagesRef.current.find((x) => x.id === id);
      setMessages((m) => m.map((x) => x.id === id ? { ...x, state: 'saved', storyId } : x));
      if (!msg) return;
      const target = pendingMemRef.current;
      if (target) {
        // Rewrite of a memory already on the canvas — update the page, don't add one.
        pendingMemRef.current = null;
        setMemories((p) => p.map((k) => k.id === target
          ? { ...k, title: msg.title, passage: msg.passage, msgId: id, version: (k.version || 1) + 1 }
          : k));
        setPinnedMemId(null);
        flash('Page rewritten');
      } else {
        const isFirstEver = memoriesRef.current.length === 0;
        const newMemId = 'k' + Date.now();
        setMemories((p) => [...p, { id: newMemId, msgId: id, title: msg.title, passage: msg.passage,
          kind: msg.kindKey || 'conversation', date: 'Just now', version: 1, storyId, sessionId: activeIdRef.current || 'live' }]);
        flash('Kept forever');
        if (isFirstEver) {
          const aid = 'a' + Date.now();
          const ask = 'That\u2019s kept. Would you like to start a story to hold it in?';
          setMessages((m) => [...m, { id: aid, role: 'assistant', content: '', full: ask, turn: 0, streaming: true, stopped: false, versions: [ask], versionIdx: 0, rating: null, storyPrompt: true, storyPromptMemId: newMemId }]);
          streamText(aid, ask);
        }
      }
    }, [flash, streamText]);

    const memRewrite = useCallback((id) => {
      const prior = messagesRef.current.find((x) => x.id === id);
      if (!prior) return;
      rewritePendingRef.current = { title: prior.title, passage: prior.passage, kindKey: prior.kindKey };
      const aid = 'a' + Date.now();
      const ask = 'Of course — it\u2019s yours, not mine. Tell me what you\u2019d like changed: where it should begin, what to leave out, or anything that doesn\u2019t sound like you.';
      setMessages((m) => [...m.filter((x) => x.id !== id), { id: aid, role: 'assistant', content: '', full: ask, turn: 0, streaming: true, stopped: false, versions: [ask], versionIdx: 0, rating: null, rewriteOptions: true }]);
      streamText(aid, ask);
    }, [streamText]);
    const memRetitle = useCallback((id, title) => { setMessages((m) => m.map((x) => x.id === id ? { ...x, title } : x)); }, []);
    const memDiscard = useCallback((id) => { memoryDeclinedRef.current = true; setMessages((m) => m.map((x) => x.id === id ? { ...x, state: 'discarded' } : x)); }, []);
    const memOpen = useCallback((id) => {
      const k = memoriesRef.current.find((x) => x.msgId === id);
      if (k) setOpenMemId(k.id);
      else flash('This one isn\u2019t in a story yet');
    }, [flash]);
    const handleOffer = useCallback((id, accept) => {
      setMessages((m) => m.map((x) => x.id === id ? { ...x, offer: false } : x));
      if (accept) runMemory(null, '');
      else memoryDeclinedRef.current = true;
    }, [runMemory]);

    const beginAssistantReply = useCallback(() => {
      setLoading(true);
      cancelledRef.current = false;
      const seed = messagesRef.current;
      const chat = seed.filter((m) => m.role === 'user' || m.role === 'assistant');
      const turn = chat.filter((m) => m.role === 'assistant').length;
      const userTurns = chat.filter((m) => m.role === 'user').length;
      // Ignore discarded cards — a decline must not disarm the tool forever.
      const hasMemory = seed.some((m) => m.role === 'tool' && m.state !== 'discarded');
      // >= not === so a RESTORED conversation still arms; declinedRef keeps it to once.
      const offer = !hasMemory && !memoryDeclinedRef.current && userTurns >= 3;
      const auto = !hasMemory && !memoryDeclinedRef.current && userTurns >= 5;
      askGuide(chat, turn).then((reply) => {
        setLoading(false);
        if (cancelledRef.current) { cancelledRef.current = false; return; }
        const aid = 'a' + Date.now();
        setMessages((m2) => [...m2, { id: aid, role: 'assistant', content: '', full: reply, turn, streaming: true, stopped: false, offer, suggestKeep: userTurns >= 3, versions: [reply], versionIdx: 0, rating: null }]);
        streamText(aid, reply, auto ? () => setTimeout(() => runMemory(null, ''), 500) : null);
      });
    }, [streamText, runMemory]);

    const attemptDeliver = useCallback((id, text, isRetry) => {
      setMessages((m) => m.map((x) => x.id === id ? { ...x, status: 'sending' } : x));
      setTimeout(() => {
        const fail = !isRetry && (failCountRef.current++ % 4 === 3);
        setMessages((m) => m.map((x) => x.id === id ? { ...x, status: fail ? 'failed' : 'sent' } : x));
        if (fail) return;
        const prior = rewritePendingRef.current;
        if (prior) { rewritePendingRef.current = null; runMemory(null, text, prior, prior.kindKey); return; }
        beginAssistantReply();
      }, 500 + Math.random() * 250);
    }, [beginAssistantReply, runMemory]);

    const send = useCallback((text) => {
      const id = 'u' + Date.now() + Math.random().toString(36).slice(2, 6);
      setMessages((prev) => [...prev, { id, role: 'user', content: text, status: 'sending' }]);
      setMobileNav(false);
      attemptDeliver(id, text, false);
    }, [attemptDeliver]);

    const resendMessage = useCallback((id) => {
      const msg = messagesRef.current.find((x) => x.id === id);
      if (msg) attemptDeliver(id, msg.content, true);
    }, [attemptDeliver]);

    const editMessage = useCallback((id, text) => {
      clearInterval(streamTimerRef.current);
      setStreamingId(null);
      cancelledRef.current = true;
      setMessages((m) => {
        const idx = m.findIndex((x) => x.id === id);
        if (idx === -1) return m;
        const next = m.slice(0, idx + 1);
        next[idx] = { ...next[idx], content: text, status: 'sending', edited: true };
        return next;
      });
      setTimeout(() => attemptDeliver(id, text, true), 0);
    }, [attemptDeliver]);

    const retryMessage = useCallback((id) => {
      clearInterval(streamTimerRef.current);
      setStreamingId(null);
      cancelledRef.current = true;
      const msg = messagesRef.current.find((x) => x.id === id);
      if (!msg) return;
      setMessages((m) => {
        const idx = m.findIndex((x) => x.id === id);
        return idx === -1 ? m : m.slice(0, idx + 1);
      });
      setTimeout(() => attemptDeliver(id, msg.content, true), 0);
    }, [attemptDeliver]);

    const stopGeneration = useCallback(() => {
      if (streamingId) {
        clearInterval(streamTimerRef.current);
        setMessages((m) => m.map((x) => x.id === streamingId ? { ...x, streaming: false, stopped: true } : x));
        setStreamingId(null);
      } else if (loading) {
        cancelledRef.current = true;
        setLoading(false);
      }
    }, [streamingId, loading]);

    const regenerate = useCallback((id) => {
      const cur = messagesRef.current;
      const idx = cur.findIndex((x) => x.id === id);
      const msg = cur[idx];
      if (!msg || msg.streaming) return;
      const context = cur.slice(0, idx).filter((x) => x.role === 'user' || x.role === 'assistant');
      askGuide(context, msg.turn || 0).then((reply) => {
        setMessages((m2) => m2.map((x) => {
          if (x.id !== id) return x;
          const versions = [...x.versions, reply];
          return { ...x, versions, versionIdx: versions.length - 1, content: '', streaming: true, stopped: false, rating: null };
        }));
        streamText(id, reply);
      });
    }, [streamText]);

    const showVersion = useCallback((id, dir) => {
      setMessages((m) => m.map((x) => {
        if (x.id !== id) return x;
        const next = Math.max(0, Math.min(x.versions.length - 1, x.versionIdx + dir));
        return { ...x, versionIdx: next, content: x.versions[next] };
      }));
    }, []);

    const rateMessage = useCallback((id, val) => {
      setMessages((m) => m.map((x) => x.id === id ? { ...x, rating: x.rating === val ? null : val } : x));
    }, []);

    const submitFeedback = useCallback((id, reasons, note) => {
      setMessages((m) => m.map((x) => x.id === id ? { ...x, feedbackReasons: reasons, feedbackNote: note } : x));
      flash('Thanks for the feedback');
    }, [flash]);

    const copyMessage = useCallback((text) => {
      const done = () => flash('Copied');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(done);
      else done();
    }, [flash]);

    const newChat = () => {
      if (messages.length) {
        const title = messages[0].content.slice(0, 42) + (messages[0].content.length > 42 ? '…' : '');
        const id = 'sess' + Date.now();
        setSessions((prev) => [{ id, title, starred: false }, ...prev]);
        setMemories((p) => p.map((k) => k.sessionId === 'live' ? { ...k, sessionId: id } : k));
      }
      setMessages([]); setActiveId(null); setMobileNav(false); memoryDeclinedRef.current = false;
    };
    const rowAction = (id, act) => {
      const s = sessions.find((x) => x.id === id);
      if (act === 'delete') { setConfirmDel(s || { id, title: 'this chat' }); }
      else if (act === 'star') { setSessions((p) => p.map((x) => x.id === id ? { ...x, starred: !x.starred } : x)); flash(s && s.starred ? 'Star removed' : 'Starred'); }
      else if (act === 'rename') { flash('Rename coming soon'); }
      else if (act === 'invite') { setInvite({ context: s ? s.title : null }); }
      else if (act === 'move') { flash('Moved to story'); }
      else if (act === 'remove') { flash('Removed from story'); }
    };
    const regenerateLink = () => { setInviteLink(LINK_BASE + makeToken()); setInviteExpiry(Date.now() + 7 * 864e5); };
    const doDelete = () => { const s = confirmDel; if (!s) return; setSessions((p) => p.filter((x) => x.id !== s.id)); if (activeId === s.id) setActiveId(null); setConfirmDel(null); flash('Chat deleted'); };
    const storyRowAction = (id, act) => { if (act === 'admin') setAdminStoryId(id); };
    const createStory = (name, description) => {
      const id = 'st' + Date.now();
      setStories((p) => [...p, { id, name, tagline: description }]);
      const attachId = pendingStoryAttachRef.current;
      if (attachId) { setMemories((p) => p.map((k) => k.id === attachId ? { ...k, storyId: id } : k)); pendingStoryAttachRef.current = null; }
      setBeginOpen(false);
      flash('Story created');
    };
    const handleRewriteOption = useCallback((id, text) => {
      setMessages((m) => m.map((x) => x.id === id ? { ...x, rewriteOptions: false } : x));
      if (text) send(text);
    }, [send]);
    const handleStoryPrompt = useCallback((id, start) => {
      const memId = messagesRef.current.find((x) => x.id === id)?.storyPromptMemId;
      setMessages((m) => m.map((x) => x.id === id ? { ...x, storyPrompt: false } : x));
      if (start && memId) { pendingStoryAttachRef.current = memId; setBeginOpen(true); }
    }, []);

    /* ── Story canvas ──────────────────────────────────────────────────────
       The canvas is a panel inside this drawer, never a separate surface.
       Reordering, direct edit, fork and remove all act on `memories`; a
       conversational rewrite reuses the existing rewrite machinery, so the
       transcript stays the place where the guide does its work. */
    const activeStoryId = canvas.storyId || (stories[0] && stories[0].id);
    const canvasStory = stories.find((s) => s.id === activeStoryId) || stories[0];
    const deck = memories.filter((k) => k.storyId === activeStoryId)
      .map((k) => ({ ...k, kind: k.kind || 'conversation', version: k.version || 1, date: k.date || 'Kept earlier', passage: k.passage || 'This one was kept before the canvas existed — open it and tell me what it should say.' }));
    const deckIndex = canvas.memId ? deck.findIndex((k) => k.id === canvas.memId) : -1;
    const storyMemCount = (id) => memories.filter((k) => k.storyId === id).length;
    const sessionMemories = memories.filter((k) => k.sessionId === (activeIdRef.current || 'live'));
    const [sessionListOpen, setSessionListOpen] = useState(false);
    const pinnedMem = pinnedMemId ? memories.find((k) => k.id === pinnedMemId) : null;

    const [openMemId, setOpenMemId] = useState(null);
    const [mediaOpen, setMediaOpen] = useState(false);
    const [mediaPageOpen, setMediaPageOpen] = useState(false);
    const openMediaGallery = useCallback(() => { setMediaOpen(true); setOpenMemId(null); setSessionListOpen(false); }, []);
    const panelOpen = !!openMemId || sessionListOpen || mediaOpen;
    const [cardW, setCardW] = useState(480);
    const prevPanelOpenRef = useRef(false);
    useEffect(() => {
      if (panelOpen && !prevPanelOpenRef.current) {
        const total = window.innerWidth;
        setCardW(scClamp(Math.round(total * 0.55), 320, Math.max(320, total - 60 - 9 - 380)));
      }
      prevPanelOpenRef.current = panelOpen;
    }, [panelOpen]);
    const openMem = openMemId ? memories.find((x) => x.id === openMemId) : null;
    useEffect(() => { if (openMemId || sessionListOpen) setMediaOpen(false); }, [openMemId, sessionListOpen]);
    const openMemParent = openMem && openMem.parentId ? memories.find((p) => p.id === openMem.parentId) : null;
    const openCanvas = (storyId, memId) => {
      setCanvas({ open: true, storyId: storyId || activeStoryId, memId: memId || null, menu: false });
      setMobileNav(false);
    };
    const openStoryMenu = () => { setCanvas({ open: true, storyId: null, memId: null, menu: true }); setMobileNav(false); };
    const closeCanvas = () => setCanvas((c) => ({ ...c, open: false, memId: null, menu: false }));
    const backToChat = () => { closeCanvas(); setOpen(true); };
    const patchMemory = (id, p) => setMemories((prev) => prev.map((k) => k.id === id ? { ...k, ...p } : k));
    const removeMemory = (id) => {
      setMemories((prev) => prev.filter((k) => k.id !== id));
      setCanvas((c) => ({ ...c, memId: null }));
      if (openMemId === id) setOpenMemId(null);
      if (pinnedMemId === id) setPinnedMemId(null);
      flash('Removed from the story');
    };
    const reorderDeck = (from, to) => setMemories((prev) => {
      const idxs = []; prev.forEach((k, i) => { if (k.storyId === activeStoryId) idxs.push(i); });
      const picked = idxs.map((i) => prev[i]);
      const [x] = picked.splice(from, 1); picked.splice(to, 0, x);
      const next = prev.slice(); idxs.forEach((i, n) => { next[i] = picked[n]; });
      return next;
    });
    const guideAsk = (text) => {
      const aid = 'a' + Date.now();
      setMessages((m) => [...m, { id: aid, role: 'assistant', content: '', full: text, turn: 0, streaming: true, stopped: false, versions: [text], versionIdx: 0, rating: null }]);
      streamText(aid, text);
    };
    const talkAbout = (id) => {
      const k = memories.find((x) => x.id === id); if (!k) return;
      pendingMemRef.current = id;
      rewritePendingRef.current = { title: k.title, passage: k.passage, kindKey: k.kind || 'conversation' };
      setPinnedMemId(id);
      if (isMobile) closeCanvas();
      setOpenMemId(null);
      guideAsk('I\u2019m reading \u201c' + k.title + '.\u201d Tell me what should change \u2014 a detail I got wrong, something missing, or a different place to start it from.');
    };
    const forkMemory = (id) => {
      const parent = memories.find((x) => x.id === id); if (!parent) return;
      const nid = 'k' + Date.now();
      setMemories((prev) => {
        const i = prev.findIndex((x) => x.id === id);
        const next = prev.slice();
        next.splice(i + 1, 0, { id: nid, title: 'Untitled memory', kind: 'conversation', date: 'Just now', version: 1,
          passage: 'Nothing written yet \u2014 tell me what this one should be about and I\u2019ll write it up from what you say.',
          storyId: parent.storyId, parentId: parent.id, sessionId: activeIdRef.current || 'live' });
        return next;
      });
      pendingMemRef.current = nid;
      rewritePendingRef.current = { title: parent.title, passage: parent.passage, kindKey: 'conversation' };
      setPinnedMemId(nid);
      if (openMemId) setOpenMemId(nid); else setCanvas({ open: !isMobile, storyId: parent.storyId, memId: nid });
      guideAsk('New page, started from \u201c' + parent.title + '.\u201d That one stays exactly as it is. What part of it do you want to open up?');
    };

    const canvasEl = canvas.menu
      ? <StoryMenu stories={stories} memories={memories} onOpen={(id) => setCanvas({ open: true, storyId: id, memId: null, menu: false })} />
      : deckIndex >= 0
      ? <CardView mem={deck[deckIndex]} index={deckIndex} total={deck.length} stories={stories}
          parent={deck[deckIndex].parentId ? deck.find((p) => p.id === deck[deckIndex].parentId) : null}
          onBack={() => setCanvas((c) => ({ ...c, memId: null }))}
          onPage={(d) => { const t = deckIndex + d; if (t >= 0 && t < deck.length) setCanvas((c) => ({ ...c, memId: deck[t].id })); }}
          onEdit={(p) => patchMemory(deck[deckIndex].id, p)}
          onMoveStory={(sid) => patchMemory(deck[deckIndex].id, { storyId: sid })}
          onTalk={() => talkAbout(deck[deckIndex].id)}
          onFork={() => forkMemory(deck[deckIndex].id)}
          onDelete={() => removeMemory(deck[deckIndex].id)} />
      : <Deck memories={deck} story={canvasStory ? canvasStory.name : 'Your story'} storyId={canvas.storyId}
          onOpen={(id) => setCanvas((c) => ({ ...c, memId: id }))} onReorder={reorderDeck}
          onAddMemories={() => setAddMemToStory(canvas.storyId)}
          onEditStub={() => flash('Editing from the deck is coming soon \u2014 open the memory to edit it for now.')}
          onAllStories={stories.length > 1 ? openStoryMenu : undefined}
          onInvite={() => setInvite({ storyId: canvas.storyId })}
          compact onClose={closeCanvas} />;

    const crumbs = [{ id: 'chat', label: 'Chat', onClick: backToChat }];
    if (canvas.menu) {
      crumbs.push({ id: 'all', label: 'All stories' });
    } else {
      crumbs.push({ id: 'story', label: canvasStory ? canvasStory.name : 'Your story', onClick: deckIndex >= 0 ? () => setCanvas((c) => ({ ...c, memId: null })) : undefined });
      if (deckIndex >= 0) crumbs.push({ id: 'mem', label: deck[deckIndex].title });
    }

    const hasStarted = messages.length > 0;
    const drawerW = (full || panelOpen) ? '100vw' : 'min(760px, 100vw)';

    const sidebarEl = (
      <Sidebar width={isMobile ? 264 : (panelOpen ? 60 : sideW)} sessions={sessions} activeId={activeId} onNew={newChat} memories={memories} onOpenMediaPage={() => setMediaPageOpen(true)}
        onToggleCollapse={() => setSideW((w) => (w <= 60 ? 264 : 53))}
        onSelect={(id) => { setActiveId(id); setMobileNav(false); flash('Demo: conversations are illustrative'); }}
        onPrompt={(p) => { setMobileNav(false); send(p); }} onRowAction={rowAction} onStoryRowAction={storyRowAction}
        onCreateStory={() => { setMobileNav(false); setBeginOpen(true); }} stories={stories}
        onInvite={(id) => { setMobileNav(false); setInvite({ storyId: id }); }}
        onOpenStory={(id) => openCanvas(id)}
        onClose={isMobile ? () => setMobileNav(false) : undefined} query={query} setQuery={setQuery} />
    );

    return (
      <>
        {/* Backdrop */}
        <div onClick={() => setOpen(false)} aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(26,21,15,0.5)', backdropFilter: 'blur(4px)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .4s ease' }} />

        {/* Drawer */}
        <div role="dialog" aria-modal="true" aria-label="Start your story" inert={!open ? '' : undefined}
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 51, width: drawerW, display: 'flex', flexDirection: 'column', background: 'var(--hl-bg)', fontFamily: 'var(--font-body)', boxShadow: '-30px 0 80px -30px rgba(26,21,15,0.6)', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .5s cubic-bezier(.22,1,.36,1), width .4s ease', pointerEvents: open ? 'auto' : 'none' }}>

          {/* Header */}
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', height: 52, borderBottom: '1px solid var(--hl-border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {isMobile && <IconBtn n="menu" label="Menu" onClick={() => setMobileNav(true)} />}
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'grid', placeItems: 'center', color: 'var(--hl-accent)' }}><Icon n="feather" s={14} /></span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--hl-text)' }}>Legacy</span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {sessionMemories.length > 0 && (
                <button onClick={() => setSessionListOpen(true)} aria-label="Memories from this chat" title="Memories from this chat"
                  style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer', marginRight: 4 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <Icon n="bookmark" s={17} />
                  <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 7, background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-mono)', fontSize: 9, display: 'grid', placeItems: 'center' }}>{sessionMemories.length}</span>
                </button>
              )}
              <IconBtn n="image" s={16} label="Media from this chat" onClick={openMediaGallery} style={{ marginRight: 4 }} />
              <IconBtn n="share" s={16} label="Share Heirloom" onClick={() => setShareOpen(true)} />
              {!isMobile && <IconBtn n={full ? 'min' : 'max'} s={16} label={full ? 'Exit full screen' : 'Full screen'} onClick={() => setFull((v) => !v)} />}
              <IconBtn n="user" s={18} label="Account" />
              <IconBtn n="x" s={18} label="Close" onClick={() => setOpen(false)} />
            </div>
          </header>

          {/* Body */}
          <div ref={bodyRef} style={{ position: 'relative', display: 'flex', flex: 1, minHeight: 0 }}>
            {!isMobile && (
              <div style={{ width: panelOpen ? 60 : sideW, flexShrink: 0, overflow: 'hidden', transition: 'width .4s cubic-bezier(.22,1,.36,1)' }}>
                <div style={{ width: isMobile ? 264 : (panelOpen ? 60 : sideW), height: '100%' }}>{sidebarEl}</div>
              </div>
            )}
            {!isMobile && !panelOpen && (
              <SCCurtain label="Resize the menu" onStart={() => sideW} onReset={() => setSideW(264)}
                onMove={(b, d) => { const v = b + d; setSideW(v < 150 ? 53 : scClamp(v, 190, paneMax(0))); }} />
            )}
            {isMobile && mobileNav && (
              <>
                <div onClick={() => setMobileNav(false)} style={{ position: 'absolute', inset: 0, zIndex: 18, background: 'rgba(26,21,15,0.4)' }} />
                <div style={{ position: 'absolute', insetBlock: 0, left: 0, zIndex: 19, borderRight: '1px solid var(--hl-border)' }}>{sidebarEl}</div>
              </>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minWidth: 380, height: '100%' }}>
              {hasStarted ? <Messages messages={messages} loading={loading} stories={stories} keepDisabled={!!streamingId || loading || (() => { const t = messages.filter((m) => m.role === 'tool'); const last = t[t.length - 1]; return !!last && (last.state === 'running'); })()} onKeep={() => runMemory(null, '')} onResend={resendMessage} onRegenerate={regenerate} onVersion={showVersion} onRate={rateMessage} onCopy={copyMessage} onEdit={editMessage} onRetry={retryMessage} onMemRetry={memRetry} onMemSave={memSave} onMemRewrite={memRewrite} onMemDiscard={memDiscard} onMemOpen={memOpen} onMemRetitle={memRetitle} onOffer={handleOffer} onRewriteOption={handleRewriteOption} onStoryPrompt={handleStoryPrompt} onFeedback={submitFeedback} onOpenMedia={(kind, title, src) => setLightbox({ kind, title, src })} onRetryUpload={retryUpload} onBookmarkUpload={bookmarkUpload} onAddUploadToMemory={onAddUploadToMemory} /> : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
                  <span style={{ color: 'var(--hl-accent)', marginBottom: 20 }}><Icon n="feather" s={30} /></span>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(30px,4vw,42px)', letterSpacing: '-.01em', color: 'var(--hl-text)', margin: '0 0 10px' }}>What’s a story worth keeping?</h1>
                  <p style={{ fontSize: 16, color: 'var(--hl-muted)', margin: 0, maxWidth: 400, lineHeight: 1.6 }}>Start anywhere — a moment, a person, a place. I’ll ask the questions that draw the rest out.</p>
                </div>
              )}
              <div style={{ paddingBottom: 16, flexShrink: 0 }}>
                {promptContext && !pinnedMem && (
                  <div style={{ boxSizing: 'border-box', maxWidth: 680, margin: '0 auto 8px', padding: '0 16px', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 11, border: '1px solid var(--hl-accent-line)', background: 'var(--hl-accent-soft)' }}>
                      <Icon n="message" s={13} style={{ color: 'var(--hl-accent)' }} />
                      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: 'var(--hl-muted)' }}>Re: </span>{promptContext}
                      </span>
                      <button onClick={() => setPromptContext(null)} aria-label="Clear context"
                        style={{ border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 2 }}><Icon n="x" s={14} /></button>
                    </div>
                  </div>
                )}
                {pinnedMem && (
                  <div style={{ boxSizing: 'border-box', maxWidth: 680, margin: '0 auto 8px', padding: '0 16px', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 11, border: '1px solid var(--hl-accent-line)', background: 'var(--hl-accent-soft)' }}>
                      <Icon n="bookmark" s={13} style={{ color: 'var(--hl-accent)' }} />
                      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: 'var(--hl-muted)' }}>Working on </span>{pinnedMem.title}
                      </span>
                      <button onClick={() => { setPinnedMemId(null); pendingMemRef.current = null; rewritePendingRef.current = null; }}
                        aria-label="Stop working on this page"
                        style={{ border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 2 }}><Icon n="x" s={14} /></button>
                    </div>
                  </div>
                )}
                <Composer onSend={send} disabled={loading || !!streamingId} showStop={loading || !!streamingId} onStop={stopGeneration} onAttach={attachUpload} />
                {messages.length >= 4 && <SaveBar onSave={() => setSaveOpen(true)} />}
              </div>
            </div>

            {!isMobile && panelOpen && (
              <SCCurtain label="Resize the memory panel" onStart={() => cardW}
                onReset={() => setCardW(scClamp(Math.round(window.innerWidth * 0.55), 320, Math.max(320, window.innerWidth - 60 - 9 - 380)))}
                onMove={(b, d) => setCardW(scClamp(b - d, 320, window.innerWidth - 60 - 9 - 380))} />
            )}
            {!isMobile && (
              <div style={{ flexGrow: 0, flexShrink: 0, flexBasis: panelOpen ? cardW + 'px' : '0%', minWidth: 0, height: '100%', overflow: 'hidden', borderLeft: panelOpen ? '1px solid var(--hl-border)' : 'none', background: 'var(--hl-bg-2)', transition: 'flex-basis .18s ease' }}>
                {sessionListOpen && <SessionMemoriesPanel memories={sessionMemories} stories={stories}
                  selectMode={!!addToMemoryUpload}
                  onClose={() => { setSessionListOpen(false); setAddToMemoryUpload(null); }}
                  onOpen={(id) => { setSessionListOpen(false); setOpenMemId(id); }}
                  onConfirm={(ids) => confirmAddToMemory(addToMemoryUpload, ids)} />}
                {openMem && (
                  <CardView mem={openMem} index={0} total={1} parent={openMemParent} stories={stories}
                    onBack={() => setOpenMemId(null)} onPage={() => {}}
                    onEdit={(p) => patchMemory(openMem.id, p)}
                    onMoveStory={(sid) => patchMemory(openMem.id, { storyId: sid })}
                    onTalk={() => talkAbout(openMem.id)}
                    onFork={() => forkMemory(openMem.id)}
                    onDelete={() => removeMemory(openMem.id)} />
                )}
                {mediaOpen && <MediaGallery sessionId={activeId} onClose={() => setMediaOpen(false)}
                  onEditStub={() => flash('Editing media is coming soon')} memories={memories} stories={stories} flash={flash} />}
              </div>
            )}

            {isMobile && (
              <>
                <div onClick={() => { setSessionListOpen(false); setOpenMemId(null); setAddToMemoryUpload(null); }} aria-hidden="true"
                  style={{ position: 'fixed', inset: 0, zIndex: 52, background: 'rgba(26,21,15,0.5)', backdropFilter: 'blur(4px)', opacity: panelOpen ? 1 : 0, pointerEvents: panelOpen ? 'auto' : 'none', transition: 'opacity .4s ease' }} />
                <div role="dialog" aria-modal="true" aria-label="Memory panel" inert={!panelOpen ? '' : undefined}
                  style={{ position: 'fixed', inset: 0, zIndex: 53, height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--hl-bg-2)', boxShadow: '0 -20px 60px -20px rgba(26,21,15,0.5)', overflow: 'hidden', transform: panelOpen ? 'translateY(0)' : 'translateY(100%)', transition: 'transform .45s cubic-bezier(.22,1,.36,1)', pointerEvents: panelOpen ? 'auto' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
                    <span style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--hl-border-strong)' }} />
                  </div>
                  {sessionListOpen && <SessionMemoriesPanel memories={sessionMemories} stories={stories}
                    selectMode={!!addToMemoryUpload}
                    onClose={() => { setSessionListOpen(false); setAddToMemoryUpload(null); }}
                    onOpen={(id) => { setSessionListOpen(false); setOpenMemId(id); }}
                    onConfirm={(ids) => confirmAddToMemory(addToMemoryUpload, ids)} />}
                  {openMem && (
                    <CardView mem={openMem} index={0} total={1} parent={openMemParent} stories={stories}
                      onBack={() => setOpenMemId(null)} onPage={() => {}}
                      onEdit={(p) => patchMemory(openMem.id, p)}
                      onMoveStory={(sid) => patchMemory(openMem.id, { storyId: sid })}
                      onTalk={() => talkAbout(openMem.id)}
                      onFork={() => forkMemory(openMem.id)}
                      onDelete={() => removeMemory(openMem.id)} />
                  )}
                  {mediaOpen && <MediaGallery sessionId={activeId} onClose={() => setMediaOpen(false)}
                    onEditStub={() => flash('Editing media is coming soon')} memories={memories} stories={stories} flash={flash} />}
                </div>
              </>
            )}

            {saveOpen && <SaveModal onClose={() => setSaveOpen(false)} />}
            {shareOpen && <ShareModal onClose={() => setShareOpen(false)} />}
            {confirmDel && <ConfirmDeleteModal item={confirmDel} onClose={() => setConfirmDel(null)} onConfirm={doDelete} />}
          </div>

          {toast && (
            <div key={toast.k} style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 99, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', boxShadow: '0 14px 34px -12px var(--hl-shadow)', pointerEvents: 'none' }}>
              <Icon n="check" s={13} style={{ color: 'var(--hl-accent)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--hl-text)' }}>{toast.m}</span>
            </div>
          )}
        </div>

        {/* Story page — independent of the chat drawer; opens from the sidebar,
            a saved receipt, or the global Stories entry, with or without chat open. */}
        <div onClick={closeCanvas} aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(26,21,15,0.55)', backdropFilter: 'blur(4px)', opacity: canvas.open ? 1 : 0, pointerEvents: canvas.open ? 'auto' : 'none', transition: 'opacity .35s ease' }} />
        <div role="dialog" aria-modal="true" aria-label="Your story" inert={!canvas.open ? '' : undefined}
          style={{ position: 'fixed', inset: 0, zIndex: 56, display: 'flex', flexDirection: 'column', background: 'var(--hl-bg)', fontFamily: 'var(--font-body)', transform: canvas.open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .45s cubic-bezier(.22,1,.36,1)', pointerEvents: canvas.open ? 'auto' : 'none' }}
          onClick={(e) => e.stopPropagation()}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', height: 56, borderBottom: '1px solid var(--hl-border)', flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'grid', placeItems: 'center', color: 'var(--hl-accent)' }}><Icon n="feather" s={14} /></span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--hl-text)' }}>Legacy</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={backToChat}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 99, border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hl-text)'; e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.borderColor = 'var(--hl-border)'; }}>
                <Icon n="pen" s={13} />Continue the conversation
              </button>
              <IconBtn n="x" s={18} label="Close" onClick={closeCanvas} />
            </div>
          </header>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderBottom: '1px solid var(--hl-border)', flexShrink: 0, overflow: 'hidden', background: 'var(--hl-surface-2)' }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={c.id}>
                {i > 0 && <Icon n="chevronRight" s={12} style={{ color: 'var(--hl-faint)', flexShrink: 0 }} />}
                {c.onClick ? (
                  <button onClick={c.onClick}
                    style={{ background: 'none', border: 'none', padding: '4px 6px', borderRadius: 7, cursor: 'pointer', color: 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180, flexShrink: 1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>{c.label}</button>
                ) : (
                  <span style={{ padding: '4px 6px', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{c.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <Sidebar sessions={sessions} activeId={activeId} onNew={() => { newChat(); backToChat(); }} onSelect={(id) => { setActiveId(id); backToChat(); }} onOpenMediaPage={() => setMediaPageOpen(true)}
              onToggleCollapse={() => setStorySideW((w) => (w <= 60 ? 264 : 53))}
              onPrompt={(t) => { newChat(); backToChat(); setTimeout(() => send(t), 30); }} onRowAction={rowAction} onStoryRowAction={storyRowAction}
              onCreateStory={() => setBeginOpen(true)} stories={stories}
              onInvite={(id) => setInvite({ storyId: id })}
              onOpenStory={(id) => setCanvas({ open: true, storyId: id, memId: null, menu: false })}
              memories={memories} query={query} setQuery={setQuery} width={storySideW} />
            <SCCurtain label="Resize the menu" onStart={() => storySideW} onReset={() => setStorySideW(264)}
              onMove={(b, d) => { const v = b + d; setStorySideW(v < 150 ? 53 : scClamp(v, 190, 420)); }} />
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
              <div key={canvas.menu ? 'menu' : deckIndex >= 0 ? 'card-' + deck[deckIndex].id : 'deck'} className="sc-slide-up" style={{ width: '100%', maxWidth: 780, height: '100%', minHeight: 0 }}>{canvasEl}</div>
            </div>
          </div>
        </div>

        {lightbox && <Lightbox data={lightbox} onClose={() => setLightbox(null)} />}
        {beginOpen && <CreateStoryModal onClose={() => setBeginOpen(false)} onCreate={createStory} />}
        {invite && <InviteModal onClose={() => setInvite(null)} link={inviteLink} expiry={inviteExpiry} onRegenerate={regenerateLink} collaborators={SEED_COLLABS}
          context={invite.storyId ? (stories.find((s) => s.id === invite.storyId) || {}).name : invite.context}
          stories={stories} storyId={invite.storyId} onStoryChange={(id) => { setInvite((v) => ({ ...v, storyId: id })); setInviteLink(null); }}
          note={invite.note || ''} onNoteChange={(v) => { setInvite((c) => ({ ...c, note: v })); setInviteLink(null); }} />}

        <div onClick={() => setAddMemToStory(null)} aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 65, background: 'rgba(26,21,15,0.4)', opacity: addMemToStory ? 1 : 0, pointerEvents: addMemToStory ? 'auto' : 'none', transition: 'opacity .25s ease' }} />
        <div role="dialog" aria-modal="true" aria-label="Add memories to this story" inert={!addMemToStory ? '' : undefined}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 66, width: 'min(400px, 100vw)', background: 'var(--hl-bg-2)', borderLeft: '1px solid var(--hl-border)', boxShadow: '-20px 0 60px -20px rgba(26,21,15,0.4)', transform: addMemToStory ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .35s cubic-bezier(.22,1,.36,1)', pointerEvents: addMemToStory ? 'auto' : 'none' }}>
          {addMemToStory && (
            <AddMemoriesToStoryPanel memories={memories} stories={stories} storyId={addMemToStory}
              onClose={() => setAddMemToStory(null)}
              onConfirm={(ids) => { setMemories((prev) => prev.map((k) => ids.includes(k.id) ? { ...k, storyId: addMemToStory } : k)); flash(ids.length === 1 ? 'Added 1 memory to this story' : 'Added ' + ids.length + ' memories to this story'); setTimeout(() => setAddMemToStory(null), 700); }} />
          )}
        </div>

        <div onClick={() => setAdminStoryId(null)} aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 67, background: 'rgba(26,21,15,0.4)', opacity: adminStoryId ? 1 : 0, pointerEvents: adminStoryId ? 'auto' : 'none', transition: 'opacity .25s ease' }} />
        <div role="dialog" aria-modal="true" aria-label="Story admin" inert={!adminStoryId ? '' : undefined}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 68, width: 'min(400px, 100vw)', background: 'var(--hl-bg-2)', borderLeft: '1px solid var(--hl-border)', boxShadow: '-20px 0 60px -20px rgba(26,21,15,0.4)', transform: adminStoryId ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .35s cubic-bezier(.22,1,.36,1)', pointerEvents: adminStoryId ? 'auto' : 'none' }}>
          {adminStoryId && (
            <StoryAdminPanel story={stories.find((s) => s.id === adminStoryId) || { id: adminStoryId, name: 'Story' }} collaborators={adminCollabs}
              onClose={() => setAdminStoryId(null)}
              onRename={(tagline) => setStories((p) => p.map((s) => s.id === adminStoryId ? { ...s, tagline } : s))}
              onRemoveMember={(name) => { setAdminCollabs((p) => p.filter((c) => c.name !== name)); flash('Removed'); }} />
          )}
        </div>

        {/* Media \u2014 standalone top-level page. Independent of any chat or story;
            shows every file the member has uploaded, plus anything shared in
            stories they contribute to. Not a panel inside the chat drawer. */}
        <div onClick={() => setMediaPageOpen(false)} aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 57, background: 'rgba(26,21,15,0.55)', backdropFilter: 'blur(4px)', opacity: mediaPageOpen ? 1 : 0, pointerEvents: mediaPageOpen ? 'auto' : 'none', transition: 'opacity .35s ease' }} />
        <div role="dialog" aria-modal="true" aria-label="Media" inert={!mediaPageOpen ? '' : undefined}
          style={{ position: 'fixed', inset: 0, zIndex: 58, display: 'flex', flexDirection: 'column', background: 'var(--hl-bg)', fontFamily: 'var(--font-body)', transform: mediaPageOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .45s cubic-bezier(.22,1,.36,1)', pointerEvents: mediaPageOpen ? 'auto' : 'none' }}
          onClick={(e) => e.stopPropagation()}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', height: 56, borderBottom: '1px solid var(--hl-border)', flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'grid', placeItems: 'center', color: 'var(--hl-accent)' }}><Icon n="feather" s={14} /></span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--hl-text)' }}>Legacy</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => flash('Upload is coming soon')}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 99, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                <Icon n="upload" s={14} />Upload
              </button>
              <IconBtn n="x" s={18} label="Close" onClick={() => setMediaPageOpen(false)} />
            </div>
          </header>
          <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 780, padding: '28px 24px' }}>
              <h1 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 26, color: 'var(--hl-text)' }}>Media</h1>
              <p style={{ margin: '0 0 20px', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-muted)' }}>Everything you've uploaded, plus anything shared in stories you contribute to.</p>
              <MediaItemsList onEditStub={() => flash('Editing media is coming soon')} memories={memories} stories={stories} flash={flash} />
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ── Mount + styles ───────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    @keyframes lgBounce { 0%,80%,100%{ transform: translateY(0); opacity:.5 } 40%{ transform: translateY(-5px); opacity:1 } }
    @keyframes hl-fade { from { opacity: 0 } to { opacity: 1 } }
    @keyframes hl-modal-in { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: none } }
    @keyframes hl-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
    @keyframes hl-blink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }
    @keyframes hl-pop { 0% { transform: scale(1); } 40% { transform: scale(1.28); } 100% { transform: scale(1); } }
    @keyframes hl-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.9); } }
    @keyframes sc-rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
    .sc-slide-up { animation: sc-rise .34s cubic-bezier(.22,1,.36,1); }
    .mm-zoom-frame:hover .mm-zoom-hint, .mm-zoom-frame:focus-visible .mm-zoom-hint { opacity: 1 !important; }
    @media (prefers-reduced-motion: reduce) { .sc-slide-up { animation: none !important; } }
    @keyframes up-sweep { 0% { background-position: -150% 0; } 100% { background-position: 150% 0; } }
    @keyframes up-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes up-glow-pulse { 0%,100% { opacity: .3; transform: scale(.82); filter: blur(20px); } 50% { opacity: .7; transform: scale(1.12); filter: blur(24px); } }
    @keyframes up-hum-pulse { 0%,100% { opacity: .8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
    .up-shimmer-bar { background-color: var(--hl-border); background-image: linear-gradient(100deg, var(--hl-border) 30%, color-mix(in srgb, var(--hl-accent) 22%, var(--hl-border)) 50%, var(--hl-border) 70%); background-size: 200% 100%; animation: up-sweep 1.8s ease-in-out infinite; }
    .up-glow { animation: up-glow-pulse 2.3s ease-in-out infinite; }
    .up-hum { display: flex; animation: up-hum-pulse 2.3s ease-in-out infinite; }
    .up-ticker { animation: up-in .35s ease; }
    @media (prefers-reduced-motion: reduce) { .up-shimmer-bar, .up-glow, .up-hum, .up-ticker { animation: none !important; } }
    @media (hover: none) { .hl-acts { opacity: 1 !important; } .hl-acts button { width: 34px !important; height: 34px !important; } }
    .lg-scroll::-webkit-scrollbar { width: 9px; }
    .lg-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--hl-text) 16%, transparent); border-radius: 9px; border: 3px solid transparent; background-clip: padding-box; }
    .lg-scroll::-webkit-scrollbar-track { background: transparent; }
    #legacy-story-root textarea::placeholder { color: var(--hl-faint); }
    #legacy-story-root input::placeholder { color: var(--hl-faint); }
    @media (prefers-reduced-motion: reduce) { #legacy-story-root [style*="lgBounce"] { animation: none !important; } }
  `;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'legacy-story-root';  // same id: the shared CSS above targets it
  document.body.appendChild(root);
  ReactDOM.createRoot(root).render(<StoryChat />);
})();
