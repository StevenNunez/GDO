"use client";

import { useAuth } from "@/modules/core/contexts/app-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, Check } from "lucide-react";
import type { Tenant } from "@/modules/core/lib/data";

export function TenantSwitcher() {
  const { user, tenants, currentTenantId, setCurrentTenantId } = useAuth();

  if (user?.role !== "super-admin" || !tenants || tenants.length === 0) return null;

  const currentTenant = tenants.find((t: Tenant) => t.tenantId === currentTenantId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-3">
          <Building2 className="h-4 w-4" />
          <div className="flex flex-col items-start">
            <span className="text-xs text-muted-foreground">Empresa actual</span>
            <span className="font-medium">{currentTenant?.name || "Seleccionar empresa"}</span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Cambiar de empresa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant: Tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => setCurrentTenantId(tenant.tenantId)}
            className="flex items-center justify-between"
          >
            <div>
              <p className="font-medium">{tenant.name}</p>
              <p className="text-xs text-muted-foreground">{tenant.tenantId}</p>
            </div>
            {currentTenantId === tenant.tenantId && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
