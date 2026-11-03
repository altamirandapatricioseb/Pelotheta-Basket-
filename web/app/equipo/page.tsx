import type { Metadata } from 'next';

import { UnderConstruction } from '@/components/under-construction';

export const metadata: Metadata = { title: 'Equipo' };

export default function Page() {
  return (
    <UnderConstruction
      title="Equipo"
      stage={4}
      description="Tablas del equipo por categoría, una a la vez: resultados, ritmo y eficiencia, cuatro factores, tiros, rebotes, pérdidas y rendimiento por cuarto y por rival."
    />
  );
}
