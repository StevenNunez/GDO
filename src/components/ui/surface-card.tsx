import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface SurfaceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Si se pasa, la card entera es un enlace. */
  href?: string;
  /** Ícono decorativo gigante asomando en la esquina inferior derecha. */
  decorIcon?: React.ElementType;
  /** Hover que levanta la card + resplandor ámbar. Por defecto: sí cuando hay `href`. */
  interactive?: boolean;
}

/** Superficie original de las tarjetas: borde tenue, relieve y acento ámbar. */
export const SurfaceCard = React.forwardRef<HTMLDivElement, SurfaceCardProps>(
  ({ href, decorIcon: DecorIcon, interactive, className, children, ...props }, ref) => {
    const isInteractive = interactive ?? Boolean(href);

    const content = (
      <>
        {isInteractive && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-br from-cta/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        )}
        {children}
        {DecorIcon && (
          <DecorIcon
            aria-hidden
            className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 text-cta/5 transition-all duration-700 group-hover:scale-110 group-hover:text-cta/10"
          />
        )}
      </>
    );

    const classes = cn(
      'group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-500',
      isInteractive &&
        'hover:-translate-y-2 hover:border-cta/50 hover:shadow-[0_20px_50px_-12px_hsl(var(--cta)/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    );

    if (href) {
      return (
        <Link href={href} className={classes}>
          {content}
        </Link>
      );
    }

    return (
      <div ref={ref} className={classes} {...props}>
        {content}
      </div>
    );
  }
);

SurfaceCard.displayName = 'SurfaceCard';
