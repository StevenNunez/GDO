import * as React from 'react';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: { box: 'h-10 w-10 rounded-xl', icon: 'h-5 w-5' },
  md: { box: 'h-14 w-14 rounded-2xl', icon: 'h-7 w-7' },
  lg: { box: 'h-16 w-16 rounded-2xl', icon: 'h-8 w-8' },
} as const;

export type IconChipSize = keyof typeof SIZES;

/** Contenedor del ícono en el lenguaje de la portada: cuadro redondeado con
 *  degradado sutil e ícono ámbar. Dentro de un `group` crece al hacer hover. */
export function IconChip({
  icon: Icon,
  size = 'md',
  className,
}: {
  icon: React.ElementType;
  size?: IconChipSize;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-cta shadow-inner transition-transform duration-500 group-hover:scale-110',
        s.box,
        className
      )}
    >
      <Icon className={s.icon} strokeWidth={1.6} />
    </div>
  );
}
