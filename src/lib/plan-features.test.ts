import { describe, it, expect } from 'vitest';
import {
  normalizePlanTier, planAtLeast, planAllowsPermission,
  lockedFeatureFor, featureOfPermission, requiredPlanLabel, featuresOfPlan,
  parseModuleOverrides, featureEnabled, lockReason, overrideSummary,
  PLAN_FEATURES, PLAN_ORDER, type PlanFeature,
} from './plan-features';
import { ALL_PERMISSIONS, ROLES } from '@/modules/core/lib/permissions';

describe('normalizePlanTier', () => {
  it('acepta los dos nombres que conviven en la base para el plan del medio', () => {
    // `subscriptions.plan` guarda 'professional' (lo escribe el registro) pero
    // PLANS lo declara como 'pro'. Los dos son el mismo plan.
    expect(normalizePlanTier('professional')).toBe('professional');
    expect(normalizePlanTier('pro')).toBe('professional');
  });

  it('no distingue mayúsculas ni espacios', () => {
    expect(normalizePlanTier('  ENTERPRISE ')).toBe('enterprise');
    expect(normalizePlanTier('Basic')).toBe('basic');
  });

  it('cae en básico ante datos faltantes o desconocidos (fail-closed)', () => {
    expect(normalizePlanTier(null)).toBe('basic');
    expect(normalizePlanTier(undefined)).toBe('basic');
    expect(normalizePlanTier('')).toBe('basic');
    expect(normalizePlanTier('premium-gold')).toBe('basic');
  });
});

describe('planAtLeast', () => {
  it('cada plan se incluye a sí mismo', () => {
    for (const tier of PLAN_ORDER) expect(planAtLeast(tier, tier)).toBe(true);
  });

  it('el plan mayor incluye lo del menor, nunca al revés', () => {
    expect(planAtLeast('enterprise', 'basic')).toBe(true);
    expect(planAtLeast('enterprise', 'professional')).toBe(true);
    expect(planAtLeast('professional', 'basic')).toBe(true);
    expect(planAtLeast('basic', 'professional')).toBe(false);
    expect(planAtLeast('professional', 'enterprise')).toBe(false);
  });
});

describe('mapa de features', () => {
  it('todos los permisos declarados existen de verdad en la plataforma', () => {
    // Un permiso mal escrito acá no rompe el build (es un string) pero dejaría
    // una feature que no gatea nada.
    for (const def of Object.values(PLAN_FEATURES)) {
      for (const permission of def.permissions) {
        expect(ALL_PERMISSIONS).toHaveProperty(permission);
      }
    }
  });

  it('ningún permiso pertenece a dos features a la vez', () => {
    const vistos = new Set<string>();
    for (const def of Object.values(PLAN_FEATURES)) {
      for (const permission of def.permissions) {
        expect(vistos.has(permission)).toBe(false);
        vistos.add(permission);
      }
    }
  });

  it('el plan básico deja operar y cobrar de punta a punta', () => {
    // Si alguna de estas cae en un plan de pago, el contratista chico no puede
    // usar la app para lo que la contrató.
    const nucleo = [
      'module_warehouse:view', 'module_purchasing:view', 'module_attendance:view',
      'module_construction_control:view', 'module_technical_office:view',
      'module_projects:view', 'module_clients:view', 'module_users:view',
      'contracts:view', 'contracts:manage', 'guarantees:manage',
      'payment_certificates:view', 'payment_certificates:create', 'payment_certificates:approve',
      'amendments:manage', 'amendments:approve',
      'construction_control:register_progress', 'construction_control:edit_structure',
      // Sin esto la cotización nunca se transforma en orden de compra.
      'finance:manage_purchase_orders',
      // El portal del subcontratista tiene que abrir aunque su plan sea básico.
      'subcontractor_portal:view',
      'tools:view_own', 'materials:view_all', 'stock:receive_order',
    ] as const;

    for (const permission of nucleo) {
      expect(featureOfPermission(permission)).toBeNull();
      expect(planAllowsPermission('basic', permission)).toBe(true);
    }
  });
});

