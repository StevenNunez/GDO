import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/modules/auth/AuthProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

// Manrope: terminaciones redondeadas y números tabulares — más suave que Inter
// sin perder legibilidad en tablas y montos.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });

const APP_NAME = "Gestión de Obras";
const APP_DESCRIPTION = "Gestión y Control de Obra en Tiempo Real. Una solución integral para constructoras, contratistas e inmobiliarias, potenciada con un asistente de IA.";

export const metadata: Metadata = {
  metadataBase: new URL('https://ferroactiva.teolabs.app'),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_NAME,
      template: `%s - ${APP_NAME}`
    },
    description: APP_DESCRIPTION,
    images: [
      {
        url: "/logo.png", // URL a tu logo
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ["/logo.png"],
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
