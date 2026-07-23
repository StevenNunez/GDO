'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Pone el nombre del módulo en la pestaña del navegador según la ruta. Las
 * páginas del dashboard son client components y no pueden exportar `metadata`,
 * así que el título se setea acá con `document.title`. Se monta una vez en el
 * layout del dashboard.
 */
const BRAND = 'Gestión de Obras';

// Segmento de ruta (/dashboard/<segmento>/…) → etiqueta que ve el usuario.
// Coincide con los nombres del hub y la barra lateral.
const MODULE_TITLES: Record<string, string> = {
  attendance: 'Asistencia',
  bodega: 'Bodega',
  clients: 'Clientes',
  'construction-control': 'Control de Obra',
  cphs: 'Comité Paritario',
  'estado-pago': 'Estado de Pago',
  'material-control': 'Trazabilidad',
  payments: 'Finanzas',
  permissions: 'Permisos',
  profile: 'Mi Perfil',
  projects: 'Proyectos',
  purchasing: 'Compras',
  reports: 'Reportes',
  safety: 'HSEC',
  subscriptions: 'Suscripciones',
  supervisor: 'Control de Terreno',
  users: 'Usuarios',
  worker: 'Mi Billetera',
};

export function DocumentTitle() {
  const pathname = usePathname();

  useEffect(() => {
    const segment = pathname?.split('/')[2]; // '' / 'dashboard' / '<módulo>' / …
    const label = segment ? MODULE_TITLES[segment] : 'Inicio';
    document.title = label ? `${label} · ${BRAND}` : BRAND;
  }, [pathname]);

  return null;
}
