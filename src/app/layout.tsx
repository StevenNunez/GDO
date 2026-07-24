import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site-url";
import { AuthProvider } from "@/modules/auth/AuthProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

// Manrope: terminaciones redondeadas y números tabulares — más suave que Inter
// sin perder legibilidad en tablas y montos.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });

const APP_NAME = "Gestión de Obras";
const APP_TITLE = "Gestión de Obras | Software de control operativo para construcción";
const APP_DESCRIPTION =
  "Software de gestión y control de obras de construcción: inventario y bodega de materiales, compras, avance físico (EDT y Carta Gantt), estados de pago, prevención de riesgos y asistencia. Para constructoras, contratistas e inmobiliarias.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: APP_NAME,
  title: {
    default: APP_TITLE,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  keywords: [
    "gestión de obras",
    "control de obras",
    "software para construcción",
    "gestión de materiales",
    "control de bodega",
    "control operativo de obras",
    "constructoras",
    "contratistas",
    "inmobiliarias",
    "avance de obra",
    "estado de pago",
    "prevención de riesgos",
    "control de asistencia obra",
    "EDT",
    "carta gantt",
    "Chile",
  ],
  authors: [{ name: "TeoLabs" }],
  creator: "TeoLabs",
  category: "business",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    locale: "es_CL",
    url: "/",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    // La imagen la aporta automáticamente src/app/opengraph-image.tsx (1200×630).
  },
  twitter: {
    card: "summary_large_image",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
  },
};

// La app se instala como PWA: conviene declarar el viewport explícitamente y
// pintar la barra del navegador con el fondo real de cada tema.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F9FB" },
    { media: "(prefers-color-scheme: dark)", color: "#011B2F" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={cn("min-h-screen bg-background font-sans antialiased", manrope.variable)}>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
