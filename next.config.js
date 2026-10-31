// next.config.js
/** @type {import('next').NextConfig} */

// Cabeceras de seguridad aplicadas a toda la app. Sin ellas el sitio se puede
// embeber en un iframe ajeno (clickjacking) y el navegador no fuerza HTTPS.
// Origen de Supabase (REST, auth, storage y realtime por websocket).
const supabaseOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin; } catch { return ''; }
})();
const supabaseWs = supabaseOrigin.replace(/^http/, 'ws');

// Política de contenido en dos capas:
//  - La que se HACE CUMPLIR solo cierra lo que no puede romper nada: nadie
//    puede embeber la app, ni cargar <object>/<base> ajenos, ni mandar
//    formularios a otro dominio.
//  - La completa (scripts, conexiones, imágenes) va en modo REPORTE: el
//    navegador anota en la consola lo que bloquearía, sin bloquearlo. Cuando
//    se navegue la app un rato y no aparezca nada, pasar esas directivas a
//    `Content-Security-Policy` (ya están acá abajo, solo mover el texto).
const cspEnforced = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} https://mindicador.cl`.replace(/\s+/g, ' ').trim(),
  `frame-src 'self' blob: ${supabaseOrigin}`.trim(),
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspEnforced },
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: false,
  turbopack: {},
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
