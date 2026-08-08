/**
 * Flujo de aprobación configurable — lógica pura (migración 029).
 *
 * La cadena de visto bueno que cada empresa define para sus contratos de
 * subcontrato, sus estados de pago (propios y del mandante) y sus adicionales.
 * Acá vive el cálculo; el guardián sigue siendo la base: `can_act_on_approval`
 * decide quién firma y `approval_act` mueve el trámite. Este archivo hace la
 * misma cuenta para que la pantalla sepa qué mostrar sin ir a preguntar, pero
 * si los dos discrepan, gana Postgres.
 *
 * Todo lo de acá es determinista y sin dependencias: por eso se puede testear.
 */

import { toCalendarDay } from '@/lib/date-utils';
import type {
  ApprovalAction,
  ApprovalDelegation,
  ApprovalDocumentType,
  ApprovalFlowStep,
  ApprovalRequest,
  ApprovalStepSnapshot,
} from '@/modules/core/lib/data';

/* ── Etiquetas ─────────────────────────────────────────────────────────── */

export const TIPO_DOCUMENTO_LABEL: Record<ApprovalDocumentType, string> = {
  subcontract: 'Contrato de subcontrato',
  subcontract_certificate: 'Estado de pago de subcontrato',
  payment_certificate: 'Estado de pago al mandante',
  amendment: 'Adicional / aumento de obra',
};

/** Orden en que se muestran los tipos en la pantalla de configuración. */
export const TIPOS_DOCUMENTO: ApprovalDocumentType[] = [
  'subcontract',
  'subcontract_certificate',
  'payment_certificate',
  'amendment',
];

/* ── Fotografía del flujo ──────────────────────────────────────────────── */

/**
 * Congela los pasos vigentes dentro de la solicitud. Se ordenan acá y se
 * renumeran desde 0: `sortOrder` puede tener huecos (10, 20, 30) después de
 * borrar un paso, y `currentStep` es un índice del arreglo, no ese número.
 */
export function congelarPasos(pasos: ApprovalFlowStep[]): ApprovalStepSnapshot[] {
  return [...pasos]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p, i) => ({
      order: i,
      name: p.name,
      approverRole: p.approverRole ?? null,
      approverUserId: p.approverUserId ?? null,
      requiresSignature: p.requiresSignature !== false,
    }));
}

/* ── Estado del trámite ────────────────────────────────────────────────── */

/** El paso que está esperando firma, o `null` si el trámite ya cerró. */
export function pasoActual(request: ApprovalRequest): ApprovalStepSnapshot | null {
  if (request.status !== 'pendiente') return null;
  return request.stepsSnapshot[request.currentStep] ?? null;
}

/* ── Delegación de firma (migración 030) ───────────────────────────────── */

/**
 * ¿Está vigente esta delegación hoy?
 *
 * Vigente = activa Y dentro del rango de fechas. El rango se compara por día
 * (no por instante): una delegación que termina "el viernes" tiene que valer
 * el viernes entero, no hasta las 00:00 de ese día.
 */
export function delegacionVigente(
  d: ApprovalDelegation,
  documentType: ApprovalDocumentType,
  hoy: Date = new Date(),
): boolean {
  if (!d.active) return false;
  if (d.documentType && d.documentType !== documentType) return false;

  const dia = soloDia(hoy);
  const desde = soloDia(d.startDate);
  const hasta = soloDia(d.endDate);
  if (desde === null || hasta === null || dia === null) return false;

  return dia >= desde && dia <= hasta;
}

/**
 * Fecha reducida a AAAAMMDD, para comparar días sin que la hora estorbe.
 *
 * Va por `toCalendarDay` y no por `new Date(...)` directo: Supabase devuelve
 * las columnas DATE como `'2026-08-15'`, y ese string lo interpreta el
 * navegador como medianoche **UTC** — que en Chile es el día 14. Leído así,
 * toda delegación terminaría un día antes de lo que dice la pantalla.
 */
