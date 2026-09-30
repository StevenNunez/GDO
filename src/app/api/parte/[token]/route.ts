import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { tokenVigente, unidadesDelParte } from '@/lib/public-daily-report';
import { claveDia } from '@/lib/work-calendar';
import { CAUSAS_CNC } from '@/lib/last-planner';
import type { DailyReportToken, TrainActivity, WorkUnit, DailyProgress, WorkCalendarException } from '@/modules/core/lib/data';

export const dynamic = 'force-dynamic';
const INVALID = 'Este enlace ya no sirve. Pídele uno nuevo al jefe de terreno.';
const unavailable = () => NextResponse.json({ error: 'No se pudo consultar el parte. Intenta nuevamente.' }, { status: 503 });

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function resolve(sb: SupabaseClient, token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const result = await sb.from('dailyReportTokens').select('*').eq('token', token).maybeSingle();
  if (result.error) throw result.error;
  const access = result.data as DailyReportToken | null;
  return access && tokenVigente(access) ? access : null;
}

/** Paginate the activity history: the API's row limit must not hide older units. */
async function history(sb: SupabaseClient, access: DailyReportToken) {
  const reports: DailyProgress[] = [];
  for (let start = 0; ; start += 500) {
    const result = await sb.from('dailyProgress').select('*')
      .eq('tenantId', access.tenantId).eq('projectId', access.projectId).eq('activityId', access.activityId)
      .lte('date', claveDia(access.validFor)).order('id').range(start, start + 499);
    if (result.error) throw result.error;
    reports.push(...(result.data as DailyProgress[]));
    if (result.data.length < 500) return reports;
  }
}

async function reportContext(sb: SupabaseClient, access: DailyReportToken) {
  const [activity, project, units, exceptions, reports] = await Promise.all([
    sb.from('trainActivities').select('*').eq('id', access.activityId).eq('tenantId', access.tenantId).eq('projectId', access.projectId).maybeSingle(),
    sb.from('projects').select('name, workDays').eq('id', access.projectId).eq('tenantId', access.tenantId).maybeSingle(),
    sb.from('workUnits').select('*').eq('projectId', access.projectId).eq('tenantId', access.tenantId).order('sortOrder'),
    sb.from('workCalendarExceptions').select('*').eq('tenantId', access.tenantId),
    history(sb, access),
  ]);
  if ([activity, project, units, exceptions].some(r => r.error)) throw new Error('Report context unavailable');
  if (!activity.data || activity.data.status !== 'activa' || !project.data) return null;
  return {
    activity: activity.data as TrainActivity,
    project: project.data,
    units: unidadesDelParte(access, activity.data as TrainActivity, units.data as WorkUnit[], reports, exceptions.data as WorkCalendarException[], project.data.workDays),
  };
}

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const sb = adminClient();
  if (!sb) return unavailable();
  try {
    const access = await resolve(sb, (await params).token);
    if (!access) return NextResponse.json({ error: INVALID }, { status: 404 });
    const context = await reportContext(sb, access);
    if (!context) return NextResponse.json({ error: INVALID }, { status: 404 });
    return NextResponse.json({ actividad: context.activity.name, fase: context.activity.phase ?? null, obra: context.project.name, capataz: access.foremanName, fecha: claveDia(access.validFor), unidades: context.units }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return unavailable(); }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const sb = adminClient();
  if (!sb) return unavailable();
  try {
    const access = await resolve(sb, (await params).token);
    if (!access) return NextResponse.json({ error: INVALID }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (typeof body?.unitId !== 'string' || typeof body.progress !== 'number' || !Number.isFinite(body.progress) || body.progress < 0 || body.progress > 1) {
      return NextResponse.json({ error: 'Indica una unidad y un avance válido entre 0 y 100%.' }, { status: 400 });
    }
    if (body.crewDays != null && (typeof body.crewDays !== 'number' || !Number.isFinite(body.crewDays) || body.crewDays < 0)) return NextResponse.json({ error: 'Las jornadas deben ser un número positivo.' }, { status: 400 });
    if (body.causeCode != null && !Object.hasOwn(CAUSAS_CNC, body.causeCode)) return NextResponse.json({ error: 'Selecciona una causa válida.' }, { status: 400 });
    const context = await reportContext(sb, access);
    if (!context) return NextResponse.json({ error: INVALID }, { status: 404 });
    if (!context.units.some(u => u.unitId === body.unitId)) return NextResponse.json({ error: 'Esa unidad no está habilitada para este parte.' }, { status: 400 });

    const { error } = await sb.from('dailyProgress').upsert({
      tenantId: access.tenantId, projectId: access.projectId, activityId: access.activityId,
      unitId: body.unitId, date: claveDia(access.validFor), progress: body.progress,
      ...(body.crewDays !== undefined ? { crewDays: body.crewDays } : {}),
      causeCode: body.progress >= 1 ? null : body.causeCode ?? null,
      ...(body.notes !== undefined ? { notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) || null : null } : {}),
      reportedBy: null, reportedByName: access.foremanName,
    }, { onConflict: 'activityId,unitId,date' });
    if (error) return NextResponse.json({ error: 'No se pudo guardar el avance.' }, { status: 500 });
    await sb.from('dailyReportTokens').update({ usedCount: (access.usedCount ?? 0) + 1, lastUsedAt: new Date().toISOString() }).eq('id', access.id);
    return NextResponse.json({ ok: true });
  } catch { return unavailable(); }
}
