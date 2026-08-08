// src/lib/plan-features.ts
//
// Qué ve cada plan contratado. Es lógica pura y sin React a propósito: el
// mismo mapa lo usan `can()` (DataProvider), la barra lateral, el portal de
// módulos y la página de planes, así que no puede vivir dentro de un componente.
//
// REGLA: el plan decide QUÉ MÓDULOS existen para la empresa; el rol decide
// QUIÉN los usa. Los dos filtros se aplican juntos y ambos son fail-closed.
//
// Esto es visibilidad de producto, NO seguridad: quien protege los datos sigue
// siendo la RLS de Postgres. Un plan básico que llame directo a la API igual
// va a poder leer sus propias filas — lo que no tiene es la pantalla.

import type { Permission } from '@/modules/core/lib/permissions';

export type PlanTier = 'basic' | 'professional' | 'enterprise';

/** De menor a mayor. El índice es el que compara. */
export const PLAN_ORDER: readonly PlanTier[] = ['basic', 'professional', 'enterprise'] as const;

export const PLAN_LABEL: Record<PlanTier, string> = {
  basic: 'Básico',
  professional: 'Profesional',
  enterprise: 'Empresarial',
};

/**
 * El valor guardado en `subscriptions.plan` no está normalizado: conviven
 * 'professional' (el que escribe /api/auth/register) y 'pro' (el que declara
 * PLANS en permissions.ts). Cualquier cosa que no reconozcamos cae en 'basic':
 * ante un dato raro se muestra de menos, nunca de más.
 */
export function normalizePlanTier(raw: string | null | undefined): PlanTier {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'pro':
    case 'professional':
    case 'profesional':
      return 'professional';
    case 'enterprise':
    case 'empresarial':
      return 'enterprise';
    default:
      return 'basic';
  }
}

/** Un plan incluye todo lo de los planes anteriores. */
export function planAtLeast(tier: PlanTier, minimum: PlanTier): boolean {
  return PLAN_ORDER.indexOf(tier) >= PLAN_ORDER.indexOf(minimum);
}

export type PlanFeature =
  | 'safety'
  | 'payments'
  | 'reports'
  | 'site_book'
  | 'cost_control'
  | 'documents'
  | 'approval_flows'
  | 'last_planner'
  | 'subcontracts'
  | 'receptions'
  | 'company_links';

interface FeatureDef {
  /** Nombre comercial, el que ve el cliente en el candado. */
  label: string;
  /** Por qué le sirve. Se muestra en la card bloqueada y en la página de planes. */
  description: string;
  minPlan: PlanTier;
  /** Permisos que este módulo trae consigo. Fuera de esta lista, todo es base. */
  permissions: Permission[];
}

/**
 * Lo que NO está acá es base: existe en los tres planes. El plan básico tiene
 * que alcanzar para que un contratista chico opere y cobre de punta a punta
 * (obra, bodega, compras, asistencia, contrato, presupuesto/APU, estados de
 * pago y adicionales); lo que sube de plan es lo que recién aparece cuando la
 * empresa crece.
 */
