import type { Metadata } from 'next';

import { UnderConstruction } from '@/components/under-construction';

export const metadata: Metadata = { title: 'Actualizar' };

export default function Page() {
  return (
    <UnderConstruction
      title="Actualizar"
      stage={3}
      description="Fecha y hora de la última actualización, botón para traer los datos más recientes e historial de cargas."
    />
  );
}
