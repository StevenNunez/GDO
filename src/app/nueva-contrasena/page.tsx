"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/modules/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/modules/core/hooks/use-toast";

const PASSWORD_MIN = 8;

/**
 * Destino del enlace de «crear / restablecer mi contraseña» que llega por
 * correo (invitaciones, cambio hecho por un administrador, «olvidé mi
 * contraseña»). El token viaja en la dirección; se canjea en el servidor recién
 * cuando se envía el formulario.
 */
function NuevaContrasenaForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const { login } = useAuth();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Enlace incompleto</CardTitle>
          <CardDescription>
            Este enlace no trae lo necesario para elegir una contraseña. Pide uno nuevo desde
            «¿Olvidaste tu contraseña?».
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/reset-password">Pedir un enlace nuevo</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < PASSWORD_MIN) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setGuardando(true);
    try {
      const res = await fetch("/api/auth/nueva-contrasena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "No se pudo guardar la contraseña.");
        return;
      }
      toast({ title: "Contraseña guardada", description: "Entrando a tu cuenta…" });
      try {
        await login(json.email, password);
        router.replace("/dashboard");
      } catch {
        // La contraseña ya quedó guardada; si el ingreso automático falla, que entre a mano.
        router.replace("/login");
      }
    } catch {
      setError("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <CardTitle>Elige tu contraseña</CardTitle>
        <CardDescription>
          Mínimo {PASSWORD_MIN} caracteres. Con ella entrarás a Gestión de Obras.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña nueva</Label>
            <div className="relative">
              <Input
                id="password"
                type={verClave ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={guardando}
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {verClave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Repite la contraseña</Label>
            <Input
              id="confirm"
              type={verClave ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={guardando}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {error}{" "}
              {/(venció|ya no sirve)/i.test(error) && (
                <Link href="/reset-password" className="font-medium underline">
                  Pedir un enlace nuevo
                </Link>
              )}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={guardando}>
            {guardando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…
              </>
            ) : (
              "Guardar y entrar"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function NuevaContrasenaPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin text-primary" />}>
        <NuevaContrasenaForm />
      </Suspense>
    </main>
  );
}
