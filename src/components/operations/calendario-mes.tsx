"use client";

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mesEnSemanas, type TipoDeDia } from '@/lib/work-calendar';
import type { WorkCalendarException } from '@/modules/core/lib/data';

const ENCABEZADO = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Cada tipo de día: color del número y de la marca inferior. Sin rellenos de color: el significado va en la marca. */
const ESTILO: Record<TipoDeDia, { numero: string; marca: string; etiqueta: string }> = {
  habil: { numero: 'text-foreground', marca: 'bg-info', etiqueta: 'Se trabaja' },
  'no-laboral': { numero: 'text-muted-foreground', marca: 'bg-transparent', etiqueta: 'No laboral' },
  feriado: { numero: 'text-warning font-semibold', marca: 'bg-cta', etiqueta: 'Feriado' },
  trabajado: { numero: 'text-success font-semibold', marca: 'bg-success', etiqueta: 'Se trabaja (excepción)' },
};

/**
 * El mes del calendario laboral, con cada día en su color: azul se trabaja, gris no se trabaja,
 * ámbar feriado y verde un día trabajado por excepción. El día de hoy lleva un anillo ámbar.
 * Muestra lo mismo que usa el tren para contar días hábiles, pero a la vista de todos.
 */
export function CalendarioMes({ workDays, excepciones, nombres }: {
  workDays: number[] | null | undefined;
  excepciones: Map<string, WorkCalendarException['type']>;
  /** Nombre de la excepción por fecha (para el texto emergente de cada día). */
  nombres: Map<string, string>;
}) {
  const [desplazamiento, setDesplazamiento] = useState(0);

  const base = useMemo(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1);
  }, [desplazamiento]);

  const semanas = useMemo(
    () => mesEnSemanas(base.getFullYear(), base.getMonth(), workDays, excepciones),
    [base, workDays, excepciones],
  );

  const titulo = base.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold capitalize tracking-tight">{titulo}</h3>
        <div className="flex items-center gap-1">
          {desplazamiento !== 0 && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setDesplazamiento(0)}>Hoy</Button>
          )}
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Mes anterior" onClick={() => setDesplazamiento((d) => d - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Mes siguiente" onClick={() => setDesplazamiento((d) => d + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {ENCABEZADO.map((d, i) => (
          <div key={i} className="pb-1 text-center font-cifras text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{d}</div>
        ))}
        {semanas.flat().map((dia) => {
          const e = ESTILO[dia.tipo];
          const nombre = nombres.get(dia.clave);
          return (
            <div
              key={dia.clave}
              title={`${dia.clave.split('-').reverse().join('/')} · ${nombre ? `${nombre} · ` : ''}${e.etiqueta}`}
              className={cn(
                'relative flex h-11 flex-col items-center justify-center rounded-md border border-border bg-card',
                !dia.delMes && 'opacity-35',
                dia.tipo === 'no-laboral' && 'bg-secondary/60',
                dia.hoy && 'border-cta ring-2 ring-cta',
              )}
            >
              <span className={cn('font-cifras text-[13px] tabular-nums', e.numero, dia.hoy && 'font-bold')}>{dia.numero}</span>
              <span className={cn('absolute inset-x-2 bottom-1 h-[3px] rounded-full', e.marca)} aria-hidden />
            </div>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><i className="h-[3px] w-4 rounded-full bg-info" />Se trabaja</li>
        <li className="flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm border border-border bg-secondary/60" />No laboral</li>
        <li className="flex items-center gap-1.5"><i className="h-[3px] w-4 rounded-full bg-cta" />Feriado</li>
        <li className="flex items-center gap-1.5"><i className="h-[3px] w-4 rounded-full bg-success" />Trabajado por excepción</li>
        <li className="flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm border border-cta ring-1 ring-cta" />Hoy</li>
      </ul>
    </div>
  );
}
