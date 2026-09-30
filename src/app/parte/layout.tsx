import type { Metadata } from 'next';

/**
 * El parte del capataz vive fuera del dashboard y se abre con un token en la
 * URL. Ese token es la llave: dejar que un buscador lo indexe sería publicarla.
 * El `noindex` acompaña al `disallow` de `robots.ts` — uno le pide al robot que
 * no entre, el otro le prohíbe guardar lo que ya vio.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: 'Parte diario',
};

export default function ParteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
