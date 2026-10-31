import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <p className="text-5xl font-semibold text-muted-foreground">404</p>
        <h2 className="text-xl font-semibold text-foreground">No encontramos esa página</h2>
        <p className="text-sm text-muted-foreground">
          Puede que el enlace esté desactualizado o que ya no tengas acceso.
        </p>
        <Button asChild>
          <Link href="/dashboard">Ir al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
