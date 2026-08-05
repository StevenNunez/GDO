import { describe, it, expect } from 'vitest';
import {
  esVinculoActivo,
  contraparte,
  soyElQueInvita,
  empresasVinculadas,
  invitacionesPendientes,
  misSubcontratos,
  subcontratosQueContrato,
  esDeOtraEmpresa,
} from './company-link';
import type { CompanyLink, Subcontract } from '@/modules/core/lib/data';

const CONSTRUCTORA = 'tenant-constructora';
const TECHOS = 'tenant-techos';

function vinculo(over: Partial<CompanyLink> & { id: string }): CompanyLink {
  return {
    requesterTenantId: CONSTRUCTORA,
    requesterName: 'Constructora Los Andes',
    addresseeTenantId: TECHOS,
    addresseeName: 'Techos del Sur',
    code: 'ABC12345',
    status: 'aceptado',
    createdAt: new Date(),
    ...over,
  } as CompanyLink;
}

function subcontrato(over: Partial<Subcontract> & { id: string }): Subcontract {
  return {
    tenantId: CONSTRUCTORA, projectId: 'p1', name: 'Techumbre',
    type: 'suma_alzada', currency: 'CLP', amountNet: 10_000_000,
    advancePercent: 0, retentionPercent: 5, retentionCapPercent: null,
    multaMode: 'permil_contrato', multaValue: 0, taxPercent: 19,
    requiresLaborCompliance: true, status: 'vigente', createdAt: new Date(),
    ...over,
  } as Subcontract;
}

/* ── Estado del vínculo ───────────────────────────────────────────────── */

describe('esVinculoActivo', () => {
  it('solo el aceptado da acceso', () => {
    expect(esVinculoActivo(vinculo({ id: 'v1' }))).toBe(true);
    expect(esVinculoActivo(vinculo({ id: 'v1', status: 'pendiente' }))).toBe(false);
    expect(esVinculoActivo(vinculo({ id: 'v1', status: 'revocado' }))).toBe(false);
    expect(esVinculoActivo(vinculo({ id: 'v1', status: 'rechazado' }))).toBe(false);
  });
});

describe('contraparte', () => {
  const v = vinculo({ id: 'v1' });

  it('desde la constructora, la otra es el subcontratista', () => {
    expect(contraparte(v, CONSTRUCTORA)).toEqual({
      tenantId: TECHOS, nombre: 'Techos del Sur',
    });
  });

  it('desde el subcontratista, la otra es la constructora', () => {
    expect(contraparte(v, TECHOS)).toEqual({
      tenantId: CONSTRUCTORA, nombre: 'Constructora Los Andes',
    });
  });

  it('una invitación sin aceptar todavía no tiene contraparte', () => {
    const pendiente = vinculo({ id: 'v2', status: 'pendiente', addresseeTenantId: null });
    expect(contraparte(pendiente, CONSTRUCTORA)).toBeNull();
  });

  it('un tercero ajeno al vínculo no obtiene nada', () => {
    expect(contraparte(v, 'tenant-cualquiera')).toBeNull();
    expect(contraparte(v, null)).toBeNull();
  });
});

describe('soyElQueInvita', () => {
  it('distingue quién generó el código', () => {
    const v = vinculo({ id: 'v1' });
    expect(soyElQueInvita(v, CONSTRUCTORA)).toBe(true);
    expect(soyElQueInvita(v, TECHOS)).toBe(false);
  });
});

/* ── Listas ───────────────────────────────────────────────────────────── */

describe('empresasVinculadas', () => {
  it('devuelve las empresas con las que puedo trabajar hoy', () => {
    const links = [
      vinculo({ id: 'v1' }),
      vinculo({ id: 'v2', addresseeTenantId: 'tenant-electrico', addresseeName: 'Eléctrica Sur' }),
    ];
    expect(empresasVinculadas(links, CONSTRUCTORA).map((e) => e.nombre))
      .toEqual(['Techos del Sur', 'Eléctrica Sur']);
  });

  it('deja fuera lo pendiente, lo rechazado y lo revocado', () => {
    const links = [
      vinculo({ id: 'v1', status: 'pendiente', addresseeTenantId: null }),
      vinculo({ id: 'v2', status: 'revocado', addresseeTenantId: 'tenant-x' }),
      vinculo({ id: 'v3', status: 'rechazado', addresseeTenantId: 'tenant-y' }),
    ];
    expect(empresasVinculadas(links, CONSTRUCTORA)).toEqual([]);
  });

  it('no repite una empresa vinculada dos veces', () => {
    const links = [vinculo({ id: 'v1' }), vinculo({ id: 'v2' })];
    expect(empresasVinculadas(links, CONSTRUCTORA)).toHaveLength(1);
  });
});

describe('invitacionesPendientes', () => {
  it('son las que yo emití y nadie usó', () => {
    const links = [
      vinculo({ id: 'mia', status: 'pendiente', addresseeTenantId: null }),
      vinculo({ id: 'aceptada' }),
      vinculo({
        id: 'de-otro', status: 'pendiente', addresseeTenantId: null,
        requesterTenantId: 'tenant-ajeno',
      }),
    ];
    expect(invitacionesPendientes(links, CONSTRUCTORA).map((l) => l.id)).toEqual(['mia']);
  });
});

/* ── Los dos lados del subcontrato ────────────────────────────────────── */

describe('misSubcontratos', () => {
  it('incluye el subcontrato de otra empresa donde mi empresa es la contraparte', () => {
    const subs = [
      subcontrato({ id: 's1', counterpartTenantId: TECHOS }),
      subcontrato({ id: 's2', counterpartTenantId: 'tenant-otro' }),
    ];
    expect(misSubcontratos(subs, TECHOS, 'u1').map((s) => s.id)).toEqual(['s1']);
  });

  it('incluye aquel donde soy el contacto designado dentro de la misma empresa', () => {
    const subs = [
      subcontrato({ id: 's1', contactUserId: 'u1' }),
      subcontrato({ id: 's2', contactUserId: 'otro-usuario' }),
    ];
    expect(misSubcontratos(subs, CONSTRUCTORA, 'u1').map((s) => s.id)).toEqual(['s1']);
  });

  it('lo que MI empresa contrata no es "mi subcontrato": ahí yo pago', () => {
    const subs = [subcontrato({ id: 's1', counterpartTenantId: 'tenant-otro' })];
    expect(misSubcontratos(subs, CONSTRUCTORA, 'u1')).toEqual([]);
  });

  it('sin sesión no devuelve nada', () => {
    const subs = [subcontrato({ id: 's1', counterpartTenantId: TECHOS })];
    expect(misSubcontratos(subs, null, null)).toEqual([]);
  });
});

describe('subcontratosQueContrato', () => {
  it('son los que paga mi empresa', () => {
    const subs = [
      subcontrato({ id: 's1' }),
      subcontrato({ id: 's2', tenantId: 'tenant-ajeno', counterpartTenantId: CONSTRUCTORA }),
    ];
    expect(subcontratosQueContrato(subs, CONSTRUCTORA).map((s) => s.id)).toEqual(['s1']);
  });
});

describe('esDeOtraEmpresa', () => {
  it('marca el trabajo que hago para otra empresa', () => {
    expect(esDeOtraEmpresa(subcontrato({ id: 's1' }), TECHOS)).toBe(true);
    expect(esDeOtraEmpresa(subcontrato({ id: 's1' }), CONSTRUCTORA)).toBe(false);
  });
});
