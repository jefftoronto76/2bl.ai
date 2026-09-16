// services/branding/build-tenant-metadata.test.ts

import { describe, it, expect } from 'vitest'
import { buildTenantMetadata } from './build-tenant-metadata'

describe('buildTenantMetadata — metadataBase', () => {
  it.each([
    ['heirloom.2bl.ai', 'https://heirloom.2bl.ai/'],
    ['2bl.ai', 'https://2bl.ai/'],
    ['jefflougheed.ca', 'https://jefflougheed.ca/'],
  ])('constructs https://%s as metadataBase', (domain, expectedHref) => {
    const metadata = buildTenantMetadata({
      domain,
      title: 'Title',
      description: 'Description',
      faviconBasePath: '/x/favicons',
    })
    expect(metadata.metadataBase?.href).toBe(expectedHref)
  })
})

describe('buildTenantMetadata — icons', () => {
  it.each([
    '/heirloom/favicons',
    '/2bl/favicons',
    '/sage/jefflougheed/favicons',
  ])('builds icon/apple/manifest paths from faviconBasePath %s', (faviconBasePath) => {
    const metadata = buildTenantMetadata({
      domain: 'example.com',
      title: 'Title',
      description: 'Description',
      faviconBasePath,
    })

    expect(metadata.icons).toEqual({
      icon: [
        { url: `${faviconBasePath}/favicon.ico`, sizes: 'any' },
        { url: `${faviconBasePath}/favicon.svg`, type: 'image/svg+xml' },
        { url: `${faviconBasePath}/favicon-96x96.png`, type: 'image/png', sizes: '96x96' },
      ],
      apple: { url: `${faviconBasePath}/apple-touch-icon.png` },
    })
    expect(metadata.manifest).toBe(`${faviconBasePath}/site.webmanifest`)
  })
})

describe('buildTenantMetadata — title and description mirroring', () => {
  it('mirrors title and description onto openGraph and twitter', () => {
    const metadata = buildTenantMetadata({
      domain: 'example.com',
      title: 'My Title',
      description: 'My Description',
      faviconBasePath: '/x/favicons',
    })

    expect(metadata.title).toBe('My Title')
    expect(metadata.description).toBe('My Description')
    expect(metadata.openGraph?.title).toBe('My Title')
    expect(metadata.openGraph?.description).toBe('My Description')
    expect(metadata.twitter?.title).toBe('My Title')
    expect(metadata.twitter?.description).toBe('My Description')
  })
})

describe('buildTenantMetadata — twitter.card', () => {
  it('is always summary_large_image, regardless of image presence', () => {
    const withoutImage = buildTenantMetadata({
      domain: 'example.com',
      title: 'Title',
      description: 'Description',
      faviconBasePath: '/x/favicons',
    })
    const withImage = buildTenantMetadata({
      domain: 'example.com',
      title: 'Title',
      description: 'Description',
      faviconBasePath: '/x/favicons',
      imagePath: '/x/share.jpg',
      imageAlt: 'Alt text',
    })

    expect(withoutImage.twitter).toMatchObject({ card: 'summary_large_image' })
    expect(withImage.twitter).toMatchObject({ card: 'summary_large_image' })
  })
})

describe('buildTenantMetadata — image omitted', () => {
  it('omits the images key entirely from openGraph and twitter (not present-and-undefined)', () => {
    const metadata = buildTenantMetadata({
      domain: 'example.com',
      title: 'Title',
      description: 'Description',
      faviconBasePath: '/x/favicons',
    })

    expect(metadata.openGraph).not.toHaveProperty('images')
    expect(metadata.twitter).not.toHaveProperty('images')
  })
})

describe('buildTenantMetadata — image provided', () => {
  it.each([
    ['/heirloom/share.jpg', 'Heirloom share image'],
    ['/2bl/share.jpg', 'Second Brain Labs share image'],
  ])('builds openGraph.images (object array) and twitter.images (string array) for %s', (imagePath, imageAlt) => {
    const metadata = buildTenantMetadata({
      domain: 'example.com',
      title: 'Title',
      description: 'Description',
      faviconBasePath: '/x/favicons',
      imagePath,
      imageAlt,
    })

    expect(metadata.openGraph).toHaveProperty('images', [
      { url: imagePath, width: 1200, height: 630, alt: imageAlt },
    ])
    expect(metadata.twitter).toHaveProperty('images', [imagePath])
  })
})

