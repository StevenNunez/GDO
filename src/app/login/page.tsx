"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/modules/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Construction, Warehouse, ShieldCheck, BarChart3, ArrowRight, ArrowLeft, Building2, CheckCircle2, HardHat } from "lucide-react";
import { useToast } from "@/modules/core/hooks/use-toast";
import { BrandMark } from "@/components/ui/brand-mark";

enum FormMode {
  LOGIN,
  REGISTER,
}

type RegisterStep = 'company' | 'admin';

const PLAN_LABELS: Record<string, string> = {
  basic: 'Básico',
  professional: 'Profesional',
  enterprise: 'Empresarial',
};

function LoginWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, authLoading } = useAuth();

  const initialAction = searchParams.get('action');
  const initialPlan = searchParams.get('plan') || 'basic';
  const errorParam = searchParams.get('error');

  // Login fields
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  // Register fields
  const [regStep, setRegStep] = React.useState<RegisterStep>('company');
  const [companyName, setCompanyName] = React.useState('');
  const [companyRut, setCompanyRut] = React.useState('');
  const [adminName, setAdminName] = React.useState('');
  const [regEmail, setRegEmail] = React.useState('');
  const [regPassword, setRegPassword] = React.useState('');
  const [regConfirmPassword, setRegConfirmPassword] = React.useState('');

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>(
    initialAction === 'register' ? FormMode.REGISTER : FormMode.LOGIN
  );

  const { toast } = useToast();

  React.useEffect(() => {
    if (errorParam === 'no_profile') {
      toast({
        variant: 'destructive',
        title: 'Cuenta incompleta',
        description: 'Tu cuenta fue autenticada pero no tiene perfil asignado. Contacta al administrador.',
      });
    }
  }, [errorParam, toast]);

  React.useEffect(() => {
    if (!authLoading && user) {
      router.push("/dashboard");
    }
  }, [user, authLoading, router]);

  const switchToRegister = () => {
    setRegStep('company');
    setCompanyName('');
    setCompanyRut('');
    setAdminName('');
    setRegEmail('');
    setRegPassword('');
    setRegConfirmPassword('');
    setFormMode(FormMode.REGISTER);
  };

  const switchToLogin = () => {
    setFormMode(FormMode.LOGIN);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, completa todos los campos.' });
      return;
    }
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        toast({ variant: 'destructive', title: 'Credenciales incorrectas', description: "El correo o la contraseña son incorrectos." });
      } else if (msg.includes('Email not confirmed')) {
        toast({ variant: 'destructive', title: 'Correo sin verificar', description: "Revisa tu bandeja de entrada y confirma tu correo." });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: msg || "Ocurrió un error inesperado." });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Demo LOCAL: no crea cuentas ni toca Supabase. Resetea la base demo del
  // navegador, la siembra con una obra de ejemplo y recarga en /dashboard (la
  // recarga hace que el AuthProvider arranque ya en modo demo). Cada visitante
  // nuevo empieza desde la misma obra de ejemplo limpia. Ver src/modules/core/lib/demo.
  const handleGuestLogin = async () => {
    setIsSubmitting(true);
    try {
      const { startDemo } = await import('@/modules/core/lib/demo/demo-config');
      startDemo();
      window.location.href = '/dashboard';
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo iniciar el modo demo.' });
      setIsSubmitting(false);
    }
  };

  const handleCompanyStepNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast({ variant: 'destructive', title: 'Requerido', description: 'Ingresa el nombre de tu empresa.' });
      return;
    }
    setRegStep('admin');
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminName.trim()) {
      toast({ variant: 'destructive', title: 'Requerido', description: 'Ingresa tu nombre completo.' });
      return;
    }
    if (!regEmail || !regPassword) {
      toast({ variant: 'destructive', title: 'Requerido', description: 'Completa todos los campos.' });
      return;
    }
    if (regPassword !== regConfirmPassword) {
      toast({ variant: 'destructive', title: 'Error', description: 'Las contraseñas no coinciden.' });
      return;
    }
    if (regPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Error', description: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          plan: initialPlan,
          companyName,
          companyRut,
          adminName,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error?.includes('ya tiene una cuenta') || json.error?.includes('already registered')) {
          toast({ variant: 'destructive', title: 'Correo ya registrado', description: 'Ese correo ya tiene una cuenta. Inicia sesión.' });
          switchToLogin();
        } else {
          throw new Error(json.error || 'No se pudo crear la cuenta.');
        }
        return;
      }
      toast({ title: '¡Cuenta creada!', description: `Bienvenido a GDO, ${adminName}. Iniciando sesión...` });
      await login(regEmail, regPassword);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error de Registro', description: error.message || 'No se pudo crear la cuenta.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const features = [
    { icon: Construction, label: "Control de obra en tiempo real" },
    { icon: Warehouse, label: "Inventario y bodega integrados" },
    { icon: ShieldCheck, label: "Prevención de riesgos digital" },
    { icon: BarChart3, label: "Reportes y analíticas avanzadas" },
  ];

  return (
    <main className="flex min-h-screen bg-background font-sans">
      {/* Panel de marca. Azul Prussian fijo, igual que la barra lateral de la app:
          el usuario reconoce la identidad antes de entrar. Su contenido usa
          tokens `sidebar-*` (texto claro), por eso el fondo debe ser oscuro. */}
      <div className="relative hidden shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-sidebar via-sidebar to-sidebar-hover p-12 lg:flex lg:w-[45%]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(at_top_right,hsl(var(--cta)/0.18)_0%,transparent_60%)]"
        />
        <HardHat
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-16 h-80 w-80 text-cta/10"
          strokeWidth={1}
        />

        <div className="relative z-10 flex items-center gap-3">
          <BrandMark className="h-10 w-10" onDark />
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold text-sidebar-foreground">Gestión de Obras</span>
            <span className="mt-0.5 text-[9px] font-medium uppercase tracking-widest text-sidebar-muted">App</span>
          </div>
        </div>

        <div className="relative z-10 space-y-10">
          <div className="space-y-3">
            <p className="text-4xl font-bold leading-[1.1] tracking-tighter text-sidebar-foreground">
              El ERP pensado<br />para la <span className="text-cta">construcción</span>.
            </p>
            <p className="max-w-xs text-sm leading-relaxed text-sidebar-muted">
              Controla inventarios, compras, asistencia y seguridad en una sola plataforma. Desde la faena hasta la oficina.
            </p>
          </div>
          <div className="grid gap-3">
            {features.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-sidebar-muted">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cta/15 text-cta">
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </div>
                {label}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-sidebar-muted/60">
          © 2026 GDO · Teo Labs · Todos los derechos reservados.
        </p>
      </div>

      {/* Right form panel */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-8 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(at_top,hsl(var(--cta)/0.10)_0%,transparent_60%)]"
        />
        {/* Mobile logo */}
        <div className="relative z-10 mb-10 flex items-center gap-2.5 lg:hidden">
          <BrandMark className="h-9 w-9" />
          <span className="text-sm font-bold tracking-tight">Gestión de Obras</span>
        </div>

        <div className="relative z-10 w-full max-w-sm">
          {formMode === FormMode.LOGIN ? (
            <form onSubmit={handleLoginSubmit} className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Bienvenido</h1>
                <p className="mt-1 text-sm text-muted-foreground">Ingresa tus credenciales para continuar</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Correo Electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">Contraseña</Label>
                    <Link href="/reset-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Button type="submit" variant="cta" className="h-10 w-full shadow-lg shadow-cta/20" disabled={isSubmitting || !email || !password}>
                  {isSubmitting
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ingresando...</>
                    : "Iniciar Sesión"
                  }
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-background px-3 text-xs text-muted-foreground">o</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10"
                  onClick={handleGuestLogin}
                  disabled={isSubmitting}
                >
                  <User className="mr-2 h-4 w-4" />
                  Probar Demo
                </Button>
              </div>

              <p className="text-center text-sm text-muted-foreground">
                ¿No tienes una cuenta?{" "}
                <button
                  type="button"
                  onClick={switchToRegister}
                  className="font-medium text-primary hover:underline"
                >
                  Regístrate aquí
                </button>
              </p>
            </form>

          ) : regStep === 'company' ? (
            /* ── PASO 1: Datos de la empresa ── */
            <form onSubmit={handleCompanyStepNext} className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paso 1 de 2</span>
                  {initialPlan && initialPlan !== 'basic' && (
                    <Badge variant="outline" className="border-cta/30 bg-cta/10 text-xs text-cta">
                      Plan {PLAN_LABELS[initialPlan] || initialPlan}
                    </Badge>
                  )}
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Tu empresa</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cuéntanos sobre la empresa que gestionará GDO.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name" className="text-sm font-medium">
                    Nombre de la Empresa <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="company-name"
                      placeholder="Ej: Constructora Los Andes"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={isSubmitting}
                      className="h-10 pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-rut" className="text-sm font-medium">
                    RUT de la Empresa <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    id="company-rut"
                    placeholder="Ej: 77.777.777-7"
                    value={companyRut}
                    onChange={(e) => setCompanyRut(e.target.value)}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="cta"
                className="h-10 w-full shadow-lg shadow-cta/20"
                disabled={isSubmitting || !companyName.trim()}
              >
                Continuar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes una cuenta?{" "}
                <button
                  type="button"
                  onClick={switchToLogin}
                  className="font-medium text-primary hover:underline"
                >
                  Inicia sesión
                </button>
              </p>
            </form>

          ) : (
            /* ── PASO 2: Usuario administrador ── */
            <form onSubmit={handleRegisterSubmit} className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paso 2 de 2</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Tu cuenta de administrador</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Este usuario tendrá acceso completo para gestionar{" "}
                  <span className="font-medium text-foreground">{companyName}</span>.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Empresa</p>
                  <p className="text-sm font-semibold truncate">{companyName}{companyRut ? ` · ${companyRut}` : ''}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRegStep('company')}
                  className="ml-auto text-xs text-muted-foreground hover:text-primary flex items-center gap-1 shrink-0"
                >
                  <ArrowLeft className="h-3 w-3" /> Editar
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-name" className="text-sm font-medium">
                    Nombre Completo <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="admin-name"
                    placeholder="Ej: Juan Pérez"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email" className="text-sm font-medium">
                    Correo Electrónico <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="tu@empresa.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password" className="text-sm font-medium">
                    Contraseña <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-confirm" className="text-sm font-medium">
                    Confirmar Contraseña <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="reg-confirm"
                    type="password"
                    placeholder="Repite tu contraseña"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="cta"
                className="h-10 w-full shadow-lg shadow-cta/20"
                disabled={isSubmitting || !adminName || !regEmail || !regPassword || !regConfirmPassword}
              >
                {isSubmitting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando cuenta...</>
                  : "Crear Cuenta y Entrar"
                }
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes una cuenta?{" "}
                <button
                  type="button"
                  onClick={switchToLogin}
                  className="font-medium text-primary hover:underline"
                >
                  Inicia sesión
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginWrapper />
    </React.Suspense>
  );
}
