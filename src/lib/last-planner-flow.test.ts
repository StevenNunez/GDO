import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDB, getRows, updateRows } from '@/modules/core/lib/demo/demo-store';
import { addWorkUnits, addCalendarExceptions, addTrainActivity, createDailyReportToken, saveDailyProgress } from '@/modules/data/mutations/lastPlannerMutations';
import { addLookaheadTask, cerrarTareaSemanal } from '@/modules/data/mutations/planningMutations';
import { GET, POST } from '@/app/api/parte/[token]/route';
import { compromisosDelTren, cierreDesdeElParte, borradorDelDia } from './train-links';
import { indexarExcepciones, claveDia } from './work-calendar';
import { celdasDeActividad } from './train';
import { calcPpc, CAUSAS_CNC } from './last-planner';
import { cargarParteDemo, guardarParteDemo } from '@/modules/core/lib/demo/demo-parte';
import { finDelDiaEnChile, tokenVigente } from './public-daily-report';
import type { TrainActivity, WorkUnit, DailyProgress, LookaheadTask, WorkCalendarException } from '@/modules/core/lib/data';

vi.mock('@/modules/core/lib/supabase', async () => {
  const { createDemoClient } = await import('@/modules/core/lib/demo/demo-client');
  return { getSupabaseBrowserClient: createDemoClient };
});
vi.mock('@supabase/supabase-js', async () => {
  const { createDemoClient } = await import('@/modules/core/lib/demo/demo-client');
  return { createClient: createDemoClient };
});

