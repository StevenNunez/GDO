"use client";

import React, { useMemo } from 'react';
import { PanelCard } from '@/components/ui/panel-card';
import { AlertCircle, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import { startOfMonth, format, getDaysInMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';
import { formatCLP } from '@/lib/format';
import { computeLiquidacion } from '@/lib/payroll';

// Tasas de referencia para la estimación del trabajador.
const AFP_RATE = 10.77;
const SALUD_RATE = 7;
const CESANTIA_RATE = 0.6;

export default function WorkerLiquidacionPage() {
  const { user } = useAuth();
  const { attendanceLogs, salaryAdvances } = useAppState();

  const liq = useMemo(() => {
    if (!user) return null;
    const baseSalary = user.baseSalary ?? 0;
    if (baseSalary === 0) return null;

    const today = new Date();
    const start = startOfMonth(today);
    const totalDays = getDaysInMonth(today);

    const workedDaysSet = new Set<string>();
    (attendanceLogs ?? []).forEach(log => {
      if (log.userId === user.id) {
        const d = toDate(log.timestamp);
        if (d && d >= start && d <= today) workedDaysSet.add(d.toDateString());
      }
    });
    const daysWorked = workedDaysSet.size;

    const advancesPaid = (salaryAdvances ?? [])
      .filter(adv => {
        if (adv.workerId !== user.id || adv.status !== 'approved') return false;
        const d = toDate(adv.requestedAt);
        return d && d >= start;
      })
      .reduce((sum, adv) => sum + adv.amount, 0);

    const r = computeLiquidacion({
      sueldoBase: baseSalary,
      afpPercent: AFP_RATE,
      saludPercent: SALUD_RATE,
      cesantiaPercent: CESANTIA_RATE,
      otrosDescuentos: advancesPaid,
    });

    return {
      sueldoBase: baseSalary,
      gratificacion: r.gratificacion,
      haberImponible: r.totalImponible,
      descAfp: r.descuentoAfp,
      descSalud: r.descuentoSalud,
      descCesantia: r.descuentoCesantia,
      totalDescuentos: r.descuentosLegales,
      advancesPaid,
      haberLiquido: r.liquido,
      daysWorked,
      totalDays,
      mes: format(today, "MMMM yyyy", { locale: es }),
    };
  }, [user, attendanceLogs, salaryAdvances]);

  const initials = (user?.name ?? 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-md mx-auto space-y-5 pb-10">
      <div className="flex justify-between items-center pt-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mis Liquidaciones</h2>
          <p className="text-muted-foreground text-sm capitalize">{liq?.mes ?? format(new Date(), "MMMM yyyy", { locale: es })}</p>
        </div>
        <div className="h-11 w-11 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
          {initials}
        </div>
      </div>

      {!liq ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-card py-12 text-center">
            <Info className="h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">Sin sueldo base configurado</p>
            <p className="text-sm text-muted-foreground">Contacta a tu administrador para que configuren tu sueldo base.</p>
        </div>
      ) : (
        <>
          <PanelCard
            title="Haberes"
            description={`${liq.daysWorked} días trabajados de ${liq.totalDays} en el mes`}
            icon={TrendingUp}
            tone="success"
            contentClassName="space-y-0"
          >
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-sm">Sueldo base</span>
                <span className="font-medium text-sm">{formatCLP(liq.sueldoBase)}</span>
              </div>
              <div className="flex justify-between items-start py-3 border-b">
                <div>
                  <p className="text-sm">Gratificación legal</p>
                  <p className="text-[11px] text-muted-foreground">Art. 50 · 25% del sueldo, tope mensual</p>
                </div>
                <span className="font-medium text-sm">{formatCLP(liq.gratificacion)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between rounded-lg bg-primary/5 px-3 py-3">
                <span className="text-sm font-semibold">Haber bruto imponible</span>
                <span className="font-bold">{formatCLP(liq.haberImponible)}</span>
              </div>
          </PanelCard>

          <PanelCard
            title="Descuentos previsionales"
            description="Cotizaciones obligatorias sobre el haber imponible"
            icon={TrendingDown}
            tone="danger"
            contentClassName="space-y-0"
          >
              <div className="flex justify-between items-start py-3 border-b">
                <div>
                  <p className="text-sm">AFP</p>
                  <p className="text-[11px] text-muted-foreground">{AFP_RATE.toFixed(2)}% del haber imponible</p>
                </div>
                <span className="text-sm text-danger">- {formatCLP(liq.descAfp)}</span>
              </div>
              <div className="flex justify-between items-start py-3 border-b">
                <div>
                  <p className="text-sm">Salud (Fonasa/Isapre)</p>
                  <p className="text-[11px] text-muted-foreground">{SALUD_RATE.toFixed(1)}% del haber imponible</p>
                </div>
                <span className="text-sm text-danger">- {formatCLP(liq.descSalud)}</span>
              </div>
              <div className="flex justify-between items-start py-3 border-b">
                <div>
                  <p className="text-sm">Seguro de cesantía</p>
                  <p className="text-[11px] text-muted-foreground">{CESANTIA_RATE.toFixed(1)}% del haber imponible</p>
                </div>
                <span className="text-sm text-danger">- {formatCLP(liq.descCesantia)}</span>
              </div>
              {liq.advancesPaid > 0 && (
                <div className="flex justify-between items-start py-3 border-b">
                  <div>
                    <p className="text-sm">Adelanto de sueldo</p>
                    <p className="text-[11px] text-muted-foreground">Aprobado y descontado este mes</p>
                  </div>
                  <span className="text-sm text-danger">- {formatCLP(liq.advancesPaid)}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between rounded-lg bg-danger/10 px-3 py-3">
                <span className="text-sm font-semibold">Total descuentos</span>
                <span className="font-bold text-danger">- {formatCLP(liq.totalDescuentos + liq.advancesPaid)}</span>
              </div>
          </PanelCard>

          <div className="rounded-3xl border border-success/30 bg-success/5 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Haber líquido estimado</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Lo que recibirías a fin de mes</p>
                </div>
                <span className="text-3xl font-extrabold text-success">{formatCLP(liq.haberLiquido)}</span>
              </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-subtle p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-warning">
              Valores estimados basados en tu sueldo base y días trabajados. La liquidación final puede incluir bonos, colación, movilización u otros conceptos. El porcentaje de AFP varía según tu institución previsional.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
