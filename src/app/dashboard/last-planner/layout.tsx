"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { cn } from '@/lib/utils';

const steps = [ ['Resumen', ''], ['Unidades', '/unidades'], ['Calendario', '/calendario'], ['Tren', '/tren'], ['Programa semanal', '/programacion'], ['Parte diario', '/parte-diario'], ['Análisis', '/analisis'] ];

export default function LastPlannerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentProjectId, can } = useAppState();
  const activeLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const link = activeLink.current;
    if (!link) return;
    const frame = requestAnimationFrame(() => {
      link.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  return (
    <div className="mx-auto max-w-[1440px]">
      {(can('planning:view') || can('planning:manage')) && <nav aria-label="Pasos de Last Planner" className="mb-6 flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-border/50 bg-card/80 p-1.5">{steps.map(([label, slug]) => {
        const href = `/dashboard/last-planner${slug}`;
        const active = pathname === href;
        return <Link ref={active ? activeLink : undefined} key={href} href={href} aria-current={active ? 'page' : undefined} className={cn('flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring', active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{label}</Link>;
      })}</nav>}
      <div key={currentProjectId ?? 'no-project'}>{children}</div>
    </div>
  );
}
