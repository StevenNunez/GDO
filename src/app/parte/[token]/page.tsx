"use client";

import { use, useEffect, useState } from 'react';
import { Check, Loader2, AlertTriangle, HardHat } from 'lucide-react';
import { isDemoMode } from '@/modules/core/lib/demo/demo-config';
import { cargarParteDemo, guardarParteDemo } from '@/modules/core/lib/demo/demo-parte';

/**
 * Parte diario para el capataz sin cuenta.
 *
 * Es la única pantalla de la app fuera del login, y está hecha para el peor
 * escenario real: un teléfono viejo, con datos móviles, en un piso sin
 * terminar. Por eso no monta el `DataProvider`, no carga la sesión, no trae
 * shadcn y no tiene barra lateral — pide un JSON chico a `/api/parte/[token]`
 * y pinta botones grandes.
 *
 * Todo lo que ve viene del token: no hay forma de navegar a otra actividad ni
 * a otra obra, porque no hay nada más en la respuesta.
 */

const ESCALA = [0, 0.2, 0.5, 0.75, 0.9, 1];
const ETIQUETAS: Record<number, string> = {
  0: 'No se hizo',
  0.2: 'Empezado',
  0.5: 'A medias',
  0.75: 'Avanzado',
  0.9: 'Casi listo',
  1: 'Terminado',
};

const CAUSAS: [string, string][] = [
  ['materiales', 'Falta de materiales'],
  ['mano_obra', 'Falta de mano de obra'],
  ['equipos', 'Equipos o herramientas'],
  ['informacion', 'Falta de información (planos)'],
  ['cancha', 'No había cancha'],
  ['subcontrato', 'Incumplimiento del subcontrato'],
  ['clima', 'Clima'],
  ['cambio_mandante', 'Cambio pedido por el mandante'],
  ['mala_programacion', 'Mala programación'],
  ['otra', 'Otra'],
];

interface UnidadParte {
  unitId: string;
  name: string;
  groupName: string | null;
  avance: number;
  atrasada: boolean;
}

interface DatosParte {
  actividad: string;
  fase: string | null;
  obra: string;
  capataz: string;
  fecha: string;
  unidades: UnidadParte[];
}

