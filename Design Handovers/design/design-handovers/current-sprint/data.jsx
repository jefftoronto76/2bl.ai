// Sample block data + icon primitives shared across all variations
const TYPES = {
  process:   { label: "Process",   badge: "badge--light-orange" },
  knowledge: { label: "Knowledge", badge: "badge--light-teal" },
  identity:  { label: "Identity",  badge: "badge--light-violet" },
};

const BLOCKS = [
  { id: "b1", title: "Working Session — Unlabeled Routing", type: "process", tokens: 412, active: true, order: 0,
    preview: "When an inbound message arrives without a clear intent label, route the conversation to the general working session flow. Ask two clarifying questions before proposing a next step. Never assume the user wants to book; confirm explicitly.",
    updated: "2d ago", author: "Jess K." },
  { id: "b2", title: "Jeff's Derailer — Process Activation Under Pressure", type: "knowledge", tokens: 687, active: false, order: 1,
    preview: "Under pressure, Jeff tends to compress the process and jump to advice. Remind him that the four-stage discovery cadence is what separates a trust-built session from a transactional one. Slow down before resolving.",
    updated: "1w ago", author: "Jeff T." },
  { id: "b3", title: "Jeff's Personality & What Makes Him Effective", type: "knowledge", tokens: 914, active: true, order: 4,
    preview: "Jeff's effectiveness comes from radical presence — he listens longer than most coaches before intervening. This is learned; mirror it by echoing the last meaningful phrase the client said before proposing anything.",
    updated: "3d ago", author: "Jeff T." },
  { id: "b4", title: "References & Trust Layer", type: "knowledge", tokens: 520, active: true, order: 8,
    preview: "When a prospect expresses doubt, surface one relevant peer reference and one measurable outcome. Never fabricate. If no appropriate reference exists, say 'I'd want to connect you with someone whose situation maps more closely.'",
    updated: "5d ago", author: "Maya R." },
  { id: "b5", title: "Jeff's Differentiators — What Makes Him Different", type: "knowledge", tokens: 430, active: true, order: 3,
    preview: "Three differentiators, in order: (1) operator background, not pure coach; (2) written frameworks clients keep; (3) no retainers — finite engagements. Lead with whichever maps to the prospect's stated constraint.",
    updated: "2w ago", author: "Jeff T." },
  { id: "b6", title: "Sage's Voice — How to Sound Like Jeff", type: "identity", tokens: 1205, active: true, order: 2,
    preview: "Write in short declarative sentences. Concrete nouns over abstractions. Never use 'I think' or 'maybe' — if uncertain, name the uncertainty specifically. One rhetorical question per message maximum. No emoji.",
    updated: "4h ago", author: "Maya R." },
  { id: "b7", title: "Jeff's Coaching Credentials", type: "knowledge", tokens: 288, active: true, order: 6,
    preview: "15 years as an operator — two exits, one IPO. Coach since 2019, ~90 active engagements. Board advisor at four companies. Mention only when asked directly or when credibility is material to the next step.",
    updated: "1mo ago", author: "Jeff T." },
  { id: "b8", title: "What Happens in a Session", type: "knowledge", tokens: 612, active: true, order: 7,
    preview: "Sessions are 75 minutes, held on Zoom or in person in SF. The first 15 are for updates; the middle 45 are the 'working block' — one problem, written artifact produced; the last 15 are commitments and next-step plan.",
    updated: "3w ago", author: "Jeff T." },
  { id: "b9", title: 'Objection — "Can we do a free intro call first?"', type: "process", tokens: 340, active: true, order: 19,
    preview: "Free intros dilute the working relationship. Offer instead: a paid 30-minute scoping call, fully credited toward the first engagement if it proceeds. Frame as 'skin in the game from both sides.'",
    updated: "6d ago", author: "Maya R." },
  { id: "b10", title: 'Objection — "What if it\'s not resolved after one session?"', type: "process", tokens: 395, active: true, order: 18,
    preview: "Most problems worth coaching on aren't one-session problems — they're compounding ones. Set the expectation: session one produces a frame and a first experiment; resolution comes from iteration between sessions.",
    updated: "1w ago", author: "Maya R." },
  { id: "b11", title: "Pricing Philosophy & Packaging", type: "knowledge", tokens: 478, active: true, order: 9,
    preview: "Four-session packages, paid up front, no refunds after session two. Price reflects outcome bands, not hours. If the prospect fixates on hourly, that's a signal this isn't the right engagement — redirect gracefully.",
    updated: "2d ago", author: "Jeff T." },
  { id: "b12", title: "Tone When Declining a Fit", type: "identity", tokens: 202, active: false, order: 10,
    preview: "Decline warmly. Name the specific reason (stage, domain, capacity). Offer exactly one alternative path — a colleague, a book, a waitlist date. Never leave the prospect without a next step.",
    updated: "5d ago", author: "Maya R." },
  { id: "b13", title: "Session Follow-up Email Template", type: "process", tokens: 320, active: true, order: 11,
    preview: "Sent within 2h of session end. Three sections: (1) the frame we agreed on, in one sentence; (2) the one commitment before next session; (3) any resource links. No preamble. Jeff signs off with 'JT —'.",
    updated: "2w ago", author: "Jess K." },
];

const TOKEN_BUDGET = 8000;

// Tiny SVG icon set — inline, no deps
const Icon = ({ name, size = 16 }) => {
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    edit: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></>,
    trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></>,
    drag: <><circle cx="9" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="15" cy="18" r="1.2"/></>,
    caretDown: <><path d="m6 9 6 6 6-6"/></>,
    chevronRight: <><path d="m9 18 6-6-6-6"/></>,
    chevronDown: <><path d="m6 9 6 6 6-6"/></>,
    filter: <><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></>,
    dots: <><circle cx="12" cy="6" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="18" r="1.2"/></>,
    x: <><path d="M18 6 6 18M6 6l12 12"/></>,
    check: <><path d="M20 6 9 17l-5-5"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    warn: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></>,
    sparkles: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></>,
    grip: <><circle cx="8" cy="8" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="16" cy="16" r="1"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></>,
    moon: <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M5 5l1.4 1.4M17.6 17.6 19 19M2 12h2M20 12h2M5 19l1.4-1.4M17.6 6.4 19 5"/></>,
    layers: <><path d="m12 2 10 6-10 6L2 8l10-6zM2 12l10 6 10-6M2 16l10 6 10-6"/></>,
    code: <><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></>,
    diff: <><path d="M12 3v14M5 10h14M5 21h14"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

Object.assign(window, { TYPES, BLOCKS, TOKEN_BUDGET, Icon });
