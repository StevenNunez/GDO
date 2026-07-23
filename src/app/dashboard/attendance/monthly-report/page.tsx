"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { formatCLP } from '@/lib/format';
import { PanelCard } from "@/components/ui/panel-card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { useAuth } from "@/modules/core/contexts/app-provider";
import { useMonthlyAttendance } from "@/modules/core/hooks/use-attendance";
import { getCompanyProfile, type CompanyProfile } from "@/lib/company-profile";
import { es } from "date-fns/locale";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserSearch, FileDown, Loader2, CalendarDays, Calculator, FileBarChart } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/modules/core/hooks/use-toast";
import { computeLiquidacion } from "@/lib/payroll";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: format(new Date(0, i), "MMMM", { locale: es }),
}));
const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);



export default function MonthlyReportPage() {
  const { users } = useAppState();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  const [sueldoBase, setSueldoBase] = useState(0);
  const [gratificacion, setGratificacion] = useState(0);
  const [calcularGratificacion, setCalcularGratificacion] = useState(true);
  const [valorHoraExtra, setValorHoraExtra] = useState(0);
  const [bonoResponsabilidad, setBonoResponsabilidad] = useState(0);
  const [aguinaldo, setAguinaldo] = useState(0);
  const [movilizacion, setMovilizacion] = useState(0);
  const [colacion, setColacion] = useState(0);
  const [afpPorcentaje, setAfpPorcentaje] = useState(10.77);
  const [saludPorcentaje, setSaludPorcentaje] = useState(7.0);
  const [seguroCesantiaPorcentaje, setSeguroCesantiaPorcentaje] = useState(0.6);
  const [anticipo, setAnticipo] = useState(0);

  // Datos de la empresa (logo, razón social, representante legal) para el PDF
  useEffect(() => {
    if (!user?.tenantId) return;
    getCompanyProfile(user.tenantId).then(setCompany);
  }, [user?.tenantId]);

  const selectedUser = useMemo(
    () => (users || []).find((u) => u.id === selectedUserId),
    [users, selectedUserId]
  );

  const { report, loading } = useMonthlyAttendance(
    selectedUserId,
    selectedYear,
    selectedMonth
  );

  // Reset form when worker/period changes; auto-fill baseSalary from profile
  useEffect(() => {
    setSueldoBase(selectedUser?.baseSalary ?? 0);
    setGratificacion(0);
    setValorHoraExtra(0);
    setBonoResponsabilidad(0);
    setAguinaldo(0);
    setMovilizacion(0);
    setColacion(0);
    setAfpPorcentaje(10.77);
    setSaludPorcentaje(7.0);
    setSeguroCesantiaPorcentaje(0.6);
    setAnticipo(0);
  }, [selectedUserId, selectedMonth, selectedYear, selectedUser?.baseSalary]);

  const calculations = useMemo(() => {
    const r = computeLiquidacion({
      sueldoBase: Number(sueldoBase) || 0,
      gratificacionManual: calcularGratificacion ? null : gratificacion,
      overtimeHours: report?.summary.totalOvertimeHoursNumber ?? 0,
      valorHoraExtraManual: valorHoraExtra,
      bonoImponible: bonoResponsabilidad + aguinaldo,
      noImponible: movilizacion + colacion,
      afpPercent: afpPorcentaje,
      saludPercent: saludPorcentaje,
      cesantiaPercent: seguroCesantiaPorcentaje,
      otrosDescuentos: anticipo,
    });
    return {
      valorHE: r.valorHoraExtra,
      horasExtrasCalculadas: r.overtimePay,
      gratificacionCalculada: r.gratificacion,
      totalImponible: r.totalImponible,
      totalNoImponible: r.totalNoImponible,
      totalHaberes: r.totalHaberes,
      descuentoAfp: r.descuentoAfp,
      descuentoSalud: r.descuentoSalud,
      descuentoSeguroCesantia: r.descuentoCesantia,
      totalDescuentosLegales: r.descuentosLegales,
      totalOtrosDescuentos: r.otrosDescuentos,
      totalDescuentos: r.totalDescuentos,
      sueldoLiquido: r.liquido,
    };
  }, [
    sueldoBase, gratificacion, calcularGratificacion, bonoResponsabilidad, aguinaldo,
    report, valorHoraExtra, movilizacion, colacion, afpPorcentaje, saludPorcentaje,
    seguroCesantiaPorcentaje, anticipo
  ]);

  const generatePDF = async () => {
    if (!selectedUser || !report) {
      toast({ variant: 'destructive', title: 'Error', description: 'Faltan datos para generar el PDF.' });
      return;
    }

    const doc = new jsPDF();
    const COLORS = { primary: '#2980b9' };
    const pageWidth = doc.internal.pageSize.getWidth();

    try {
      {
        if (company?.logo) doc.addImage(company.logo, 15, 15, 30, 15);

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('LIQUIDACIÓN DE SUELDO', pageWidth / 2, 25, { align: 'center' });

        autoTable(doc, {
          startY: 40,
          theme: "plain",
          styles: { fontSize: 9 },
          body: [
            ["Razón Social:", company?.name || 'N/A', "Nombre Trabajador:", selectedUser.name],
            ["RUT Empresa:", company?.rut || 'N/A', "RUT Trabajador:", selectedUser.rut || 'N/A'],
            ["AFP:", selectedUser.afp || 'N/A', "Cargo:", selectedUser.cargo || 'N/A'],
            ["Período:", format(report.period.start, "MMMM yyyy", { locale: es }), "Sistema Salud:", selectedUser.tipoSalud || 'N/A'],
          ],
        });

        autoTable(doc, {
          head: [['HABERES', 'MONTO']],
          body: [
            ['Sueldo Base', formatCLP(sueldoBase)],
            ['Gratificación Legal', formatCLP(calculations.gratificacionCalculada)],
            [`Horas Extras (${report.summary.totalOvertimeHours})`, formatCLP(calculations.horasExtrasCalculadas)],
            ['Bono Responsabilidad', formatCLP(bonoResponsabilidad)],
            ['Aguinaldo', formatCLP(aguinaldo)],
            [{ content: 'Total Imponible', styles: { fontStyle: 'bold' } }, { content: formatCLP(calculations.totalImponible), styles: { fontStyle: 'bold' } }],
            ['Movilización', formatCLP(movilizacion)],
            ['Colación', formatCLP(colacion)],
            [{ content: 'Total No Imponible', styles: { fontStyle: 'bold' } }, { content: formatCLP(calculations.totalNoImponible), styles: { fontStyle: 'bold' } }],
            [{ content: 'TOTAL HABERES', styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }, { content: formatCLP(calculations.totalHaberes), styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }],
          ],
          startY: (doc as any).lastAutoTable.finalY + 2,
          theme: 'grid',
          styles: { fontSize: 9 },
          headStyles: { fillColor: COLORS.primary }
        });

        autoTable(doc, {
          head: [['DESCUENTOS', 'MONTO']],
          body: [
            [`Cotización AFP (${afpPorcentaje.toFixed(2)}%)`, formatCLP(calculations.descuentoAfp)],
            [`Cotización Salud (${saludPorcentaje.toFixed(2)}%)`, formatCLP(calculations.descuentoSalud)],
            [`Seguro Cesantía (${seguroCesantiaPorcentaje.toFixed(2)}%)`, formatCLP(calculations.descuentoSeguroCesantia)],
            [{ content: 'Total Descuentos Legales', styles: { fontStyle: 'bold' } }, { content: formatCLP(calculations.totalDescuentosLegales), styles: { fontStyle: 'bold' } }],
            ['Anticipo Quincenal', formatCLP(anticipo)],
            [{ content: 'Total Otros Descuentos', styles: { fontStyle: 'bold' } }, { content: formatCLP(calculations.totalOtrosDescuentos), styles: { fontStyle: 'bold' } }],
            [{ content: 'TOTAL DESCUENTOS', styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }, { content: formatCLP(calculations.totalDescuentos), styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }],
          ],
          startY: (doc as any).lastAutoTable.finalY,
          theme: 'grid',
          styles: { fontSize: 9 },
          headStyles: { fillColor: COLORS.primary }
        });

        autoTable(doc, {
          body: [
            [{ content: 'LÍQUIDO A PAGAR', styles: { fontStyle: 'bold', fontSize: 12 } }, { content: formatCLP(calculations.sueldoLiquido), styles: { fontStyle: 'bold', fontSize: 12, halign: 'right' } }],
          ],
          startY: (doc as any).lastAutoTable.finalY,
          theme: 'grid',
        });

        const finalY = (doc as any).lastAutoTable.finalY;

        // Firma trabajador
        doc.setFontSize(8);
        doc.text('_________________________', 30, finalY + 28);
        doc.text(selectedUser.name, 30, finalY + 33);
        doc.text('Trabajador', 30, finalY + 38);

        // Firma representante legal
        if (company?.representanteSignature) {
          try {
            doc.addImage(company?.representanteSignature, 'PNG', pageWidth - 80, finalY + 10, 50, 18);
          } catch (_) { /* skip if image fails */ }
        }
        doc.text('_________________________', pageWidth - 80, finalY + 28);
        doc.text(company?.representanteLegal || 'Representante Legal', pageWidth - 80, finalY + 33);
        if (company?.representanteRut) doc.text(`R.U.T.: ${company?.representanteRut}`, pageWidth - 80, finalY + 38);

        doc.setFontSize(7);
        doc.text(
          'Certifico que he recibido conforme el pago de mi remuneración y que el presente documento es el fiel reflejo de las operaciones ocurridas en el mes.',
          15, finalY + 48, { maxWidth: pageWidth - 30 }
        );

        doc.save(`Liquidacion_${selectedUser.name.replace(/\s/g, '_')}_${selectedMonth}_${selectedYear}.pdf`);
      }
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el PDF.' });
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Calculadora de Liquidación de Sueldo"
        description="Genera un resumen mensual de asistencia y calcula la liquidación de sueldo."
      />

      <PanelCard
        title="Selección de Reporte"
        icon={UserSearch}
        description="Elige un trabajador y el período para generar el informe."
      >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            <Select value={selectedUserId || ""} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un trabajador..." /></SelectTrigger>
              <SelectContent>
                {(users || [])
                  .filter((u) => u.role !== "guardia")
                  .map((user) => (<SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
              <SelectTrigger><SelectValue placeholder="Selecciona un mes..." /></SelectTrigger>
              <SelectContent>{MONTHS.map((m) => (<SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
              <SelectTrigger><SelectValue placeholder="Selecciona un año..." /></SelectTrigger>
              <SelectContent>{YEARS.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}</SelectContent>
            </Select>
          </div>
      </PanelCard>

      {!selectedUserId ? (
        <SurfaceCard interactive={false} className="items-center p-12 text-center text-muted-foreground">
          <UserSearch className="mb-4 h-16 w-16 opacity-50" />
          <h3 className="text-xl font-bold tracking-tight">Selecciona un Trabajador</h3>
          <p className="mt-2">Elige a un trabajador para ver su reporte y calcular su liquidación.</p>
        </SurfaceCard>
      ) : loading ? (
        <SurfaceCard interactive={false} className="items-center p-12 text-center text-muted-foreground">
          <Loader2 className="mb-4 h-12 w-12 animate-spin" />
          <p className="text-xl font-bold tracking-tight">Cargando reporte...</p>
        </SurfaceCard>
      ) : (
        report && selectedUser && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-1 space-y-8">
              <PanelCard
                title="Resumen de Asistencia"
                description={`Período: ${format(report.period.start, "MMMM yyyy", { locale: es })}`}
                icon={CalendarDays}
                contentClassName="grid grid-cols-2 gap-4 px-6 pb-6 text-center"
              >
                  <div className="p-2 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Días Hábiles</p><p className="text-xl font-bold">{report.summary.totalBusinessDays}</p></div>
                  <div className="p-2 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Días Trabajados</p><p className="text-xl font-bold">{report.summary.workedDays}</p></div>
                  <div className="p-2 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Ausencias</p><p className="text-xl font-bold text-danger">{report.summary.absentDays}</p></div>
                  <div className="p-2 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Atrasos (min)</p><p className="text-xl font-bold text-warning">{report.summary.totalDelayMinutes}</p></div>
                  <div className="p-2 bg-muted rounded-lg col-span-2"><p className="text-xs text-muted-foreground">Horas Extras</p><p className="text-xl font-bold text-success">{report.summary.totalOvertimeHours}</p></div>
              </PanelCard>

              <PanelCard
                title="Datos para Cálculo"
                description="Ingresa los valores para la liquidación."
                icon={Calculator}
                contentClassName="space-y-4 px-6 pb-6"
              >
                  <h4 className="font-semibold text-sm text-primary">Haberes</h4>
                  <div className="space-y-2">
                    <Label htmlFor="sueldoBase">Sueldo Base</Label>
                    <Input id="sueldoBase" type="number" value={sueldoBase} onChange={e => setSueldoBase(Number(e.target.value))} />
                    {selectedUser.baseSalary && (
                      <p className="text-xs text-muted-foreground">Auto-completado desde el perfil del trabajador.</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="calc-grat" checked={calcularGratificacion} onCheckedChange={setCalcularGratificacion} />
                    <Label htmlFor="calc-grat">Calcular Gratificación Legal (25%)</Label>
                  </div>
                  {!calcularGratificacion && (
                    <div className="space-y-2">
                      <Label htmlFor="gratificacion">Gratificación Manual</Label>
                      <Input id="gratificacion" type="number" value={gratificacion} onChange={e => setGratificacion(Number(e.target.value))} />
                    </div>
                  )}
                  <div className="space-y-2"><Label htmlFor="bonoResponsabilidad">Bono Responsabilidad</Label><Input id="bonoResponsabilidad" type="number" value={bonoResponsabilidad} onChange={e => setBonoResponsabilidad(Number(e.target.value))} /></div>
                  <div className="space-y-2"><Label htmlFor="aguinaldo">Aguinaldo</Label><Input id="aguinaldo" type="number" value={aguinaldo} onChange={e => setAguinaldo(Number(e.target.value))} /></div>
                  <div className="space-y-2"><Label htmlFor="valorHoraExtra">Valor Hora Extra (si es distinto al legal)</Label><Input id="valorHoraExtra" type="number" value={valorHoraExtra} onChange={e => setValorHoraExtra(Number(e.target.value))} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label htmlFor="movilizacion">Movilización</Label><Input id="movilizacion" type="number" value={movilizacion} onChange={e => setMovilizacion(Number(e.target.value))} /></div>
                    <div className="space-y-2"><Label htmlFor="colacion">Colación</Label><Input id="colacion" type="number" value={colacion} onChange={e => setColacion(Number(e.target.value))} /></div>
                  </div>
                  <hr className="my-4" />
                  <h4 className="font-semibold text-sm text-destructive">Descuentos</h4>
                  {selectedUser.afp && (
                    <p className="text-xs text-muted-foreground">AFP registrada: <span className="font-semibold">{selectedUser.afp}</span></p>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label htmlFor="afp">AFP (%)</Label><Input id="afp" type="number" step="0.01" value={afpPorcentaje} onChange={e => setAfpPorcentaje(Number(e.target.value))} /></div>
                    <div className="space-y-2"><Label htmlFor="salud">Salud (%)</Label><Input id="salud" type="number" step="0.01" value={saludPorcentaje} onChange={e => setSaludPorcentaje(Number(e.target.value))} /></div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="seguroCesantia">Seguro Cesantía (%)</Label><Input id="seguroCesantia" type="number" step="0.01" value={seguroCesantiaPorcentaje} onChange={e => setSeguroCesantiaPorcentaje(Number(e.target.value))} /></div>
                  <div className="space-y-2"><Label htmlFor="anticipo">Anticipo Quincenal</Label><Input id="anticipo" type="number" value={anticipo} onChange={e => setAnticipo(Number(e.target.value))} /></div>
              </PanelCard>
            </div>

            <PanelCard
              className="lg:col-span-2"
              title={`Liquidación para ${selectedUser.name}`}
              description={`Período: ${format(report.period.start, "MMMM yyyy", { locale: es })}`}
              icon={FileBarChart}
              contentClassName="space-y-4 px-6 pb-6"
              actions={<Button onClick={generatePDF}><FileDown className="mr-2 h-4 w-4" />Descargar PDF</Button>}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg border-b pb-2 mb-2">HABERES</h3>
                    <div className="flex justify-between"><span>Sueldo Base:</span> <span>{formatCLP(sueldoBase)}</span></div>
                    <div className="flex justify-between"><span>Gratificación Legal:</span> <span>{formatCLP(calculations.gratificacionCalculada)}</span></div>
                    <div className="flex justify-between"><span>Horas Extras ({report.summary.totalOvertimeHours}):</span> <span>{formatCLP(calculations.horasExtrasCalculadas)}</span></div>
                    <div className="flex justify-between"><span>Bono Responsabilidad:</span> <span>{formatCLP(bonoResponsabilidad)}</span></div>
                    <div className="flex justify-between"><span>Aguinaldo:</span> <span>{formatCLP(aguinaldo)}</span></div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Total Imponible:</span> <span>{formatCLP(calculations.totalImponible)}</span></div>
                    <div className="flex justify-between pt-2"><span>Movilización:</span> <span>{formatCLP(movilizacion)}</span></div>
                    <div className="flex justify-between"><span>Colación:</span> <span>{formatCLP(colacion)}</span></div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Total No Imponible:</span> <span>{formatCLP(calculations.totalNoImponible)}</span></div>
                    <div className="flex justify-between font-bold text-lg bg-muted p-2 rounded-md mt-4"><span>TOTAL HABERES:</span> <span>{formatCLP(calculations.totalHaberes)}</span></div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg border-b pb-2 mb-2">DESCUENTOS</h3>
                    <div className="flex justify-between"><span>Cotización AFP ({afpPorcentaje.toFixed(2)}%):</span> <span>{formatCLP(calculations.descuentoAfp)}</span></div>
                    <div className="flex justify-between"><span>Cotización Salud ({saludPorcentaje.toFixed(2)}%):</span> <span>{formatCLP(calculations.descuentoSalud)}</span></div>
                    <div className="flex justify-between"><span>Seguro Cesantía ({seguroCesantiaPorcentaje.toFixed(2)}%):</span> <span>{formatCLP(calculations.descuentoSeguroCesantia)}</span></div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Total Descuentos Legales:</span> <span>{formatCLP(calculations.totalDescuentosLegales)}</span></div>
                    <div className="flex justify-between pt-2"><span>Anticipo Quincenal:</span> <span>{formatCLP(anticipo)}</span></div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Total Otros Descuentos:</span> <span>{formatCLP(calculations.totalOtrosDescuentos)}</span></div>
                    <div className="flex justify-between font-bold text-lg bg-muted p-2 rounded-md mt-4"><span>TOTAL DESCUENTOS:</span> <span className="text-destructive">{formatCLP(calculations.totalDescuentos)}</span></div>
                  </div>
                </div>
                <div className="pt-6 text-center">
                  <h3 className="text-muted-foreground font-semibold">SUELDO LÍQUIDO A PAGAR</h3>
                  <p className="text-4xl font-bold text-primary tracking-tight">{formatCLP(calculations.sueldoLiquido)}</p>
                </div>
            </PanelCard>
          </div>
        )
      )}
    </div>
  );
}
