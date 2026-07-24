/**
 * URL pública del sitio. Dominio de producción real de la app; en desarrollo,
 * localhost. Se puede sobrescribir con NEXT_PUBLIC_SITE_URL si algún día cambia.
 *
 * Se usa para metadata, imagen de compartir, robots y sitemap: sin una URL
 * absoluta correcta, WhatsApp/redes/buscadores no encuentran bien el sitio.
 */
export const PRODUCTION_URL = 'https://www.gestiondeobras.app';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === 'production' ? PRODUCTION_URL : 'http://localhost:3000');
