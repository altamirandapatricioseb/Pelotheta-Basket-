import { StatsLab } from '@/components/stats/stats-lab';
import { situationAnalyses } from '@/lib/models/analyses';
import type { Metadata } from 'next';

import { SituationsBoard } from '@/components/situations/board';
import { getSituations } from '@/lib/data/situations';

export const metadata: Metadata = {
  description:
    'Más de 100 situaciones de partido de Boca Juniors básquet: qué pasa cuando gana al descanso, cuando convierte 10 triples, de visitante, según el rival o cuando un jugador anota 20.',
};

export default async function Page() {
  const result = await getSituations();
  if (!result.ok) {
    return (
      <div role="alert" className="under-construction">
        <p className="font-bold">PEL-DB-001: la base de datos no responde.</p>
        <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-10">
      <SituationsBoard
        cards={result.data.cards}
        matches={result.data.matches}
        baseWinPct={result.data.baseWinPct}
        conclusions={result.data.conclusions}
      />
      <StatsLab
        analyses={situationAnalyses(
          result.data.cards.flatMap((c) => c.rows.map((r) => ({ title: c.title, param: r.param, n: r.n, w: r.w }))),
          result.data.baseWinPct,
        )}
      />
    </div>
  );
}