const context = { tenantId: 'tenant-a', projectId: 'project-a', user: { id: 'user-a', name: 'Jefe de terreno' } };
const rows = <T,>(table: string) => getRows(table) as T[];
const read = (token: string) => GET(new NextRequest(`http://localhost/api/parte/${token}`), { params: Promise.resolve({ token }) });
const write = (token: string, body: unknown) => POST(new NextRequest(`http://localhost/api/parte/${token}`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ token }) });

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-key');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-16T15:00:00Z'));
  seedDB({ projects: [{ id: 'project-a', tenantId: 'tenant-a', name: 'Obra de prueba', workDays: [1, 2, 3, 4, 5] }] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function prepare() {
  await addWorkUnits([0, 1, 2].map(i => ({ name: `10${i + 1}`, groupName: 'Piso 1', typology: null, area: null, sortOrder: i })), 0, context);
  await addCalendarExceptions([{ date: '2026-09-15', name: 'Cierre de obra' }], 'project-a', context);
  const activityId = await addTrainActivity({ name: 'Pintura', daysPerUnit: 1, startDate: '2026-09-14', unitGroups: ['Piso 1'] }, context);
  const token = await createDailyReportToken({ activityId, foremanName: 'Capataz', validFor: '2026-09-16' }, context);
  return { activityId, token, units: rows<WorkUnit>('workUnits') };
}

describe('Last Planner: persisted workflow and public HTTP handlers', () => {
  it('units → calendar → train → weekly commitment → report/correction → PPC and daily log', async () => {
    const { activityId, token, units } = await prepare();
    const acts = rows<TrainActivity>('trainActivities');
    const calendar = indexarExcepciones(rows<WorkCalendarException>('workCalendarExceptions'), 'project-a');
    expect(celdasDeActividad(acts[0], units, [1, 2, 3, 4, 5], calendar).map(c => claveDia(c.inicio))).toEqual(['2026-09-14', '2026-09-16', '2026-09-17']);
    const [proposal] = compromisosDelTren(acts, units, new Date(2026, 8, 14), [1, 2, 3, 4, 5], calendar, []);
    const id = await addLookaheadTask({ ...proposal, weekStart: '2026-09-14' as never, status: 'comprometida' }, context);
    expect(compromisosDelTren(acts, units, new Date(2026, 8, 14), [1, 2, 3, 4, 5], calendar, rows<LookaheadTask>('lookaheadTasks'))[0].yaExiste).toBe(true);
    const first = await (await read(token)).json();
    expect(first.unidades).toHaveLength(2);
    expect(first.tenantId).toBeUndefined();
    expect((await write(token, { unitId: units[0].id, progress: 1 })).status).toBe(200);
    expect((await write(token, { unitId: units[1].id, progress: 0.2, causeCode: 'materiales' })).status).toBe(200);
    expect((await write(token, { unitId: units[1].id, progress: 1 })).status).toBe(200);
    expect(rows<DailyProgress>('dailyProgress')).toHaveLength(2);
    expect(rows<DailyProgress>('dailyProgress').every(p => p.causeCode === null)).toBe(true);
    expect((await (await read(token)).json()).unidades).toHaveLength(2); // can correct completed units today
    expect(cargarParteDemo(token).unidades).toHaveLength(2);
    guardarParteDemo(token, { unitId: units[1].id, progress: 0.5 });
    expect(rows<DailyProgress>('dailyProgress')).toHaveLength(2);
    let task = rows<LookaheadTask>('lookaheadTasks')[0];
    const incomplete = cierreDesdeElParte(task, acts, units, rows<DailyProgress>('dailyProgress'), [1, 2, 3, 4, 5], calendar)!;
    expect(incomplete.cumplida).toBe(false);
    await cerrarTareaSemanal(id, { ...incomplete, causeCode: 'materiales' }, context);
    expect(calcPpc(rows<LookaheadTask>('lookaheadTasks')).ppc).toBe(0);
    vi.setSystemTime(new Date('2026-09-17T15:00:00Z'));
    await saveDailyProgress({ activityId, unitId: units[1].id, date: '2026-09-17', progress: 1 }, context);
    await saveDailyProgress({ activityId, unitId: units[2].id, date: '2026-09-17', progress: 1, crewDays: 2 }, context);
    task = rows<LookaheadTask>('lookaheadTasks')[0];
    const complete = cierreDesdeElParte(task, acts, units, rows<DailyProgress>('dailyProgress'), [1, 2, 3, 4, 5], calendar)!;
    expect(complete.cumplida).toBe(true);
    await cerrarTareaSemanal(id, complete, context);
    expect(calcPpc(rows<LookaheadTask>('lookaheadTasks')).ppc).toBe(100);
    expect(borradorDelDia('2026-09-17', acts, units, rows<DailyProgress>('dailyProgress'), CAUSAS_CNC).avanceEquivalente).toBe(1.5);
  });

  it('rejects future, excluded, wrong-group and other-project units in public writes', async () => {
    const { token, units } = await prepare();
    expect((await write(token, { unitId: units[2].id, progress: 1 })).status).toBe(400);
    for (const patch of [{ status: 'excluida' }, { groupName: 'Otro piso' }, { projectId: 'otra-obra' }, { tenantId: 'otra-empresa' }]) {
      updateRows('workUnits', r => r.id === units[0].id, { ...units[0], ...patch });
      expect((await write(token, { unitId: units[0].id, progress: 1 })).status).toBe(400);
      expect(() => guardarParteDemo(token, { unitId: units[0].id, progress: 1 })).toThrow();
    }
    expect(rows('dailyProgress')).toHaveLength(0);
  });

  it('rejects invalid values, archived activities, and expired links', async () => {
    const { token, units, activityId } = await prepare();
    for (const progress of [null, '', true, -1, 1.1]) expect((await write(token, { unitId: units[0].id, progress })).status).toBe(400);
    expect((await write(token, { unitId: units[0].id, progress: 0, causeCode: 'invalid' })).status).toBe(400);
    updateRows('trainActivities', r => r.id === activityId, { status: 'archivada' });
    expect((await read(token)).status).toBe(404);
    expect((await write(token, { unitId: units[0].id, progress: 1 })).status).toBe(404);
    vi.setSystemTime(new Date('2026-09-18T15:00:00Z'));
    expect((await read(token)).status).toBe(404);
  });

  it('ignores future progress when reopening today and preserves report metadata', async () => {
    const { activityId, token, units } = await prepare();
    await saveDailyProgress({ activityId, unitId: units[0].id, date: '2026-09-16', progress: 0.5, crewDays: 3, notes: 'Cuadrilla A', photoPath: 'foto.jpg' }, context);
    await saveDailyProgress({ activityId, unitId: units[1].id, date: '2026-09-17', progress: 1 }, context);
    const result = await (await read(token)).json();
    expect(result.unidades.find((u: { unitId: string }) => u.unitId === units[1].id).avance).toBe(0);
    await write(token, { unitId: units[0].id, progress: 1 });
    expect(rows<DailyProgress>('dailyProgress').find(p => p.unitId === units[0].id)).toMatchObject({ crewDays: 3, notes: 'Cuadrilla A', photoPath: 'foto.jpg' });
  });
});

describe('daily link validity in Chile', () => {
  it('rejects invalid timestamps and future days even if expiration is later', () => {
    expect(tokenVigente({ expiresAt: 'invalid', validFor: '2026-09-16' })).toBe(false);
    expect(tokenVigente({ expiresAt: '2026-09-20T23:00:00Z', validFor: '2026-09-17' })).toBe(false);
  });
  it('uses the Chilean day at the UTC date boundary', () => {
    expect(tokenVigente({ expiresAt: '2026-09-17T02:59:59Z', validFor: '2026-09-16' }, new Date('2026-09-17T01:00:00Z'))).toBe(true);
    expect(finDelDiaEnChile('2026-01-16')).toBe('2026-01-17T02:59:59.000Z');
    expect(finDelDiaEnChile('2026-07-16')).toBe('2026-07-17T03:59:59.000Z');
  });
});
