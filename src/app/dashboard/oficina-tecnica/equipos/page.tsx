"use client";

/**
 * Equipos y maquinaria en arriendo.
 *
 * El arriendo es de los pocos costos que crecen SOLOS. Por eso lo primero que
 * muestra la pantalla no es la lista: es lo que ya pasó su fecha de devolución
 * y sigue costando. Nadie devuelve una grúa porque se acordó — la devuelve
 * porque alguien tenía la fecha a la vista.
 */

import { useMemo, useState } from 'react';
import {
  AlertTriangle, CornerDownLeft, Package, Plus, Trash2,
} from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import { getLeafItems } from '@/lib/budget-costs';
import {
  CATEGORIAS_EQUIPO, MODOS_TARIFA, arriendosAtrasados, costoAcumulado,
  costoProyectado, diasDeArriendo, resumenArriendos,
} from '@/lib/equipment';
import type { EquipmentRental } from '@/modules/core/lib/data';

const SIN_PARTIDA = '__sin__';

export default function EquiposPage() {
  const {
    equipmentRentals, workItems, currentProjectId, can, deleteEquipmentRental,
  } = useAppState();
  const { toast } = useToast();
  const [creando, setCreando] = useState(false);
  const [devolviendo, setDevolviendo] = useState<EquipmentRental | null>(null);

  const hoy = useMemo(() => new Date(), []);

  const arriendos = useMemo(
    () => equipmentRentals.filter((r) => r.projectId === currentProjectId),
    [equipmentRentals, currentProjectId],
  );

  const resumen = useMemo(() => resumenArriendos(arriendos, hoy), [arriendos, hoy]);
  const atrasados = useMemo(() => arriendosAtrasados(arriendos, hoy), [arriendos, hoy]);

  const activos = useMemo(
    () => arriendos.filter((r) => r.status === 'activo'),
    [arriendos],
  );
  const cerrados = useMemo(
    () => arriendos.filter((r) => r.status !== 'activo'),
    [arriendos],
  );

  const editable = can('equipment:manage');
  const nombrePartida = (id?: string | null) =>
    workItems.find((w) => w.id === id)?.name ?? null;

  if (!can('module_technical_office:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Equipos y maquinaria" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver este módulo.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipos y maquinaria"
        description="Lo que la obra tiene arrendado y lo que va costando. El costo corre solo: se corta devolviendo."
        actions={editable ? (
          <Button onClick={() => setCreando(true)}>
            <Plus className="mr-2 h-4 w-4" /> Registrar arriendo
          </Button>
        ) : undefined}
      />

      {/* Lo primero: lo que está costando de más */}
      {atrasados.length > 0 && (
        <Card className="border-danger/40">
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-danger" />
                Equipos pasados de su fecha de devolución
              </span>
              <StatusBadge tone="danger">
                {formatCLP(resumen.costoDeMas)} de más
              </StatusBadge>
            </div>
            <ul className="divide-y divide-border">
              {atrasados.map((a) => (
                <li key={a.rental.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground">
                      {a.rental.name}
                      {a.rental.code ? ` · ${a.rental.code}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Debía devolverse el {formatDate(a.rental.endDate)} ·{' '}
                      {a.diasDeMas} día(s) de más
                    </div>
                  </div>
                  <span className="font-medium text-danger">+{formatCLP(a.costoDeMas)}</span>
                  {editable && (
                    <Button size="sm" onClick={() => setDevolviendo(a.rental)}>
                      <CornerDownLeft className="mr-2 h-3.5 w-3.5" /> Devolver
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Resumen */}
      {arriendos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="En obra ahora" valor={`${resumen.activos}`} />
          <Kpi label="Costo acumulado" valor={formatCLP(resumen.costoAcumulado)} />
          <Kpi
            label="Proyectado al término"
            valor={formatCLP(resumen.costoProyectado)}
            detalle="Si todos se devuelven en su fecha"
          />
          <Kpi
            label="Costando de más"
            valor={formatCLP(resumen.costoDeMas)}
            tono={resumen.costoDeMas > 0 ? 'danger' : undefined}
          />
        </div>
      )}

      {/* En obra */}
      <Card>
        <CardHeader><CardTitle className="text-base">En obra</CardTitle></CardHeader>
        <CardContent className="p-0">
          {activos.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No hay equipos arrendados registrados en esta obra. Registra la grúa, los
              andamios o los moldajes para que su costo se vea antes de que llegue la factura.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {activos.map((r) => (
                <Fila
                  key={r.id}
                  rental={r}
                  hoy={hoy}
                  partida={nombrePartida(r.workItemId)}
                  editable={editable}
                  onDevolver={() => setDevolviendo(r)}
                  onBorrar={async () => {
                    try { await deleteEquipmentRental(r.id); }
                    catch (e: any) {
                      toast({ variant: 'destructive', title: 'No se pudo borrar', description: e.message });
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Devueltos */}
      {cerrados.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Devueltos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {cerrados.map((r) => (
                <Fila
                  key={r.id}
                  rental={r}
                  hoy={hoy}
                  partida={nombrePartida(r.workItemId)}
                  editable={false}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {creando && <DialogoArriendo onCerrar={() => setCreando(false)} />}

      {devolviendo && (
        <DialogoDevolver
          rental={devolviendo}
          onCerrar={() => setDevolviendo(null)}
        />
      )}
    </div>
  );
}

/* ── Fila ──────────────────────────────────────────────────────────────── */

function Fila({
  rental: r, hoy, partida, editable, onDevolver, onBorrar,
}: {
  rental: EquipmentRental;
  hoy: Date;
  partida: string | null;
  editable: boolean;
  onDevolver?: () => void;
  onBorrar?: () => void;
}) {
  const acumulado = costoAcumulado(r, hoy);
  const proyectado = costoProyectado(r);
  const dias = diasDeArriendo(r, hoy);

  return (
    <li className="flex flex-wrap items-center gap-3 p-4 text-sm">
      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{r.name}</span>
          {r.code && <span className="text-xs text-muted-foreground">{r.code}</span>}
          <StatusBadge tone="neutral">{CATEGORIAS_EQUIPO[r.category]}</StatusBadge>
          {r.status === 'devuelto' && (
            <StatusBadge tone="success">Devuelto {formatDate(r.returnedAt)}</StatusBadge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatCLP(r.rate)} {MODOS_TARIFA[r.rateMode].toLowerCase()}
          {' · '}{dias} día(s) desde {formatDate(r.startDate)}
          {r.endDate ? ` · hasta ${formatDate(r.endDate)}` : ' · sin fecha de término'}
          {r.supplierName ? ` · ${r.supplierName}` : ''}
        </div>
        {partida ? (
          <div className="text-xs text-muted-foreground">Imputado a: {partida}</div>
        ) : (
          <div className="text-xs text-warning">
            Sin partida: su costo no llega al control de costos.
          </div>
        )}
      </div>

      <div className="text-right">
        <div className="font-medium text-foreground">{formatCLP(acumulado)}</div>
        {proyectado !== null && (
          <div className="text-xs text-muted-foreground">
            de {formatCLP(proyectado)} previstos
          </div>
        )}
      </div>

      {editable && (
        <div className="flex items-center gap-1">
          {onDevolver && (
            <Button size="sm" variant="outline" onClick={onDevolver}>
              <CornerDownLeft className="mr-2 h-3.5 w-3.5" /> Devolver
            </Button>
          )}
          {onBorrar && (
            <Button variant="ghost" size="icon" aria-label="Borrar" onClick={onBorrar}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Kpi({
  label, valor, detalle, tono,
}: {
  label: string;
  valor: string;
  detalle?: string;
  tono?: 'danger';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`text-xl font-bold ${tono === 'danger' ? 'text-danger' : 'text-foreground'}`}>
          {valor}
        </div>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  );
}

/* ── Alta ──────────────────────────────────────────────────────────────── */

function DialogoArriendo({ onCerrar }: { onCerrar: () => void }) {
  const {
    addEquipmentRental, suppliers, workItems, currentProjectId,
  } = useAppState();
  const { toast } = useToast();

  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [categoria, setCategoria] = useState<EquipmentRental['category']>('maquinaria');
  const [proveedor, setProveedor] = useState('');
  const [modo, setModo] = useState<EquipmentRental['rateMode']>('dia');
  const [tarifa, setTarifa] = useState(0);
  const [horas, setHoras] = useState<number | ''>('');
  const [minimo, setMinimo] = useState<number | ''>('');
  const [desde, setDesde] = useState(() => hoyISO());
  const [hasta, setHasta] = useState('');
  const [partida, setPartida] = useState(SIN_PARTIDA);
  const [notas, setNotas] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const partidas = useMemo(
    () => getLeafItems(workItems.filter((w) => w.projectId === currentProjectId)),
    [workItems, currentProjectId],
  );

  async function guardar() {
    setOcupado(true);
    try {
      await addEquipmentRental({
        name: nombre,
        code: codigo.trim() || null,
        category: categoria,
        supplierId: suppliers.find(
          (s) => s.name.toLowerCase() === proveedor.trim().toLowerCase(),
        )?.id ?? null,
        supplierName: proveedor.trim() || null,
        rateMode: modo,
        rate: tarifa,
        hoursPerDay: horas === '' ? null : Number(horas),
        minimumUnits: minimo === '' ? null : Number(minimo),
        startDate: desde as unknown as Date,
        endDate: (hasta || null) as unknown as Date,
        workItemId: partida === SIN_PARTIDA ? null : partida,
        notes: notas.trim() || null,
      });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo registrar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar arriendo</DialogTitle>
          <DialogDescription>
            Desde que se registra, la app calcula sola lo que va costando.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eq-nombre">Equipo</Label>
              <Input id="eq-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Grúa torre Potain MDT 178" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-codigo">Patente / serie</Label>
              <Input id="eq-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as EquipmentRental['category'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIAS_EQUIPO).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-prov">Arrendador</Label>
              <Input id="eq-prov" value={proveedor} list="proveedores-eq"
                onChange={(e) => setProveedor(e.target.value)} />
              <datalist id="proveedores-eq">
                {suppliers.map((s) => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Se cobra</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as EquipmentRental['rateMode'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MODOS_TARIFA).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-tarifa">Tarifa</Label>
              <Input id="eq-tarifa" type="number" min={0} value={tarifa || ''}
                onChange={(e) => setTarifa(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-min">Mínimo</Label>
              <Input id="eq-min" type="number" min={0} value={minimo}
                onChange={(e) => setMinimo(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Opcional" />
            </div>
          </div>

          {modo === 'hora' && (
            <div className="space-y-2">
              <Label htmlFor="eq-horas">Horas por jornada</Label>
              <Input id="eq-horas" type="number" min={0} value={horas}
                onChange={(e) => setHoras(e.target.value === '' ? '' : Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">
                Con tarifa por hora hace falta para poder calcular lo que va costando.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eq-desde">Desde</Label>
              <Input id="eq-desde" type="date" value={desde}
                onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-hasta">Hasta (programado)</Label>
              <Input id="eq-hasta" type="date" value={hasta}
                onChange={(e) => setHasta(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Es la fecha contra la que la app avisa que sigue en obra.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Imputar a partida</Label>
            <Select value={partida} onValueChange={setPartida}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_PARTIDA}>Sin imputar</SelectItem>
                {partidas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.path} · {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sin partida, el arriendo no llega al control de costos y queda como un
              gasto general que nadie mira.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eq-notas">Observaciones</Label>
            <Textarea id="eq-notas" rows={2} value={notas}
              onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Devolución ────────────────────────────────────────────────────────── */

function DialogoDevolver({
  rental: r, onCerrar,
}: {
  rental: EquipmentRental;
  onCerrar: () => void;
}) {
  const { returnEquipmentRental } = useAppState();
  const { toast } = useToast();
  const [fecha, setFecha] = useState(() => hoyISO());
  const [ocupado, setOcupado] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver {r.name}</DialogTitle>
          <DialogDescription>
            Desde esta fecha deja de correr el costo. Lo acumulado hasta acá queda
            congelado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="dv-fecha">Fecha de devolución</Label>
          <Input id="dv-fecha" type="date" value={fecha}
            onChange={(e) => setFecha(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              try {
                await returnEquipmentRental(r.id, fecha);
                toast({ title: 'Equipo devuelto', description: 'El costo dejó de correr.' });
                onCerrar();
              } catch (e: any) {
                toast({ variant: 'destructive', title: 'No se pudo devolver', description: e.message });
              } finally { setOcupado(false); }
            }}
          >
            Devolver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