export const PLAN_FEATURES: Record<PlanFeature, FeatureDef> = {
  // ── Profesional ────────────────────────────────────────────────────
  safety: {
    label: 'Prevención de Riesgos',
    description: 'Checklists, inspecciones, observaciones de conducta y Comité Paritario.',
    minPlan: 'professional',
    permissions: [
      'module_safety:view',
      'safety_templates:create', 'safety_templates:assign',
      'safety_checklists:complete', 'safety_checklists:review',
      'safety_inspections:create', 'safety_inspections:complete', 'safety_inspections:review',
      'safety_observations:create', 'safety_observations:review',
    ],
  },
  payments: {
    label: 'Finanzas',
    description: 'Facturas de proveedor, adelantos de sueldo y control de lo que se paga.',
    minPlan: 'professional',
    // OJO: `finance:manage_purchase_orders` NO entra acá. Es el paso que
    // convierte la cotización en OC oficial, o sea parte de Compras: sacarlo
    // del plan básico dejaría el flujo de compras cortado por la mitad.
    permissions: [
      'module_payments:view',
      'payments:create', 'payments:view', 'payments:mark_as_paid', 'payments:edit', 'payments:delete',
    ],
  },
  reports: {
    label: 'Reportes y Trazabilidad',
    description: 'Analítica de consumo, entregas, inventario y seguimiento de materiales.',
    minPlan: 'professional',
    permissions: ['module_reports:view', 'reports:view'],
  },
  site_book: {
    label: 'Libro de Obra y Protocolos',
    description: 'Libro de obra foliado con firmas y protocolos de calidad por partida.',
    minPlan: 'professional',
    // La bitácora del día a día queda en el plan básico; lo que sube de plan
    // es el libro foliado (el documento formal) y la revisión de protocolos.
    permissions: ['construction_control:review_protocols'],
  },
  cost_control: {
    label: 'Control de Costos',
    description: 'Costo real por partida contra el presupuesto meta, y el margen de la obra.',
    minPlan: 'professional',
    permissions: ['cost_control:view', 'cost_control:edit_target', 'cost_control:impute'],
  },
  documents: {
    label: 'RDI y Planos',
    description: 'Requerimientos de información con plazo, y planos por revisión con la vigente clara.',
    minPlan: 'professional',
    permissions: ['rdi:create', 'rdi:answer', 'documents:manage'],
  },
  approval_flows: {
    label: 'Flujos de Aprobación',
    description: 'La cadena de visto bueno que define tu empresa, con firma y motivo de rechazo.',
    minPlan: 'professional',
    // Solo se cierra CONFIGURAR la cadena. FIRMAR un paso no tiene permiso de
    // plan: si la empresa baja de plan con trámites abiertos, los aprobadores
    // tienen que poder cerrarlos igual — un documento trabado para siempre es
    // peor que una pantalla de más.
    permissions: ['approvals:configure'],
  },

  // ── Empresarial ────────────────────────────────────────────────────
  last_planner: {
    label: 'Programación Last Planner',
    description: 'Lookahead, restricciones, compromisos semanales, PPC y causas de no cumplimiento.',
    minPlan: 'enterprise',
    permissions: ['planning:view', 'planning:manage'],
  },
  subcontracts: {
    label: 'Subcontratos',
    description: 'Contratos a terceros, sus estados de pago, retención y control F30-1 (Ley 20.123).',
    minPlan: 'enterprise',
    // `subcontractor_portal:view` NO entra: el portal es de quien recibe la
    // invitación y tiene que funcionar aunque su propio plan sea el básico.
    // El expediente documental entra acá: existe PARA poder subcontratar. Una
    // empresa que no subcontrata no tiene a quién exigirle un F30-1.
    permissions: [
      'subcontracts:view', 'subcontracts:manage', 'subcontracts:approve',
      'contractors:view', 'contractors:manage',
    ],
  },
  receptions: {
    label: 'Recepción de Obra',
    description: 'Recepción provisoria y definitiva, observaciones y devolución de la retención.',
    minPlan: 'enterprise',
    permissions: ['receptions:manage'],
  },
  company_links: {
    label: 'Empresas Vinculadas',
    description: 'Que tu subcontratista trabaje desde su propia cuenta, sin duplicar el estado de pago.',
    minPlan: 'enterprise',
    permissions: ['company_links:manage'],
  },
};

/**
 * Excepciones al estándar del plan, decididas por el super-admin para UNA
 * empresa (columna `tenants.moduleOverrides`, migración 028). Solo guarda las
 * diferencias: lo que no está acá sigue el plan, así que si mañana cambia qué
 * trae cada plan, los clientes que nadie tocó a mano lo heredan solos.
 */
export type ModuleOverrides = Partial<Record<PlanFeature, boolean>>;

/**
 * Limpia lo que viene de la base. Es JSONB: puede traer claves de una versión
 * anterior, o cualquier cosa si alguien la editó a mano. Se descarta todo lo que
 * no sea una feature conocida con valor booleano, en vez de confiar en el dato.
 */
