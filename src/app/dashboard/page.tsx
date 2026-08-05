'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import {
  Warehouse, CalendarCheck, User as UserIcon, DollarSign,
  ShieldCheck, BarChart3, ShoppingCart, HardHat,
  AlertCircle, Construction, Wallet, Briefcase, Building2,
  Key, CreditCard, Users as UsersIcon, Package, ClipboardList,
  FileSignature,
} from 'lucide-react';
import { UserCredentialCard } from '@/components/user-credential-card';
import { ModuleCard } from '@/components/ui/module-card';
import type { Permission } from '@/modules/core/lib/permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UserRole } from '@/modules/core/lib/data';
import { cn } from '@/lib/utils';

interface ModuleDef {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  permission?: Permission;
  roles?: UserRole[];
  superadminOnly?: boolean;
  /** Card más alta y destacada, arriba de la grilla. */
  featured?: boolean;
}

// Orden de la grilla: sigue el flujo real de la obra — primero producción y
// terreno, luego abastecimiento, después personas, finanzas y por último
// administración de la plataforma.
const MODULES_CONFIG: ModuleDef[] = [
  { href: '/dashboard/construction-control', icon: Construction, title: "Control de Obra", description: "Hitos, avance y KPIs en tiempo real.", permission: 'module_construction_control:view', featured: true },
  { href: '/dashboard/payments', icon: DollarSign, title: "Finanzas", description: "Pagos, facturación y órdenes de compra.", permission: 'module_payments:view', featured: true },
  { href: '/dashboard/oficina-tecnica', icon: FileSignature, title: "Oficina Técnica", description: "Contrato, presupuesto, APU y garantías.", permission: 'module_technical_office:view', featured: true },

  { href: '/dashboard/supervisor', icon: HardHat, title: "Control de Terreno", description: "Supervisión y checklists", roles: ['supervisor', 'apr', 'bodega-admin', 'jefe-terreno', 'jefe-oficina-tecnica'] },
  { href: '/dashboard/projects', icon: Briefcase, title: "Proyectos", description: "Administración de obras", permission: 'module_projects:view' },
  { href: '/dashboard/clients', icon: Building2, title: "Clientes", description: "Cartera, presupuestos y gasto por cliente", permission: 'module_clients:view' },
  { href: '/dashboard/bodega', icon: Warehouse, title: "Bodega", description: "Inventario y stock", permission: 'module_warehouse:view' },
  { href: '/dashboard/purchasing', icon: ShoppingCart, title: "Compras", description: "Requisiciones y proveedores", permission: 'module_purchasing:view' },
  { href: '/dashboard/material-control', icon: Package, title: "Trazabilidad", description: "Seguimiento de materiales", permission: 'reports:view' },
  { href: '/dashboard/attendance', icon: CalendarCheck, title: "Asistencia", description: "Turnos y personal", permission: 'module_attendance:view' },
  { href: '/dashboard/safety', icon: ShieldCheck, title: "HSEC", description: "Seguridad y prevención", permission: 'module_safety:view' },
  { href: '/dashboard/cphs', icon: UsersIcon, title: "Comité Paritario", description: "Gestión CPHS", roles: ['cphs', 'apr'] },
  { href: '/dashboard/estado-pago', icon: ClipboardList, title: "Mi Subcontrato", description: "Avance y estados de pago", permission: 'subcontractor_portal:view' },
  { href: '/dashboard/worker', icon: Wallet, title: "Mi Billetera", description: "Saldo y liquidaciones", roles: ['worker', 'supervisor'] },
  { href: '/dashboard/reports', icon: BarChart3, title: "Reportes", description: "Analítica y métricas", permission: 'module_reports:view' },
  { href: '/dashboard/users', icon: UserIcon, title: "Usuarios", description: "Gestión de dotación", permission: 'module_users:view' },
  { href: '/dashboard/permissions', icon: Key, title: "Permisos", description: "Roles y accesos", permission: 'permissions:manage' },
  { href: '/dashboard/subscriptions', icon: CreditCard, title: "Suscripciones", description: "Planes y facturación", permission: 'module_subscriptions:view' },
];

