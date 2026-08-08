/**
 * Agenda de la obra: todo lo que tiene fecha, en una sola lista.
 *
 * POR QUÉ LOS EVENTOS SE DERIVAN Y NO SE GUARDAN
 *   Cada fecha ya vive en su tabla: el término del contrato, el vencimiento de
 *   una garantía, la caducidad del F30-1, la fecha de pago de una orden.
 *   Copiarlas a una tabla de «eventos» significa mantener dos versiones de la
 *   misma fecha, y la copia queda mintiendo en el momento exacto en que alguien
 *   corrige la original — que es cuando más importa. Acá se calculan al vuelo:
 *   la fuente siempre es el documento.
 *
 * EL ORDEN DE LAS CAPAS (corrección del usuario, y es la correcta)
 *   eventos → calendario → notificación → dashboard.
 *   El dashboard solo CONSUME esta lista; no calcula nada por su cuenta. Antes,
 *   cada pantalla rehacía su propio «lo que vence pronto» con criterios
 *   levemente distintos, y dos pantallas podían discrepar sobre el mismo hecho.
 *
 * Lógica pura, con tests.
 */

import { toCalendarDay } from '@/lib/date-utils';
import { calcFechaTermino } from '@/lib/contract';
import { impactoContrato } from '@/lib/amendment';
import { estadoDocumento } from '@/lib/contractor-file';
import type {
  Amendment, Contract, ContractorDocument, ContractorDocumentType,
  EquipmentRental, Guarantee, PaymentOrder, Rdi, Reception, Subcontract,
  Supplier, TaskConstraint,
} from '@/modules/core/lib/data';

/* ── El evento ─────────────────────────────────────────────────────────── */

export type EventoTipo =
  | 'contrato_termino'
  | 'subcontrato_termino'
  | 'garantia_vence'
  | 'documento_contratista_vence'
  | 'orden_pago_vence'
  | 'rdi_vence'
  | 'restriccion_vence'
  | 'garantia_obra_termina'
  | 'equipo_devolucion';

export type EventoUrgencia = 'vencido' | 'hoy' | 'proximo' | 'lejano';

export interface EventoAgenda {
  /** Estable entre recálculos: `tipo:idDeLaFuente`. Sirve de key y de ancla. */
  id: string;
  tipo: EventoTipo;
  fecha: Date;
  titulo: string;
  detalle?: string | null;
  /** A dónde lleva al hacer clic. */
  href: string;
  /** Días hasta la fecha. Negativo = ya pasó. */
  dias: number;
  urgencia: EventoUrgencia;
  projectId?: string | null;
}

export const EVENTO_LABEL: Record<EventoTipo, string> = {
  contrato_termino: 'Término de contrato',
  subcontrato_termino: 'Término de subcontrato',
  garantia_vence: 'Garantía por vencer',
  documento_contratista_vence: 'Documento de contratista',
  orden_pago_vence: 'Orden de pago',
  rdi_vence: 'RDI sin respuesta',
  restriccion_vence: 'Restricción por liberar',
  garantia_obra_termina: 'Fin del período de garantía',
  equipo_devolucion: 'Devolución de equipo',
};

export const URGENCIA_TONO: Record<EventoUrgencia, 'danger' | 'warning' | 'info' | 'neutral'> = {
  vencido: 'danger',
  hoy: 'danger',
  proximo: 'warning',
  lejano: 'neutral',
};

/** Días dentro de los cuales un evento se considera «próximo». */
export const HORIZONTE_PROXIMO = 15;

function diasHasta(fecha: Date | string | null | undefined, hoy: Date): number | null {
  const f = toCalendarDay(fecha);
  const d = toCalendarDay(hoy);
  if (!f || !d) return null;
  return Math.round((f.getTime() - d.getTime()) / 86_400_000);
}

function urgenciaDe(dias: number): EventoUrgencia {
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoy';
  if (dias <= HORIZONTE_PROXIMO) return 'proximo';
  return 'lejano';
}

