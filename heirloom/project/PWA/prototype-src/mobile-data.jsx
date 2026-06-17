/* mobile-data.jsx — Heirloom mobile PWA: theme tokens + real content.
   Exposes window.HL with THEMES and CONTENT. No JSX here. */
(function () {
  // ── Themes (CSS-var maps applied to the phone screen root) ───────────────
  const THEMES = {
    sepia: {
      '--hl-bg': '#ECE3D2', '--hl-bg-2': '#E3D8C2', '--hl-surface': '#F6EFE0', '--hl-surface-2': '#EFE6D2',
      '--hl-text': '#2E2417', '--hl-muted': 'rgba(46,36,23,0.62)', '--hl-faint': 'rgba(46,36,23,0.36)',
      '--hl-border': 'rgba(46,36,23,0.14)', '--hl-border-strong': 'rgba(46,36,23,0.24)',
      '--hl-glow-1': '#E9D3A8', '--hl-glow-2': '#E0CCA0', '--hl-on-accent': '#2A1C0B', '--hl-danger': '#B0432F',
      '--hl-accent': '#B68A3E', '--hl-accent-hover': '#9C7430',
      '--hl-statusbar': 'dark', // dark glyphs on light bg
    },
    espresso: {
      '--hl-bg': '#1C0F06', '--hl-bg-2': '#170B04', '--hl-surface': '#2A1A0E', '--hl-surface-2': '#33210F',
      '--hl-text': '#F5EFE6', '--hl-muted': 'rgba(245,239,230,0.55)', '--hl-faint': 'rgba(245,239,230,0.30)',
      '--hl-border': 'rgba(245,239,230,0.12)', '--hl-border-strong': 'rgba(245,239,230,0.20)',
      '--hl-glow-1': '#5C3317', '--hl-glow-2': '#3D2010', '--hl-on-accent': '#1C0F06', '--hl-danger': '#E58D80',
      '--hl-accent': '#C9A96E', '--hl-accent-hover': '#B8935A',
      '--hl-statusbar': 'light',
    },
    midnight: {
      '--hl-bg': '#0F1115', '--hl-bg-2': '#0B0D10', '--hl-surface': '#181B21', '--hl-surface-2': '#1F242C',
      '--hl-text': '#ECEEF2', '--hl-muted': 'rgba(236,238,242,0.55)', '--hl-faint': 'rgba(236,238,242,0.30)',
      '--hl-border': 'rgba(236,238,242,0.12)', '--hl-border-strong': 'rgba(236,238,242,0.20)',
      '--hl-glow-1': '#2C3340', '--hl-glow-2': '#1A1F27', '--hl-on-accent': '#0F1115', '--hl-danger': '#E8847A',
      '--hl-accent': '#C9A96E', '--hl-accent-hover': '#B8935A',
      '--hl-statusbar': 'light',
    },
  };

  function buildTheme(name) {
    const base = THEMES[name] || THEMES.sepia;
    const accent = base['--hl-accent'];
    return {
      ...base,
      '--hl-accent-soft': `color-mix(in srgb, ${accent} 16%, transparent)`,
      '--hl-accent-line': `color-mix(in srgb, ${accent} 32%, transparent)`,
      '--font-display': `'Cormorant Garamond', Georgia, serif`,
      '--font-body': `'DM Sans', system-ui, sans-serif`,
      '--font-mono': `'DM Mono', ui-monospace, monospace`,
    };
  }

  const CONTENT = {
    brand: 'Heirloom',
    tagline: 'Every life deserves to be told.',
    sub: 'Capture your story once. Publish it as a printed book, an illustrated comic, a living webpage, or an audiobook in your own voice.',
    eyebrow: 'One life, many forms',
    formats: ['Book', 'Comic', 'Webpage', 'Audiobook'],

    whatis: [
      { icon: 'mic', label: 'Capture', body: 'Guided voice and text conversations that draw stories out — chapter by chapter, memory by memory.' },
      { icon: 'sparkles', label: 'Shape', body: 'AI acts as your editor. It drafts, organizes, and refines — you approve every word.' },
      { icon: 'bookOpen', label: 'Publish', body: 'A formatted, print-ready manuscript — a physical book and a mobile keepsake.' },
    ],
    how: [
      { n: '01', t: 'Invite', d: 'Set up your project. Invite contributors — family, friends, colleagues.' },
      { n: '02', t: 'Capture', d: 'AI-guided voice or text interviews. Pull from photos, letters, documents.' },
      { n: '03', t: 'Draft', d: 'AI composes scenes, chapters, moments. You approve or refine.' },
      { n: '04', t: 'Compile', d: 'Approved blocks assemble into a manuscript. You review the full arc.' },
      { n: '05', t: 'Publish', d: 'Print-on-demand book delivered. Mobile web version included.' },
    ],
    closing: 'The stories we never wrote down are the ones we lose. Let\u2019s write yours down.',

    emptyPrompt: 'Where should we begin?',
    starters: ['The house I grew up in', 'How my parents met', 'A summer I\u2019ll never forget', 'The work that defined me'],
    guideTurns: [
      "What a place to begin. Close your eyes for a moment — when you picture it, what is the very first thing you see? The light, a face, the room itself?",
      "I can almost see it. And the sound of it — was the house quiet, or always full of someone?",
      "That detail belongs in the book. Who was with you most often in those years?",
      "Thank you for trusting me with that. I\u2019ve kept it safe as the opening of your first chapter. Whenever you\u2019re ready, tell me what happened next.",
    ],

    // Memories = recent conversations (loose chats)
    memories: [
      { id: 'm1', title: 'The house on Vandalia Street', when: '2h ago', starred: true, cached: true },
      { id: 'm2', title: 'Meeting Eleanor', when: 'Yesterday', starred: false, cached: true },
      { id: 'm3', title: 'The summer we drove west', when: '3 days ago', starred: false, cached: true },
      { id: 'm4', title: 'My father\u2019s workshop', when: 'Last week', starred: true, cached: false },
      { id: 'm5', title: 'The bakery on Arthur Avenue', when: 'Last week', starred: false, cached: false },
    ],

    stories: [
      { id: 's1', name: 'A Life in Full', tagline: 'The long arc — childhood to now.', chapters: 4,
        collaborators: [{ name: 'Eleanor Hayes', rel: 'Daughter', status: 'joined' }, { name: 'Marcus Bell', rel: 'Brother', status: 'pending' }, { name: 'Sofia Russo', rel: 'Granddaughter', status: 'pending' }] },
      { id: 's2', name: 'The Bell Family', tagline: 'Where we came from, and how.', chapters: 3,
        collaborators: [{ name: 'Marcus Bell', rel: 'Brother', status: 'joined' }, { name: 'Rosa Bell', rel: 'Mother', status: 'joined' }] },
      { id: 's3', name: 'Letters to the Grandchildren', tagline: 'The things I want them to keep.', chapters: 2,
        collaborators: [{ name: 'Sofia Russo', rel: 'Granddaughter', status: 'pending' }] },
    ],

    prompts: [
      'A scent that carries you straight back home',
      'The bravest thing you ever did for love',
      'Advice you\u2019d hand down to a great-grandchild',
      'A moment you knew everything had changed',
    ],

    // Per-row kebab actions (mobile bottom sheet) — mirrors production SidebarV2
    rowActions: [
      { key: 'star', icon: 'star', label: 'Star' },
      { key: 'rename', icon: 'edit', label: 'Rename' },
      { key: 'invite', icon: 'userPlus', label: 'Invite collaborators' },
      { key: 'moveToChapter', icon: 'folder', label: 'Move to chapter' },
      { key: 'removeFromChapter', icon: 'folderMinus', label: 'Remove from chapter' },
      { key: 'delete', icon: 'trash', label: 'Delete', danger: true },
    ],
  };

  const initials = (n) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  window.HL = { THEMES, buildTheme, CONTENT, initials };
})();
