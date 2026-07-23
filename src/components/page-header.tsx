import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string | React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, className, actions }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tighter text-foreground lg:text-3xl">{title}</h1>
        {description && (
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