/** Arma el evento, o `null` si no hay fecha con la que armarlo. */
function evento(
  base: Omit<EventoAgenda, 'dias' | 'urgencia' | 'fecha'> & { fecha: Date | string | null | undefined },
  hoy: Date,
): EventoAgenda | null {
  const dias = diasHasta(base.fecha, hoy);
  const fecha = toCalendarDay(base.fecha);
  if (dias === null || !fecha) return null;
  return { ...base, fecha, dias, urgencia: urgenciaDe(dias) };
}

/* ── Las fuentes ───────────────────────────────────────────────────────── */

export interface FuentesAgenda {
  contracts?: Contract[];
  amendments?: Amendment[];
  guarantees?: Guarantee[];
  subcontracts?: Subcontract[];
  suppliers?: Supplier[];
  contractorDocumentTypes?: ContractorDocumentType[];
  contractorDocuments?: ContractorDocument[];
  paymentOrders?: PaymentOrder[];
  rdis?: Rdi[];
  taskConstraints?: TaskConstraint[];
  receptions?: Reception[];
  equipmentRentals?: EquipmentRental[];
}

/**
 * Construye la agenda completa, ordenada por fecha (lo más urgente primero).
 *
 * `projectId` acota a una obra; sin él, entra todo. Las fechas de documentos de
 * contratista NO se acotan por obra a propósito: un F30-1 vencido lo está para
 * todas las obras de ese contratista a la vez.
 */
