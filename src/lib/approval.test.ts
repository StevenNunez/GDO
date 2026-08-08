import { describe, expect, it } from 'vitest';
import type {
  ApprovalAction, ApprovalDelegation, ApprovalFlowStep, ApprovalRequest,
  ApprovalStepSnapshot,
} from '@/modules/core/lib/data';
import {
  congelarPasos, delegacionVigente, diasEsperando, documentoAlterado,
  firmaPorCuentaDe, historialDe, motivoRechazo, pasoActual, pendientesDeFirma,
  progresoAprobacion, puedeFirmar, resultadoDe, textoCanonico,
  titularesQueDelegaronEn, validarDelegacion, validarFlujo,
} from './approval';

/* ── Fábricas ──────────────────────────────────────────────────────────── */

function paso(over: Partial<ApprovalFlowStep> = {}): ApprovalFlowStep {
  return {
    id: crypto.randomUUID(),
    tenantId: 't1',
    flowId: 'f1',
    sortOrder: 0,
    name: 'Paso',
    approverRole: 'operations',
    approverUserId: null,
    requiresSignature: true,
    createdAt: new Date('2026-08-01'),
    ...over,
  };
}

function snap(over: Partial<ApprovalStepSnapshot> = {}): ApprovalStepSnapshot {
  return {
    order: 0, name: 'Paso', approverRole: 'operations',
    approverUserId: null, requiresSignature: true, ...over,
  };
}

function solicitud(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'r1',
    tenantId: 't1',
    documentType: 'subcontract_certificate',
    documentId: 'd1',
    projectId: 'p1',
    flowId: 'f1',
    stepsSnapshot: [
      snap({ order: 0, name: 'Jefe de Terreno', approverRole: 'supervisor' }),
      snap({ order: 1, name: 'Oficina Técnica', approverRole: 'operations' }),
      snap({ order: 2, name: 'Gerencia', approverRole: 'admin' }),
    ],
    status: 'pendiente',
    currentStep: 0,
    documentHash: null,
    submittedBy: 'u0',
    submittedAt: new Date('2026-08-01T10:00:00Z'),
    closedAt: null,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    ...over,
  };
}

function accion(over: Partial<ApprovalAction> = {}): ApprovalAction {
  return {
    id: crypto.randomUUID(),
    tenantId: 't1',
    requestId: 'r1',
    stepOrder: 0,
    stepName: 'Jefe de Terreno',
    action: 'aprobado',
    comment: null,
    actedBy: 'u1',
    actorName: 'Juan Pérez',
    actorRut: '11.111.111-1',
    actorCargo: 'Jefe de Terreno',
    actorRole: 'supervisor',
    signature: null,
    documentHash: null,
    actedAt: new Date('2026-08-02T10:00:00Z'),
    ...over,
  };
}

function delegacion(over: Partial<ApprovalDelegation> = {}): ApprovalDelegation {
  return {
    id: crypto.randomUUID(),
    tenantId: 't1',
    fromUserId: 'u1',
    toUserId: 'u2',
    documentType: null,
    // Fechas construidas con campos locales, no con `new Date('2026-08-01')`:
    // ese string se lee como medianoche UTC y en Chile cae el día anterior.
    startDate: new Date(2026, 7, 1),
    endDate: new Date(2026, 7, 15),
    reason: 'Vacaciones',
    active: true,
    createdBy: 'u1',
    createdAt: new Date('2026-07-30'),
    ...over,
  };
}

/* ── Congelar los pasos ────────────────────────────────────────────────── */

