import { describe, expect, it } from 'vitest';
import type { CertificateDeduction, ToolLog } from '@/modules/core/lib/data';
import {
  descuentosDe, descuentosPorTipo, herramientasPendientesDe,
  historialDeContratista, totalDescuentos, validarDescuento, yaSeDesconto,
} from './deductions';

/* ── Fábricas ──────────────────────────────────────────────────────────── */

function desc(over: Partial<CertificateDeduction> = {}): CertificateDeduction {
  return {
    id: crypto.randomUUID(),
    tenantId: 't1',
    certificateType: 'subcontract',
    certificateId: 'cert-1',
    kind: 'otro',
    description: 'Descuento',
    amount: 100_000,
    sourceType: null,
    sourceId: null,
    notes: null,
    createdBy: 'u1',
    createdAt: new Date(2026, 7, 5),
    ...over,
  };
}

function toolLog(over: Partial<ToolLog> = {}): ToolLog {
  return {
    id: crypto.randomUUID(),
    toolId: 'tool-1',
    toolName: 'Taladro percutor',
    userId: 'u-sub',
    userName: 'Contratista',
    checkoutDate: new Date(2026, 6, 8),
    returnDate: null,
    checkoutSupervisorId: 'u1',
    checkoutSupervisorName: 'Pedro',
    ...over,
  };
}

const HOY = new Date(2026, 7, 7);

/* ── Totales ───────────────────────────────────────────────────────────── */

describe('descuentosDe', () => {
  it('trae solo los del estado de pago pedido', () => {
    const todos = [
      desc({ id: 'a', certificateId: 'cert-1' }),
      desc({ id: 'b', certificateId: 'cert-2' }),
    ];
    expect(descuentosDe(todos, 'subcontract', 'cert-1').map((d) => d.id)).toEqual(['a']);
  });

  it('no confunde el EEPP del subcontrato con el del mandante que tenga el mismo id', () => {
    const todos = [
      desc({ id: 'a', certificateType: 'subcontract', certificateId: 'x' }),
      desc({ id: 'b', certificateType: 'contract', certificateId: 'x' }),
    ];
    expect(descuentosDe(todos, 'contract', 'x').map((d) => d.id)).toEqual(['b']);
  });
});

describe('totalDescuentos', () => {
  it('suma las líneas', () => {
    expect(totalDescuentos([desc({ amount: 100_000 }), desc({ amount: 50_000 })]))
      .toBe(150_000);
  });

  it('sin líneas, cero', () => {
    expect(totalDescuentos([])).toBe(0);
  });
});

describe('descuentosPorTipo', () => {
  it('agrupa y ordena de mayor a menor', () => {
    const r = descuentosPorTipo([
      desc({ kind: 'epp', amount: 30_000 }),
      desc({ kind: 'herramienta', amount: 200_000 }),
      desc({ kind: 'herramienta', amount: 50_000 }),
    ]);
    expect(r.map((x) => x.kind)).toEqual(['herramienta', 'epp']);
    expect(r[0].monto).toBe(250_000);
    expect(r[0].lineas).toBe(2);
  });

  it('trae la etiqueta legible', () => {
    expect(descuentosPorTipo([desc({ kind: 'combustible' })])[0].label)
      .toBe('Combustible');
  });

  it('sin líneas devuelve vacío', () => {
    expect(descuentosPorTipo([])).toEqual([]);
  });
});

/* ── La pregunta que motivó el módulo ──────────────────────────────────── */

describe('historialDeContratista', () => {
  const todos = [
    desc({ certificateId: 'c1', kind: 'herramienta', amount: 120_000, createdAt: new Date(2026, 2, 10) }),
    desc({ certificateId: 'c2', kind: 'herramienta', amount: 80_000, createdAt: new Date(2026, 5, 3) }),
    desc({ certificateId: 'c2', kind: 'epp', amount: 40_000, createdAt: new Date(2026, 5, 3) }),
    // De OTRO contratista
    desc({ certificateId: 'ajeno', kind: 'herramienta', amount: 999_000, createdAt: new Date(2026, 5, 3) }),
  ];

  it('responde «cuánto le he descontado y en qué»', () => {
    const r = historialDeContratista(todos, ['c1', 'c2']);
    expect(r.total).toBe(240_000);
    expect(r.porTipo[0]).toMatchObject({ kind: 'herramienta', monto: 200_000, lineas: 2 });
    expect(r.estadosDePago).toBe(2);
  });

  it('no mezcla los descuentos de otro contratista', () => {
    expect(historialDeContratista(todos, ['c1']).total).toBe(120_000);
  });

  it('acota por período', () => {
    const r = historialDeContratista(todos, ['c1', 'c2'], {
      desde: new Date(2026, 4, 1), hasta: new Date(2026, 6, 30),
    });
    expect(r.total).toBe(120_000); // solo los de junio
  });

  it('sin rango trae todo el historial', () => {
    expect(historialDeContratista(todos, ['c1', 'c2'], {}).total).toBe(240_000);
  });

  it('ignora los descuentos del mandante: son otra cosa', () => {
    const conMandante = [
      ...todos,
      desc({ certificateType: 'contract', certificateId: 'c1', amount: 500_000 }),
    ];
    expect(historialDeContratista(conMandante, ['c1', 'c2']).total).toBe(240_000);
  });

  it('sin estados de pago devuelve cero, no revienta', () => {
    expect(historialDeContratista(todos, [])).toMatchObject({ total: 0, estadosDePago: 0 });
  });
});