export function construirAgenda(
  fuentes: FuentesAgenda,
  opts: { projectId?: string | null; hoy?: Date } = {},
): EventoAgenda[] {
  const hoy = opts.hoy ?? new Date();
  const soloObra = opts.projectId ?? null;
  const eventos: EventoAgenda[] = [];

  const deLaObra = <T extends { projectId?: string | null }>(x: T) =>
    !soloObra || x.projectId === soloObra;

  /* Contrato con el mandante: la fecha VIGENTE, con los adicionales aprobados */
  for (const c of fuentes.contracts ?? []) {
    if (!deLaObra(c)) continue;
    if (c.status === 'closed' || c.status === 'finished') continue;

    const adicionales = (fuentes.amendments ?? []).filter(
      (a) => a.contractId === c.id && !a.subcontractId,
    );
    const impacto = impactoContrato(c, adicionales);

    const e = evento({
      id: `contrato_termino:${c.id}`,
      tipo: 'contrato_termino',
      fecha: impacto.fechaTerminoVigente,
      titulo: `Término de contrato · ${c.name}`,
      detalle: impacto.diasAumento > 0
        ? `Incluye +${impacto.diasAumento} días aprobados`
        : null,
      href: '/dashboard/oficina-tecnica/contrato',
      projectId: c.projectId,
    }, hoy);
    if (e) eventos.push(e);
  }

  /* Garantías del contrato */
  for (const g of fuentes.guarantees ?? []) {
    if (g.status !== 'vigente') continue;
    const e = evento({
      id: `garantia_vence:${g.id}`,
      tipo: 'garantia_vence',
      fecha: g.expiryDate,
      titulo: `Garantía ${g.number ? `N° ${g.number}` : 'sin número'}`,
      detalle: g.bank ?? null,
      href: '/dashboard/oficina-tecnica/contrato',
    }, hoy);
    if (e) eventos.push(e);
  }

  /* Subcontratos vigentes: término = inicio + plazo + adendas aprobadas */
  for (const s of fuentes.subcontracts ?? []) {
    if (!deLaObra(s)) continue;
    if (s.status === 'liquidado' || s.status === 'terminado' || s.status === 'borrador') continue;

    const adendas = (fuentes.amendments ?? []).filter((a) => a.subcontractId === s.id);
    const impacto = impactoContrato(s, adendas);

    const e = evento({
      id: `subcontrato_termino:${s.id}`,
      tipo: 'subcontrato_termino',
      fecha: impacto.fechaTerminoVigente ?? calcFechaTermino(s.startDate, s.plazoDias),
      titulo: `Término de subcontrato · ${s.name}`,
      detalle: s.supplierName ?? null,
      href: `/dashboard/oficina-tecnica/subcontratos/${s.id}`,
      projectId: s.projectId,
    }, hoy);
    if (e) eventos.push(e);
  }

  /* Documentos del expediente de contratistas */
  const tipos = fuentes.contractorDocumentTypes ?? [];
  const contratistas = (fuentes.suppliers ?? []).filter((s) => s.isContractor);
  for (const doc of fuentes.contractorDocuments ?? []) {
    const tipo = tipos.find((t) => t.id === doc.documentTypeId);
    if (!tipo || tipo.active === false || !tipo.hasExpiry) continue;

    // Un documento observado ya se está gestionando por otro lado; sumarlo a la
    // agenda por su fecha lo duplicaría en dos listas distintas.
    const estado = estadoDocumento(doc, tipo, hoy);
    if (estado !== 'vencido' && estado !== 'por_vencer') continue;

    const contratista = contratistas.find((c) => c.id === doc.supplierId);
    const e = evento({
      id: `documento_contratista_vence:${doc.id}`,
      tipo: 'documento_contratista_vence',
      fecha: doc.expiryDate,
      titulo: `${tipo.name} · ${contratista?.name ?? 'Contratista'}`,
      detalle: tipo.code === 'f30_1' ? 'Sin él no se puede pagar (Ley 20.123)' : null,
      href: `/dashboard/oficina-tecnica/contratistas/${doc.supplierId}`,
    }, hoy);
    if (e) eventos.push(e);
  }

  /* Órdenes de pago con fecha de pago comprometida */
  for (const o of fuentes.paymentOrders ?? []) {
    if (o.status === 'pagada' || o.status === 'anulada') continue;
    if (!deLaObra(o)) continue;
    const e = evento({
      id: `orden_pago_vence:${o.id}`,
      tipo: 'orden_pago_vence',
      fecha: o.dueDate,
      titulo: `Pagar OP N° ${o.number} · ${o.supplierName}`,
      detalle: null,
      href: `/dashboard/oficina-tecnica/subcontratos`,
      projectId: o.projectId,
    }, hoy);
    if (e) eventos.push(e);
  }

  /* RDI presentadas sin respuesta */
  for (const r of fuentes.rdis ?? []) {
    if (!deLaObra(r)) continue;
    // Solo las abiertas: una respondida o cerrada ya no espera a nadie.
    if (r.status !== 'abierta') continue;
    const e = evento({
      id: `rdi_vence:${r.id}`,
      tipo: 'rdi_vence',
      fecha: r.dueDate,
      titulo: `RDI sin respuesta · ${r.subject}`,
      detalle: null,
      href: `/dashboard/oficina-tecnica/rdi/${r.id}`,
      projectId: r.projectId,
    }, hoy);
    if (e) eventos.push(e);
  }

  /* Restricciones del Last Planner que hay que liberar */
  for (const c of fuentes.taskConstraints ?? []) {
    if (c.status !== 'pendiente') continue;
    const e = evento({
      id: `restriccion_vence:${c.id}`,
      tipo: 'restriccion_vence',
      fecha: c.dueDate,
      titulo: `Liberar restricción · ${c.description}`,
      detalle: c.responsibleName ?? null,
      href: '/dashboard/oficina-tecnica/programacion',
    }, hoy);
    if (e) eventos.push(e);
  }

  /* Fin del período de garantía que abre la recepción provisoria */
  for (const rec of fuentes.receptions ?? []) {
    if (!deLaObra(rec)) continue;
    if (rec.type !== 'provisoria' || !rec.warrantyDays || !rec.receptionDate) continue;

    const inicio = toCalendarDay(rec.receptionDate);
    if (!inicio) continue;
    const fin = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + rec.warrantyDays);

    const e = evento({
      id: `garantia_obra_termina:${rec.id}`,
      tipo: 'garantia_obra_termina',
      fecha: fin,
      titulo: 'Fin del período de garantía',
      detalle: 'Después de esta fecha se puede hacer la recepción definitiva',
      href: '/dashboard/oficina-tecnica/recepcion',
      projectId: rec.projectId,
    }, hoy);
    if (e) eventos.push(e);
  }

  /* Equipos arrendados: la fecha en que hay que devolverlos.
     Es el evento más rentable de la agenda — cada día de más cuesta plata sin
     que nadie apruebe nada. */
  for (const r of fuentes.equipmentRentals ?? []) {
    if (!deLaObra(r)) continue;
    if (r.status !== 'activo') continue;
    const e = evento({
      id: `equipo_devolucion:${r.id}`,
      tipo: 'equipo_devolucion',
      fecha: r.endDate,
      titulo: `Devolver ${r.name}${r.code ? ` (${r.code})` : ''}`,
      detalle: r.supplierName ?? null,
      href: '/dashboard/oficina-tecnica/equipos',
      projectId: r.projectId,
    }, hoy);
    if (e) eventos.push(e);
  }

  // Lo más vencido primero; a igual fecha, orden estable por id para que la
  // lista no baile entre recálculos.
  return eventos.sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime() || a.id.localeCompare(b.id),
  );
}

