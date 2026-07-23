import { cn } from '@/lib/utils';

/** Marca GDO: mismo casco sobre la "O" que el ícono de la app (design/gdo-icon.svg).
 *  `onDark` porque sobre el azul del panel lateral el cuadro de fondo desaparecería;
 *  ahí se dibuja tintado en ámbar. */
export function BrandMark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 512 512" className={cn('shrink-0', className)} aria-label="GDO" role="img">
      <rect
        width="512"
        height="512"
        rx="116"
        fill={onDark ? 'hsl(var(--cta) / 0.15)' : 'hsl(var(--sidebar))'}
      />
      <text
        x="256"
        y="342"
        fontFamily="inherit"
        fontWeight="800"
        fontSize="152"
        letterSpacing="-3"
        fill="hsl(var(--cta))"
        textAnchor="middle"
      >
        GDO
      </text>
      <g fill="hsl(var(--cta))">
        <rect x="325" y="220" width="100" height="17" rx="8.5" />
        <path d="M337 222 a38 42 0 0 1 76 0 Z" />
        <rect x="367" y="182" width="16" height="16" rx="6" />
      </g>
    </svg>
  );
}
