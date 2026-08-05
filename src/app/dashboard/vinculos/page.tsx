"use client";

import { useMemo, useState } from 'react';
import { Link2, Copy, Plus, Ban, Trash2, Check } from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/date-utils';
import {
  contraparte, soyElQueInvita, invitacionesPendientes, ESTADOS_VINCULO,
} from '@/lib/company-link';
import type { CompanyLink } from '@/modules/core/lib/data';

const TONO: Record<CompanyLink['status'], StatusTone> = {
  pendiente: 'warning',
  aceptado: 'success',
  rechazado: 'neutral',
  revocado: 'danger',
};

/**
 * Empresas vinculadas: la constructora y el subcontratista que trabaja con su
 * propia cuenta.
 *
 * El vínculo **no comparte la obra**: habilita que la otra empresa vea y
 * prepare los subcontratos donde quedó declarada como contraparte. Nada más —
 * ni costos, ni contrato con el mandante, ni los otros subcontratos.
 */
export default function VinculosPage() {
  const { user, tenants, getTenantId } = useAuth();
  const {
    companyLinks, subcontracts, can, lockedFeature, notify,
    createCompanyLink, acceptCompanyLink, revokeCompanyLink, deleteCompanyLink,
  } = useAppState();

  const [codigo, setCodigo] = useState('');
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const miTenantId = getTenantId() ?? null;

  const miNombre = useMemo(
    () => tenants.find((t) => t.tenantId === miTenantId)?.name ?? user?.name ?? null,
    [tenants, miTenantId, user],
  );

  const pendientes = useMemo(
    () => invitacionesPendientes(companyLinks, miTenantId),
    [companyLinks, miTenantId],
  );

  const resueltos = useMemo(
    () => companyLinks.filter((l) => l.status !== 'pendiente'),
    [companyLinks],
  );

  /** Cuántos subcontratos dependen de cada vínculo, para avisar al revocar. */
  const subcontratosPorEmpresa = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const s of subcontracts) {
      if (!s.counterpartTenantId) continue;
      cuenta.set(s.counterpartTenantId, (cuenta.get(s.counterpartTenantId) ?? 0) + 1);
    }
    return cuenta;
  }, [subcontracts]);

  const invitar = async () => {
    setOcupado(true);
    try {
      const link = await createCompanyLink({
        requesterName: miNombre,
        inviteNote: nota.trim() || null,
      });
      notify(`Código generado: ${link.code}. Pásaselo a la otra empresa.`, 'success');
      setNota('');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo generar la invitación.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const aceptar = async () => {
    setOcupado(true);
    try {
      await acceptCompanyLink({ code: codigo, name: miNombre });
      notify('Empresas vinculadas.', 'success');
      setCodigo('');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo aceptar el código.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const copiar = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiado(code);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      notify('No se pudo copiar; anótalo a mano.', 'destructive');
    }
  };

  const bloqueoDePlan = lockedFeature('company_links:manage');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="Empresas vinculadas" />;

  if (!can('company_links:manage')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Empresas vinculadas" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para vincular empresas.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas vinculadas"
        description="Para que un subcontratista trabaje desde su propia cuenta y sus estados de pago lleguen solos, sin que nadie los retipee."
      />

      <Card>
        <CardContent className="space-y-2 p-5 text-sm">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Link2 className="h-4 w-4 text-primary" />
            Qué habilita un vínculo
          </div>
          <p className="text-muted-foreground">
            La otra empresa puede ver y preparar <strong>solo los subcontratos donde la declares
            como contraparte</strong>: su itemizado y sus estados de pago. No ve tu obra, ni tu
            contrato con el mandante, ni tus costos, ni los subcontratos de nadie más. Si revocas
            el vínculo, el acceso se corta en el acto — no le queda ninguna copia.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Invitar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invitar a una empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Para acordarte de quién es (opcional)
              </Label>
              <Input
                value={nota}
                placeholder="Ej: Techos del Sur, don Manuel"
                onChange={(e) => setNota(e.target.value)}
              />
            </div>
            <Button onClick={invitar} disabled={ocupado}>
              <Plus className="mr-2 h-4 w-4" /> Generar código
            </Button>
            <p className="text-xs text-muted-foreground">
              Se genera un código que le pasas por donde quieras. Quien lo tenga y lo pegue en su
              cuenta queda vinculado contigo.
            </p>
          </CardContent>
        </Card>

        {/* Aceptar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tengo un código</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Código que te pasaron</Label>
              <Input
                value={codigo}
                placeholder="Ej: 7F3A9C21"
                className="font-mono uppercase"
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>
            <Button onClick={aceptar} disabled={ocupado || !codigo.trim()}>
              <Check className="mr-2 h-4 w-4" /> Vincular
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Invitaciones sin usar */}
      {pendientes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Códigos que generaste y nadie ha usado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendientes.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg bg-card px-3 py-1.5 font-mono text-base font-bold tracking-widest text-foreground">
                    {l.code}
                  </span>
                  {l.inviteNote && (
                    <span className="text-sm text-muted-foreground">{l.inviteNote}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(l.createdAt)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => copiar(l.code)}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {copiado === l.code ? 'Copiado' : 'Copiar'}
                  </Button>
                  <Button
                    variant="ghost" size="sm" disabled={ocupado}
                    onClick={() => deleteCompanyLink(l.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Vínculos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Mis empresas vinculadas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {resueltos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay ninguna. Genera un código e invita a tu subcontratista, o pega el que
              te haya pasado la empresa que te contrató.
            </p>
          ) : resueltos.map((l) => {
            const otra = contraparte(l, miTenantId);
            const yoInvite = soyElQueInvita(l, miTenantId);
            const enUso = otra ? subcontratosPorEmpresa.get(otra.tenantId) ?? 0 : 0;
            return (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground">
                    {otra?.nombre ?? 'Empresa sin nombre'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {yoInvite ? 'La invitaste tú' : 'Te invitó a ti'}
                    {l.respondedAt ? ` · ${formatDate(l.respondedAt)}` : ''}
                    {enUso > 0 ? ` · ${enUso} subcontrato(s) enlazado(s)` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={TONO[l.status]}>{ESTADOS_VINCULO[l.status]}</StatusBadge>
                  {l.status === 'aceptado' && (
                    <Button
                      variant="outline" size="sm" disabled={ocupado}
                      className="border-danger/40 text-danger"
                      onClick={() => revokeCompanyLink(l.id)}
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" /> Revocar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