/* ── Cortes de la agenda ───────────────────────────────────────────────── */

/** Lo vencido y lo que vence dentro del horizonte. Es lo accionable. */
export function agendaUrgente(
  eventos: EventoAgenda[],
  horizonte = HORIZONTE_PROXIMO,
): EventoAgenda[] {
  return eventos.filter((e) => e.dias <= horizonte);
}

export interface ResumenAgenda {
  vencidos: number;
  hoy: number;
  proximos: number;
  total: number;
  /** Cuántos hay de cada tipo, entre los urgentes. */
  porTipo: { tipo: EventoTipo; label: string; cantidad: number }[];
}

/**
 * Los números que muestra el dashboard. Salen de la MISMA lista que el
 * calendario: si el tablero dijera «3 por vencer» y el calendario mostrara 5,
 * nadie volvería a confiar en ninguno de los dos.
 */
export function resumenAgenda(eventos: EventoAgenda[]): ResumenAgenda {
  const urgentes = agendaUrgente(eventos);
  const mapa = new Map<EventoTipo, number>();
  for (const e of urgentes) {
    mapa.set(e.tipo, (mapa.get(e.tipo) ?? 0) + 1);
  }

  return {
    vencidos: eventos.filter((e) => e.urgencia === 'vencido').length,
    hoy: eventos.filter((e) => e.urgencia === 'hoy').length,
    proximos: eventos.filter((e) => e.urgencia === 'proximo').length,
    total: eventos.length,
    porTipo: [...mapa.entries()]
      .map(([tipo, cantidad]) => ({ tipo, label: EVENTO_LABEL[tipo], cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}

/* ── Vista de calendario ───────────────────────────────────────────────── */

/**
 * Agrupa por día, en clave `YYYY-MM-DD` local. La clave se arma con los campos
 * locales y no cortando un ISO: en Chile un `toISOString()` corre el día y los
 * eventos aparecerían en la casilla equivocada.
 */
export function agendaPorDia(eventos: EventoAgenda[]): Map<string, EventoAgenda[]> {
  const mapa = new Map<string, EventoAgenda[]>();
  for (const e of eventos) {
    const k = claveDia(e.fecha);
    const lista = mapa.get(k);
    if (lista) lista.push(e);
    else mapa.set(k, [e]);
  }
  return mapa;
}

export function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Los eventos de un mes concreto. */
export function agendaDelMes(
  eventos: EventoAgenda[],
  anio: number,
  mes: number,
): EventoAgenda[] {
  return eventos.filter(
    (e) => e.fecha.getFullYear() === anio && e.fecha.getMonth() === mes,
  );
}

/**
 * Las celdas de una grilla mensual: siempre semanas completas de lunes a
 * domingo, incluidos los días del mes anterior y siguiente que las cierran.
 */
export function grillaDelMes(anio: number, mes: number): Date[] {
  const primero = new Date(anio, mes, 1);
  // getDay(): 0 = domingo. La semana chilena parte el lunes.
  const desplazamiento = (primero.getDay() + 6) % 7;
  const inicio = new Date(anio, mes, 1 - desplazamiento);

  const celdas: Date[] = [];
  for (let i = 0; i < 42; i++) {
    celdas.push(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  }

  // Se recorta la última semana si sobra entera (meses que caben en 5 semanas).
  const ultimo = new Date(anio, mes + 1, 0);
  const necesarias = Math.ceil((desplazamiento + ultimo.getDate()) / 7) * 7;
  return celdas.slice(0, necesarias);
}