function soloDia(v: Date | string | null | undefined): number | null {
  const d = toCalendarDay(v);
  if (!d) return null;
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Los titulares que delegaron su firma en esta persona, para este documento. */
export function titularesQueDelegaronEn(
  delegaciones: ApprovalDelegation[],
  userId: string | null | undefined,
  documentType: ApprovalDocumentType,
  hoy: Date = new Date(),
): string[] {
  if (!userId) return [];
  return delegaciones
    .filter((d) => d.toUserId === userId && delegacionVigente(d, documentType, hoy))
    .map((d) => d.fromUserId);
}

/**
 * ¿Le toca firmar a esta persona?
 *
 * Espejo de `can_act_on_approval` en la base. Un paso nominativo manda por
 * sobre el rol: si el flujo dice "firma el gerente Juan", que otro gerente
 * exista no lo habilita.
 *
 * Con delegaciones (migración 030) hay dos caminos más:
 *  - paso nominativo → el titular delegó en mí;
 *  - paso por rol    → alguien de ese rol delegó en mí. Es el caso común (el
 *    jefe de terreno de vacaciones), y sin él la delegación no serviría para
 *    los pasos por rol, que son la mayoría.
 *
 * La delegación NO encadena: se mira el titular directo, nunca el delegado de
 * un delegado. Una cadena de delegaciones no se puede auditar y puede dar
 * vueltas en círculo.
 */
export function puedeFirmar(
  request: ApprovalRequest,
  quien: {
    userId?: string | null;
    role?: string | null;
    /** Delegaciones vigentes de la empresa; sin ellas se evalúa sin delegación. */
    delegaciones?: ApprovalDelegation[];
    /** Rol de cada usuario, para resolver los pasos por rol delegados. */
    rolPorUsuario?: Record<string, string | null | undefined>;
  },
  hoy: Date = new Date(),
): boolean {
  const paso = pasoActual(request);
  if (!paso) return false;
  if (quien.role === 'super-admin') return true;

  const titulares = titularesQueDelegaronEn(
    quien.delegaciones ?? [], quien.userId, request.documentType, hoy,
  );

  if (paso.approverUserId) {
    return paso.approverUserId === quien.userId
      || titulares.includes(paso.approverUserId);
  }

  if (!paso.approverRole) return false;
  if (paso.approverRole === quien.role) return true;

  return titulares.some((t) => quien.rolPorUsuario?.[t] === paso.approverRole);
}

/**
 * Si esta persona va a firmar por cuenta de otro, quién es ese otro. `null` si
 * firma por sí misma. Es lo que la pantalla muestra antes de firmar: nadie
 * debería estampar su firma sin saber a nombre de quién queda.
 */
export function firmaPorCuentaDe(
  request: ApprovalRequest,
  quien: {
    userId?: string | null;
    delegaciones?: ApprovalDelegation[];
    rolPorUsuario?: Record<string, string | null | undefined>;
  },
  hoy: Date = new Date(),
): string | null {
  const paso = pasoActual(request);
  if (!paso) return null;

  const titulares = titularesQueDelegaronEn(
    quien.delegaciones ?? [], quien.userId, request.documentType, hoy,
  );

  if (paso.approverUserId) {
    if (paso.approverUserId === quien.userId) return null;
    return titulares.includes(paso.approverUserId) ? paso.approverUserId : null;
  }

  // En un paso por rol no hay titular único; solo se nombra si el firmante
  // llegó ahí por una delegación y no por su propio rol.
  return titulares.find((t) => quien.rolPorUsuario?.[t] === paso.approverRole) ?? null;
}

/**
 * Revisa una delegación antes de guardarla. Las tres reglas son las mismas que
 * la base impone, dichas en cristiano y antes de que falle el guardado.
 */
export function validarDelegacion(
  d: Pick<ApprovalDelegation, 'fromUserId' | 'toUserId' | 'startDate' | 'endDate'>,
): string[] {
  const errores: string[] = [];

  if (!d.toUserId) {
    errores.push('Elige en quién delegas tu firma.');
  } else if (d.fromUserId === d.toUserId) {
    errores.push('No puedes delegar tu firma en ti mismo.');
  }

  const desde = soloDia(d.startDate);
  const hasta = soloDia(d.endDate);
  if (desde === null) errores.push('Falta la fecha de inicio.');
  if (hasta === null) errores.push('Falta la fecha de término: una delegación sin fin es un cambio permanente.');
  if (desde !== null && hasta !== null && hasta < desde) {
    errores.push('La fecha de término no puede ser anterior a la de inicio.');
  }

  return errores;
}

/**
 * A dónde queda el trámite después de una firma. Espejo del RPC.
 *
 * Un rechazo corta la cadena en el paso donde ocurrió: no sigue al siguiente
 * ni vuelve al principio solo. Corregir el documento abre un trámite nuevo, y
 * así el historial muestra los dos intentos en vez de pisar el primero.
 */
export function resultadoDe(
  request: ApprovalRequest,
  accion: 'aprobado' | 'rechazado',
): { status: ApprovalRequest['status']; currentStep: number } {
  const total = request.stepsSnapshot.length;

  if (accion === 'rechazado') {
    return { status: 'rechazado', currentStep: request.currentStep };
  }
  if (request.currentStep + 1 >= total) {
    return { status: 'aprobado', currentStep: total };
  }
  return { status: 'pendiente', currentStep: request.currentStep + 1 };
}

export interface ProgresoAprobacion {
  total: number;
  firmados: number;
  /** Nombre del paso que espera firma, o `null` si cerró. */
  esperando: string | null;
  /** 0–100. Un trámite rechazado no se completa: queda donde murió. */
  porcentaje: number;
}

export function progresoAprobacion(request: ApprovalRequest): ProgresoAprobacion {
  const total = request.stepsSnapshot.length;
  const paso = pasoActual(request);
  const firmados = request.status === 'aprobado'
    ? total
    : Math.min(request.currentStep, total);

  return {
    total,
    firmados,
    esperando: paso?.name ?? null,
    porcentaje: total === 0 ? 0 : Math.round((firmados / total) * 100),
  };
}

/* ── Bandeja «pendientes de mi firma» ──────────────────────────────────── */

/**
 * Los trámites que esperan a esta persona. Es la lista que hace que el flujo
 * sirva: sin ella, cada aprobador tendría que entrar documento por documento
 * a ver si le toca.
 */
export function pendientesDeFirma(
  requests: ApprovalRequest[],
  quien: {
    userId?: string | null;
    role?: string | null;
    delegaciones?: ApprovalDelegation[];
    rolPorUsuario?: Record<string, string | null | undefined>;
  },
  hoy: Date = new Date(),
): ApprovalRequest[] {
  return requests
    .filter((r) => r.status === 'pendiente' && puedeFirmar(r, quien, hoy))
    .sort((a, b) => fechaMs(a.submittedAt) - fechaMs(b.submittedAt));
}

/** Días que lleva el trámite esperando. Sirve para ordenar por antigüedad. */
export function diasEsperando(request: ApprovalRequest, hoy: Date = new Date()): number {
  const desde = fechaMs(request.submittedAt);
  if (!Number.isFinite(desde)) return 0;
  return Math.max(0, Math.floor((hoy.getTime() - desde) / 86_400_000));
}

function fechaMs(v: Date | string | null | undefined): number {
  if (!v) return 0;
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

/* ── Huella del documento ──────────────────────────────────────────────── */

/**
 * Texto canónico con los campos que NO pueden cambiar después de firmado
 * (montos, plazos, partes). Se ordenan las claves y se normalizan los números
 * para que el mismo documento produzca siempre la misma huella: si el orden
 * dependiera de cómo se armó el objeto, la huella cambiaría sola y todos los
 * documentos aparecerían alterados.
 *
 * El SHA-256 se calcula aparte (`huellaDocumento`), porque exige el navegador.
 */
export function textoCanonico(campos: Record<string, unknown>): string {
  return Object.keys(campos)
    .sort()
    .map((k) => `${k}=${normalizar(campos[k])}`)
    .join('|');
}

function normalizar(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(4) : '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v).trim();
}

/**
 * ¿El documento cambió después de que lo firmaron?
 *
 * Compara la huella de ahora contra la del instante de la firma. Un documento
 * sin huella guardada (los anteriores a esta migración) no se marca como
 * alterado: no se sabe, y acusar en falso es peor que no acusar.
 */
export function documentoAlterado(
  request: ApprovalRequest,
  huellaActual: string | null | undefined,
): boolean {
  if (!request.documentHash || !huellaActual) return false;
  return request.documentHash !== huellaActual;
}

/** SHA-256 del texto canónico, en hexadecimal. */
export async function huellaDocumento(campos: Record<string, unknown>): Promise<string> {
  const texto = textoCanonico(campos);
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ── Historial ─────────────────────────────────────────────────────────── */

/** Las acciones del trámite en el orden en que ocurrieron. */
export function historialDe(
  acciones: ApprovalAction[],
  requestId: string,
): ApprovalAction[] {
  return acciones
    .filter((a) => a.requestId === requestId)
    .sort((a, b) => fechaMs(a.actedAt) - fechaMs(b.actedAt));
}

/**
 * El motivo por el que se rechazó, para mostrarlo arriba del documento. Es el
 * dato que la pizarra pedía explícitamente: quien corrige tiene que saber qué
 * corregir sin llamar por teléfono.
 */
export function motivoRechazo(
  request: ApprovalRequest,
  acciones: ApprovalAction[],
): { motivo: string; por: string | null; paso: string | null } | null {
  if (request.status !== 'rechazado') return null;

  const rechazo = historialDe(acciones, request.id)
    .filter((a) => a.action === 'rechazado')
    .pop();
  if (!rechazo) return null;

  return {
    motivo: rechazo.comment ?? '',
    por: rechazo.actorName ?? null,
    paso: rechazo.stepName ?? null,
  };
}

/* ── Validación del flujo antes de guardarlo ───────────────────────────── */

/**
 * Revisa la plantilla antes de activarla. Un flujo mal armado no falla al
 * guardarlo: falla el día que un estado de pago queda trabado y nadie sabe
 * quién tiene que firmarlo.
 */
export function validarFlujo(pasos: ApprovalFlowStep[]): string[] {
  const errores: string[] = [];

  if (pasos.length === 0) {
    errores.push('El flujo necesita al menos un paso de aprobación.');
  }

  pasos.forEach((p, i) => {
    const etiqueta = p.name?.trim() || `Paso ${i + 1}`;
    if (!p.name?.trim()) {
      errores.push(`El paso ${i + 1} no tiene nombre.`);
    }
    if (!p.approverRole && !p.approverUserId) {
      errores.push(`«${etiqueta}» no tiene quién lo apruebe: quedaría trabado.`);
    }
  });

  // Dos pasos seguidos con el mismo aprobador: la misma persona firmando dos
  // veces no agrega control, solo clics.
  const orden = [...pasos].sort((a, b) => a.sortOrder - b.sortOrder);
  for (let i = 1; i < orden.length; i++) {
    const a = orden[i - 1];
    const b = orden[i];
    const mismoUsuario = !!a.approverUserId && a.approverUserId === b.approverUserId;
    const mismoRol = !a.approverUserId && !b.approverUserId
      && !!a.approverRole && a.approverRole === b.approverRole;
    if (mismoUsuario || mismoRol) {
      errores.push(
        `«${a.name}» y «${b.name}» los aprueba el mismo firmante: junta los dos pasos en uno.`,
      );
    }
  }

  return errores;
}