describe('planAllowsPermission', () => {
  it('el plan básico no ve prevención, finanzas, reportes ni control de costos', () => {
    expect(planAllowsPermission('basic', 'module_safety:view')).toBe(false);
    expect(planAllowsPermission('basic', 'module_payments:view')).toBe(false);
    expect(planAllowsPermission('basic', 'reports:view')).toBe(false);
    expect(planAllowsPermission('basic', 'cost_control:view')).toBe(false);
    expect(planAllowsPermission('basic', 'rdi:create')).toBe(false);
  });

  it('el plan profesional suma lo anterior pero no lo empresarial', () => {
    expect(planAllowsPermission('professional', 'module_safety:view')).toBe(true);
    expect(planAllowsPermission('professional', 'cost_control:view')).toBe(true);
    expect(planAllowsPermission('professional', 'documents:manage')).toBe(true);

    expect(planAllowsPermission('professional', 'planning:manage')).toBe(false);
    expect(planAllowsPermission('professional', 'subcontracts:view')).toBe(false);
    expect(planAllowsPermission('professional', 'receptions:manage')).toBe(false);
    expect(planAllowsPermission('professional', 'company_links:manage')).toBe(false);
  });

  it('el plan empresarial no bloquea ningún permiso de la plataforma', () => {
    for (const permission of Object.keys(ALL_PERMISSIONS)) {
      expect(planAllowsPermission('enterprise', permission)).toBe(true);
    }
  });
});

describe('lockedFeatureFor', () => {
  it('distingue «no está en tu plan» de «no tienes permiso»', () => {
    // Bloqueado por plan: hay algo que vender.
    expect(lockedFeatureFor('basic', 'cost_control:view')).toBe('cost_control');
    expect(lockedFeatureFor('professional', 'subcontracts:view')).toBe('subcontracts');
    // Permiso base: si el usuario no lo tiene es por su rol, no por el plan.
    expect(lockedFeatureFor('basic', 'contracts:manage')).toBeNull();
    expect(lockedFeatureFor('basic', 'users:create')).toBeNull();
    // Ya incluido en el plan contratado.
    expect(lockedFeatureFor('enterprise', 'subcontracts:view')).toBeNull();
  });
});

describe('requiredPlanLabel', () => {
  it('nombra el plan que hay que contratar, en español', () => {
    expect(requiredPlanLabel('cost_control')).toBe('Profesional');
    expect(requiredPlanLabel('subcontracts')).toBe('Empresarial');
  });
});

describe('featuresOfPlan', () => {
  it('es acumulativo: cada plan contiene al anterior', () => {
    const basico = featuresOfPlan('basic');
    const pro = featuresOfPlan('professional');
    const empresarial = featuresOfPlan('enterprise');

    expect(basico).toEqual([]);
    for (const f of basico) expect(pro).toContain(f);
    for (const f of pro) expect(empresarial).toContain(f);
    expect(empresarial).toHaveLength(Object.keys(PLAN_FEATURES).length);
    expect(pro.length).toBeLessThan(empresarial.length);
  });
});

describe('excepciones por empresa (lo que decide el super-admin)', () => {
  it('activa un módulo que el plan no trae', () => {
    expect(featureEnabled('basic', { cost_control: true }, 'cost_control')).toBe(true);
    expect(planAllowsPermission('basic', 'cost_control:view', { cost_control: true })).toBe(true);
    expect(lockedFeatureFor('basic', 'cost_control:view', { cost_control: true })).toBeNull();
  });

  it('quita un módulo aunque el plan sí lo traiga', () => {
    expect(featureEnabled('enterprise', { subcontracts: false }, 'subcontracts')).toBe(false);
    expect(planAllowsPermission('enterprise', 'subcontracts:view', { subcontracts: false })).toBe(false);
    expect(lockedFeatureFor('enterprise', 'subcontracts:view', { subcontracts: false })).toBe('subcontracts');
  });

  it('los módulos que no se tocaron siguen el plan', () => {
    const overrides = { cost_control: true };
    expect(featureEnabled('basic', overrides, 'safety')).toBe(false);
    expect(featureEnabled('professional', overrides, 'safety')).toBe(true);
  });

  it('sin excepciones se comporta igual que antes', () => {
    for (const tier of PLAN_ORDER) {
      for (const feature of Object.keys(PLAN_FEATURES) as PlanFeature[]) {
        expect(featureEnabled(tier, {}, feature)).toBe(featureEnabled(tier, null, feature));
        expect(featureEnabled(tier, undefined, feature)).toBe(featureEnabled(tier, null, feature));
      }
    }
  });

  it('nunca deja bloqueado un permiso base, ni con excepciones raras', () => {
    // Los módulos base no son features: ninguna excepción puede apagarlos.
    const overrides = { safety: false, payments: false, documents: false };
    expect(planAllowsPermission('basic', 'contracts:manage', overrides)).toBe(true);
    expect(planAllowsPermission('basic', 'finance:manage_purchase_orders', overrides)).toBe(true);
    expect(planAllowsPermission('basic', 'subcontractor_portal:view', overrides)).toBe(true);
  });
});

