'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/modules/auth/useAuth';
import { useAppState } from '@/modules/data/useData';
import { Sidebar } from '@/components/sidebar';
import {
    Menu,
    LayoutGrid,
    UserRound,
    Bell,
    Volume2,
    VolumeX,
    AlertCircle,
    ShoppingCart,
    ClipboardList,
    Users,
    LogOut,
    FileText,
    ChevronDown,
    Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
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
import { usePlannerHealth } from '@/components/operations/use-planner-health';
import { Sparkline } from '@/components/operations/planner-ui';
import { toneForPpc } from '@/lib/planner-tones';
import { cn } from '@/lib/utils';

/**
 * `torre`: cabecera de control a todo el ancho (fondo Prussian Blue, obra con su contexto y PPC
 * de la semana). Hoy solo se usa en Last Planner; `default` es la cabecera clara de siempre.
 */
export function DashboardHeader({ variant = 'default' }: { variant?: 'default' | 'torre' }) {
    const { user, logout, tenants, setCurrentTenantId } = useAuth();
    const {
        requests,
        purchaseRequests,
        supplierPayments,
        suppliers,
        purchaseOrders,
        can,
        projects,
        clients,
        currentProjectId,
        setCurrentProjectId,
    } = useAppState();

    const torre = variant === 'torre';
    const planner = usePlannerHealth(torre && (can('planning:view') || can('planning:manage')));
    const obraActiva = projects.find(p => p.id === currentProjectId);
    // Línea de contexto bajo el nombre de la obra: su cliente, o su dirección si no hay cliente.
    const obraContexto = obraActiva
        ? ((clients || []).find(c => c.id === obraActiva.clientId)?.name || obraActiva.address || 'Obra activa')
        : projects.length > 0 ? 'Vista global' : 'Crea tu primera obra';

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
        <>
        <header className={cn(
            'flex shrink-0 items-center gap-2 border-b px-3 sm:gap-4 sm:px-6',
            torre ? 'h-[62px] border-sidebar-border bg-sidebar text-sidebar-foreground' : 'h-16 border-border/70 bg-card',
        )}>
            {isSubModulePage && (
                <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="icon" className={cn('shrink-0 md:hidden', torre && 'border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white')} aria-label="Abrir menú de navegación">
                            <Menu className="h-5 w-5" />
                            <span className="sr-only">Abrir menú de navegación</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="flex flex-col border-sidebar-border bg-sidebar p-0">
                        <SheetTitle className="sr-only">Navegación del módulo</SheetTitle>
                        <SheetDescription className="sr-only">Accesos disponibles para tu rol.</SheetDescription>
                        <Sidebar onLinkClick={() => setIsSidebarOpen(false)} />
                    </SheetContent>
                </Sheet>
            )}

            <div className="min-w-0 flex-1">
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
                    <div className={cn('flex min-w-0 items-center gap-2', torre ? 'lg:gap-5' : 'md:ml-4')}>
                        {torre && (
                            <Link href="/dashboard" className="hidden shrink-0 items-center gap-2.5 lg:flex" aria-label="Ir a la portada de módulos">
                                <div className="flex h-8 w-8 select-none items-center justify-center rounded-lg bg-cta text-[10px] font-black tracking-tight text-cta-foreground">GDO</div>
                                <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-white">Gestión de Obras</span>
                            </Link>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                {torre ? (
                                    <button
                                        type="button"
                                        aria-label="Cambiar de obra activa"
                                        className="flex min-w-0 max-w-[13rem] flex-col items-start rounded-md px-2 py-1 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta sm:max-w-sm lg:border-l lg:border-white/15 lg:pl-5"
                                    >
                                        <span className="flex max-w-full items-center gap-1.5 text-[15px] font-semibold leading-tight tracking-tight text-white">
                                            <span className="truncate">{projects.length === 0 ? 'Sin obras' : obraActiva?.name || 'Vista Global'}</span>
                                            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                        </span>
                                        <span className="mt-1 max-w-full truncate font-cifras text-[11px] leading-none text-cta">{obraContexto}</span>
                                    </button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={`h-11 w-full max-w-[11rem] gap-2 sm:h-9 sm:w-auto sm:max-w-sm ${!currentProjectId && projects.length > 0 ? 'border-warning text-warning' : ''}`}
                                    >
                                        <FileText className="h-4 w-4 shrink-0" />
                                        <span className="truncate">
                                            {projects.length === 0
                                                ? 'Sin obras'
                                                : projects.find(p => p.id === currentProjectId)?.name || 'Vista Global'}
                                        </span>
                                    </Button>
                                )}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className={torre ? 'min-w-[16rem] max-w-[22rem]' : undefined}>
                                <DropdownMenuLabel className={torre ? 'font-cifras text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground' : undefined}>Obra activa</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {projects.length === 0 ? (
                                    <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                                        No hay obras creadas aún
                                    </DropdownMenuItem>
                                ) : (
                                    <>
                                        <DropdownMenuItem onSelect={() => setCurrentProjectId(null)}>
                                            <span className={torre ? 'font-medium' : 'font-semibold text-primary italic'}>Todas las obras</span>
                                            {torre && !currentProjectId && <Check className="ml-auto h-4 w-4 text-primary" />}
                                        </DropdownMenuItem>
                                        {projects.map((p) => (
                                            <DropdownMenuItem key={p.id} onSelect={() => setCurrentProjectId(p.id)}>
                                                <span className={cn(torre && 'truncate', torre && p.id === currentProjectId && 'font-semibold')}>{p.name}</span>
                                                {torre && p.id === currentProjectId && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />}
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

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                {/* En móvil no cabe junto al selector de obra; es la acción menos
                    crítica de las cuatro, así que se oculta bajo sm. */}
                {torre && planner && (
                    <Link
                        href="/dashboard/last-planner/programacion"
                        title="Porcentaje de plan cumplido de esta semana"
                        className="mr-1 hidden flex-col rounded-md border border-white/15 px-3 py-1.5 leading-none transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta md:flex"
                    >
                        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/60">PPC semana</span>
                        <span className="mt-1.5 flex items-center gap-2.5">
                            <span className={cn(
                                'font-cifras text-lg font-semibold tracking-tight',
                                { danger: 'text-red-300', warning: 'text-cta', success: 'text-emerald-300', info: 'text-white', neutral: 'text-white' }[toneForPpc(planner.ppc.ppc)],
                            )}>{planner.ppc.ppc === null ? '—' : `${planner.ppc.ppc.toFixed(0)}%`}</span>
                            <Sparkline values={planner.ppcSerie} width={52} height={20} className="text-white/60" />
                        </span>
                    </Link>
                )}

                <Button variant="ghost" size="icon" className={cn('hidden sm:inline-flex', torre && 'text-white/70 hover:bg-white/10 hover:text-white')} onClick={() => setIsMuted(!isMuted)}>
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    <span className="sr-only">{isMuted ? 'Activar sonido' : 'Silenciar'}</span>
                </Button>

                <ThemeToggle className={torre ? 'text-white/70 hover:bg-white/10 hover:text-white' : undefined} />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className={cn('relative', torre && 'text-white/70 hover:bg-white/10 hover:text-white')}>
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
                                        <DropdownMenuLabel className="text-warning">Pagos por Vencer</DropdownMenuLabel>
                                        {dueSoonPayments.map((p: SupplierPayment) => (
                                            <Link key={p.id} href="/dashboard/payments">
                                                <DropdownMenuItem className="text-warning">
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
                        <Button variant="secondary" size="icon" className={cn('rounded-full', torre && 'bg-cta text-cta-foreground hover:bg-cta-hover')}>
                            <Avatar>
                                <AvatarFallback className={torre ? 'bg-transparent text-xs font-bold' : undefined}>{getInitials(user.name)}</AvatarFallback>
                            </Avatar>
                            <span className="sr-only">Abrir menú de usuario</span>
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
        <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-card px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.04)] md:hidden">
          <Link href="/dashboard" aria-current={!isSubModulePage ? 'page' : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold focus-visible:ring-2 focus-visible:ring-ring ${!isSubModulePage ? 'text-primary' : 'text-muted-foreground'}`}>
            <LayoutGrid className="h-5 w-5" /> Inicio
          </Link>
          {isSubModulePage ? (
            <button type="button" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menú del módulo" aria-expanded={isSidebarOpen} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold text-primary focus-visible:ring-2 focus-visible:ring-ring">
              <Menu className="h-5 w-5" /> Menú
            </button>
          ) : (
            <Link href="/dashboard#modules-title" className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <Menu className="h-5 w-5" /> Módulos
            </Link>
          )}
          <Link href="/dashboard/profile" aria-current={pathname === '/dashboard/profile' ? 'page' : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold focus-visible:ring-2 focus-visible:ring-ring ${pathname === '/dashboard/profile' ? 'text-primary' : 'text-muted-foreground'}`}>
            <UserRound className="h-5 w-5" /> Mi perfil
          </Link>
        </nav>
        </>
    );
}
