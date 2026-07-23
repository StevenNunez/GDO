/**
 * Ciclo de vida del modo demo. El flag vive en localStorage; cada vez que alguien
 * pulsa "Probar Demo" se resetea la base y se re-siembra → un visitante nuevo
 * siempre arranca desde la obra de ejemplo limpia.
 */
import { seedDB, clearDB } from './demo-store';
import { buildDemoDB } from './demo-seed';

const FLAG_KEY = 'gdo_demo_active';

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(FLAG_KEY) === '1';
}

/** Activa el demo: resetea, siembra la obra de ejemplo y prende el flag. */
export function startDemo() {
  if (typeof window === 'undefined') return;
  clearDB();
  seedDB(buildDemoDB());
  window.localStorage.setItem(FLAG_KEY, '1');
  // Limpia selección de obra/tenant de una sesión previa para que el
  // DataProvider auto-seleccione la obra del demo.
  window.localStorage.removeItem('currentProjectId');
  window.localStorage.removeItem('selectedTenantId');
}

/** Apaga el demo y borra sus datos. */
export function endDemo() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(FLAG_KEY);
  clearDB();
  window.localStorage.removeItem('currentProjectId');
}
