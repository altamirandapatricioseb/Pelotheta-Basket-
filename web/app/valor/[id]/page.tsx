import type { Metadata } from 'next';
import Link from 'next/link';

import { ErrorNotice } from '@/components/error-notice';
import { ModelHeader, WaitingData } from '@/components/models/common';
import { ValuePlayer } from '@/components/models/value-player';
import { CURRENT_TEAM } from '@/config/teams';
import { getMarketValues, getModelRun } from '@/lib/data/models';

export const metadata: Metadata = {
  description: 'Un jugador en Valor: minutos reales contra los que su producción justifica, por qué, y quién produce parecido en la liga.',
};

export default async function ValorJugadorPage({ params }: { params: Promise<{ id: string }> }) {
  const playerId = Number((await params).id);
  const [run, values] = await Promise.all([
    getModelRun(CURRENT_TEAM.slug, 'valor_mercado'),
    getMarketValues(CURRENT_TEAM.slug),
  ]);
  if (!run.ok) return <ErrorNotice code={run.code} />;
  if (!values.ok) return <ErrorNotice code={values.code} />;
  const row = values.data.rows.find((r) => r.playerId === playerId);
  if (!run.data || !row) {
    return (
      <div className="grid gap-6">
        <ModelHeader title="Valor" subtitle={CURRENT_TEAM.name} />
        <WaitingData
          title="Sin datos de valor para este jugador"
          message="Necesita al menos 3 partidos y 40 minutos en la Liga Nacional."
        >
          <Link href="/valor" className="chip focus-ring w-fit">
            ← Volver a Valor
          </Link>
        </WaitingData>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <ModelHeader title="Valor" subtitle={`${CURRENT_TEAM.name} · ${row.name}: cuánto juega y por qué`} />
      <ValuePlayer
        run={run.data}
        row={row}
        rows={values.data.rows}
        coefs={values.data.coefs}
      />
    </div>
  );
}
