"use client";

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FilterChip {
  value: string;
  label: string;
  /** Número al lado de la etiqueta: cuántos hay en ese grupo. */
  count?: number;
  /** Pinta el chip como alerta cuando no está elegido (atrasadas, vencidas). */
  tone?: 'default' | 'danger';
}

/**
 * Fila de filtros en forma de píldora, pensada para el teléfono.
 *
 * Es la alternativa al `<select>` cuando las opciones son pocas y hay que
 * elegir con el pulgar: se ve todo de una, no abre un menú encima de la
 * pantalla, y cada chip es un blanco grande. En una obra de 56 deptos, filtrar
 * por piso es la diferencia entre encontrar el tuyo y rendirse.
 *
 * Scroll horizontal cuando no caben, con los bordes difuminados para que se
 * note que sigue: una fila cortada en seco parece que termina ahí.
 */
export function FilterChips({ options, value, onChange, className }: {
  options: FilterChip[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  if (options.length <= 1) return null;

  return (
    <div className={cn('relative -mx-1', className)}>
      <div className="flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((o) => {
          const activo = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={activo}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
                activo
                  ? 'border-primary bg-primary text-primary-foreground'
                  : o.tone === 'danger'
                    ? 'border-danger/40 bg-danger-subtle text-danger hover:border-danger'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {o.label}
              {o.count !== undefined && (
                <span className={cn('ml-1.5 tabular-nums', activo ? 'opacity-80' : 'opacity-60')}>
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