// --- PÁGINA PRINCIPAL ---

// La animación de entrada corre una sola vez por carga del sitio. Sin esto se
// repite en cada visita a /dashboard y la página parece recargarse.
let entranceAlreadyPlayed = false;

export default function DashboardHubPage() {
  const { user, authLoading } = useAuth();
  const { can } = useAppState();
  const router = useRouter();

  const [playEntrance] = React.useState(() => {
    if (entranceAlreadyPlayed) return false;
    entranceAlreadyPlayed = true;
    return true;
  });

  React.useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'guardia') router.replace('/dashboard/attendance/registry');
  }, [user, authLoading, router]);

  const visibleModules = React.useMemo(() => {
    if (!user) return [];
    return MODULES_CONFIG.filter(m => {
      if (user.role === 'super-admin') return true;
      if (m.superadminOnly) return false;
      if (m.roles) return m.roles.includes(user.role);
      if (m.permission) return can(m.permission);
      // Fail-closed: un módulo sin permiso ni roles declarados no se muestra.
      return false;
    });
  }, [user, can]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background p-8">
        <div className="text-center">
          <HardHat className="mx-auto h-16 w-16 animate-pulse text-cta" strokeWidth={1} />
          <p className="mt-6 font-mono text-sm uppercase tracking-widest text-muted-foreground">Cargando centro de comando...</p>
        </div>
      </div>
    );
  }

  const firstName = user.name?.split(' ')[0] || 'Usuario';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

  const featured = visibleModules.filter(m => m.featured);
  const others = visibleModules.filter(m => !m.featured);

  return (
    <div className="relative h-full overflow-auto bg-background pb-10 font-sans text-foreground">
      {/* Resplandor ambiental de la esquina superior derecha */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(at_top_right,hsl(var(--cta)/0.12)_0%,transparent_55%)]"
      />

      <div className="relative mx-auto max-w-[1720px] px-6 pt-8 lg:px-10">

        {/* HERO: saludo a la izquierda, credencial digital a la derecha */}
        <div className={cn(
          "flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between",
          playEntrance && "animate-in fade-in slide-in-from-top-4 duration-700"
        )}>
          <div className="min-w-0">

            <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tighter sm:text-5xl lg:text-6xl">
              {greeting},<br />
              <span className="bg-gradient-to-r from-cta to-primary bg-clip-text text-transparent">
                {firstName}
              </span>
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">¿Qué vamos a avanzar hoy?</p>
          </div>

          {/* Credencial digital. El fondo azul Prussian no es decorativo: el
              contenido de UserCredentialCard usa tokens `sidebar-*` (texto claro),
              así que sobre una superficie clara quedaría ilegible. */}
          <div className="group relative w-full shrink-0 overflow-hidden rounded-3xl border border-cta/20 bg-gradient-to-br from-sidebar via-sidebar to-sidebar-hover shadow-xl transition-all duration-500 hover:-translate-y-1.5 hover:border-cta/50 hover:shadow-[0_20px_50px_-12px_hsl(var(--cta)/0.3)] lg:w-[520px]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cta/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
            <div className="relative z-10 p-6">
              <UserCredentialCard />
            </div>
          </div>
        </div>

        <div className={cn(
          playEntrance && "animate-in fade-in slide-in-from-bottom-6 fill-mode-both delay-200 duration-700"
        )}>
          {/* Destacados: una card por columna (sin col-span, que las apilaría) */}
          {featured.length > 0 && (
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {featured.map(module => (
                <ModuleCard key={module.href} {...module} featured />
              ))}
            </div>
          )}

          {others.length > 0 && (
            <div className="mt-10">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Módulos Operativos
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {others.map(module => (
                  <ModuleCard key={module.href} {...module} />
                ))}
              </div>
            </div>
          )}

          {visibleModules.length === 0 && user.role !== 'guardia' && (
            <Alert className="mt-10 border-danger/30 bg-danger/5 text-danger">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="font-semibold tracking-tight">Acceso Restringido</AlertTitle>
              <AlertDescription>No tienes módulos asignados. Contacta al administrador de obra.</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