describe('congelarPasos', () => {
  it('ordena por sortOrder y renumera desde 0', () => {
    const pasos = [
      paso({ name: 'Gerencia', sortOrder: 30 }),
      paso({ name: 'Terreno', sortOrder: 10 }),
      paso({ name: 'Oficina', sortOrder: 20 }),
    ];
    const snapshot = congelarPasos(pasos);
    expect(snapshot.map((s) => s.name)).toEqual(['Terreno', 'Oficina', 'Gerencia']);
    expect(snapshot.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('no depende del orden en que vengan los pasos', () => {
    const a = congelarPasos([paso({ name: 'A', sortOrder: 1 }), paso({ name: 'B', sortOrder: 2 })]);
    const b = congelarPasos([paso({ name: 'B', sortOrder: 2 }), paso({ name: 'A', sortOrder: 1 })]);
    expect(a.map((s) => s.name)).toEqual(b.map((s) => s.name));
  });
});

/* ── Quién firma ───────────────────────────────────────────────────────── */

describe('puedeFirmar', () => {
  it('habilita al rol del paso en curso', () => {
    const r = solicitud();
    expect(puedeFirmar(r, { userId: 'u1', role: 'supervisor' })).toBe(true);
  });

  it('no habilita al rol del paso siguiente antes de tiempo', () => {
    const r = solicitud();
    expect(puedeFirmar(r, { userId: 'u2', role: 'operations' })).toBe(false);
  });

  it('un paso nominativo manda por sobre el rol', () => {
    const r = solicitud({
      stepsSnapshot: [snap({ name: 'Gerencia', approverRole: 'admin', approverUserId: 'u9' })],
    });
    expect(puedeFirmar(r, { userId: 'u9', role: 'worker' })).toBe(true);
    // Otro admin no sirve: el flujo pidió a esa persona.
    expect(puedeFirmar(r, { userId: 'u8', role: 'admin' })).toBe(false);
  });

  it('nadie firma un trámite cerrado', () => {
    for (const status of ['aprobado', 'rechazado', 'anulado'] as const) {
      const r = solicitud({ status });
      expect(puedeFirmar(r, { userId: 'u1', role: 'supervisor' })).toBe(false);
    }
  });

  it('el super-admin puede destrabar cualquier paso', () => {
    expect(puedeFirmar(solicitud(), { userId: 'sa', role: 'super-admin' })).toBe(true);
  });

  it('no habilita a nadie si el índice apunta fuera del flujo', () => {
    const r = solicitud({ currentStep: 7 });
    expect(pasoActual(r)).toBeNull();
    expect(puedeFirmar(r, { userId: 'u1', role: 'supervisor' })).toBe(false);
  });
});

/* ── Delegación de firma ───────────────────────────────────────────────── */

describe('delegacionVigente', () => {
  const doc = 'subcontract_certificate' as const;

  it('vale dentro del rango de fechas', () => {
    expect(delegacionVigente(delegacion(), doc, new Date('2026-08-05'))).toBe(true);
  });

  it('vale el último día completo, no hasta las 00:00', () => {
    const d = delegacion({ endDate: new Date(2026, 7, 15) });
    expect(delegacionVigente(d, doc, new Date(2026, 7, 15, 23, 30))).toBe(true);
  });

  it('no vale antes ni después del rango', () => {
    expect(delegacionVigente(delegacion(), doc, new Date(2026, 6, 31))).toBe(false);
    expect(delegacionVigente(delegacion(), doc, new Date(2026, 7, 16))).toBe(false);
  });

  it('lee las fechas de Supabase (string YYYY-MM-DD) por sus dígitos, no en UTC', () => {
    // Este es el caso REAL: las columnas DATE llegan como string. Leído como
    // UTC, en Chile la delegación terminaría un día antes de lo que dice la
    // pantalla y el aprobador de reemplazo se quedaría fuera el último día.
    const d = delegacion({
      startDate: '2026-08-01' as unknown as Date,
      endDate: '2026-08-15' as unknown as Date,
    });
    expect(delegacionVigente(d, doc, new Date(2026, 7, 15, 18, 0))).toBe(true);
    expect(delegacionVigente(d, doc, new Date(2026, 7, 1, 0, 30))).toBe(true);
    expect(delegacionVigente(d, doc, new Date(2026, 7, 16))).toBe(false);
  });

  it('una delegación apagada no vale aunque esté en fecha', () => {
    expect(delegacionVigente(delegacion({ active: false }), doc, new Date('2026-08-05'))).toBe(false);
  });

  it('respeta el tipo de documento cuando está acotada', () => {
    const soloEepp = delegacion({ documentType: 'subcontract_certificate' });
    expect(delegacionVigente(soloEepp, 'subcontract_certificate', new Date('2026-08-05'))).toBe(true);
    expect(delegacionVigente(soloEepp, 'amendment', new Date('2026-08-05'))).toBe(false);
  });

  it('sin tipo, vale para todos los documentos', () => {
    const todas = delegacion({ documentType: null });
    expect(delegacionVigente(todas, 'amendment', new Date('2026-08-05'))).toBe(true);
  });
});

describe('puedeFirmar con delegación', () => {
  const hoy = new Date('2026-08-05');

  it('el delegado firma un paso nominativo del titular', () => {
    const r = solicitud({
      stepsSnapshot: [snap({ name: 'Gerencia', approverRole: null, approverUserId: 'u1' })],
    });
    const quien = {
      userId: 'u2', role: 'worker',
      delegaciones: [delegacion({ fromUserId: 'u1', toUserId: 'u2' })],
    };
    expect(puedeFirmar(r, quien, hoy)).toBe(true);
  });

  it('el delegado firma un paso POR ROL si el titular tiene ese rol', () => {
    // El caso común: el jefe de terreno se va de vacaciones.
    const r = solicitud({
      stepsSnapshot: [snap({ name: 'Terreno', approverRole: 'supervisor' })],
    });
    const quien = {
      userId: 'u2', role: 'worker',
      delegaciones: [delegacion({ fromUserId: 'u1', toUserId: 'u2' })],
      rolPorUsuario: { u1: 'supervisor' },
    };
    expect(puedeFirmar(r, quien, hoy)).toBe(true);
  });

  it('no firma si el titular que delegó tiene OTRO rol', () => {
    const r = solicitud({
      stepsSnapshot: [snap({ name: 'Terreno', approverRole: 'supervisor' })],
    });
    const quien = {
      userId: 'u2', role: 'worker',
      delegaciones: [delegacion({ fromUserId: 'u1', toUserId: 'u2' })],
      rolPorUsuario: { u1: 'bodega-admin' },
    };
    expect(puedeFirmar(r, quien, hoy)).toBe(false);
  });

  it('la delegación NO encadena: el delegado de un delegado no firma', () => {
    const r = solicitud({
      stepsSnapshot: [snap({ name: 'Gerencia', approverRole: null, approverUserId: 'u1' })],
    });
    const quien = {
      userId: 'u3', role: 'worker',
      delegaciones: [
        delegacion({ fromUserId: 'u1', toUserId: 'u2' }), // u1 → u2
        delegacion({ fromUserId: 'u2', toUserId: 'u3' }), // u2 → u3
      ],
    };
    expect(puedeFirmar(r, quien, hoy)).toBe(false);
  });

  it('una delegación fuera de fecha no habilita a nadie', () => {
    const r = solicitud({
      stepsSnapshot: [snap({ name: 'Gerencia', approverRole: null, approverUserId: 'u1' })],
    });
    const quien = {
      userId: 'u2', role: 'worker',
      delegaciones: [delegacion({ fromUserId: 'u1', toUserId: 'u2' })],
    };
    expect(puedeFirmar(r, quien, new Date('2026-09-01'))).toBe(false);
  });

  it('sin delegaciones se comporta igual que antes', () => {
    const r = solicitud();
    expect(puedeFirmar(r, { userId: 'u1', role: 'supervisor' })).toBe(true);
    expect(puedeFirmar(r, { userId: 'u9', role: 'worker' })).toBe(false);
  });
});

describe('firmaPorCuentaDe', () => {
  const hoy = new Date('2026-08-05');

  it('nombra al titular cuando se firma por delegación', () => {
    const r = solicitud({
      stepsSnapshot: [snap({ name: 'Gerencia', approverRole: null, approverUserId: 'u1' })],
    });
    expect(firmaPorCuentaDe(r, {
      userId: 'u2', delegaciones: [delegacion({ fromUserId: 'u1', toUserId: 'u2' })],
    }, hoy)).toBe('u1');
  });

  it('devuelve null cuando la persona firma por sí misma', () => {
    const r = solicitud({
      stepsSnapshot: [snap({ name: 'Gerencia', approverRole: null, approverUserId: 'u1' })],
    });
    expect(firmaPorCuentaDe(r, { userId: 'u1', delegaciones: [] }, hoy)).toBeNull();
  });

  it('no nombra titular si llegó por su propio rol', () => {
    const r = solicitud();
    expect(firmaPorCuentaDe(r, { userId: 'u1', delegaciones: [] }, hoy)).toBeNull();
  });
});

describe('titularesQueDelegaronEn', () => {
  it('lista solo las delegaciones vigentes hacia esa persona', () => {
    const ds = [
      delegacion({ fromUserId: 'a', toUserId: 'yo' }),
      delegacion({ fromUserId: 'b', toUserId: 'yo', active: false }),
      delegacion({ fromUserId: 'c', toUserId: 'otro' }),
    ];
    expect(titularesQueDelegaronEn(ds, 'yo', 'amendment', new Date('2026-08-05')))
      .toEqual(['a']);
  });

  it('sin usuario devuelve vacío en vez de reventar', () => {
    expect(titularesQueDelegaronEn([delegacion()], null, 'amendment')).toEqual([]);
  });
});

describe('validarDelegacion', () => {
  it('acepta una delegación bien armada', () => {
    expect(validarDelegacion({
      fromUserId: 'u1', toUserId: 'u2',
      startDate: new Date('2026-08-01'), endDate: new Date('2026-08-15'),
    })).toEqual([]);
  });

  it('no deja delegar en uno mismo', () => {
    const e = validarDelegacion({
      fromUserId: 'u1', toUserId: 'u1',
      startDate: new Date('2026-08-01'), endDate: new Date('2026-08-15'),
    });
    expect(e.some((x) => x.includes('ti mismo'))).toBe(true);
  });

  it('exige fecha de término', () => {
    const e = validarDelegacion({
      fromUserId: 'u1', toUserId: 'u2',
      startDate: new Date('2026-08-01'), endDate: null as any,
    });
    expect(e.some((x) => x.includes('término'))).toBe(true);
  });

  it('no deja el término antes del inicio', () => {
    const e = validarDelegacion({
      fromUserId: 'u1', toUserId: 'u2',
      startDate: new Date('2026-08-15'), endDate: new Date('2026-08-01'),
    });
    expect(e.some((x) => x.includes('anterior'))).toBe(true);
  });
});

/* ── Avance del trámite ────────────────────────────────────────────────── */

describe('resultadoDe', () => {
  it('aprobar un paso intermedio avanza al siguiente', () => {
    expect(resultadoDe(solicitud({ currentStep: 0 }), 'aprobado'))
      .toEqual({ status: 'pendiente', currentStep: 1 });
  });

  it('aprobar el último paso cierra el trámite', () => {
    expect(resultadoDe(solicitud({ currentStep: 2 }), 'aprobado'))
      .toEqual({ status: 'aprobado', currentStep: 3 });
  });

  it('rechazar corta la cadena en el paso donde ocurrió', () => {
    expect(resultadoDe(solicitud({ currentStep: 1 }), 'rechazado'))
      .toEqual({ status: 'rechazado', currentStep: 1 });
  });

  it('un flujo de un solo paso se aprueba de una', () => {
    const r = solicitud({ stepsSnapshot: [snap()], currentStep: 0 });
    expect(resultadoDe(r, 'aprobado')).toEqual({ status: 'aprobado', currentStep: 1 });
  });
});

describe('progresoAprobacion', () => {
  it('cuenta los pasos ya firmados', () => {
    expect(progresoAprobacion(solicitud({ currentStep: 1 })))
      .toMatchObject({ total: 3, firmados: 1, esperando: 'Oficina Técnica', porcentaje: 33 });
  });

  it('un trámite aprobado marca 100%', () => {
    expect(progresoAprobacion(solicitud({ status: 'aprobado', currentStep: 3 })))
      .toMatchObject({ total: 3, firmados: 3, esperando: null, porcentaje: 100 });
  });

  it('un trámite rechazado se queda donde murió', () => {
    expect(progresoAprobacion(solicitud({ status: 'rechazado', currentStep: 1 })))
      .toMatchObject({ firmados: 1, esperando: null, porcentaje: 33 });
  });

  it('no divide por cero con un flujo vacío', () => {
    const r = solicitud({ stepsSnapshot: [], currentStep: 0 });
    expect(progresoAprobacion(r)).toMatchObject({ total: 0, porcentaje: 0 });
  });
});

/* ── Bandeja ───────────────────────────────────────────────────────────── */

describe('pendientesDeFirma', () => {
  it('trae solo los que esperan a esa persona, el más viejo primero', () => {
    const nuevo = solicitud({
      id: 'nuevo', submittedAt: new Date('2026-08-05T10:00:00Z'),
    });
    const viejo = solicitud({
      id: 'viejo', submittedAt: new Date('2026-08-01T10:00:00Z'),
    });
    const ajeno = solicitud({ id: 'ajeno', currentStep: 1 });
    const cerrado = solicitud({ id: 'cerrado', status: 'aprobado' });

    const r = pendientesDeFirma([nuevo, ajeno, cerrado, viejo], {
      userId: 'u1', role: 'supervisor',
    });
    expect(r.map((x) => x.id)).toEqual(['viejo', 'nuevo']);
  });
});

describe('diasEsperando', () => {
  it('cuenta los días desde que se presentó', () => {
    const r = solicitud({ submittedAt: new Date('2026-08-01T10:00:00Z') });
    expect(diasEsperando(r, new Date('2026-08-06T10:00:00Z'))).toBe(5);
  });

  it('nunca es negativo', () => {
    const r = solicitud({ submittedAt: new Date('2026-08-10T10:00:00Z') });
    expect(diasEsperando(r, new Date('2026-08-01T10:00:00Z'))).toBe(0);
  });
});

/* ── Huella del documento ──────────────────────────────────────────────── */

describe('textoCanonico', () => {
  it('da lo mismo sin importar el orden de las claves', () => {
    expect(textoCanonico({ monto: 1000, numero: 3 }))
      .toBe(textoCanonico({ numero: 3, monto: 1000 }));
  });

  it('cambia si cambia un monto', () => {
    expect(textoCanonico({ monto: 1000 })).not.toBe(textoCanonico({ monto: 1001 }));
  });

  it('normaliza los decimales para que 1000 y 1000.0 sean el mismo documento', () => {
    expect(textoCanonico({ monto: 1000 })).toBe(textoCanonico({ monto: 1000.0 }));
  });

  it('trata null, undefined y ausencia como lo mismo', () => {
    expect(textoCanonico({ a: null })).toBe(textoCanonico({ a: undefined }));
  });

  it('usa solo la fecha, no la hora, para no invalidar por el huso horario', () => {
    expect(textoCanonico({ f: new Date('2026-08-01T03:00:00Z') }))
      .toBe(textoCanonico({ f: new Date('2026-08-01T22:00:00Z') }));
  });
});

describe('documentoAlterado', () => {
  it('detecta que el documento cambió después de firmado', () => {
    expect(documentoAlterado(solicitud({ documentHash: 'abc' }), 'xyz')).toBe(true);
  });

  it('no acusa cuando calza', () => {
    expect(documentoAlterado(solicitud({ documentHash: 'abc' }), 'abc')).toBe(false);
  });

  it('no acusa a los documentos anteriores a la migración, que no tienen huella', () => {
    expect(documentoAlterado(solicitud({ documentHash: null }), 'abc')).toBe(false);
    expect(documentoAlterado(solicitud({ documentHash: 'abc' }), null)).toBe(false);
  });
});

/* ── Historial y motivo del rechazo ────────────────────────────────────── */

describe('motivoRechazo', () => {
  it('devuelve el motivo, quién y en qué paso', () => {
    const r = solicitud({ status: 'rechazado', currentStep: 1 });
    const acciones = [
      accion({ stepOrder: 0, action: 'aprobado' }),
      accion({
        stepOrder: 1, action: 'rechazado', stepName: 'Oficina Técnica',
        comment: 'Falta el F30-1 del período', actorName: 'Ana Soto',
        actedAt: new Date('2026-08-03T10:00:00Z'),
      }),
    ];
    expect(motivoRechazo(r, acciones)).toEqual({
      motivo: 'Falta el F30-1 del período',
      por: 'Ana Soto',
      paso: 'Oficina Técnica',
    });
  });

  it('no devuelve nada si el trámite no está rechazado', () => {
    expect(motivoRechazo(solicitud(), [accion()])).toBeNull();
  });

  it('se queda con el rechazo más reciente', () => {
    const r = solicitud({ status: 'rechazado' });
    const acciones = [
      accion({ action: 'rechazado', comment: 'primero', actedAt: new Date('2026-08-01') }),
      accion({ action: 'rechazado', comment: 'último', actedAt: new Date('2026-08-05') }),
    ];
    expect(motivoRechazo(r, acciones)?.motivo).toBe('último');
  });
});

describe('historialDe', () => {
  it('filtra por trámite y ordena cronológicamente', () => {
    const acciones = [
      accion({ requestId: 'r1', comment: 'b', actedAt: new Date('2026-08-05') }),
      accion({ requestId: 'r2', comment: 'otro trámite' }),
      accion({ requestId: 'r1', comment: 'a', actedAt: new Date('2026-08-01') }),
    ];
    expect(historialDe(acciones, 'r1').map((a) => a.comment)).toEqual(['a', 'b']);
  });
});

/* ── Validación de la plantilla ────────────────────────────────────────── */

describe('validarFlujo', () => {
  it('acepta una cadena bien armada', () => {
    expect(validarFlujo([
      paso({ name: 'Terreno', sortOrder: 0, approverRole: 'supervisor' }),
      paso({ name: 'Oficina', sortOrder: 1, approverRole: 'operations' }),
    ])).toEqual([]);
  });

  it('rechaza un flujo sin pasos', () => {
    expect(validarFlujo([])).toHaveLength(1);
  });

  it('detecta un paso sin aprobador, que dejaría el documento trabado', () => {
    const errores = validarFlujo([
      paso({ name: 'Huérfano', approverRole: null, approverUserId: null }),
    ]);
    expect(errores.some((e) => e.includes('Huérfano'))).toBe(true);
  });

  it('avisa cuando el mismo rol firma dos pasos seguidos', () => {
    const errores = validarFlujo([
      paso({ name: 'Revisión', sortOrder: 0, approverRole: 'operations' }),
      paso({ name: 'Visto bueno', sortOrder: 1, approverRole: 'operations' }),
    ]);
    expect(errores.some((e) => e.includes('mismo firmante'))).toBe(true);
  });

  it('no confunde el mismo rol con la misma persona cuando el paso es nominativo', () => {
    // Dos gerentes distintos firmando uno tras otro es un control real.
    expect(validarFlujo([
      paso({ name: 'Gerente A', sortOrder: 0, approverRole: 'admin', approverUserId: 'u1' }),
      paso({ name: 'Gerente B', sortOrder: 1, approverRole: 'admin', approverUserId: 'u2' }),
    ])).toEqual([]);
  });

  it('detecta a la misma persona dos veces seguidas', () => {
    const errores = validarFlujo([
      paso({ name: 'Uno', sortOrder: 0, approverUserId: 'u1', approverRole: null }),
      paso({ name: 'Dos', sortOrder: 1, approverUserId: 'u1', approverRole: null }),
    ]);
    expect(errores.some((e) => e.includes('mismo firmante'))).toBe(true);
  });
});