describe('parseModuleOverrides', () => {
  it('acepta solo features conocidas con valor booleano', () => {
    const raw = {
      cost_control: true,
      subcontracts: false,
      modulo_que_ya_no_existe: true,  // de una versión anterior
      safety: 'sí',                   // editado a mano en la base
      payments: null,
    };
    expect(parseModuleOverrides(raw)).toEqual({ cost_control: true, subcontracts: false });
  });

  it('tolera lo que venga: null, texto, arreglos', () => {
    expect(parseModuleOverrides(null)).toEqual({});
    expect(parseModuleOverrides(undefined)).toEqual({});
    expect(parseModuleOverrides('{}')).toEqual({});
    expect(parseModuleOverrides([1, 2])).toEqual({});
  });
});

describe('lockReason', () => {
  it('separa «no está en tu plan» de «te lo desactivaron»', () => {
    // No lo tiene y su plan tampoco: hay que venderle el plan.
    expect(lockReason('basic', {}, 'cost_control')).toBe('plan');
    // Su plan lo trae pero se lo apagaron: mandarlo a comprar sería mentirle.
    expect(lockReason('professional', { cost_control: false }, 'cost_control')).toBe('override');
    // Está habilitado: no hay nada que explicar.
    expect(lockReason('basic', { cost_control: true }, 'cost_control')).toBeNull();
  });
});

describe('overrideSummary', () => {
  it('cuenta lo agregado y lo quitado respecto del plan', () => {
    const resumen = overrideSummary('professional', {
      last_planner: true,      // no venía: agregado
      cost_control: false,     // sí venía: quitado
      safety: true,            // ya venía en el plan: no es excepción
    });
    expect(resumen.agregados).toEqual(['last_planner']);
    expect(resumen.quitados).toEqual(['cost_control']);
  });

  it('sin excepciones no reporta nada', () => {
    expect(overrideSummary('basic', {})).toEqual({ agregados: [], quitados: [] });
    expect(overrideSummary('basic', null)).toEqual({ agregados: [], quitados: [] });
  });
});

describe('interacción con los roles', () => {
  it('el rol subcontratista sigue entrando a su portal en plan básico', () => {
    // Es el caso del subcontratista invitado: su empresa puede no pagar nada y
    // aun así tiene que poder presentar su estado de pago.
    for (const permission of ROLES['subcontratista'].permissions) {
      expect(planAllowsPermission('basic', permission)).toBe(true);
    }
  });

  it('el trabajador y el guardia funcionan completos en plan básico', () => {
    for (const rol of ['worker', 'guardia'] as const) {
      for (const permission of ROLES[rol].permissions) {
        expect(planAllowsPermission('basic', permission)).toBe(true);
      }
    }
  });

  it('a un jefe de oficina técnica en plan básico le queda el núcleo del contrato', () => {
    const permisos = ROLES['jefe-oficina-tecnica'].permissions;
    const vivos = permisos.filter((p) => planAllowsPermission('basic', p));
    const bloqueados = permisos.filter((p) => !planAllowsPermission('basic', p));

    expect(vivos).toContain('contracts:manage');
    expect(vivos).toContain('payment_certificates:create');
    expect(vivos).toContain('amendments:manage');
    expect(bloqueados).toContain('cost_control:view');
    expect(bloqueados).toContain('planning:manage');
    expect(bloqueados).toContain('subcontracts:manage');
  });

  it('cada feature bloquea al menos un permiso que algún rol usa', () => {
    // Una feature cuyos permisos no los tenga nadie sería una etiqueta vacía en
    // la página de planes.
    const usados = new Set(Object.values(ROLES).flatMap((r) => r.permissions as string[]));
    for (const key of Object.keys(PLAN_FEATURES) as PlanFeature[]) {
      const alguno = PLAN_FEATURES[key].permissions.some((p) => usados.has(p));
      expect(alguno, `la feature ${key} no gatea ningún permiso en uso`).toBe(true);
    }
  });
});
