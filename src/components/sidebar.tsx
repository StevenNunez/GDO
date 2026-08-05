
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import {
  LayoutDashboard,
  Calculator,
  Boxes,
  Wrench,
  Users,
  ClipboardList,
  Warehouse,
  Package,
  PlusCircle,
  ShoppingCart,
  Briefcase,
  PackagePlus,
  FileText,
  Edit,
  CalendarCheck,
  Clock,
  BookOpen,
  FileBarChart,
  Ruler,
  ShieldCheck,
  FileUp,
  ListChecks,
  ShieldAlert,
  ClipboardPaste,
  BarChart3,
  QrCode,
  Undo2,
  FolderTree,
  HandCoins,
  Crown,
  Construction,
  CheckSquare,
  GanttChartSquare,
  Wallet,
  HandPlatter,
  History,
  UserCircle,
  Building2,
  BookMarked,
  FileSignature,
  ReceiptText,
  FilePlus2,
  MessageCircleQuestion,
  FileStack,
  CalendarRange,
  HardHat,
  ClipboardCheck,
  Link2,
  TrendingUp,
} from 'lucide-react';

import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import { cn } from '@/lib/utils';
import { UserRole } from '@/modules/core/lib/data';
import type { Permission } from '@/modules/core/lib/permissions';
import { TenantSwitcher } from '@/components/TenantSwitcher';

interface ModuleCardProps {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}

const warehouseNavItems = (can: (p: Permission) => boolean) => {
  const items = [];

  if (can('module_warehouse:view')) items.push({ href: '/dashboard/bodega', icon: LayoutDashboard, label: 'Resumen Bodega' });
  if (can('material_requests:approve')) items.push({ href: '/dashboard/bodega/requests', icon: ClipboardList, label: 'Gestionar Solicitudes' });
  if (can('return_requests:approve')) items.push({ href: '/dashboard/bodega/return-requests', icon: Undo2, label: 'Gestionar Devoluciones' });
  if (can('tools:view_all')) items.push({ href: '/dashboard/bodega/tools', icon: Wrench, label: 'Herramientas' });
  if (can('materials:view_all')) items.push({ href: '/dashboard/bodega/materials', icon: Package, label: 'Materiales' });
  if (can('stock:add_manual')) items.push({ href: '/dashboard/bodega/manual-stock-entry', icon: Edit, label: 'Ingreso Manual' });
  if (can('units:create')) items.push({ href: '/dashboard/bodega/units', icon: Ruler, label: 'Unidades' });

  return items;
}

const supervisorNavItems = (can: (p: Permission) => boolean) => {
  const items = [];

  if (can('module_warehouse:view')) items.push({ href: '/dashboard/supervisor', icon: LayoutDashboard, label: 'Resumen Supervisor' });
  if (can('material_requests:create')) items.push({ href: '/dashboard/supervisor/request', icon: PlusCircle, label: 'Solicitar Materiales' });
  if (can('purchase_requests:create')) items.push({ href: '/dashboard/supervisor/purchase-request-form', icon: ShoppingCart, label: 'Solicitar Compra' });
  if (can('return_requests:create')) items.push({ href: '/dashboard/supervisor/return-request', icon: Undo2, label: 'Registrar Devolución' });
  if (can('tools:view_own')) {
    items.push({ href: '/dashboard/worker', icon: Wallet, label: 'Mi Billetera Digital' });
    items.push({ href: '/dashboard/worker/herramientas', icon: Wrench, label: 'Mis Herramientas' });
    items.push({ href: '/dashboard/worker/asistencia', icon: CalendarCheck, label: 'Mi Asistencia' });
    items.push({ href: '/dashboard/worker/liquidacion', icon: FileBarChart, label: 'Mis Liquidaciones' });
    items.push({ href: '/dashboard/worker/finiquito', icon: HandCoins, label: 'Mi Finiquito' });
  }

  return items;
};

const workerNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('tools:view_own')) {
    items.push({ href: '/dashboard/worker', icon: Wallet, label: 'Mi Billetera Digital' });
    items.push({ href: '/dashboard/worker/herramientas', icon: Wrench, label: 'Mis Herramientas' });
    items.push({ href: '/dashboard/worker/asistencia', icon: CalendarCheck, label: 'Mi Asistencia' });
    items.push({ href: '/dashboard/worker/liquidacion', icon: FileBarChart, label: 'Mis Liquidaciones' });
    items.push({ href: '/dashboard/worker/finiquito', icon: HandCoins, label: 'Mi Finiquito' });
  }
  return items;
}

const cphsNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('module_safety:view')) {
    items.push({ href: '/dashboard/cphs', icon: LayoutDashboard, label: 'Resumen CPHS' });
  }
  if (can('safety_templates:create')) {
    items.push({ href: '/dashboard/safety/templates', icon: FileUp, label: 'Gestión de Plantillas' });
  }
  if (can('safety_checklists:review')) {
    items.push({ href: '/dashboard/safety/review-checklists', icon: ShieldCheck, label: 'Revisar Checklists' });
  }
  if (can('safety_inspections:review')) {
    items.push({ href: '/dashboard/safety/review-inspections', icon: ShieldCheck, label: 'Revisar Inspecciones' });
  }
  if (can('safety_observations:review')) {
    items.push({ href: '/dashboard/safety/review-observations', icon: ShieldCheck, label: 'Revisar Observaciones' });
  }
  return items;
}

const purchasingNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('module_purchasing:view')) items.push({ href: '/dashboard/purchasing', icon: LayoutDashboard, label: 'Resumen' });
  if (can('purchase_requests:create')) items.push({ href: '/dashboard/purchasing/purchase-request-form', icon: Edit, label: 'Crear Solicitud Compra' });
  if (can('purchase_requests:view_all')) items.push({ href: '/dashboard/purchasing/purchase-requests', icon: ShoppingCart, label: 'Solicitudes de Compra' });
  if (can('lots:create')) items.push({ href: '/dashboard/purchasing/lots', icon: PackagePlus, label: 'Gestión de Lotes' });
  if (can('orders:create') || can('finance:manage_purchase_orders')) items.push({ href: '/dashboard/purchasing/orders', icon: FileText, label: 'Generador de Cotizaciones' });
  if (can('suppliers:view')) items.push({ href: '/dashboard/purchasing/suppliers', icon: Briefcase, label: 'Proveedores' });
  if (can('categories:view')) items.push({ href: '/dashboard/purchasing/categories', icon: FolderTree, label: 'Categorías' });

  return items;
};

const usersNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('users:view')) {
    items.push({ href: '/dashboard/users', icon: Users, label: 'Lista de Usuarios' });
  }
  if (can('permissions:manage')) {
    items.push({ href: '/dashboard/permissions', icon: ListChecks, label: 'Gestión de Permisos' });
  }
  if (can('users:print_qr')) {
    items.push({ href: '/dashboard/users/print-qrs', icon: QrCode, label: 'Imprimir Credenciales' });
  }
  return items;
};

const attendanceNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('module_attendance:view')) {
    items.push({ href: '/dashboard/attendance', icon: LayoutDashboard, label: 'Resumen' });
  }
  if (can('attendance:register')) {
    items.push({ href: '/dashboard/attendance/registry', icon: CalendarCheck, label: 'Registro de Asistencia' });
  }
  if (can('attendance:edit') || can('attendance:view')) {
    items.push({ href: '/dashboard/attendance/report', icon: BookOpen, label: 'Reporte Semanal' });
    items.push({ href: '/dashboard/attendance/monthly-report', icon: FileBarChart, label: 'Reporte Mensual' });
    items.push({ href: '/dashboard/attendance/overtime', icon: Clock, label: 'Horas Extras' });
    items.push({ href: '/dashboard/attendance/severance', icon: HandCoins, label: 'Generador de Finiquito' });
  }
  return items;
};

const paymentsNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('payments:view')) items.push({ href: '/dashboard/payments', icon: LayoutDashboard, label: 'Gestión de Facturas' });
  if (can('payments:view')) items.push({ href: '/dashboard/payments/advances', icon: HandPlatter, label: 'Gestionar Adelantos' });
  if (can('finance:manage_purchase_orders')) items.push({ href: '/dashboard/purchasing/finance', icon: FileText, label: 'Gestionar OC' });
  if (can('orders:view_all')) items.push({ href: '/dashboard/payments/orders', icon: ClipboardList, label: 'Historial de OCs' });
  if (can('suppliers:view') && can('module_payments:view')) items.push({ href: '/dashboard/payments/suppliers', icon: Briefcase, label: 'Proveedores' });
  return items;
};

const reportsNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('reports:view')) {
    items.push({ href: '/dashboard/reports', icon: BarChart3, label: 'Estadísticas de Consumo' });
    items.push({ href: '/dashboard/reports/deliveries', icon: FileBarChart, label: 'Reporte de Entregas' });
    items.push({ href: '/dashboard/reports/inventory', icon: Warehouse, label: 'Reporte de Inventario' });
    items.push({ href: '/dashboard/material-control', icon: Package, label: 'Control de Materiales' });
  }
  return items;
};

const subscriptionsNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('module_subscriptions:view')) {
    items.push({ href: '/dashboard/subscriptions', icon: Users, label: 'Suscriptores' });
    items.push({ href: '/dashboard/subscriptions/plans', icon: Crown, label: 'Planes y Permisos' });
  }
  return items;
};

const projectsNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('projects:view')) {
    items.push({ href: '/dashboard/projects', icon: Construction, label: 'Lista de Obras' });
  }
  if (can('clients:view')) {
    items.push({ href: '/dashboard/clients', icon: Users, label: 'Clientes' });
  }
  return items;
};

const permissionsNavItems = [
  { href: '/dashboard/permissions', icon: ListChecks, label: 'Gestión de Permisos' },
];

const profileNavItems = (user: { role?: string } | null) => {
  const items = [
    { href: '/dashboard/profile', icon: UserCircle, label: 'Mi Perfil' },
  ];
  if (user?.role && ['admin', 'operations', 'soporte', 'super-admin'].includes(user.role)) {
    items.push({ href: '/dashboard/profile/empresa', icon: Building2, label: 'Mi Empresa' });
    items.push({ href: '/dashboard/vinculos', icon: Link2, label: 'Empresas Vinculadas' });
  }
  return items;
};

const safetyNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('module_safety:view')) items.push({ href: '/dashboard/safety', icon: LayoutDashboard, label: 'Resumen' });
  if (can('safety_observations:create')) items.push({ href: '/dashboard/safety/daily-talk', icon: ClipboardPaste, label: 'Charla Diaria' });
  if (can('safety_observations:review')) {
    items.push({ href: '/dashboard/safety/review-daily-talks', icon: History, label: 'Historial de Charlas' });
  }
  if (can('safety_inspections:create')) items.push({ href: '/dashboard/safety/inspection', icon: ShieldAlert, label: 'Nueva Inspección' });
  if (can('safety_observations:create')) items.push({ href: '/dashboard/safety/behavior-observation', icon: ClipboardPaste, label: 'Nueva Observación' });

  if (can('safety_templates:create')) {
    items.push({ href: '/dashboard/safety/templates', icon: FileUp, label: 'Gestión de Plantillas' });
  }
  if (can('safety_checklists:review')) {
    items.push({ href: '/dashboard/safety/review-checklists', icon: ShieldCheck, label: 'Revisar Checklists' });
  }
  if (can('safety_inspections:review')) {
    items.push({ href: '/dashboard/safety/review-inspections', icon: ShieldCheck, label: 'Revisar Inspecciones' });
  }
  if (can('safety_observations:review')) {
    items.push({ href: '/dashboard/safety/review-observations', icon: ShieldCheck, label: 'Revisar Observaciones' });
  }
  if (can('safety_checklists:complete')) {
    items.push({ href: '/dashboard/safety/assigned-checklists', icon: ListChecks, label: 'Mis Checklists' });
  }
  if (can('safety_inspections:complete')) {
    items.push({ href: '/dashboard/safety/assigned-inspections', icon: ShieldCheck, label: 'Mis Inspecciones' });
  }

  // Deduplicate items just in case
  return Array.from(new Map(items.map(item => [item.href, item])).values());
};

const constructionControlNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('module_construction_control:view')) {
    items.push({ href: '/dashboard/construction-control', icon: LayoutDashboard, label: 'Resumen de Obra' });
  }
  if (can('construction_control:edit_structure') || can('construction_control:register_progress')) {
    items.push({ href: '/dashboard/construction-control/wbs', icon: FolderTree, label: 'Partidas (EDT)' });
  }
  if (can('construction_control:edit_structure')) {
    items.push({ href: '/dashboard/construction-control/gantt', icon: GanttChartSquare, label: 'Carta Gantt' });
  }
  if (can('module_construction_control:view')) {
    items.push({ href: '/dashboard/construction-control/bitacora', icon: BookOpen, label: 'Bitácora de Obra' });
    items.push({ href: '/dashboard/construction-control/libro-obra', icon: BookMarked, label: 'Libro de Obra' });
  }
  if (can('construction_control:review_protocols')) {
    items.push({ href: '/dashboard/construction-control/revisar-protocolos', icon: CheckSquare, label: 'Revisar Protocolos' });
  }
  if (can('construction_control:register_progress')) {
    items.push({ href: '/dashboard/construction-control/mis-protocolos', icon: ClipboardList, label: 'Mis Protocolos' });
  }
  return items;
};

const oficinaTecnicaNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('module_technical_office:view')) {
    items.push({ href: '/dashboard/oficina-tecnica', icon: LayoutDashboard, label: 'Resumen' });
  }
  if (can('contracts:view')) {
    items.push({ href: '/dashboard/oficina-tecnica/contrato', icon: FileSignature, label: 'Contrato' });
  }
  if (can('payment_certificates:view')) {
    items.push({ href: '/dashboard/oficina-tecnica/estados-de-pago', icon: ReceiptText, label: 'Estados de Pago' });
  }
  if (can('contracts:view')) {
    items.push({ href: '/dashboard/oficina-tecnica/adicionales', icon: FilePlus2, label: 'Adicionales' });
  }
  if (can('cost_control:view')) {
    items.push({ href: '/dashboard/oficina-tecnica/control-costos', icon: TrendingUp, label: 'Control de Costos' });
  }
  if (can('rdi:create') || can('rdi:answer')) {
    items.push({ href: '/dashboard/oficina-tecnica/rdi', icon: MessageCircleQuestion, label: 'RDI' });
  }
  if (can('module_technical_office:view')) {
    items.push({ href: '/dashboard/oficina-tecnica/planos', icon: FileStack, label: 'Planos' });
  }
  if (can('planning:view') || can('planning:manage')) {
    items.push({ href: '/dashboard/oficina-tecnica/programacion', icon: CalendarRange, label: 'Programación' });
  }
  if (can('subcontracts:view')) {
    items.push({ href: '/dashboard/oficina-tecnica/subcontratos', icon: HardHat, label: 'Subcontratos' });
  }
  if (can('receptions:manage') || can('module_technical_office:view')) {
    items.push({ href: '/dashboard/oficina-tecnica/recepcion', icon: ClipboardCheck, label: 'Recepción' });
  }
  if (can('construction_control:edit_structure')) {
    items.push({ href: '/dashboard/oficina-tecnica/presupuesto', icon: Wallet, label: 'Presupuesto' });
    items.push({ href: '/dashboard/oficina-tecnica/apu', icon: Calculator, label: 'APU' });
    items.push({ href: '/dashboard/oficina-tecnica/recursos', icon: Boxes, label: 'Recursos' });
  }
  return items;
};

/** Portal del subcontratista: su propio subcontrato y sus estados de pago. */
const paymentStatusNavItems = (can: (p: Permission) => boolean) => {
  const items = [];
  if (can('subcontractor_portal:view')) {
    items.push({ href: '/dashboard/estado-pago', icon: HardHat, label: 'Mi Subcontrato' });
    items.push({ href: '/dashboard/estado-pago/historial', icon: History, label: 'Mis Estados de Pago' });
  }
  return items;
};


interface SidebarProps {
  onLinkClick?: () => void;
}

