"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/useAuth";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand-mark";
import { SurfaceCard } from "@/components/ui/surface-card";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, HardHat, Building2, BarChart3, ShieldCheck, Users, Truck } from "lucide-react";

export default function LandingPage() {
    const { user, authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user) {
            router.replace('/dashboard');
        }
    }, [user, authLoading, router]);

    return (
        <div className="flex min-h-screen flex-col bg-background font-sans text-foreground selection:bg-cta/25">

            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur">
                <div className="container flex h-16 items-center justify-between px-4 md:px-8">
                    <Link href="/" className="flex items-center gap-2.5">
                        <BrandMark className="h-8 w-8" />
                        <span className="text-lg font-bold tracking-tighter">
                            Gestión de<span className="text-primary"> Obras</span>
                        </span>
                    </Link>
                    <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
                        <Link href="#features" className="text-muted-foreground transition-colors hover:text-foreground">Características</Link>
                        <Link href="#nosotros" className="text-muted-foreground transition-colors hover:text-foreground">Nosotros</Link>
                    </nav>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                            <Link href="/login">Iniciar Sesión</Link>
                        </Button>
                        <Button variant="cta" size="sm" asChild>
                            <Link href="/login?action=register">Comenzar Gratis</Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="flex-1">

                {/* Hero */}
                <section className="pb-20 pt-20 md:pt-28">
                    <div className="container flex flex-col items-center gap-6 px-4 text-center md:px-8">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            GDO — Plataforma ERP para Construcción
                        </p>
                        <h1 className="max-w-4xl text-4xl font-bold leading-[1.05] tracking-tighter sm:text-5xl md:text-6xl">
                            Control total para tu <br className="hidden sm:block" />
                            <span className="text-primary">proyecto de construcción</span>
                        </h1>
                        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
                            Gestiona materiales, herramientas, personal y asistencia en una sola plataforma unificada.
                            Optimiza tus recursos y toma decisiones basadas en datos en tiempo real.
                        </p>
                        <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row">
                            <Button variant="cta" size="lg" asChild>
                                <Link href="/login?action=register">Empezar Ahora</Link>
                            </Button>
                            <Button size="lg" variant="ghost" asChild>
                                <Link href="#features">
                                    Ver Funcionalidades <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </div>

                        <div className="mt-14 grid w-full max-w-4xl grid-cols-2 gap-8 border-t border-border pt-10 md:grid-cols-4">
                            <Stat value="100%" label="Trazabilidad" />
                            <Stat value="+5k" label="Items Gestionados" />
                            <Stat value="24/7" label="Acceso Supervisor" />
                            <Stat value="0%" label="Pérdidas" />
                        </div>
                    </div>
                </section>

                {/* Features */}
                <section id="features" className="border-y border-border bg-muted/30 py-24">
                    <div className="container px-4 md:px-8">
                        <SectionHeading
                            title="Todo lo que necesitas para tu obra"
                            subtitle="Una suite completa de herramientas diseñadas específicamente para el rubro de la construcción y bodegaje."
                        />

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                            <FeatureCard
                                icon={Building2}
                                title="Gestión de Obras"
                                description="Administra múltiples proyectos simultáneamente. Asigna recursos y controla el avance de cada faena por separado."
                            />
                            <FeatureCard
                                icon={Truck}
                                title="Control de Materiales"
                                description="Inventario en tiempo real. Solicitudes de compra, recepciones y control de consumo por partida y actividad."
                            />
                            <FeatureCard
                                icon={Users}
                                title="Personal y Asistencia"
                                description="Registro de asistencia mediante QR. Gestión de roles, perfiles y documentación del trabajador."
                            />
                            <FeatureCard
                                icon={HardHat}
                                title="App para Supervisores"
                                description="Interfaz móvil simplificada para pedidos de material en terreno y validación de recepciones."
                            />
                            <FeatureCard
                                icon={ShieldCheck}
                                title="Seguridad y Prevención"
                                description="Checklists de seguridad, charlas diarias y reporte de incidentes integrados en el flujo de trabajo."
                            />
                            <FeatureCard
                                icon={BarChart3}
                                title="Reportes Inteligentes"
                                description="Analytics detallados de consumo, costos y productividad para tomar mejores decisiones."
                            />
                        </div>
                    </div>
                </section>

                {/* CTA final — único bloque azul de la página */}
                <section className="px-4 py-24 md:px-8">
                    <div className="container">
                        <div className="rounded-3xl bg-sidebar px-8 py-20 text-center">
                            <h2 className="text-3xl font-bold tracking-tighter text-sidebar-foreground md:text-4xl">
                                ¿Listo para optimizar tu gestión?
                            </h2>
                            <p className="mx-auto mt-5 max-w-2xl text-lg text-sidebar-muted">
                                Únete a las empresas que ya están transformando su control de obra con GDO.
                            </p>
                            <Button variant="cta" size="lg" asChild className="mt-9">
                                <Link href="/login?action=register">
                                    Crear Cuenta Gratuita <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </div>
                    </div>
                </section>

            </main>

            <SiteFooter />
        </div>
    );
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

