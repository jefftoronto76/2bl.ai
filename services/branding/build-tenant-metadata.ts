// services/branding/build-tenant-metadata.ts
//
// Centralizes the hand-rolled `export const metadata: Metadata` block that
// was previously duplicated across app/heirloom/layout.tsx,
// app/(jefflougheed)/layout.tsx, and app/secondbrainlabs/layout.tsx. Pure
// function — no DB, no fetch — mirrors services/branding/paper-stack.ts's
// resolvePaperStack() pattern rather than a DB-table config.
//
// imagePath/imageAlt are a discriminated union: a share image is optional,
// but if provided, alt text is mandatory (accessibility). When omitted,
// openGraph.images / twitter.images are omitted entirely — never a
// placeholder fallback. Narrow on config.imagePath directly (not via
// destructuring) so TS keeps the imagePath<->imageAlt correlation.

import type { Metadata } from 'next';

interface TenantMetadataConfigBase {
  /** Bare domain, no protocol, no trailing slash — e.g. 'heirloom.2bl.ai'. */
  domain: string;
  title: string;
  description: string;
  /** No trailing slash — e.g. '/heirloom/favicons'. */
  faviconBasePath: string;
}

interface TenantMetadataConfigWithImage extends TenantMetadataConfigBase {
  /** Path to a 1200x630 share image, relative to metadataBase. */
  imagePath: string;
  imageAlt: string;
}

interface TenantMetadataConfigWithoutImage extends TenantMetadataConfigBase {
  imagePath?: undefined;
  imageAlt?: undefined;
}

export type TenantMetadataConfig =
  | TenantMetadataConfigWithImage
  | TenantMetadataConfigWithoutImage;

export function buildTenantMetadata(config: TenantMetadataConfig): Metadata {
  const { domain, title, description, faviconBasePath } = config;

  return {
    metadataBase: new URL(`https://${domain}`),
    title,
    description,
    icons: {
      icon: [
        { url: `${faviconBasePath}/favicon.ico`, sizes: 'any' },
        { url: `${faviconBasePath}/favicon.svg`, type: 'image/svg+xml' },
        { url: `${faviconBasePath}/favicon-96x96.png`, type: 'image/png', sizes: '96x96' },
      ],
      apple: { url: `${faviconBasePath}/apple-touch-icon.png` },
    },
    manifest: `${faviconBasePath}/site.webmanifest`,
    openGraph: {
      title,
      description,
      ...(config.imagePath
        ? { images: [{ url: config.imagePath, width: 1200, height: 630, alt: config.imageAlt }] }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(config.imagePath ? { images: [config.imagePath] } : {}),
    },
  };
}
