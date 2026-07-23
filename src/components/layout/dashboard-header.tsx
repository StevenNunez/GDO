'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/modules/auth/useAuth';
import { useAppState } from '@/modules/data/useData';
import { Sidebar } from '@/components/sidebar';
import {
    Menu,
    Bell,
    Volume2,
    VolumeX,
    AlertCircle,
    ShoppingCart,
    ClipboardList,
    Users,
    LogOut,
    FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuPortal,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { differenceInDays, startOfDay } from 'date-fns';
import { toDate } from '@/lib/date-utils';
import { UserRole, type SupplierPayment, type MaterialRequest, type PurchaseRequest, type Supplier, type Tenant } from '@/modules/core/lib/data';
import { ROLES } from '@/modules/core/lib/permissions';
import { ThemeToggle } from '@/components/theme-toggle';

export function DashboardHeader() {
    const { user, logout, tenants, setCurrentTenantId } = useAuth();
    const {
        requests,
        purchaseRequests,
        supplierPayments,
        suppliers,
        purchaseOrders,
        can,
        projects,
        currentProjectId,
        setCurrentProjectId,
    } = useAppState();

    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [isMuted, setIsMuted] = React.useState(false);

    const today = React.useMemo(() => startOfDay(new Date()), []);

    const getInitials = (name: string) => {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    };

    const getRoleDisplayName = (role: UserRole) => {
        return ROLES[role]?.label || role;
    };

    const overduePayments = React.useMemo(() => (supplierPayments || []).filter((p: SupplierPayment) => {
        if (p.status === 'paid') return false;
        const dueDate = toDate(p.dueDate) || new Date(p.dueDate as any);
        return differenceInDays(dueDate, today) < 0;
    }), [supplierPayments, today]);

    const dueSoonPayments = React.useMemo(() => (supplierPayments || []).filter((p: SupplierPayment) => {
        if (p.status === 'paid') return false;
        const dueDate = toDate(p.dueDate) || new Date(p.dueDate as any);
        const daysLeft = differenceInDays(dueDate, today);
        return daysLeft >= 0 && daysLeft <= 7;
    }), [supplierPayments, today]);

    const pendingMaterialRequests = React.useMemo(() => (requests || []).filter((r: MaterialRequest) => r.status === 'pending').length, [requests]);
    const pendingPurchaseRequests = React.useMemo(() => (purchaseRequests || []).filter((pr: PurchaseRequest) => pr.status === 'pending').length, [purchaseRequests]);
    const pendingCotizaciones = React.useMemo(() => (purchaseOrders || []).filter(po => po.status === 'generated').length, [purchaseOrders]);

    const totalNotifications = React.useMemo(() => {
        let count = 0;
        if (can('material_requests:approve')) count += pendingMaterialRequests;
        if (can('purchase_requests:approve')) count += pendingPurchaseRequests;
        if (can('payments:view')) {
            count += overduePayments.length;
            count += dueSoonPayments.length;
        }
        if (can('finance:manage_purchase_orders')) {
            count += pendingCotizaciones;
        }
        return count;
    }, [can, pendingMaterialRequests, pendingPurchaseRequests, overduePayments, dueSoonPayments, pendingCotizaciones]);

    const supplierMap = React.useMemo(() => new Map<string, string>((suppliers || []).map((s: Supplier) => [s.id, s.name])), [suppliers]);

    const playNotificationSound = React.useCallback(() => {
        if (isMuted || typeof window === 'undefined') return;
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const audioContext = new AudioContext();
        function playTone(frequency: number, startTime: number, duration: number) {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(frequency, startTime);
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.6, startTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        }
        const now = audioContext.currentTime;
        playTone(980, now, 0.15);
        playTone(780, now + 0.2, 0.15);
    }, [isMuted]);

    React.useEffect(() => {
        if (totalNotifications > 0) playNotificationSound();
        if ('setAppBadge' in navigator) {
            (navigator as any).setAppBadge(totalNotifications).catch((e: any) => console.error('Error setting app badge:', e));
        }
    }, [totalNotifications, playNotificationSound]);

    // La portada `/dashboard` no lleva barra lateral: ahí el header muestra el
    // logo en vez del disparador del menú y del selector de obra.
    const isSubModulePage = pathname !== '/dashboard';

    if (!user) return null;

    return (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border/60 bg-card/60 px-4 backdrop-blur-sm lg:h-[60px] lg:px-6">
            {isSubModulePage && (
                <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="icon" className="shrink-0 md:hidden" aria-label="Abrir menú de navegación">
                            <Menu className="h-5 w-5" />
                            <span className="sr-only">Abrir menú de navegación</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="flex flex-col border-sidebar-border bg-sidebar p-0">
                        <Sidebar onLinkClick={() => setIsSidebarOpen(false)} />
                    </SheetContent>
                </Sheet>
            )}

            <div className="w-full flex-1">
                {!isSubModulePage && (
                    <Link href="/dashboard" className="group flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-md bg-primary text-[9px] font-black tracking-tight text-primary-foreground">
                            GDO
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">Gestión de Obras</span>
                            <span className="mt-0.5 text-[9px] font-medium uppercase tracking-widest text-muted-foreground/50">App</span>
                        </div>
                    </Link>
                )}
                {isSubModulePage && (
                    // Visible también en móvil: los datos de todo el dashboard están
                    // filtrados por la obra activa, así que ocultar el selector dejaba
                    // al usuario sin saber (ni poder cambiar) qué obra está viendo.
                    <div className="ml-2 flex items-center gap-2 md:ml-4">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={`h-8 max-w-[7rem] gap-1 sm:max-w-none ${!currentProjectId && projects.length > 0 ? 'border-warning text-warning' : ''}`}
                                >
                                    <FileText className="h-4 w-4 shrink-0" />
                                    <span className="truncate">
                                        {projects.length === 0
                                            ? 'Sin obras'
                                            : projects.find(p => p.id === currentProjectId)?.name || 'Vista Global'}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Obra activa</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {projects.length === 0 ? (
                                    <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                                        No hay obras creadas aún
                                    </DropdownMenuItem>
                                ) : (
                                    <>
                                        <DropdownMenuItem onSelect={() => setCurrentProjectId(null)}>
                                            <span className="font-semibold text-primary italic">Todas las obras</span>
                                        </DropdownMenuItem>
                                        {projects.map((p) => (
                                            <DropdownMenuItem key={p.id} onSelect={() => setCurrentProjectId(p.id)}>
                                                {p.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </>
                                )}
                                <DropdownMenuSeparator />
                                <Link href="/dashboard/projects">
                                    <DropdownMenuItem>
                                        <span>{projects.length === 0 ? 'Crear primera obra' : 'Gestionar obras'}</span>
                                    </DropdownMenuItem>
                                </Link>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                {/* En móvil no cabe junto al selector de obra; es la acción menos
                    crítica de las cuatro, así que se oculta bajo sm. */}
                <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => setIsMuted(!isMuted)}>
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    <span className="sr-only">{isMuted ? 'Activar sonido' : 'Silenciar'}</span>
                </Button>

                <ThemeToggle />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            {totalNotifications > 0 && (
                                <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center rounded-full p-0">
                                    {totalNotifications}
                                </Badge>
                            )}
                            <span className="sr-only">Abrir notificaciones</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                        <DropdownMenuLabel>Centro de Notificaciones</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {totalNotifications === 0 ? (
                            <DropdownMenuItem disabled className="text-muted-foreground">No hay notificaciones nuevas.</DropdownMenuItem>
                        ) : (
                            <>
                                {can('finance:manage_purchase_orders') && pendingCotizaciones > 0 && (
                                    <Link href="/dashboard/purchasing/finance">
                                        <DropdownMenuItem>
                                            <FileText className="mr-2 h-4 w-4 text-info" />
                                            <span>{pendingCotizaciones} Cotización(es) por Procesar</span>
                                        </DropdownMenuItem>
                                    </Link>
                                )}
                                {can('purchase_requests:approve') && pendingPurchaseRequests > 0 && (
                                    <Link href="/dashboard/purchasing/purchase-requests">
                                        <DropdownMenuItem>
                                            <ShoppingCart className="mr-2 h-4 w-4 text-cyan-500" />
                                            <span>{pendingPurchaseRequests} Solicitud(es) de Compra</span>
                                        </DropdownMenuItem>
                                    </Link>
                                )}
                                {can('material_requests:approve') && pendingMaterialRequests > 0 && (
                                    <Link href="/dashboard/bodega/requests">
                                        <DropdownMenuItem>
                                            <ClipboardList className="mr-2 h-4 w-4 text-purple-500" />
                                            <span>{pendingMaterialRequests} Solicitud(es) de Material</span>
                                        </DropdownMenuItem>
                                    </Link>
                                )}
                                {can('payments:view') && overduePayments.length > 0 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-red-500">Pagos Vencidos</DropdownMenuLabel>
                                        {overduePayments.map((p: SupplierPayment) => (
                                            <Link key={p.id} href="/dashboard/payments">
                                                <DropdownMenuItem className="text-red-500">
                                                    <AlertCircle className="mr-2 h-4 w-4" />
                                                    <span>Factura {p.invoiceNumber} ({supplierMap.get(p.supplierId) || 'N/A'}) vencida.</span>
                                                </DropdownMenuItem>
                                            </Link>
                                        ))}
                                    </>
                                )}
                                {can('payments:view') && dueSoonPayments.length > 0 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-amber-500">Pagos por Vencer</DropdownMenuLabel>
                                        {dueSoonPayments.map((p: SupplierPayment) => (
                                            <Link key={p.id} href="/dashboard/payments">
                                                <DropdownMenuItem className="text-amber-500">
                                                    <AlertCircle className="mr-2 h-4 w-4" />
                                                    <span>Factura {p.invoiceNumber} ({supplierMap.get(p.supplierId) || 'N/A'}) vence en {differenceInDays(toDate(p.dueDate) || new Date(p.dueDate as any), today)} días.</span>
                                                </DropdownMenuItem>
                                            </Link>
                                        ))}
                                    </>
                                )}
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="icon" className="rounded-full">
                            <Avatar>
                                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                            </Avatar>
                            <span className="sr-only">Toggle user menu</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel>
                            <p className="font-semibold">{user.name}</p>
                            <p className="text-xs text-muted-foreground font-normal">{user.email}</p>
                            <p className="text-xs text-primary font-medium pt-1">{getRoleDisplayName(user.role)}</p>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {user.role === 'super-admin' && (
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <Users className="mr-2 h-4 w-4" />
                                    <span>Cambiar Inquilino</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem onSelect={() => setCurrentTenantId(null)}>
                                            Ver Todos los Inquilinos
                                        </DropdownMenuItem>
                                        {(tenants || []).map((tenant: Tenant) => (
                                            <DropdownMenuItem key={tenant.id} onSelect={() => setCurrentTenantId(tenant.tenantId)}>
                                                {tenant.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                        )}
                        <DropdownMenuItem asChild>
                            <Link href="/dashboard/profile">
                                <Users className="mr-2 h-4 w-4" />
                                <span>Mi Perfil</span>
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={logout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Cerrar Sesión</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

            </div>
        </header>
    );
}