export function parseModuleOverrides(raw: unknown): ModuleOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ModuleOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean' && key in PLAN_FEATURES) {
      out[key as PlanFeature] = value;
    }
  }
  return out;
}

/** ¿Esta empresa tiene el módulo? Plan + la excepción que haya puesto el super-admin. */
export function featureEnabled(
  tier: PlanTier,
  overrides: ModuleOverrides | null | undefined,
  feature: PlanFeature,
): boolean {
  const override = overrides?.[feature];
  return typeof override === 'boolean' ? override : planIncludesFeature(tier, feature);
}

/** Por qué está apagado un módulo: por el plan, o porque se lo quitaron a mano. */
export type LockReason = 'plan' | 'override';

export function lockReason(
  tier: PlanTier,
  overrides: ModuleOverrides | null | undefined,
  feature: PlanFeature,
): LockReason | null {
  if (featureEnabled(tier, overrides, feature)) return null;
  // Si el plan sí lo traía, entonces se lo quitaron a mano.
  return planIncludesFeature(tier, feature) ? 'override' : 'plan';
}

/** Cuántas excepciones tiene una empresa respecto de su plan, para mostrarlas. */
export function overrideSummary(tier: PlanTier, overrides: ModuleOverrides | null | undefined) {
  const agregados: PlanFeature[] = [];
  const quitados: PlanFeature[] = [];
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const feature = key as PlanFeature;
    const estandar = planIncludesFeature(tier, feature);
    if (value === estandar) continue; // coincide con el plan: no es una excepción
    (value ? agregados : quitados).push(feature);
  }
  return { agregados, quitados };
}

/** Índice inverso permiso → feature. Se arma una vez, al cargar el módulo. */
const FEATURE_BY_PERMISSION = new Map<string, PlanFeature>();
for (const [key, def] of Object.entries(PLAN_FEATURES)) {
  for (const permission of def.permissions) {
    FEATURE_BY_PERMISSION.set(permission, key as PlanFeature);
  }
}

/** La feature a la que pertenece un permiso, o `null` si es base (todos los planes). */
export function featureOfPermission(permission: Permission | string): PlanFeature | null {
  return FEATURE_BY_PERMISSION.get(permission as string) ?? null;
}

export function planIncludesFeature(tier: PlanTier, feature: PlanFeature): boolean {
  return planAtLeast(tier, PLAN_FEATURES[feature].minPlan);
}

/** ¿La empresa tiene habilitado este permiso? Los permisos base siempre pasan. */
export function planAllowsPermission(
  tier: PlanTier,
  permission: Permission | string,
  overrides?: ModuleOverrides | null,
): boolean {
  const feature = featureOfPermission(permission);
  return feature === null || featureEnabled(tier, overrides, feature);
}

/**
 * Si el permiso está bloqueado POR EL MÓDULO (plan o excepción), devuelve la
 * feature que lo bloquea. Sirve para distinguir «no tienes permiso» (problema de
 * rol, lo arregla el administrador de la empresa) de «tu empresa no tiene este
 * módulo» (lo resuelve el plan o el super-admin).
 */
export function lockedFeatureFor(
  tier: PlanTier,
  permission: Permission | string,
  overrides?: ModuleOverrides | null,
): PlanFeature | null {
  const feature = featureOfPermission(permission);
  if (feature === null) return null;
  return featureEnabled(tier, overrides, feature) ? null : feature;
}

/** Plan mínimo que hay que contratar para tener la feature, ya con nombre comercial. */
export function requiredPlanLabel(feature: PlanFeature): string {
  return PLAN_LABEL[PLAN_FEATURES[feature].minPlan];
}

/** Las features de cada plan, para la página de planes y el material de venta. */
export function featuresOfPlan(tier: PlanTier): PlanFeature[] {
  return (Object.keys(PLAN_FEATURES) as PlanFeature[]).filter((f) => planIncludesFeature(tier, f));
}
