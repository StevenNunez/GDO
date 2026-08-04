/**
 * Indicadores UF / UTM / IPC.
 *
 * `marketIndices` es tabla global y su RLS solo deja escribir al super-admin,
 * así que ambos caminos pasan por acá con la service key:
 *
 *   POST            → sincroniza desde mindicador.cl (API pública chilena).
 *   POST { manual } → carga a mano un valor. Es el respaldo: si la API se cae o
 *                     cambia, un contrato en UF no puede quedar bloqueado por un
 *                     servicio externo.
 *
 * Ambos exigen sesión y permiso de contrato: escribe datos que afectan montos
 * cobrados, y sin autenticación esto sería un proxy abierto hacia un tercero.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';

const MINDICADOR = 'https://mindicador.cl/api';
const TIPOS = ['uf', 'utm', 'ipc'] as const;
type Tipo = (typeof TIPOS)[number];

/** Roles que pueden tocar datos del contrato sin consultar la tabla `roles`. */
const ROLES_CON_CONTRATO = ['super-admin', 'admin', 'operations', 'soporte', 'jefe-oficina-tecnica'];

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * `YYYY-MM-DD` del día que representa el timestamp.
 *
 * mindicador.cl publica la fecha como medianoche de Chile en UTC (ej.
 * `2026-08-03T04:00:00.000Z` = 3 de agosto). Se toma el día en UTC y no los
 * campos locales para que el resultado no dependa de la zona horaria del
 * servidor donde corra esto.
 */
function aFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * ¿El valor es utilizable para este indicador?
 *
 * La UF y la UTM son montos y siempre positivos, pero **el IPC es una variación
 * porcentual y puede ser negativo o cero** (deflación: hoy mismo la API devuelve
 * −0,2). Rechazarlo por "no ser mayor que cero" haría perder el dato en silencio.
 */
function valorValido(tipo: Tipo, valor: number): boolean {
  if (!Number.isFinite(valor)) return false;
  return tipo === 'ipc' ? true : valor > 0;
}

export async function POST(req: NextRequest) {
  const sb = adminClient();

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { data: { user: caller }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !caller) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { data: perfil } = await sb.from('users').select('role').eq('id', caller.id).single();
  if (!perfil || !ROLES_CON_CONTRATO.includes(perfil.role)) {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }

  // Acotado por usuario: la sincronización golpea un servicio de terceros.
  const limite = rateLimit(`indices:${caller.id}`, 20, 10 * 60 * 1000);
  if (!limite.allowed) {
    return NextResponse.json(
      { error: `Demasiadas solicitudes. Reintenta en ${limite.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));

  /* ── Carga manual ── */
  if (body?.manual) {
    const { type, date, value } = body.manual as { type: Tipo; date: string; value: number };

    if (!TIPOS.includes(type)) {
      return NextResponse.json({ error: 'Tipo de indicador no válido.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
      return NextResponse.json({ error: 'Fecha no válida.' }, { status: 400 });
    }
    if (!valorValido(type, value)) {
      return NextResponse.json(
        {
          error: type === 'ipc'
            ? 'El IPC debe ser un número (puede ser negativo).'
            : 'El valor debe ser un número mayor que cero.',
        },
        { status: 400 },
      );
    }

    const { error } = await sb
      .from('marketIndices')
      .upsert({ date, type, value }, { onConflict: 'date,type' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, guardados: 1, origen: 'manual' });
  }

  /* ── Sincronización desde mindicador.cl ── */
  let payload: any;
  try {
    const res = await fetch(MINDICADOR, {
      headers: { accept: 'application/json' },
      // El valor cambia una vez al día: no vale la pena golpear el origen más seguido.
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`mindicador.cl respondió ${res.status}`);
    payload = await res.json();
  } catch (e: any) {
    // No es un 500 nuestro: el origen es de un tercero y hay carga manual.
    return NextResponse.json(
      {
        error: 'No se pudo consultar mindicador.cl. Puedes cargar el valor a mano.',
        detalle: e?.message ?? String(e),
      },
      { status: 502 },
    );
  }

  const filas = TIPOS.flatMap((tipo) => {
    const bloque = payload?.[tipo];
    const valor = Number(bloque?.valor);
    if (!valorValido(tipo, valor)) return [];
    // `fecha` viene ISO; si faltara se usa hoy para no perder el dato.
    const fecha = bloque?.fecha ? aFecha(new Date(bloque.fecha)) : aFecha(new Date());
    return [{ date: fecha, type: tipo, value: valor }];
  });

  if (filas.length === 0) {
    return NextResponse.json(
      { error: 'mindicador.cl no devolvió valores utilizables.' },
      { status: 502 },
    );
  }

  const { error } = await sb
    .from('marketIndices')
    .upsert(filas, { onConflict: 'date,type' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, guardados: filas.length, origen: 'mindicador.cl' });
}
