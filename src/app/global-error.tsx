'use client';

/**
 * Último recurso: falla el layout raíz mismo. Reemplaza al <html> completo,
 * así que no puede depender de temas, fuentes ni componentes de la app.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#f8fafc', color: '#0f172a' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>No pudimos cargar la aplicación</h1>
            <p style={{ fontSize: 14, color: '#475569', margin: '0 0 16px' }}>
              Tus datos están a salvo. Intenta de nuevo{error.digest ? ` (código ${error.digest})` : ''}.
            </p>
            <button
              onClick={reset}
              style={{ background: '#003F66', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
