"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import dynamic from 'next/dynamic';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { formatCLP } from '@/lib/format';
import { PanelCard } from '@/components/ui/panel-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/modules/core/hooks/use-toast';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { getCompanyProfile, type CompanyProfile } from '@/lib/company-profile';
import { Loader2, Calculator, ChevronsUpDown, Check, Calendar as CalendarIcon, FileDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { toDate } from '@/lib/date-utils';
import { computeFiniquito, TERMINATION_CAUSES, type TerminationCause } from '@/lib/payroll';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { User } from '@/modules/core/lib/data';

const Calendar = dynamic(() => import('@/components/ui/calendar').then(mod => mod.Calendar), { ssr: false });

const severanceSchema = z.object({
  workerId: z.string({ required_error: 'Debes seleccionar un trabajador.' }),
  lastSalary: z.coerce.number().min(1, 'El sueldo es requerido.'),
  startDate: z.date({ required_error: 'La fecha de inicio es requerida.' }),
  endDate: z.date({ required_error: 'La fecha de término es requerida.' }),
  terminationCause: z.string({ required_error: 'La causal de término es requerida.' }),
  noticeGiven: z.boolean().default(false),
  vacationDaysTaken: z.coerce.number().min(0, 'Los días tomados no pueden ser negativos.').default(0),
});

type SeveranceFormData = z.infer<typeof severanceSchema>;

export default function SeverancePage() {
  const { users } = useAppState();
  const { user } = useAuth();
  const { toast } = useToast();
  const [workerPopoverOpen, setWorkerPopoverOpen] = useState(false);
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  // Datos de la empresa (logo, razón social, representante legal) para el PDF
  useEffect(() => {
    if (!user?.tenantId) return;
    getCompanyProfile(user.tenantId).then(setCompany);
  }, [user?.tenantId]);

  const { control, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<SeveranceFormData>({
    resolver: zodResolver(severanceSchema),
    defaultValues: {
      lastSalary: 0,
      startDate: new Date(),
      endDate: new Date(),
      terminationCause: '',
      noticeGiven: false,
      vacationDaysTaken: 0,
    }
  });

  const selectedWorkerId = watch('workerId');
  const selectedWorker = useMemo(() => (users || []).find((u: User) => u.id === selectedWorkerId), [selectedWorkerId, users]);

  useEffect(() => {
    if (selectedWorker) {
      if (selectedWorker.fechaIngreso) {
        const startDate = toDate(selectedWorker.fechaIngreso) || new Date(selectedWorker.fechaIngreso as any);
        setValue('startDate', startDate);
      }
      if (selectedWorker.baseSalary) {
        setValue('lastSalary', selectedWorker.baseSalary);
      }
    }
  }, [selectedWorker, setValue]);

  const onSubmit = (data: SeveranceFormData) => {
    setCalculationResult(
      computeFiniquito({
        lastSalary: data.lastSalary,
        startDate: data.startDate,
        endDate: data.endDate,
        terminationCause: data.terminationCause as TerminationCause,
        noticeGiven: data.noticeGiven,
        vacationDaysTaken: data.vacationDaysTaken,
      })
    );
  };

  const handleGeneratePDF = async () => {
    if (!calculationResult || !selectedWorker) {
      toast({ title: "Error", description: "Calcula el finiquito primero y selecciona un trabajador.", variant: "destructive" });
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
        doc.text('FINIQUITO DE CONTRATO DE TRABAJO', pageWidth / 2, 25, { align: 'center' });

        autoTable(doc, {
          startY: 40,
          theme: "plain",
          styles: { fontSize: 9 },
          body: [
            ["Razón Social:", company?.name || 'N/A', "Nombre Trabajador:", selectedWorker.name],
            ["RUT Empresa:", company?.rut || 'N/A', "RUT Trabajador:", selectedWorker.rut || 'N/A'],
            ["Representante Legal:", company?.representanteLegal || 'N/A', "Fecha Ingreso:", format(watch('startDate'), "dd/MM/yyyy")],
            ["RUT Representante:", company?.representanteRut || 'N/A', "Fecha Término:", format(watch('endDate'), "dd/MM/yyyy")],
          ],
        });

        autoTable(doc, {
          head: [['CONCEPTO', 'MONTO']],
          body: [
            [`Indemnización por ${calculationResult.yearsForIndemnity} Años de Servicio`, formatCLP(calculationResult.indemnityPerYear)],
            ['Indemnización Sustitutiva del Aviso Previo', formatCLP(calculationResult.noticeIndemnity)],
            [`Feriado Proporcional (${calculationResult.pendingVacationDays.toFixed(2)} días)`, formatCLP(calculationResult.vacationPay)],
            [{ content: 'TOTAL FINIQUITO', styles: { fontStyle: 'bold' } }, { content: formatCLP(calculationResult.totalSeverance), styles: { fontStyle: 'bold' } }],
          ],
          startY: (doc as any).lastAutoTable.finalY + 5,
          theme: 'grid',
          styles: { fontSize: 10 },
          headStyles: { fillColor: COLORS.primary }
        });

        const finalY = (doc as any).lastAutoTable.finalY;

        // Declaración legal
        doc.setFontSize(9);
        const city = 'Chile';
        const declarationText = `En ${city}, a ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}, ${selectedWorker.name}, RUT ${selectedWorker.rut || 'N/A'}, declara haber recibido de ${company?.name || 'la empresa'}, RUT ${company?.rut || 'N/A'}, representada por ${company?.representanteLegal || 'su representante legal'}, RUT ${company?.representanteRut || 'N/A'}, la suma de ${formatCLP(calculationResult.totalSeverance)}, por concepto del total de los haberes que le corresponden por el término de su contrato de trabajo. Declara, asimismo, no tener reclamo alguno que formular en contra de la empresa.`;
        const splitText = doc.splitTextToSize(declarationText, pageWidth - 30);
        doc.text(splitText, 15, finalY + 12);

        const signaturesY = finalY + 12 + splitText.length * 5 + 15;

        // Firma trabajador
        doc.setFontSize(8);
        doc.text('_________________________', 25, signaturesY + 20);
        doc.text(selectedWorker.name, 25, signaturesY + 25);
        doc.text(selectedWorker.rut ? `R.U.T.: ${selectedWorker.rut}` : '', 25, signaturesY + 30);
        doc.text('Trabajador', 25, signaturesY + 35);

        // Firma representante legal
        if (company?.representanteSignature) {
          try {
            doc.addImage(company?.representanteSignature, 'PNG', pageWidth - 85, signaturesY - 5, 55, 22);
          } catch (_) { /* skip if image invalid */ }
        }
        doc.text('_________________________', pageWidth - 85, signaturesY + 20);
        doc.text(company?.representanteLegal || 'Representante Legal', pageWidth - 85, signaturesY + 25);
        if (company?.representanteRut) doc.text(`R.U.T.: ${company?.representanteRut}`, pageWidth - 85, signaturesY + 30);
        if (company?.representanteCargo) doc.text(company?.representanteCargo, pageWidth - 85, signaturesY + 35);

        doc.save(`Finiquito_${selectedWorker.name.replace(/\s/g, '_')}.pdf`);
      }
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el PDF.' });
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Generador de Finiquito" description="Calcula el finiquito de un trabajador según la normativa chilena actualizada." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <PanelCard
          className="lg:col-span-1"
          title="Datos para el Cálculo"
          description="Ingresa la información del trabajador y el término de contrato."
          icon={Calculator}
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Controller
                name="workerId"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Trabajador</Label>
                    <Popover open={workerPopoverOpen} onOpenChange={setWorkerPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between">
                          <span className="truncate">{(users || []).find((u: User) => u.id === field.value)?.name || "Selecciona un trabajador..."}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                          <CommandInput placeholder="Buscar trabajador..." />
                          <CommandList>
                            <CommandEmpty>No se encontró el trabajador.</CommandEmpty>
                            <CommandGroup>
                              {(users || []).filter((u: User) => u.role !== 'guardia').map((user: User) => (
                                <CommandItem key={user.id} value={user.name} onSelect={() => { field.onChange(user.id); setWorkerPopoverOpen(false); }}>
                                  <Check className={cn("mr-2 h-4 w-4", field.value === user.id ? "opacity-100" : "opacity-0")} />
                                  {user.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {errors.workerId && <p className="text-xs text-destructive">{errors.workerId.message}</p>}
                  </div>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <Controller name="startDate" control={control} render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Fecha Inicio Contrato</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, 'dd/MM/yyyy') : "Selecciona"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent>
                    </Popover>
                    {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
                  </div>
                )} />
                <Controller name="endDate" control={control} render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Fecha Término Contrato</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, 'dd/MM/yyyy') : "Selecciona"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent>
                    </Popover>
                    {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
                  </div>
                )} />
              </div>

              <Controller name="lastSalary" control={control} render={({ field }) => (
                <div className="space-y-2">
                  <Label>Última Remuneración Mensual Imponible</Label>
                  <Input type="number" placeholder="Ej: 650000" {...field} />
                  {selectedWorker?.baseSalary && <p className="text-xs text-muted-foreground">Auto-completado desde el perfil del trabajador.</p>}
                  {errors.lastSalary && <p className="text-xs text-destructive">{errors.lastSalary.message}</p>}
                </div>
              )} />
              <Controller name="vacationDaysTaken" control={control} render={({ field }) => (
                <div className="space-y-2">
                  <Label>Días de Vacaciones Tomados</Label>
                  <Input type="number" placeholder="0" {...field} />
                  {errors.vacationDaysTaken && <p className="text-xs text-destructive">{errors.vacationDaysTaken.message}</p>}
                </div>
              )} />
              <Controller name="terminationCause" control={control} render={({ field }) => (
                <div className="space-y-2">
                  <Label>Causal de Término</Label>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Selecciona una causal..." /></SelectTrigger>
                    <SelectContent>{Object.entries(TERMINATION_CAUSES).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.terminationCause && <p className="text-xs text-destructive">{errors.terminationCause.message}</p>}
                </div>
              )} />
              <Controller name="noticeGiven" control={control} render={({ field }) => (
                <div className="flex items-center space-x-2">
                  <Checkbox id="noticeGiven" checked={field.value} onCheckedChange={field.onChange} />
                  <Label htmlFor="noticeGiven">¿Se dio aviso previo de 30 días?</Label>
                </div>
              )} />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 animate-spin" /> : <Calculator className="mr-2" />}
                Calcular Finiquito
              </Button>
            </form>
        </PanelCard>

        <PanelCard
          className="lg:col-span-2"
          title="Resultado del Finiquito"
          description="Desglose de los montos calculados según ley chilena."
          icon={FileDown}
          actions={calculationResult && (
            <Button variant="outline" onClick={handleGeneratePDF}>
              <FileDown className="mr-2 h-4 w-4" />Descargar PDF
            </Button>
          )}
        >
            {calculationResult ? (
              <div className="space-y-4 text-sm">
                <div className="flex justify-between items-center bg-muted p-3 rounded-lg">
                  <span className="font-semibold">Indemnización por Años de Servicio ({calculationResult.yearsForIndemnity} años)</span>
                  <span className="font-bold text-base">{formatCLP(calculationResult.indemnityPerYear)}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg">
                  <span className="font-semibold">Indemnización Sustitutiva del Aviso Previo</span>
                  <span>{formatCLP(calculationResult.noticeIndemnity)}</span>
                </div>
                <div className="flex justify-between items-center bg-muted p-3 rounded-lg">
                  <span className="font-semibold">Feriado Proporcional ({calculationResult.pendingVacationDays.toFixed(2)} días)</span>
                  <span className="font-bold text-base">{formatCLP(calculationResult.vacationPay)}</span>
                </div>
                <div className="border-t pt-4 mt-4 flex justify-between items-center text-lg">
                  <span className="font-bold text-primary">TOTAL FINIQUITO A PAGAR</span>
                  <span className="font-extrabold text-primary text-2xl">{formatCLP(calculationResult.totalSeverance)}</span>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-muted-foreground">
                <Calculator className="mx-auto mb-4 h-12 w-12 opacity-40" />
                <p>Ingresa los datos en el formulario para ver el cálculo del finiquito.</p>
              </div>
            )}
        </PanelCard>
      </div>
    </div>
  );
}
