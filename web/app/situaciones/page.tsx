import type { Metadata } from 'next';

import { UnderConstruction } from '@/components/under-construction';

export const metadata: Metadata = { title: 'Situaciones' };

export default function Page() {
  return (
    <UnderConstruction
      title="Situaciones"
      stage={6}
      description="Tablero con más de 100 estadísticas complejas por situación: clutch, corridas, quintetos, arranques y cierres de cuarto, bonus y tiempos muertos."
    />
  );
}
