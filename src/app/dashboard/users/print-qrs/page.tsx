"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import QRCode from "react-qr-code";
import { Printer, ArrowLeft, AlertCircle, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, UserRole } from "@/modules/core/lib/data";
import { ROLES } from "@/modules/core/lib/permissions";
import { getSupabaseBrowserClient } from "@/modules/core/lib/supabase";

export default function PrintUserQrPage() {
  const { users, isLoading, can } = useAppState();
  const { user: authUser, tenants, currentTenantId } = useAuth();
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [tenantName, setTenantName] = useState("");

  // Resolve tenant name: super-admin has tenants[] populated; regular users need a direct fetch
  useEffect(() => {
    // Try from tenants array first (super-admin path)
    if (currentTenantId && tenants?.length) {
      const found = tenants.find(t => t.id === currentTenantId || t.tenantId === currentTenantId);
      if (found?.name) { setTenantName(found.name); return; }
    }
    // Fallback: fetch from DB using the user's tenantId
    const tid = authUser?.tenantId;
    if (!tid) return;
    const sb = getSupabaseBrowserClient();
    sb.from('tenants').select('name').eq('tenantId', tid).single().then(({ data }: { data: { name: string } | null }) => {
      if (data?.name) setTenantName(data.name);
    });
  }, [currentTenantId, tenants, authUser]);

  const getRoleDisplayName = (role: UserRole) => ROLES[role]?.label || role;

  const rolesInUse = useMemo(() => {
    const set = new Set((users || []).map((u: User) => u.role));
    return Array.from(set).sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    let result: User[] = users || [];
    if (roleFilter !== "all") result = result.filter(u => u.role === roleFilter);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) ||
        (u.cargo && u.cargo.toLowerCase().includes(q)) ||
        (u.rut && u.rut.includes(searchTerm))
      );
    }
    return result;
  }, [users, searchTerm, roleFilter]);

  if (!can('users:print_qr')) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Acceso Denegado</AlertTitle>
        <AlertDescription>No tienes permiso para acceder a esta sección.</AlertDescription>
      </Alert>
    );
  }

  const companyLabel = tenantName || "Control de Obra App";

  return (
    <div className="print-container flex flex-col gap-6">

      {/* ── Controles (ocultos al imprimir) ── */}
      <div className="print-hide">
        <PageHeader
          title="Credenciales de Usuario"
          description={`${filteredUsers.length} credencial${filteredUsers.length !== 1 ? 'es' : ''} listas para imprimir.`}
        />

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, cargo o RUT..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos los roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {rolesInUse.map(r => (
                <SelectItem key={r} value={r}>{getRoleDisplayName(r as UserRole)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(searchTerm || roleFilter !== "all") && (
            <Button variant="ghost" size="icon" onClick={() => { setSearchTerm(""); setRoleFilter("all"); }}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Grilla de credenciales ── */}
      <div className="print-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="credential-card animate-pulse bg-muted rounded-xl" />
            ))
          : filteredUsers.map((user: User, idx: number) => (
              <CredentialCard
                key={user.id}
                user={user}
                index={idx + 1}
                companyLabel={companyLabel}
                getRoleDisplayName={getRoleDisplayName}
              />
            ))
        }
        {filteredUsers.length === 0 && !isLoading && (
          <p className="col-span-full text-center text-muted-foreground py-10">
            No hay usuarios con ese criterio.
          </p>
        )}
      </div>

      {/* ── Estilos de impresión ── */}
      <style jsx global>{`
        .credential-card {
          min-height: 220px;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 0.8cm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: #fff !important;
          }
          .print-hide { display: none !important; }
          .print-container { gap: 0 !important; }
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 0.4cm !important;
          }
          .credential-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            background-color: #fff !important;
            border: 1px solid #ccc !important;
            min-height: unset !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ── Tarjeta de credencial ── */
function CredentialCard({
  user,
  index,
  companyLabel,
  getRoleDisplayName,
}: {
  user: User;
  index: number;
  companyLabel: string;
  getRoleDisplayName: (r: UserRole) => string;
}) {
  const sequential = String(index).padStart(3, "0");

  return (
    <div className="credential-card flex flex-col rounded-xl border border-border overflow-hidden bg-card shadow-sm text-center">

      {/* Header de empresa */}
      <div className="bg-primary px-2 py-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold text-primary-foreground uppercase tracking-wide truncate">
          {companyLabel}
        </span>
        <span className="text-[10px] font-mono text-primary-foreground/70 shrink-0 ml-1">
          #{sequential}
        </span>
      </div>

      {/* QR Code */}
      <div className="flex items-center justify-center bg-white px-4 py-3">
        {user.qrCode ? (
          <QRCode
            value={user.qrCode}
            size={100}
            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
          />
        ) : (
          <div className="w-[100px] h-[100px] bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
            Sin QR
          </div>
        )}
      </div>

      {/* Info del usuario */}
      <div className="px-2 pb-2.5 flex flex-col gap-0.5">
        <p className="font-bold text-sm leading-tight truncate" title={user.name}>
          {user.name}
        </p>
        {user.cargo && (
          <p className="text-[11px] text-muted-foreground truncate">{user.cargo}</p>
        )}
        <p className="text-[10px] text-muted-foreground">{getRoleDisplayName(user.role)}</p>
        {user.rut && (
          <p className="text-[10px] font-mono text-muted-foreground">{user.rut}</p>
        )}
      </div>
    </div>
  );
}