describe('buildTenantMetadata — real tenant configs', () => {
  it('produces the exact Heirloom metadata (regression check against the pre-refactor hand-rolled block)', () => {
    const metadata = buildTenantMetadata({
      domain: 'heirloom.2bl.ai',
      title: 'Heirloom — Every life deserves to be a book.',
      description:
        'An AI-guided biography platform that helps people capture, shape, and publish their life story.',
      faviconBasePath: '/heirloom/favicons',
      imagePath: '/heirloom/heirloom-your-story-matters.jpg',
      imageAlt: 'Heirloom — a physical keepsake book of life stories, open to sample story pages',
    })

    expect(metadata.metadataBase?.href).toBe('https://heirloom.2bl.ai/')
    expect(metadata.title).toBe('Heirloom — Every life deserves to be a book.')
    expect(metadata.description).toBe(
      'An AI-guided biography platform that helps people capture, shape, and publish their life story.'
    )
    expect(metadata.icons).toEqual({
      icon: [
        { url: '/heirloom/favicons/favicon.ico', sizes: 'any' },
        { url: '/heirloom/favicons/favicon.svg', type: 'image/svg+xml' },
        { url: '/heirloom/favicons/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
      ],
      apple: { url: '/heirloom/favicons/apple-touch-icon.png' },
    })
    expect(metadata.manifest).toBe('/heirloom/favicons/site.webmanifest')
    expect(metadata.openGraph).toEqual({
      title: 'Heirloom — Every life deserves to be a book.',
      description:
        'An AI-guided biography platform that helps people capture, shape, and publish their life story.',
      images: [
        {
          url: '/heirloom/heirloom-your-story-matters.jpg',
          width: 1200,
          height: 630,
          alt: 'Heirloom — a physical keepsake book of life stories, open to sample story pages',
        },
      ],
    })
    expect(metadata.twitter).toEqual({
      card: 'summary_large_image',
      title: 'Heirloom — Every life deserves to be a book.',
      description:
        'An AI-guided biography platform that helps people capture, shape, and publish their life story.',
      images: ['/heirloom/heirloom-your-story-matters.jpg'],
    })
  })

  it('produces the expected jefflougheed.ca metadata (no image yet)', () => {
    const metadata = buildTenantMetadata({
      domain: 'jefflougheed.ca',
      title: 'JL',
      description:
        'Performance-driven, heart-led coaching and embedded execution support. Better close rates, deeper relationships, revenue growth made easier.',
      faviconBasePath: '/sage/jefflougheed/favicons',
    })

    expect(metadata.metadataBase?.href).toBe('https://jefflougheed.ca/')
    expect(metadata.title).toBe('JL')
    expect(metadata.manifest).toBe('/sage/jefflougheed/favicons/site.webmanifest')
    expect(metadata.openGraph).toEqual({
      title: 'JL',
      description:
        'Performance-driven, heart-led coaching and embedded execution support. Better close rates, deeper relationships, revenue growth made easier.',
    })
    expect(metadata.twitter).toEqual({
      card: 'summary_large_image',
      title: 'JL',
      description:
        'Performance-driven, heart-led coaching and embedded execution support. Better close rates, deeper relationships, revenue growth made easier.',
    })
  })

  it('produces the expected secondbrainlabs metadata (no image yet)', () => {
    const metadata = buildTenantMetadata({
      domain: '2bl.ai',
      title: 'Second Brain Labs — Software people actually want to use.',
      description:
        'AI changes how software gets built and how people experience it. Second Brain Labs is putting that shift to work.',
      faviconBasePath: '/2bl/favicons',
    })

    expect(metadata.metadataBase?.href).toBe('https://2bl.ai/')
    expect(metadata.title).toBe('Second Brain Labs — Software people actually want to use.')
    expect(metadata.manifest).toBe('/2bl/favicons/site.webmanifest')
    expect(metadata.openGraph).toEqual({
      title: 'Second Brain Labs — Software people actually want to use.',
      description:
        'AI changes how software gets built and how people experience it. Second Brain Labs is putting that shift to work.',
    })
    expect(metadata.twitter).toEqual({
      card: 'summary_large_image',
      title: 'Second Brain Labs — Software people actually want to use.',
      description:
        'AI changes how software gets built and how people experience it. Second Brain Labs is putting that shift to work.',
    })
  })
})
