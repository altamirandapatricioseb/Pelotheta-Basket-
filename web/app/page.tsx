import type { Metadata } from 'next';

import { UnderConstruction } from '@/components/under-construction';

export const metadata: Metadata = { title: 'Gráficos' };

export default function Page() {
  return (
    <UnderConstruction
      title="Gráficos"
      stage={5}
      description="Más de 50 gráficos por categoría: forma y resultados, anotación, eficiencia de tiro, mapa de tiro por zona, rebote, creación, defensa, rotación y métricas propias."
    />
  );
}
