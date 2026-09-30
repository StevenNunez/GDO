/**
 * El parte del capataz (`/parte/[token]`), pero resuelto en el navegador.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *   `/api/parte/[token]` valida el enlace en el SERVIDOR con la clave de
 *   servicio, porque quien lo abre no tiene sesión y por lo tanto no hay RLS
 *   que lo proteja. Eso está bien y no se toca. Pero en el modo demo no hay
 *   servidor que valga: la base vive en el localStorage del visitante, así que
 *   esa ruta no encuentra el token y el enlace muere en «ya no sirve».
 *
 *   El resultado era que la mitad más visible de la fase 3 —mandarle el enlace
 *   al capataz por WhatsApp y verlo reportar— no se podía mostrar en la demo.
 *
 * QUÉ GARANTIZA
 *   Reusa las MISMAS funciones puras que la ruta real (`celdasDeActividad`,
 *   `avanceVigente`, `claveDia`), así que lo que el visitante ve en la demo es
 *   exactamente lo que verá el capataz en la obra. Lo único que cambia es de
 *   dónde salen las filas.
 *
 * LO QUE NO HACE
 *   No relaja nada de la ruta real ni se usa fuera del demo: el único que lo
 *   llama es `parte/[token]/page.tsx`, detrás de `isDemoMode()`.
 */
import { getRows, insertRows, updateRows } from './demo-store';
import { tokenVigente, unidadesDelParte } from '@/lib/public-daily-report';
import { CAUSAS_CNC } from '@/lib/last-planner';
import { claveDia } from '@/lib/work-calendar';
import type {
  TrainActivity, WorkUnit, WorkCalendarException, DailyProgress,
  DailyReportToken, NonComplianceCause,
} from '@/modules/core/lib/data';

/** El mismo mensaje único de la ruta real: no distinguir vencido de inexistente. */
const ENLACE_INVALIDO = 'Este enlace ya no sirve. Pídele uno nuevo al jefe de terreno.';

export interface UnidadParteDemo {
  unitId: string;
  name: string;
  groupName: string | null;
  avance: number;
  atrasada: boolean;
}

export interface DatosParteDemo {
  actividad: string;
  fase: string | null;
  obra: string;
  capataz: string;
  fecha: string;
  unidades: UnidadParteDemo[];
}

function resolverToken(token: string): DailyReportToken | null {
  if (!token) return null;
  const fila = (getRows('dailyReportTokens') as DailyReportToken[])
    .find((t) => t.token === token);
  if (!fila) return null;
  if (!tokenVigente(fila)) return null;
  return fila;
}

/** Equivalente al GET de la ruta: qué unidades tiene que reportar el capataz. */
export function cargarParteDemo(token: string): DatosParteDemo {
  const acceso = resolverToken(token);
  if (!acceso) throw new Error(ENLACE_INVALIDO);

  const actividad = (getRows('trainActivities') as TrainActivity[])
    .find((a) => a.id === acceso.activityId);
  if (!actividad || actividad.status !== 'activa') throw new Error(ENLACE_INVALIDO);

  const obra = (getRows('projects') as { id: string; name?: string; workDays?: number[] }[])
    .find((p) => p.id === acceso.projectId);

  const unidades = (getRows('workUnits') as WorkUnit[])
    .filter((u) => u.projectId === acceso.projectId && u.status === 'activa')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const hoy = claveDia(acceso.validFor);
  const paraReportar = unidadesDelParte(acceso, actividad, unidades,
    getRows('dailyProgress') as DailyProgress[],
    getRows('workCalendarExceptions') as WorkCalendarException[], obra?.workDays);

  return {
    actividad: actividad.name,
    fase: actividad.phase ?? null,
    obra: obra?.name ?? '',
    capataz: acceso.foremanName,
    fecha: hoy,
    unidades: paraReportar,
  };
}

/** Equivalente al POST: guarda el avance de una unidad y marca el token usado. */
export function guardarParteDemo(
  token: string,
  body: { unitId: string; progress: number; causeCode?: string | null; notes?: string | null },
): void {
  const acceso = resolverToken(token);
  if (!acceso) throw new Error(ENLACE_INVALIDO);

  const progress = body.progress;
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new Error('Avance fuera de rango.');
  }

  // La misma comprobación de la ruta real: la unidad tiene que ser de la obra
  // del token. Se replica aunque acá no haya riesgo, para que el demo no
  // "funcione" en un caso que en producción se rechaza.
  const permitidas = cargarParteDemo(token).unidades;
  if (!permitidas.some(u => u.unitId === body.unitId)) {
    throw new Error('Unidad no habilitada para este parte.');
  }
  if (body.causeCode != null && !Object.prototype.hasOwnProperty.call(CAUSAS_CNC, body.causeCode)) {
    throw new Error('Causa no valida.');
  }

  const fila = {
    tenantId: acceso.tenantId,
    projectId: acceso.projectId,
    activityId: acceso.activityId,
    unitId: body.unitId,
    // La fecha la manda el token, igual que en producción.
    date: claveDia(acceso.validFor),
    progress,
    crewDays: null,
    quantity: null,
    causeCode: progress >= 1 ? null : ((body.causeCode ?? null) as NonComplianceCause | null),
    photoPath: null,
    notes: body.notes?.slice(0, 500) || null,
    reportedBy: null,
    reportedByName: acceso.foremanName,
    updatedAt: new Date().toISOString(),
  };

  // Un parte por unidad por día: corrige el de hoy si ya existe (migración 041).
  const mismo = (r: Record<string, unknown>) =>
    r.activityId === fila.activityId && r.unitId === fila.unitId && r.date === fila.date;

  if ((getRows('dailyProgress') as Record<string, unknown>[]).some(mismo)) {
    updateRows('dailyProgress', mismo, fila);
  } else {
    insertRows('dailyProgress', [fila]);
  }

  updateRows('dailyReportTokens', (r) => r.id === acceso.id, {
    usedCount: (acceso.usedCount ?? 0) + 1,
    lastUsedAt: new Date().toISOString(),
  });
}
