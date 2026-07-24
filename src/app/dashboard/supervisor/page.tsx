"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  ShoppingCart,
  RotateCcw,
  Clock,
  AlertTriangle,
  Plus,
  PackageCheck,
  ArrowRight,
  FileText,
  SearchX,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import type { MaterialRequest, PurchaseRequest, ReturnRequest, Material } from "@/modules/core/lib/data";
import { cn } from "@/lib/utils";
import { toDate } from "@/lib/date-utils";

// ── Types ──────────────────────────────────────────────────────────────────
type ActivityItem = {
  id: string;
  type: "request" | "purchase" | "return";
  title: string;
  subtitle: string;
  time: Date;
  status: string;
  delivered?: boolean;
  href: string;
};

// El estado sí es semántico → tonos de StatusBadge (varios estados colapsan en
// el mismo tono, p. ej. aprobado/ordenado = info, completado/recibido = success).
function getStatusInfo(status: string, delivered = false): { label: string; tone: StatusTone } {
  if (delivered) return { label: "Entregado", tone: "success" };
  const map: Record<string, { label: string; tone: StatusTone }> = {
    pending:   { label: "Pendiente",  tone: "warning" },
    approved:  { label: "Aprobado",   tone: "info" },
    rejected:  { label: "Rechazado",  tone: "danger" },
    completed: { label: "Completado", tone: "success" },
    ordered:   { label: "Ordenado",   tone: "info" },
    received:  { label: "Recibido",   tone: "success" },
    batched:   { label: "En Lote",    tone: "neutral" },
  };
  return map[status] ?? { label: status, tone: "neutral" };
}

// El tipo (Bodega/Compra/Devolución) es una CATEGORÍA, no un estado. Va con
// paleta propia en pares claro/oscuro, igual que el clima de la bitácora.
function getTypeConfig(t: string) {
  switch (t) {
    case "request":  return { label: "Bodega",     iconCls: "text-primary",      bgCls: "bg-primary/10" };
    case "purchase": return { label: "Compra",     iconCls: "text-blue-600 dark:text-blue-400",   bgCls: "bg-blue-100 dark:bg-blue-900/30" };
    case "return":   return { label: "Devolución", iconCls: "text-purple-600 dark:text-purple-400", bgCls: "bg-purple-100 dark:bg-purple-900/30" };
    default:         return { label: "Otro",       iconCls: "text-muted-foreground", bgCls: "bg-muted" };
  }
}

