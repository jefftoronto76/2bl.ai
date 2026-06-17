import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get('host')?.toLowerCase() ?? '';

  if (!host.startsWith('heirloom.')) {
    return {
      name: 'Second Brain Labs',
      short_name: '2BL',
      start_url: '/',
      display: 'standalone',
      icons: [],
    };
  }

  return {
    name: 'Heirloom',
    short_name: 'Heirloom',
    id: '/',
    // start_url and scope are "/" — the public root on heirloom.2bl.ai.
    // The middleware rewrites heirloom.2bl.ai/ → /heirloom internally;
    // the browser only ever sees the public origin, so /heirloom would be wrong.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1C0F06',
    theme_color: '#1C0F06',
    icons: [
      {
        src: '/heirloom/icons/heirloom-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/heirloom/icons/heirloom-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/heirloom/icons/heirloom-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
