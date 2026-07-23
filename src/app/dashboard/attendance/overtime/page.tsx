"use client";

import React, { useState, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { PanelCard } from "@/components/ui/panel-card";
import { StatTile } from "@/components/ui/stat-tile";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { useMonthlyAttendance } from "@/modules/core/hooks/use-attendance";
import { es } from "date-fns/locale";
import { format } from "date-fns";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserSearch, Clock, Briefcase, CalendarDays, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: format(new Date(0, i), "MMMM", { locale: es }),
}));
const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

export default function OvertimeReportPage() {
  const { users } = useAppState();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const { report, loading } = useMonthlyAttendance(
    selectedUserId,
    selectedYear,
    selectedMonth
  );
  
  const selectedUser = useMemo(
    () => (users || []).find((u) => u.id === selectedUserId),
    [users, selectedUserId]
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Reporte de Horas Extras"
        description="Visualiza el detalle de horas extras por trabajador y período."
      />

       <PanelCard
        title="Selección de Reporte"
        description="Elige un trabajador y el período para generar el informe de horas extras."
        icon={UserSearch}
       >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              value={selectedUserId || ""}
              onValueChange={setSelectedUserId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un trabajador..." />
              </SelectTrigger>
              <SelectContent>
                {(users || [])
                  .filter((u) => u.role !== "guardia")
                  .map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select
              value={String(selectedMonth)}
              onValueChange={(val) => setSelectedMonth(Number(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un mes..." />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(selectedYear)}
              onValueChange={(val) => setSelectedYear(Number(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un año..." />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PanelCard>

        {!selectedUserId ? (
            <SurfaceCard interactive={false} className="items-center p-12 text-center text-muted-foreground">
                <UserSearch className="mb-4 h-16 w-16 opacity-50" />
                <h3 className="text-xl font-bold tracking-tight">Selecciona un Trabajador</h3>
                <p className="mt-2">
                    Elige a un trabajador para ver su reporte de horas extras.
                </p>
            </SurfaceCard>
      ) : loading ? (
        <SurfaceCard interactive={false} className="items-center p-12 text-center text-muted-foreground">
          <Loader2 className="mb-4 h-12 w-12 animate-spin" />
          <p className="text-xl font-bold tracking-tight">Calculando horas...</p>
        </SurfaceCard>
      ) : (
        report && selectedUser && (
            <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile label="Horas Extras Totales" value={report.summary.totalOvertimeHours} icon={Clock} tone="success" />
                <StatTile label="Horas Trabajadas" value={report.summary.totalWorkedHours} icon={Briefcase} />
                <StatTile label="Días Hábiles" value={report.summary.totalBusinessDays} icon={CalendarDays} />
            </div>

            <PanelCard
                title={`Desglose Diario — ${selectedUser.name}`}
                description={`Período: ${format(report.period.start, "MMMM yyyy", { locale: es })}`}
                icon={CalendarDays}
            >
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Día</TableHead>
                                <TableHead>Registros</TableHead>
                                <TableHead className="text-right">Horas Trabajadas</TableHead>
                                <TableHead className="text-right font-semibold text-success">Horas Extras</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {report.dailySummaries.map(day => (
                                <TableRow key={day.date} className={cn(!day.isBusinessDay && "bg-muted/50 text-muted-foreground")}>
                                    <TableCell className="font-medium">{day.date}</TableCell>
                                    <TableCell className="capitalize">{day.dayName}</TableCell>
                                    <TableCell>
                                    {day.entries.length > 0 ? (
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                            {day.entries.map(e => (
                                                <span key={e.id} className={cn(e.type === 'in' ? 'text-success' : 'text-danger')}>
                                                    {e.time}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-xs">{day.isBusinessDay ? 'Ausente' : 'Día no hábil'}</span>
                                    )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {day.totalHours > 0 ? day.totalHours.toFixed(2) : '--'}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold text-success">
                                        {day.overtimeHours !== '00:00' ? day.overtimeHours : '--'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
            </PanelCard>

            </>
        )
      )}
    </div>
  );
}
