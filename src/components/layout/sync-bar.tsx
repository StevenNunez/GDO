'use client';

import * as React from 'react';
import { useAppState } from '@/modules/data/useData';

/**
 * Barrita fina arriba de la pantalla mientras se descargan los datos de una
 * sección recién abierta. Como los datos se piden recién cuando una pantalla los
 * necesita, la primera vez que se entra a una sección hay un instante en que
 * parece vacía: esto avisa que están llegando. No aparece si la carga es
 * instantánea (espera 250 ms), para no parpadear.
 */
export function SyncBar() {
  const { isSyncing } = useAppState();
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!isSyncing) return;
    const t = setTimeout(() => setVisible(true), 250);
    return () => {
      clearTimeout(t);
      setVisible(false);
    };
  }, [isSyncing]);

  if (!isSyncing || !visible) return null;
  return (
    <div
      role="progressbar"
      aria-label="Cargando datos"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/15"
    >
      <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
    </div>
  );
}
