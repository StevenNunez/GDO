"use client";

import React, { useMemo } from 'react';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { CalendarCheck, ArrowDownLeft, ArrowUpRight, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import { startOfMonth, format, formatDistanceToNow, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';

const formatTime = (date: any) => {
  const d = toDate(date);
  if (!d) return '--:--';
  return format(d, 'HH:mm');
};

const formatRelative = (date: any) => {
  const d = toDate(date);
  if (!d) return 'N/A';
  if (isToday(d)) return 'Hoy';
  return formatDistanceToNow(d, { addSuffix: true, locale: es });
};

export default function WorkerAsistenciaPage() {
  const { user } = useAuth();
  const { attendanceLogs, dailyTalks } = useAppState();

  const monthlyAttendance = useMemo(() => {
    if (!user || !attendanceLogs) return [];
    const today = new Date();
    const start = startOfMonth(today);

    const byDate = new Map<string, { in?: Date; out?: Date }>();
    [...(attendanceLogs ?? [])]
      .filter(log => {
        if (log.userId !== user.id) return false;
        const d = toDate(log.timestamp);
        return d && d >= start && d <= today;
      })
      .sort((a, b) => (toDate(a.timestamp)?.getTime() ?? 0) - (toDate(b.timestamp)?.getTime() ?? 0))
      .forEach(log => {
        const d = toDate(log.timestamp)!;
        const key = d.toDateString();
        const entry = byDate.get(key) ?? {};
        if (log.type === 'in') entry.in = d;
        else if (log.type === 'out') entry.out = d;
        byDate.set(key, entry);
      });

    return Array.from(byDate.entries())
      .map(([key, val]) => ({ dateKey: key, date: new Date(key), in: val.in, out: val.out }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [attendanceLogs, user]);

  const signedTalks = useMemo(() => {
    if (!user || !dailyTalks) return [];
    return (dailyTalks ?? [])
      .filter(t => t.asistentes.some(a => a.id === user.id && a.signed))
      .sort((a, b) => (b.fecha as any) - (a.fecha as any))
      .slice(0, 10);
  }, [dailyTalks, user]);

  const daysWorked = monthlyAttendance.length;
  const mesActual = format(new Date(), "MMMM yyyy", { locale: es });

  return (
    <div className="max-w-md mx-auto space-y-5 pb-10">
      <div className="pt-4">
        <h2 className="text-2xl font-bold tracking-tight">Mi Asistencia</h2>
        <p className="text-muted-foreground text-sm capitalize">{mesActual}</p>
      </div>

      <PanelCard
        title="Registro del mes"
        description="Entradas y salidas registradas este mes"
        icon={CalendarCheck}
        actions={<StatusBadge tone="neutral" className="font-mono">{daysWorked} días</StatusBadge>}
      >
          {monthlyAttendance.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <CalendarCheck className="h-8 w-8" />
              <p className="text-sm">Sin registros este mes</p>
            </div>
          ) : (
            <div className="space-y-1">
              {monthlyAttendance.map(entry => {
                const mins = entry.in && entry.out
                  ? Math.round((entry.out.getTime() - entry.in.getTime()) / 60000)
                  : null;
                return (
                  <div key={entry.dateKey} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="text-center w-9 shrink-0">
                        <p className="text-[10px] text-muted-foreground capitalize">{format(entry.date, 'EEE', { locale: es })}</p>
                        <p className="font-bold text-sm">{format(entry.date, 'd')}</p>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <ArrowDownLeft className="h-3 w-3 text-success shrink-0" />
                          <span className="text-xs">{entry.in ? formatTime(entry.in) : <span className="text-muted-foreground">--:--</span>}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ArrowUpRight className="h-3 w-3 text-warning shrink-0" />
                          <span className="text-xs">{entry.out ? formatTime(entry.out) : <span className="text-muted-foreground">--:--</span>}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {mins !== null ? (
                        <span className="text-xs font-medium">
                          {Math.floor(mins / 60)}h{mins % 60 > 0 ? ` ${mins % 60}m` : ''}
                        </span>
                      ) : (
                        <StatusBadge tone="neutral" className="text-[10px]">Incompleto</StatusBadge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </PanelCard>

      {signedTalks.length > 0 && (
        <PanelCard
          title="Charlas de seguridad firmadas"
          description="Historial de charlas confirmadas"
          icon={ClipboardCheck}
          contentClassName="space-y-2"
          actions={<StatusBadge tone="neutral" className="font-mono">{signedTalks.length}</StatusBadge>}
        >
            {signedTalks.map(talk => {
              const info = talk.asistentes.find(a => a.id === user?.id);
              return (
                <div key={talk.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="h-6 w-6 rounded-full bg-success-subtle flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{talk.temas}</p>
                    <p className="text-[11px] text-muted-foreground">Firmada {formatRelative(info?.signedAt)}</p>
                  </div>
                </div>
              );
            })}
        </PanelCard>
      )}
    </div>
  );
}
