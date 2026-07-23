"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/modules/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/modules/core/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { sendPasswordReset } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor, ingresa tu correo electrónico.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await sendPasswordReset(email);
      toast({
        title: "Correo enviado",
        description: "Revisa tu bandeja de entrada para restablecer la contraseña.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo enviar el correo. Verifica que el correo sea correcto.",
      });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Restablecer Contraseña</CardTitle>
          <CardDescription>
            Ingresa tu correo electrónico y te enviaremos un enlace para que puedas recuperar tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@constructora.com"
                disabled={isSubmitting}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Enviando..." : "Enviar Enlace de Recuperación"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
             <Button variant="link" className="text-muted-foreground w-full" asChild>
                <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4"/>
                    Volver a Inicio de Sesión
                </Link>
            </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
