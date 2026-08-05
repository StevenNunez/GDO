"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Plus, FileStack, AlertTriangle, Search } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/date-utils';
import {
  revisionVigente, revisionesDe, resumenDocumentos,
  DISCIPLINAS, TIPOS_DOCUMENTO,
} from '@/lib/documents';
import type { Discipline, ProjectDocument } from '@/modules/core/lib/data';

export default function PlanosPage() {
  const {
    documents, documentRevisions, currentProjectId, can, notify, addDocument,
  } = useAppState();

  const [busqueda, setBusqueda] = useState('');
  const [disciplina, setDisciplina] = useState<'todas' | Discipline>('todas');
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState<Partial<ProjectDocument>>({
    type: 'plano', discipline: 'arquitectura',
  });
  const [guardando, setGuardando] = useState(false);

  const deLaObra = useMemo(
    () => documents.filter((d) => d.projectId === currentProjectId),
    [documents, currentProjectId],
  );

  const resumen = useMemo(
    () => resumenDocumentos(deLaObra, documentRevisions),
    [deLaObra, documentRevisions],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return deLaObra
      .filter((d) => disciplina === 'todas' || d.discipline === disciplina)
      .filter((d) => !q
        || d.name.toLowerCase().includes(q)
        || (d.code ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name, 'es'));
  }, [deLaObra, disciplina, busqueda]);

  const crear = async () => {
    if (!nuevo.name?.trim()) {
      notify('Ponle un nombre al documento.', 'destructive');
      return;
    }
    setGuardando(true);
    try {
      await addDocument({
        ...nuevo,
        name: nuevo.name.trim(),
        code: nuevo.code?.trim() || null,
        projectId: currentProjectId,
      });
      notify('Documento creado. Ahora carga su primera revisión.', 'success');
      setNuevo({ type: 'plano', discipline: 'arquitectura' });
      setCreando(false);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo crear el documento.', 'destructive');
    } finally {
      setGuardando(false);
    }
  };

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Planos y documentos" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para ver sus planos.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planos y documentos"
        description="La revisión vigente es siempre la más nueva no anulada: construir con una superada es de los errores más caros que hay."
        actions={can('documents:manage') && (
          <Button onClick={() => setCreando((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo documento
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Documentos" value={`${resumen.documentos}`} />
        <Kpi label="Con revisión vigente" value={`${resumen.conVigente}`} />
        <Kpi
          label="Sin ninguna revisión"
          value={`${resumen.sinRevision}`}
          tone={resumen.sinRevision > 0 ? 'warning' : undefined}
        />
        <Kpi
          label="Vigente sin archivo"
          value={`${resumen.sinArchivo}`}
          tone={resumen.sinArchivo > 0 ? 'danger' : undefined}
        />
      </div>

      {resumen.sinArchivo > 0 && (
        <Card className="border-danger/40">
          <CardContent className="flex flex-wrap items-center gap-2 p-5 text-sm">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <span className="font-medium text-foreground">
              Hay {resumen.sinArchivo} documento(s) cuya revisión vigente no tiene archivo cargado.
            </span>
            <span className="text-muted-foreground">
              En terreno, un plano sin archivo es un plano que no existe.
            </span>
          </CardContent>
        </Card>
      )}

      {creando && can('documents:manage') && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nuevo documento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Código</Label>
                <Input
                  value={nuevo.code ?? ''}
                  placeholder="A-01"
                  onChange={(e) => setNuevo((n) => ({ ...n, code: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">Nombre</Label>
                <Input
                  value={nuevo.name ?? ''}
                  placeholder="Planta primer piso"
                  onChange={(e) => setNuevo((n) => ({ ...n, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Tipo</Label>
                <Select
                  value={nuevo.type ?? 'plano'}
                  onValueChange={(v) => setNuevo((n) => ({ ...n, type: v as ProjectDocument['type'] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS_DOCUMENTO).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Especialidad</Label>
                <Select
                  value={nuevo.discipline ?? 'general'}
                  onValueChange={(v) => setNuevo((n) => ({ ...n, discipline: v as Discipline }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DISCIPLINAS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={crear} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Crear documento'}
              </Button>
              <Button variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-wrap items-center gap-3 px-6 pt-6">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por código o nombre…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <Select value={disciplina} onValueChange={(v) => setDisciplina(v as typeof disciplina)}>
              <SelectTrigger className="w-[13rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las especialidades</SelectItem>
                {Object.entries(DISCIPLINAS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtrados.length === 0 ? (
            <div className="flex flex-col items-start gap-2 p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileStack className="h-4 w-4" />
                {deLaObra.length === 0 ? 'Todavía no hay documentos' : 'Ningún documento coincide'}
              </div>
              {deLaObra.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Registra acá los planos de la obra y sube cada revisión que llegue. Así todos
                  trabajan contra la misma versión.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Especialidad</TableHead>
                    <TableHead>Revisión vigente</TableHead>
                    <TableHead>Emitida</TableHead>
                    <TableHead className="text-right">Revisiones</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((d) => {
                    const propias = revisionesDe(documentRevisions, d.id);
                    const vigente = revisionVigente(propias);
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.code ?? '—'}</TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{d.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {TIPOS_DOCUMENTO[d.type]}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {DISCIPLINAS[d.discipline]}
                        </TableCell>
                        <TableCell>
                          {vigente
                            ? (
                              <StatusBadge tone={vigente.filePath ? 'success' : 'danger'}>
                                {vigente.filePath ? `Rev. ${vigente.revision}` : `Rev. ${vigente.revision} · sin archivo`}
                              </StatusBadge>
                            )
                            : <StatusBadge tone="warning">Sin revisión</StatusBadge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {vigente?.issueDate ? formatDate(vigente.issueDate) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {propias.length}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/oficina-tecnica/planos/${d.id}`}>
                            <Button variant="ghost" size="sm">Ver</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: {
  label: string; value: string; tone?: 'warning' | 'danger';
}) {
  return (
    <Card className={tone === 'danger' ? 'border-danger/40' : undefined}>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`text-xl font-bold ${tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-foreground'}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
