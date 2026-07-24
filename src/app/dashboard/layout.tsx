'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DataProvider } from '@/modules/data/DataProvider';
import { useAuth } from '@/modules/auth/useAuth';
import { Sidebar } from '@/components/sidebar';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { DocumentTitle } from '@/components/layout/document-title';
import { GdoAssistant } from '@/components/assistant/gdo-assistant';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isClient, setIsClient] = React.useState(false);
  // Once the user has loaded once, remember it so token-refresh cycles don't
  // flash the loading screen on subsequent renders.
  const hasEverHadUser = React.useRef(false);
  if (user) hasEverHadUser.current = true;

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  // Show loading screen only on initial hydration or if the user has never loaded.
  if (!isClient || (!hasEverHadUser.current && (authLoading || !user))) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  // `/dashboard` es la portada de entrada (post-login) y NO lleva barra lateral:
  // desde ahí el usuario elige el módulo. La barra aparece dentro de los módulos.
  const isSubModulePage = pathname !== '/dashboard';

  return (
    // Shell de alto fijo (100dvh): la barra lateral y el header quedan quietos
    // y el scroll ocurre solo dentro de <main>. Sin `overflow-hidden` + `min-h-0`
    // el scroll se va al body y ambas barras se arrastran hacia arriba.
    <div className={cn(
      'h-[100dvh] w-full overflow-hidden',
      isSubModulePage
        // `grid-cols-1` en móvil (no un grid sin columnas): usa `minmax(0,1fr)`,
        // así la columna se encoge al ancho de la pantalla en vez de estirarse
        // al del contenido y quedar recortada por el `overflow-hidden` de arriba.
        ? 'grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]'
        : 'flex flex-col'
    )}>
      <DocumentTitle />
      {isSubModulePage && (
        <div className="hidden h-full min-h-0 border-r border-sidebar-border bg-sidebar md:block">
          <Sidebar onLinkClick={() => { }} />
        </div>
      )}

      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <DashboardHeader />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
          <GdoAssistant />
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </DataProvider>
  );
}