export function Sidebar({ onLinkClick }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  // can() debe venir de useAppState(): usa los roles dinámicos de la DB y
  // excluye los permisos superadmin-only para admin/operations.
  const { can } = useAppState();

  const handleLinkClick = () => {
    if (onLinkClick) {
      onLinkClick();
    }
  }

  const { navItems, moduleTitle, isSubModule } = React.useMemo(() => {
    if (!user) return { navItems: [], moduleTitle: '', isSubModule: false };

    let navItems: { href: string; icon: React.ElementType; label: string; }[] = [];
    let title = '';
    let isSub = true;

    const pathSegments = pathname.split('/').filter(Boolean);
    const mainModule = pathSegments[1];

    switch (mainModule) {
      case 'bodega':
        navItems = warehouseNavItems(can);
        title = 'Módulo Bodega';
        break;
      case 'users':
        navItems = usersNavItems(can);
        title = 'Módulo de Usuarios';
        break;
      case 'attendance':
        navItems = attendanceNavItems(can);
        title = 'Módulo de Asistencia';
        break;
      case 'safety':
        navItems = safetyNavItems(can);
        title = 'Prevención de Riesgos';
        break;
      case 'payments':
        navItems = paymentsNavItems(can);
        title = 'Módulo de Pagos';
        break;
      case 'reports':
        navItems = reportsNavItems(can);
        title = 'Estadísticas y Reportes';
        break;
      case 'subscriptions':
        navItems = subscriptionsNavItems(can);
        title = 'Módulo de Suscripciones';
        break;
      case 'permissions':
        navItems = permissionsNavItems;
        title = 'Gestión de Permisos';
        break;
      case 'purchasing':
        navItems = purchasingNavItems(can);
        title = 'Gestión de Compras';
        break;
      case 'supervisor':
        title = 'Módulo de Terreno';
        navItems = supervisorNavItems(can);
        break;
      case 'worker':
        if (user.role === 'worker') {
          title = 'Módulo Trabajador';
          navItems = workerNavItems(can);
        } else {
          title = 'Módulo de Terreno';
          navItems = supervisorNavItems(can);
        }
        break;
      case 'cphs':
        title = 'Módulo Comité Paritario';
        navItems = cphsNavItems(can);
        break;
      case 'construction-control':
        title = 'Control de Obra';
        navItems = constructionControlNavItems(can);
        break;
      case 'oficina-tecnica':
        title = 'Oficina Técnica';
        navItems = oficinaTecnicaNavItems(can);
        break;
      case 'estado-pago':
        title = 'Mi Subcontrato';
        navItems = paymentStatusNavItems(can);
        break;
      case 'material-control':
        title = 'Control de Materiales';
        navItems = reportsNavItems(can);
        break;
      case 'projects':
      case 'clients':
        title = 'Obras y Clientes';
        navItems = projectsNavItems(can);
        break;
      case 'profile':
      case 'vinculos':
        navItems = profileNavItems(user);
        title = 'Mi Perfil';
        break;
      default:
        isSub = false;
        title = 'Portal de Módulos';
        break;
    }

    return { navItems, moduleTitle: title, isSubModule: isSub };

  }, [pathname, user, can]);

  return (
    <div className="flex h-full max-h-screen flex-col bg-sidebar text-sidebar-foreground">
      {/* GDO Brand Header */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4 lg:h-[60px] lg:px-6">
        <Link href="/dashboard" className="group flex items-center gap-2.5" onClick={handleLinkClick}>
          <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-md bg-sidebar-active text-[9px] font-black tracking-tight text-sidebar">
            GDO
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold text-sidebar-foreground transition-colors group-hover:text-sidebar-active">
              Gestión de Obras
            </span>
            <span className="mt-0.5 text-[9px] font-medium uppercase tracking-widest text-sidebar-muted">
              App
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3">
        {isSubModule && moduleTitle && (
          <div className="mb-2 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted">
              {moduleTitle}
            </span>
          </div>
        )}
        <nav className="grid gap-px px-2 lg:px-3">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <div key={item.href} className="relative">
                {isActive && (
                  <span className="pointer-events-none absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-active" />
                )}
                <Link
                  href={item.href}
                  onClick={handleLinkClick}
                  className={cn(
                    'flex items-center gap-3 rounded-md py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-sidebar-hover pl-4 pr-3 font-medium text-sidebar-active'
                      : 'px-3 text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Super-admin: tenant switcher */}
      {user?.role === 'super-admin' && (
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <TenantSwitcher />
        </div>
      )}
    </div>
  );
}
