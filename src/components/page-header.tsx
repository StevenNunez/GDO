import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string | React.ReactNode;
  /**
   * Etiqueta corta en mayúsculas sobre el título («TERRENO», «CONTROLAR»).
   *
   * Con una sola familia tipográfica en toda la app, la jerarquía tiene que
   * salir de otro lado: este renglón chico y espaciado hace de contrapunto al
   * título grande, y es lo que separa un encabezado de un texto cualquiera.
   */
  kicker?: string;
  className?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, kicker, className, actions }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col items-start justify-between gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end", className)}>
      <div className="min-w-0">
        {kicker && (
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {kicker}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tighter text-foreground lg:text-3xl">{title}</h1>
        {description && (
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</div>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
      )}
    </div>
  );
}
