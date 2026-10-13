"use client";

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/planner-tones';
import { toneFill, toneRail, toneText } from './planner-tone-classes';

/**
 * Bloques de interfaz comunes a todas las pantallas de Last Planner (diseño «Torre»).
 * Son lo que hace que Resumen, Unidades, Calendario, Tren, Programa, Parte diario y Análisis se
 * vean de una sola pieza: la misma etiqueta de sección, la misma tarjeta de métrica, la misma barra.
 */

/** Etiqueta de sección con su «cota»: texto en mono, línea de 1 px y, a la derecha, un dato opcional. */
export function SectionLabel({ children, aside, id, className }: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-center gap-3', className)}>
      <h2 id={id} className="font-cifras text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" aria-hidden />
      {aside != null && <span className="font-cifras text-[11px] text-muted-foreground">{aside}</span>}
    </div>
  );
}

/** Mini-gráfico de tendencia. Los `null` cortan la línea (semana sin dato ≠ cero). */
export function Sparkline({ values, width = 120, height = 36, className }: {
  values: Array<number | null>;
  width?: number;
  height?: number;
  className?: string;
}) {
  const reales = values.filter((v): v is number => v !== null);
  if (reales.length < 2) return null;
  const min = Math.min(...reales);
  const max = Math.max(...reales);
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const puntos = values.map((v, i) => (v === null ? null : ([x(i), y(v)] as const)));

  let d = '';
  puntos.forEach((p, i) => {
    if (!p) return;
    d += `${i === 0 || puntos[i - 1] === null ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)} `;
  });
  const ultimo = [...puntos].reverse().find((p) => p !== null) ?? null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn('shrink-0 text-primary', className)} aria-hidden>
      <path d={d.trim()} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {ultimo && <circle cx={ultimo[0]} cy={ultimo[1]} r={2.5} fill="currentColor" />}
    </svg>
  );
}

/** Barra de progreso fina; el color lo da el tono, no el porcentaje (así lo decide quien la usa). */
export function ToneBar({ value, tone = 'info', className }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-border/70', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', toneFill[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Tarjeta de métrica: etiqueta en mono, cifra grande y su pista. El riel de color a la izquierda dice
 * de un vistazo si el número es bueno, malo o solo informativo.
 */
export function Metric({ label, value, hint, tone = 'neutral', icon: Icon, trend, className }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  icon?: React.ElementType;
  trend?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative min-w-0 overflow-hidden rounded-lg border border-border bg-card p-4 pl-5 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full', toneRail[tone], className)}>
      <div className="flex items-center gap-2 font-cifras text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <span className={cn('text-[1.85rem] font-semibold leading-none tracking-tight tabular-nums', tone === 'neutral' ? 'text-foreground' : toneText[tone])}>{value}</span>
        {trend}
      </div>
      {hint && <p className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}
