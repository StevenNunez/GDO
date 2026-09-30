import { redirect } from 'next/navigation';

/**
 * La Programación se mudó al módulo Last Planner, donde vive junto al tren de
 * actividades y al parte diario.
 *
 * Esta ruta queda como redirección y no como una segunda copia de la pantalla:
 * dos pantallas calculando el mismo PPC terminan mostrando números distintos.
 * Existe porque la ruta vieja está en marcadores y en enlaces ya compartidos.
 */
export default function ProgramacionRedirect() {
  redirect('/dashboard/last-planner/programacion');
}