const FOUNDERS = [
    {
        initials: "SC",
        name: "Sebastián Campos",
        role: "CEO",
        detail: "Ingeniero Constructor",
    },
    {
        initials: "SN",
        name: "Steven Nuñez",
        role: "CEO & CTO",
        detail: "Técnico en Construcción · Desarrollador",
    },
];

const FOOTER_LINKS = [
    { href: "#features", label: "Características" },
    { href: "/login", label: "Iniciar sesión" },
    { href: "/login?action=register", label: "Crear cuenta" },
];

function SiteFooter() {
    return (
        <footer id="nosotros" className="border-t border-border bg-muted/30">
            <div className="container px-4 py-20 md:px-8">

                {/* Cierre de la página: la frase es el titular, no una nota al pie. */}
                <p className="max-w-4xl text-2xl font-bold leading-[1.2] tracking-tighter md:text-4xl">
                    Con más de <span className="text-primary">15 años en construcción</span> conocemos los
                    problemas reales.{" "}
                    <span className="text-muted-foreground">
                        En Gestión de Obras tenemos la solución.
                    </span>
                </p>

                <div className="mt-14 grid gap-12 border-t border-border pt-12 lg:grid-cols-[1fr_auto]">

                    {/* Fundadores */}
                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Fundadores
                        </h3>
                        <ul className="mt-6 grid gap-8 sm:grid-cols-2">
                            {FOUNDERS.map(f => (
                                <li key={f.name} className="flex items-start gap-4">
                                    <span
                                        aria-hidden
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sidebar text-sm font-bold tracking-tight text-sidebar-foreground"
                                    >
                                        {f.initials}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="font-semibold tracking-tight">{f.name}</p>
                                        <p className="text-sm font-medium text-primary">{f.role}</p>
                                        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{f.detail}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Navegación */}
                    <div className="lg:min-w-[180px]">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Plataforma
                        </h3>
                        <div className="mt-6 flex items-center gap-2.5">
                            <BrandMark className="h-7 w-7" />
                            <span className="text-sm font-bold tracking-tight">Gestión de Obras</span>
                        </div>
                        <ul className="mt-4 space-y-2.5 text-sm">
                            {FOOTER_LINKS.map(l => (
                                <li key={l.href}>
                                    <Link href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row">
                    <p>&copy; {new Date().getFullYear()} Teo Labs. Todos los derechos reservados.</p>
                    <p>
                        Desarrollado por{" "}
                        <a
                            href="https://teolabs.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium transition-colors hover:text-primary hover:underline"
                        >
                            teolabs.app
                        </a>
                    </p>
                </div>
            </div>
        </footer>
    );
}

/* ── Piezas de la página ────────────────────────────────────────────────── */

function Stat({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex flex-col items-center">
            <span className="text-3xl font-bold tracking-tighter">{value}</span>
            <span className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
    );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tighter md:text-4xl">{title}</h2>
            <p className="text-muted-foreground">{subtitle}</p>
        </div>
    );
}

function FeatureCard({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
    return (
        <SurfaceCard interactive={false} className="p-8">
            <Icon className="mb-6 h-7 w-7 text-primary" strokeWidth={1.6} />
            <h3 className="mb-3 text-xl font-bold tracking-tight">{title}</h3>
            <p className="leading-relaxed text-muted-foreground">{description}</p>
        </SurfaceCard>
    );
}
