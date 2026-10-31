import { Loader2 } from 'lucide-react';

/** Mientras carga el código de una pantalla del panel, en vez de un hueco. */
export default function Loading() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Cargando" />
    </div>
  );
}