/* ── Validación ────────────────────────────────────────────────────────── */

describe('validarDescuento', () => {
  const base = { netoAntesDeDescuentos: 1_000_000, yaDescontado: 0 };

  it('acepta un descuento normal', () => {
    expect(validarDescuento(
      { description: 'Taladro no devuelto', amount: 150_000, kind: 'herramienta' }, base,
    )).toEqual([]);
  });

  it('exige glosa', () => {
    const e = validarDescuento(
      { description: '   ', amount: 150_000, kind: 'otro' }, base,
    );
    expect(e.some((x) => x.includes('glosa'))).toBe(true);
  });

  it('exige monto mayor que cero', () => {
    expect(validarDescuento(
      { description: 'X', amount: 0, kind: 'otro' }, base,
    ).some((x) => x.includes('mayor que cero'))).toBe(true);
  });

  it('no deja dejar el estado de pago en negativo', () => {
    const e = validarDescuento(
      { description: 'Daños', amount: 1_500_000, kind: 'danos' }, base,
    );
    expect(e.some((x) => x.includes('negativo'))).toBe(true);
  });

  it('cuenta lo ya descontado en las otras líneas', () => {
    const e = validarDescuento(
      { description: 'Más', amount: 300_000, kind: 'otro' },
      { netoAntesDeDescuentos: 1_000_000, yaDescontado: 800_000 },
    );
    expect(e.some((x) => x.includes('negativo'))).toBe(true);
  });

  it('acepta descontar justo hasta el saldo disponible', () => {
    expect(validarDescuento(
      { description: 'Todo', amount: 200_000, kind: 'otro' },
      { netoAntesDeDescuentos: 1_000_000, yaDescontado: 800_000 },
    )).toEqual([]);
  });
});

/* ── Sugerencia desde Bodega ───────────────────────────────────────────── */

describe('herramientasPendientesDe', () => {
  it('trae las que siguen sin devolver, la más antigua primero', () => {
    const logs = [
      toolLog({ toolName: 'Reciente', checkoutDate: new Date(2026, 7, 5) }),
      toolLog({ toolName: 'Antigua', checkoutDate: new Date(2026, 6, 1) }),
      toolLog({ toolName: 'Devuelta', returnDate: new Date(2026, 7, 1) }),
    ];
    const r = herramientasPendientesDe(logs, 'u-sub', HOY);
    expect(r.map((x) => x.log.toolName)).toEqual(['Antigua', 'Reciente']);
    expect(r[0].dias).toBe(37);
  });

  it('no trae las de otra persona', () => {
    const logs = [toolLog({ userId: 'otro' })];
    expect(herramientasPendientesDe(logs, 'u-sub', HOY)).toEqual([]);
  });

  it('sin usuario asociado devuelve vacío en vez de inventar el cruce', () => {
    // Las herramientas se prestan a un USUARIO, no a una empresa: si el
    // contratista no tiene cuenta, no hay nada que sugerir.
    expect(herramientasPendientesDe([toolLog()], null, HOY)).toEqual([]);
  });
});

describe('yaSeDesconto', () => {
  it('detecta el origen ya descontado', () => {
    const ds = [desc({ sourceType: 'tool_log', sourceId: 'log-1' })];
    expect(yaSeDesconto(ds, 'tool_log', 'log-1')).toBe(true);
    expect(yaSeDesconto(ds, 'tool_log', 'log-2')).toBe(false);
  });

  it('no confunde orígenes de distinto tipo con el mismo id', () => {
    const ds = [desc({ sourceType: 'material_request', sourceId: 'x' })];
    expect(yaSeDesconto(ds, 'tool_log', 'x')).toBe(false);
  });
});
