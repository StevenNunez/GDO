"use client";

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { siguienteNumeroAdicional } from '@/lib/amendment';
import {
  AdicionalForm, valoresIniciales,
  type AdicionalFormValues,
} from '@/components/operations/adicional-form';
import { usePresupuestosAdicionales } from '@/components/operations/use-presupuestos-adicionales';

export default function NuevoAdicionalPage() {
  const router = useRouter();
  const {
    contracts, amendments, currentProjectId, can, notify, addAmendment,
  } = useAppState();

  const [valores, setValores] = useState<AdicionalFormValues>(valoresIniciales);
  const [guardando, setGuardando] = useState(false);

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  const adicionalesDelContrato = useMemo(
    () => (contrato ? amendments.filter((a) => a.contractId === contrato.id) : []),
    [amendments, contrato],
  );

  const presupuestos = usePresupuestosAdicionales(null);

  if (!can('amendments:manage')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nuevo adicional" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para registrar adicionales.
        </CardContent></Card>
      </div>
    );
  }

  if (!contrato) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nuevo adicional" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Esta obra no tiene contrato cargado.
        </CardContent></Card>
      </div>
    );
  }

  const numero = siguienteNumeroAdicional(adicionalesDelContrato);

  const guardar = async () => {
    if (!valores.name.trim()) {
      notify('Ponle un nombre al adicional.', 'destructive');
      return;
    }
    if (valores.type !== 'aumento_plazo' && valores.amountNet <= 0 && valores.extraDays <= 0) {
      notify('Un adicional tiene que traer monto o días de plazo.', 'destructive');
      return;
    }

    setGuardando(true);
    try {
      const id = await addAmendment({
        contractId: contrato.id,
        projectId: contrato.projectId,
        number: numero,
        name: valores.name.trim(),
        type: valores.type,
        cause: valores.cause,
        description: valores.description || null,
        budgetId: valores.type === 'aumento_plazo' ? null : valores.budgetId,
        amountNet: valores.type === 'aumento_plazo' ? 0 : Math.abs(valores.amountNet),
        currency: contrato.currency,
        extraDays: valores.extraDays,
        detectedAt: (valores.detectedAt || null) as never,
        reference: valores.reference || null,
        notes: valores.notes || null,
        status: 'borrador',
      });
      notify('Adicional creado en borrador.', 'success');
      router.push(`/dashboard/oficina-tecnica/adicionales/${id}`);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo crear el adicional.', 'destructive');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Adicional N° ${numero}`}
        description={contrato.name}
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/oficina-tecnica/adicionales">
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            <Button onClick={guardar} disabled={guardando}>
              <Save className="mr-2 h-4 w-4" />
              {guardando ? 'Guardando…' : 'Crear borrador'}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Datos del adicional</CardTitle></CardHeader>
        <CardContent>
          <AdicionalForm
            value={valores}
            onChange={(patch) => setValores((v) => ({ ...v, ...patch }))}
            presupuestos={presupuestos}
          />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Queda en borrador: no cambia el monto ni el plazo del contrato hasta que el mandante lo
        apruebe. Preséntalo desde su ficha cuando esté listo.
      </p>
    </div>
  );
}
