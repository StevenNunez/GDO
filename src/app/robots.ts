import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

// Los buscadores pueden indexar la landing pública, pero no las zonas privadas
// (dashboard/API/reset de contraseña).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/api/', '/reset-password'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
