

"use client";

import React, { useState, useMemo, useCallback } from "react";
import dynamic from 'next/dynamic';
import { PageHeader } from "@/components/page-header";
import { PanelCard } from "@/components/ui/panel-card";
import { StatTile } from "@/components/ui/stat-tile";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { User, AttendanceLog } from "@/modules/core/lib/data";
import { calculateDailySummary, type DailySummary } from "@/lib/attendance";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  CalendarIcon,
  UserSearch,
  AlertTriangle,
  Briefcase,
  Clock,
  CalendarDays,
  Edit,
  ChevronsUpDown,
  Check,
  PlusCircle,
} from "lucide-react";

import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EditAttendanceLogDialog } from "@/components/admin/edit-attendance-log-dialog";
import { toDate } from "@/lib/date-utils";

const Calendar = dynamic(() => import('@/components/ui/calendar').then(mod => mod.Calendar), { ssr: false });

const WEEK_START_ON = 1; // Lunes

export default function AttendanceReportPage() {
  const { users, attendanceLogs, can } = useAppState();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<
    (Partial<AttendanceLog> & { forDate?: Date; forUser?: User }) | null
  >(null);

  const userMap = useMemo(
    () => new Map<string, string>((users || []).map((u: User) => [u.id, u.name])),
    [users]
  );

  const weekInterval = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: WEEK_START_ON });
    const end = endOfWeek(selectedDate, { weekStartsOn: WEEK_START_ON });
    return { start, end };
  }, [selectedDate]);

  const weekDays = useMemo(() => eachDayOfInterval(weekInterval), [weekInterval]);

  const weeklyReport = useMemo((): DailySummary[] => {
    if (!selectedUserId || !users || !attendanceLogs) return [];

    const userLogs = attendanceLogs.filter(
      (log: AttendanceLog) => log.userId === selectedUserId
    );

    return weekDays.map((day) => {
      const dayString = format(day, "yyyy-MM-dd");
      const logsForDay = userLogs
        .filter((log: AttendanceLog) => log.date === dayString)
        .sort(
          (a: AttendanceLog, b: AttendanceLog) =>
            (toDate(a.timestamp) || new Date(a.timestamp)).getTime() -
            (toDate(b.timestamp) || new Date(b.timestamp)).getTime()
        );
      return calculateDailySummary(logsForDay, day);
    });
  }, [selectedUserId, weekDays, attendanceLogs, users]);

  const formatHoursDecimal = (decimalHours: number) => {
    if (typeof decimalHours !== "number" || isNaN(decimalHours)) {
      return "00:00";
    }
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}`;
  };

  const weeklyTotals = useMemo(() => {
    const totalHoursDecimal = weeklyReport.reduce((acc, day) => acc + day.totalHours, 0);
    const totalDelays = weeklyReport.reduce((acc, day) => acc + day.delayMinutes, 0);
    
    const overtimeMillis = weeklyReport.reduce((acc, day) => {
      const [hours, minutes] = day.overtimeHours.split(":").map(Number);
      return acc + hours * 60 * 60 * 1000 + minutes * 60 * 1000;
    }, 0);

    const overtimeHours = Math.floor(overtimeMillis / (1000 * 60 * 60));
    const overtimeMinutes = Math.floor((overtimeMillis % (1000 * 60 * 60)) / (1000 * 60));
    
    return { 
      totalHours: formatHoursDecimal(totalHoursDecimal), 
      totalDelays, 
      overtimeHours: `${overtimeHours.toString().padStart(2, "0")}:${overtimeMinutes.toString().padStart(2, "0")}`
    };
  }, [weeklyReport]);

  const selectedUser = useMemo(
    () => (users || []).find((u: User) => u.id === selectedUserId),
    [selectedUserId, users]
  );

  const handleAddNewEntry = useCallback(
    (day: DailySummary) => {
      if (!selectedUser) return;
      setEditingLog({
        forDate: day.dayDate,
        forUser: selectedUser,
      });
    },
    [selectedUser]
  );

  const handleEditEntry = useCallback(
    (entry: AttendanceLog & { time: string; dateObj: Date }, day: DailySummary) => {
      if (!selectedUser) return;
      setEditingLog({
        ...entry,
        forDate: day.dayDate,
        forUser: selectedUser,
      });
    },
    [selectedUser]
  );

  return (
    <div className="flex flex-col gap-8">
      {editingLog && (
        <EditAttendanceLogDialog
          log={editingLog}
          isOpen={!!editingLog}
          onClose={() => setEditingLog(null)}
        />
      )}

      <PageHeader
        title="Reporte Semanal de Asistencia"
        description="Selecciona un trabajador y una semana para ver el detalle de horas trabajadas, atrasos y horas extras (Ley 21.561 - 44 horas semanales)."
      />

      <PanelCard title="Filtros del Reporte" icon={UserSearch}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Trabajador</label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-label="Seleccionar trabajador"
                    className="w-full justify-between"
                  >
                    <span className="truncate">
                      {selectedUserId
                        ? (users || []).find((u: User) => u.id === selectedUserId)?.name ??
                          "Selecciona un trabajador..."
                        : "Selecciona un trabajador..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar trabajador..." />
                    <CommandList>
                      <CommandEmpty>No se encontró el trabajador.</CommandEmpty>
                      <CommandGroup>
                        {(users || [])
                          ?.filter((u: User) => u.role !== "guardia")
                          .map((user: User) => (
                            <CommandItem
                              key={user.id}
                              value={user.name}
                              onSelect={() => {
                                setSelectedUserId(user.id);
                                setPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedUserId === user.id
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              {user.name}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-medium">Semana del</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    aria-label="Seleccionar semana"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(weekInterval.start, "dd 'de' MMM", { locale: es })} -{" "}
                    {format(weekInterval.end, "dd 'de' MMM, yyyy", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
      </PanelCard>

      {selectedUser ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile label="Horas Trabajadas" value={weeklyTotals.totalHours} icon={Briefcase} />
            <StatTile label="Minutos de Atraso" value={weeklyTotals.totalDelays} icon={AlertTriangle} tone="warning" />
            <StatTile label="Horas Extras" value={weeklyTotals.overtimeHours} icon={Clock} tone="success" />
          </div>

          <PanelCard
            title={`Detalle Diario — ${selectedUser.name}`}
            description="Horas trabajadas, atrasos y horas extras de la semana seleccionada."
            icon={CalendarDays}
          >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Día</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Registros</TableHead>
                    <TableHead className="text-right">Atraso (min)</TableHead>
                    <TableHead className="text-right">Horas</TableHead>
                    <TableHead className="text-right">Extras</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyReport.map((day) => (
                    <TableRow
                      key={day.date}
                      className={day.isAbsent || !day.isBusinessDay ? "bg-muted/30" : ""}
                    >
                      <TableCell className="font-medium capitalize">
                        {day.dayName}
                      </TableCell>
                      <TableCell>{day.date}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {day.entries.length === 0 ? (
                            <span className="text-muted-foreground text-xs">
                              {day.isBusinessDay ? "Ausente" : "Día no hábil"}
                            </span>
                          ) : (
                            day.entries.map((e, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <span
                                  className={
                                    e.type === "in"
                                      ? "text-success"
                                      : "text-danger"
                                  }
                                >
                                  {e.time}
                                </span>
                                {e.modifiedAt && e.modifiedBy && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <AlertTriangle
                                          className="h-3 w-3 text-warning"
                                          aria-label="Registro modificado"
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>
                                          Original:{" "}
                                          {e.originalTimestamp
                                            ? format(
                                                toDate(e.originalTimestamp) || new Date(e.originalTimestamp),
                                                "HH:mm"
                                              )
                                            : "N/A"}
                                        </p>
                                        <p>
                                          Modificado por:{" "}
                                          {userMap.get(e.modifiedBy) ?? "Desconocido"}
                                        </p>
                                        <p>
                                          Fecha mod:{" "}
                                          {format(
                                            toDate(e.modifiedAt) || new Date(e.modifiedAt),
                                            "dd/MM/yy HH:mm"
                                          )}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {can('attendance:edit') && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={() => {
                                      handleEditEntry(e, day);
                                    }}
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))
                          )}
                          {can('attendance:edit') && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6 ml-2"
                              onClick={() => handleAddNewEntry(day)}
                              aria-label="Agregar nuevo registro"
                            >
                              <PlusCircle className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {day.delayMinutes > 0 ? (
                          <span className="text-warning font-bold">
                            {day.delayMinutes}
                          </span>
                        ) : (
                          "0"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatHoursDecimal(day.totalHours)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-success">
                        {day.overtimeHours}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          </PanelCard>
        </>
      ) : (
        <SurfaceCard interactive={false} className="items-center p-12 text-center text-muted-foreground">
          <UserSearch className="mb-4 h-16 w-16 opacity-50" />
          <h3 className="text-xl font-bold tracking-tight">Selecciona un Trabajador</h3>
          <p className="mt-2">
            Elige un trabajador del menú de arriba para generar su reporte de asistencia.
          </p>
        </SurfaceCard>
      )}
    </div>
  );
}