export default function PartePublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [datos, setDatos] = useState<DatosParte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  /** Unidades ya enviadas en esta sesión, para marcarlas y no repetirlas. */
  const [enviadas, setEnviadas] = useState<Record<string, number>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  /* La carga va dentro del efecto y no en un callback aparte: llamar a
     setState de forma síncrona al entrar al efecto encadena renders. El
     `vivo` evita escribir estado si el capataz cerró la página a mitad de la
     petición, que con señal mala pasa. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // En la demo no hay servidor que valide el token: la base vive en el
        // navegador. Se resuelve ahí con las mismas funciones puras.
        if (isDemoMode()) {
          const datosDemo = cargarParteDemo(token);
          if (vivo) setDatos(datosDemo as DatosParte);
          return;
        }
        const res = await fetch(`/api/parte/${token}`);
        const json = await res.json();
        if (!vivo) return;
        if (!res.ok) setError(json.error ?? 'No se pudo abrir el parte.');
        else setDatos(json as DatosParte);
      } catch (e: any) {
        if (isDemoMode()) {
          if (vivo) setError(e?.message ?? 'No se pudo abrir el parte.');
          return;
        }
        if (vivo) setError('No hay conexión. Intenta de nuevo cuando tengas señal.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  async function enviar(u: UnidadParte, progress: number, causeCode: string | null) {
    setGuardando(u.unitId);
    try {
      if (isDemoMode()) {
        guardarParteDemo(token, { unitId: u.unitId, progress, causeCode });
        setEnviadas((e) => ({ ...e, [u.unitId]: progress }));
        setAbierta(null);
        return;
      }
      const res = await fetch(`/api/parte/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: u.unitId, progress, causeCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'No se pudo guardar.');
        return;
      }
      setEnviadas((e) => ({ ...e, [u.unitId]: progress }));
      setAbierta(null);
    } catch (e: any) {
      setError(isDemoMode()
        ? (e?.message ?? 'No se pudo guardar.')
        : 'No hay conexión. El avance no se guardó, inténtalo de nuevo.');
    } finally {
      setGuardando(null);
    }
  }

  if (cargando) {
    return (
      <Marco>
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando…
        </div>
      </Marco>
    );
  }

  if (error && !datos) {
    return (
      <Marco>
        <div className="space-y-3 py-12 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="text-lg font-semibold text-slate-900">{error}</p>
        </div>
      </Marco>
    );
  }

  if (!datos) return null;

  const pendientes = datos.unidades.filter((u) => enviadas[u.unitId] === undefined);
  const listas = datos.unidades.filter((u) => enviadas[u.unitId] !== undefined);

  return (
    <Marco>
      <header className="space-y-1 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <HardHat className="h-4 w-4" />
          {datos.obra}
        </div>
        <h1 className="text-xl font-bold text-slate-900">{datos.actividad}</h1>
        <p className="text-sm text-slate-500">
          {datos.capataz} · {formatearFecha(datos.fecha)}
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {pendientes.length === 0 ? (
        <div className="space-y-2 py-10 text-center">
          <Check className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="text-lg font-semibold text-slate-900">
            {listas.length > 0 ? '¡Listo! Parte enviado.' : 'No hay nada pendiente por hoy.'}
          </p>
          <p className="text-sm text-slate-500">
            Ya puedes cerrar esta página.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Registra el avance de cada unidad de trabajo. Si no hubo avance, indica la causa.
          </p>

          {pendientes.map((u) => (
            <div key={u.unitId} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <span className="text-base font-bold text-slate-900">{u.name}</span>
                  {u.groupName && (
                    <span className="ml-2 text-xs text-slate-500">{u.groupName}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {u.atrasada && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Atrasado
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    va en {Math.round(u.avance * 100)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {ESCALA.map((valor) => (
                  <button
                    key={valor}
                    type="button"
                    disabled={guardando === u.unitId}
                    onClick={() => {
                      // Sin avance hay que decir por qué: se abre el selector.
                      if (valor <= u.avance) setAbierta(`${u.unitId}|${valor}`);
                      else enviar(u, valor, null);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-3 text-center active:bg-slate-100 disabled:opacity-50"
                  >
                    <div className="text-base font-bold text-slate-900">
                      {Math.round(valor * 100)}%
                    </div>
                    <div className="text-[11px] leading-tight text-slate-500">
                      {ETIQUETAS[valor]}
                    </div>
                  </button>
                ))}
              </div>

              {abierta?.startsWith(`${u.unitId}|`) && (
                <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">¿Por qué no avanzó?</p>
                  <div className="grid gap-1.5">
                    {CAUSAS.map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        disabled={guardando === u.unitId}
                        onClick={() => enviar(u, Number(abierta.split('|')[1]), code)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-800 active:bg-slate-100 disabled:opacity-50"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setAbierta(null)}
                    className="w-full py-2 text-sm text-slate-500">
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {listas.length > 0 && (
        <div className="space-y-1 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Enviados ({listas.length})
          </p>
          {listas.map((u) => (
            <div key={u.unitId} className="flex items-center gap-2 py-1 text-sm text-slate-600">
              <Check className="h-4 w-4 text-emerald-600" />
              {u.name} · {Math.round(enviadas[u.unitId] * 100)}%
            </div>
          ))}
        </div>
      )}
    </Marco>
  );
}

/**
 * Marco de la página. Colores fijos y no tokens del tema: esta pantalla vive
 * fuera del dashboard y no monta el proveedor de temas.
 */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto flex max-w-md flex-col gap-4">{children}</div>
    </div>
  );
}

/** `2026-09-14` → `14 de septiembre`. */
function formatearFecha(clave: string): string {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [, mes, dia] = clave.split('-');
  return `${Number(dia)} de ${meses[Number(mes) - 1] ?? ''}`;
}
