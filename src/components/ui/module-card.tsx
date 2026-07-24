import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { SurfaceCard } from '@/components/ui/surface-card';
import { IconChip } from '@/components/ui/icon-chip';
import { cn } from '@/lib/utils';

export interface ModuleCardProps {
  href: string;
  icon: React.ElementType;
  title: string;
  description?: string;
  /** Card más alta, para destacarla arriba de una grilla. */
  featured?: boolean;
  className?: string;
}

/**
 * Card de navegación a un módulo o sub-sección. Vertical: ícono arriba a la
 * izquierda, flecha arriba a la derecha, texto abajo. `featured` solo la hace
 * más alta; el ancho lo define la grilla que la contiene.
 */
export const ModuleCard = React.memo(function ModuleCard({
  href,
  icon: Icon,
  title,
  description,
  featured = false,
  className,
}: ModuleCardProps) {
  return (
    <SurfaceCard
      href={href}
      decorIcon={Icon}
      className={cn('p-6', featured ? 'min-h-[220px]' : 'min-h-[168px]', className)}
    >
      <div className="relative z-10 flex items-start justify-between">
        <IconChip icon={Icon} size={featured ? 'lg' : 'md'} />
        <ArrowRight className="h-5 w-5 text-cta/40 transition-all duration-300 group-hover:translate-x-1 group-hover:text-cta" />
      </div>

      <div className="relative z-10 mt-auto pt-6">
        <h3
          className={cn(
            'font-bold tracking-tight text-foreground transition-colors group-hover:text-primary',
            featured ? 'text-2xl tracking-tighter' : 'text-xl'
          )}
        >
          {title}
        </h3>
        {description && (
          <p className="mt-2 line-clamp-2 text-sm leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </SurfaceCard>
  );
});
