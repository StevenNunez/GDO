import type { Metadata } from "next";

// Página privada de un solo uso: que no la indexe ningún buscador.
export const metadata: Metadata = {
  title: "Elige tu contraseña",
  robots: { index: false, follow: false },
};

export default function NuevaContrasenaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
