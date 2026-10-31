'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Red de seguridad de toda la app: si un componente falla al renderizar, la
 * persona ve esto y puede reintentar, en vez de una pantalla en blanco.
 * Next la usa para cualquier ruta que no tenga su propio error.tsx.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Algo salió mal en esta pantalla</h2>
        <p className="text-sm text-muted-foreground">
          Tus datos están a salvo. Puedes volver a intentarlo; si el problema sigue, recarga la página
          o avísale a soporte{error.digest ? ` (código ${error.digest})` : ''}.
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={reset}>Reintentar</Button>
          <Button variant="outline" onClick={() => { window.location.href = '/dashboard'; }}>
            Ir al inicio
          </Button>
        </div>
      </div>
    </div>
  );
}
