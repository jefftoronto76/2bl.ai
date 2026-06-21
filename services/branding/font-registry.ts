export type FontEntry = { label: string; value: string; googleFamily?: string };

export const DISPLAY_FONTS: FontEntry[] = [
  { label: 'Playfair Display',   value: 'Playfair Display, Georgia, serif',   googleFamily: 'Playfair+Display:ital,wght@0,400;0,700;1,400' },
  { label: 'Cormorant Garamond', value: 'Cormorant Garamond, Georgia, serif', googleFamily: 'Cormorant+Garamond:ital,wght@0,400;0,600;1,400' },
  { label: 'Newsreader',         value: 'Newsreader, Georgia, serif',         googleFamily: 'Newsreader:ital,wght@0,400;0,600;1,400' },
  { label: 'Lora',               value: 'Lora, Georgia, serif',               googleFamily: 'Lora:ital,wght@0,400;0,700;1,400' },
  { label: 'Merriweather',       value: 'Merriweather, Georgia, serif',       googleFamily: 'Merriweather:ital,wght@0,400;0,700;1,400' },
  { label: 'EB Garamond',        value: 'EB Garamond, Georgia, serif',        googleFamily: 'EB+Garamond:ital,wght@0,400;0,700;1,400' },
  { label: 'Georgia (system)',   value: 'Georgia, serif' },
];

export const BODY_FONTS: FontEntry[] = [
  { label: 'DM Sans',            value: 'DM Sans, sans-serif',        googleFamily: 'DM+Sans:wght@400;500;700' },
  { label: 'Manrope',            value: 'Manrope, sans-serif',        googleFamily: 'Manrope:wght@400;500;700' },
  { label: 'Inter',              value: 'Inter, sans-serif',          googleFamily: 'Inter:wght@400;500;700' },
  { label: 'Source Sans 3',      value: 'Source Sans 3, sans-serif',  googleFamily: 'Source+Sans+3:wght@400;600;700' },
  { label: 'Nunito',             value: 'Nunito, sans-serif',         googleFamily: 'Nunito:wght@400;600;700' },
  { label: 'Open Sans',          value: 'Open Sans, sans-serif',      googleFamily: 'Open+Sans:wght@400;600;700' },
  { label: 'System UI (system)', value: 'system-ui, sans-serif' },
];

export const MONO_FONTS: FontEntry[] = [
  { label: 'DM Mono',             value: 'DM Mono, Courier New, monospace',  googleFamily: 'DM+Mono:wght@400;500' },
  { label: 'JetBrains Mono',      value: 'JetBrains Mono, monospace',        googleFamily: 'JetBrains+Mono:wght@400;700' },
  { label: 'Fira Code',           value: 'Fira Code, monospace',             googleFamily: 'Fira+Code:wght@400;700' },
  { label: 'Source Code Pro',     value: 'Source Code Pro, monospace',       googleFamily: 'Source+Code+Pro:wght@400;700' },
  { label: 'Courier New (system)', value: 'Courier New, monospace' },
];

export const ALL_FONTS: FontEntry[] = [...DISPLAY_FONTS, ...BODY_FONTS, ...MONO_FONTS];
