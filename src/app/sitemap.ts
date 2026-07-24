import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

// Páginas públicas para los buscadores. El dashboard es privado (ver robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