function getTypeIcon(t: string) {
  if (t === "request")  return Package;
  if (t === "purchase") return ShoppingCart;
  if (t === "return")   return RotateCcw;
  return FileText;
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function SupervisorHubPage() {
  const { requests, purchaseRequests, returnRequests, materials } = useAppState();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  };

  // ── Metrics ──
  const metrics = useMemo(() => {
    if (!user) return { pending: 0, delivery: 0, returns: 0, lowStock: 0 };
    const reqs  = (requests         || []) as MaterialRequest[];
    const pr    = (purchaseRequests  || []) as PurchaseRequest[];
    const ret   = (returnRequests    || []) as ReturnRequest[];
    const mats  = (materials         || []) as Material[];
    return {
      pending:  reqs.filter(r => r.supervisorId === user.id && r.status === "pending").length +
                pr.filter(r => r.supervisorId === user.id && r.status === "pending").length,
      delivery: reqs.filter(r => r.supervisorId === user.id && r.status === "approved" && !r.deliveryDate).length,
      returns:  ret.filter(r => r.supervisorId === user.id && r.status === "pending").length,
      lowStock: mats.filter(m => !m.archived && m.stock <= 10).length,
    };
  }, [requests, purchaseRequests, returnRequests, materials, user]);

  // ── Activity feed ──
  const allActivity = useMemo(() => {
    if (!user) return [];
    const mats = materials || [];
    const list: ActivityItem[] = [];

    (requests || []).forEach((r: MaterialRequest) => {
      if (r.supervisorId !== user.id) return;
      const single = r.items?.length === 1 ? mats.find(m => m.id === r.items![0].materialId)?.name : null;
      list.push({
        id: `req-${r.id}`,
        type: "request",
        title: single ? `Solicitud: ${single}` : r.items?.length ? `${r.items.length} ítems solicitados` : "Solicitud de material",
        subtitle: `Destino: ${r.area || "Obra"}`,
        time: toDate(r.createdAt) || new Date(r.createdAt as any),
        status: r.status,
        delivered: !!r.deliveryDate,
        href: "/dashboard/supervisor/request",
      });
    });

    (purchaseRequests || []).forEach((r: PurchaseRequest) => {
      if (r.supervisorId !== user.id) return;
      list.push({
        id: `pur-${r.id}`,
        type: "purchase",
        title: r.materialName || "Solicitud de compra",
        subtitle: `Cantidad: ${r.quantity} ${r.unit}`,
        time: toDate(r.createdAt) || new Date(r.createdAt as any),
        status: r.status,
        href: "/dashboard/supervisor/purchase-request-form",
      });
    });

    (returnRequests || []).forEach((r: ReturnRequest) => {
      if (r.supervisorId !== user.id) return;
      const count = (r as any).items?.length ?? 1;
      list.push({
        id: `ret-${r.id}`,
        type: "return",
        title: count === 1 ? "Devolución de material" : `Devolución (${count} ítems)`,
        subtitle: `${count} ítem${count > 1 ? "s" : ""} devuelto${count > 1 ? "s" : ""}`,
        time: toDate(r.createdAt) || new Date(r.createdAt as any),
        status: r.status,
        href: "/dashboard/supervisor/return-request",
      });
    });

    return list.sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [requests, purchaseRequests, returnRequests, materials, user]);

  const filtered = useMemo(() => {
    const base = activeTab === "all" ? allActivity : allActivity.filter(a => a.type === activeTab);
    return base.slice(0, 20);
  }, [activeTab, allActivity]);

  const pendingItems = allActivity.filter(a => a.status === "pending");

  // ── Render ──
  return (
    <div className="flex flex-col gap-6 pb-16 fade-in">
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0] ?? "Supervisor"}`}
        description="Panel de control operativo de tu obra."
      />

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Pendientes aprobación" value={metrics.pending} icon={Clock} tone="warning" />
        <StatTile label="Por recibir" value={metrics.delivery} icon={PackageCheck} tone="info" />
        <StatTile label="Devoluciones pend." value={metrics.returns} icon={RotateCcw} tone="neutral" />
        <StatTile label="Stock crítico (≤10)" value={metrics.lowStock} icon={AlertTriangle} tone="danger" />
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SurfaceCard href="/dashboard/supervisor/request" className="p-5">
          <div className="relative z-10 flex items-center gap-4">
            <div className="shrink-0 rounded-xl bg-primary/10 p-3 text-primary">
              <Package className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold transition-colors group-hover:text-primary">Solicitar a Bodega</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Material disponible en stock</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-cta/40 transition-all group-hover:translate-x-0.5 group-hover:text-cta" />
          </div>
        </SurfaceCard>

        <SurfaceCard href="/dashboard/supervisor/purchase-request-form" className="p-5">
          <div className="relative z-10 flex items-center gap-4">
            <div className="shrink-0 rounded-xl bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold transition-colors group-hover:text-primary">Solicitar Compra</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Material sin stock en bodega</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-cta/40 transition-all group-hover:translate-x-0.5 group-hover:text-cta" />
          </div>
        </SurfaceCard>

        <SurfaceCard href="/dashboard/supervisor/return-request" className="p-5">
          <div className="relative z-10 flex items-center gap-4">
            <div className="shrink-0 rounded-xl bg-purple-100 p-3 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <RotateCcw className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold transition-colors group-hover:text-primary">Devolver Material</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Retornar sobrantes a bodega</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-cta/40 transition-all group-hover:translate-x-0.5 group-hover:text-cta" />
          </div>
        </SurfaceCard>
      </div>

      {/* ── Pending alert (if any) ── */}
      {pendingItems.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-subtle p-4">
          <Clock className="h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-warning">
              Tienes {pendingItems.length} solicitud{pendingItems.length > 1 ? "es" : ""} pendiente{pendingItems.length > 1 ? "s" : ""} de aprobación
            </p>
            <p className="mt-0.5 text-xs text-warning/80">
              Pueden tardar hasta 24 horas en ser procesadas.
            </p>
          </div>
          <Link href="/dashboard/supervisor/request">
            <Button size="sm" variant="outline" className="shrink-0 border-warning/40 text-warning hover:bg-warning/10">
              Ver <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}

      {/* ── Activity feed ── */}
      <PanelCard
        title="Historial de Actividad"
        description={
          allActivity.length > 0
            ? `${allActivity.length} movimiento${allActivity.length > 1 ? "s" : ""} registrado${allActivity.length > 1 ? "s" : ""}`
            : "Tus solicitudes, compras y devoluciones aparecerán aquí."
        }
        icon={FileText}
        actions={
          <Link href="/dashboard/supervisor/request">
            <Button size="sm" variant="outline" className="shrink-0">
              Ver todo <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        }
      >
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 grid h-auto w-full grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="all">Todo</TabsTrigger>
              <TabsTrigger value="request" className="gap-1.5">
                <Package className="h-3.5 w-3.5" /> Bodega
              </TabsTrigger>
              <TabsTrigger value="purchase" className="gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5" /> Compras
              </TabsTrigger>
              <TabsTrigger value="return" className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Devol.
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-14 text-muted-foreground">
                  <SearchX className="mb-3 h-10 w-10 opacity-30" />
                  <p className="text-sm">No hay movimientos en esta categoría.</p>
                  <p className="mt-1 text-xs opacity-60">Crea tu primera solicitud usando las acciones de arriba.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(act => {
                    const tc   = getTypeConfig(act.type);
                    const sc   = getStatusInfo(act.status, act.delivered);
                    const Icon = getTypeIcon(act.type);

                    return (
                      <Link key={act.id} href={act.href}>
                        <div className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-muted/40 p-3.5 transition-all hover:bg-muted">
                          {/* Icon */}
                          <div className={cn("shrink-0 rounded-lg p-2", tc.bgCls)}>
                            <Icon className={cn("h-4 w-4", tc.iconCls)} />
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium">{act.title}</span>
                              <StatusBadge tone="neutral" className="h-4 shrink-0 px-1.5 text-[10px] font-normal">
                                {tc.label}
                              </StatusBadge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {act.subtitle} · {formatDistanceToNow(act.time, { addSuffix: true, locale: es })}
                            </p>
                          </div>

                          {/* Status + arrow */}
                          <div className="flex shrink-0 items-center gap-2">
                            <StatusBadge tone={sc.tone} className="hidden whitespace-nowrap sm:inline-flex">
                              {sc.label}
                            </StatusBadge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
      </PanelCard>

      {/* Mobile FAB */}
      <Link href="/dashboard/supervisor/request">
        <Button className="fixed bottom-6 right-6 rounded-full shadow-xl h-14 w-14 p-0 md:hidden z-50">
          <Plus className="h-7 w-7" />
        </Button>
      </Link>
    </div>
  );
}
