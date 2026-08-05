"use client";

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { siguienteNumeroRdi, PRIORIDADES_RDI } from '@/lib/rdi';
import { DISCIPLINAS } from '@/lib/documents';
import { getLeafItems } from '@/lib/budget-costs';
import { FileField, type ArchivoAdjunto } from '@/components/operations/file-field';
import type { Discipline, Rdi } from '@/modules/core/lib/data';

/** Plazo de respuesta por defecto: una semana, que es lo habitual en obra. */
const DIAS_PLAZO_DEFECTO = 7;

function isoMasDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function NuevaRdiPage() {
  const router = useRouter();
  const {
    rdis, contracts, documents, workItems, currentProjectId, can, notify, addRdi,
  } = useAppState();

  const [form, setForm] = useState({
    subject: '',
    question: '',
    discipline: 'general' as Discipline,
    priority: 'normal' as Rdi['priority'],
    askedTo: '',
    askedAt: isoMasDias(0),
    dueDate: isoMasDias(DIAS_PLAZO_DEFECTO),
    documentId: 'ninguno',
    workItemId: 'ninguna',
  });
  const [archivo, setArchivo] = useState<ArchivoAdjunto | null>(null);
  const [guardando, setGuardando] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const deLaObra = useMemo(
    () => rdis.filter((r) => r.projectId === currentProjectId),
    [rdis, currentProjectId],
  );
  const numero = siguienteNumeroRdi(deLaObra);

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  const planos = useMemo(
    () => documents.filter((d) => d.projectId === currentProjectId),
    [documents, currentProjectId],
  );

  const partidas = useMemo(
    () => getLeafItems(workItems.filter((w) => w.projectId === currentProjectId)),
    [workItems, currentProjectId],
  );

  if (!can('rdi:create')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nueva RDI" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para crear requerimientos de información.
        </CardContent></Card>
      </div>
    );
  }

  const guardar = async () => {
    if (!form.subject.trim()) {
      notify('Ponle un asunto a la consulta.', 'destructive');
      return;
    }
    if (!form.question.trim()) {
      notify('Escribe la consulta: es lo que se responde y lo que después respalda un adicional.', 'destructive');
      return;
    }

    setGuardando(true);
    try {
      const id = await addRdi({
        projectId: currentProjectId,
        contractId: contrato?.id ?? null,
        number: numero,
        subject: form.subject.trim(),
        question: form.question.trim(),
        discipline: form.discipline,
        priority: form.priority,
        askedTo: form.askedTo.trim() || null,
        askedAt: (form.askedAt || null) as never,
        dueDate: (form.dueDate || null) as never,
        documentId: form.documentId === 'ninguno' ? null : form.documentId,
        workItemId: form.workItemId === 'ninguna' ? null : form.workItemId,
        filePath: archivo?.path ?? null,
        fileName: archivo?.name ?? null,
        status: 'abierta',
      });
      notify('RDI creada.', 'success');
      router.push(`/dashboard/oficina-tecnica/rdi/${id}`);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo crear la RDI.', 'destructive');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`RDI N° ${numero}`}
        description="Consulta formal al mandante o al proyectista"
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/oficina-tecnica/rdi">
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            <Button onClick={guardar} disabled={guardando}>
              <Save className="mr-2 h-4 w-4" />
              {guardando ? 'Guardando…' : 'Crear RDI'}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">La consulta</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Asunto</Label>
            <Input
              value={form.subject}
              placeholder="Ej: Interferencia entre viga V-12 y ducto de clima"
              onChange={(e) => set('subject', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Consulta</Label>
            <Textarea
              rows={5}
              value={form.question}
              placeholder="Describe qué falta o qué no calza, con la referencia al plano si corresponde."
              onChange={(e) => set('question', e.target.value)}
            />
          </div>

          <FileField
            label="Croquis o respaldo (opcional)"
            carpeta="rdi"
            value={archivo}
            onChange={setArchivo}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Destinatario y plazo</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Dirigida a</Label>
            <Input
              value={form.askedTo}
              placeholder="Arquitecto, ITO, calculista…"
              onChange={(e) => set('askedTo', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Especialidad</Label>
            <Select value={form.discipline} onValueChange={(v) => set('discipline', v as Discipline)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DISCIPLINAS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Prioridad</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => set('priority', v as Rdi['priority'])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORIDADES_RDI).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Fecha de la consulta</Label>
            <Input type="date" value={form.askedAt} onChange={(e) => set('askedAt', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Respuesta comprometida</Label>
            <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            <p className="text-xs text-muted-foreground">
              De acá sale el aviso de vencimiento. Sin plazo, la RDI no se puede reclamar.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            A qué afecta
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Opcional, pero es lo que después conecta la respuesta con el adicional.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Plano o documento</Label>
            <Select value={form.documentId} onValueChange={(v) => set('documentId', v)}>
              <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguno">Ninguno</SelectItem>
                {planos.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.code ? `${d.code} · ${d.name}` : d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Partida</Label>
            <Select value={form.workItemId} onValueChange={(v) => set('workItemId', v)}>
              <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Ninguna</SelectItem>
                {partidas.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
