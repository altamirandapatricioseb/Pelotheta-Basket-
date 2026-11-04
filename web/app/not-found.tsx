import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Página no encontrada' };

export default function NotFound() {
  return (
    <div className="grid gap-4">
      <h1 className="page-title">Página no encontrada</h1>
      <div role="alert" className="under-construction">
        <p className="font-bold">PEL-NF-404: esta dirección no existe.</p>
        <p className="text-muted">Puede que el enlace sea viejo o que el partido o el jugador ya no estén cargados.</p>
      </div>
      <Link href="/" className="focus-ring font-semibold text-link hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}
