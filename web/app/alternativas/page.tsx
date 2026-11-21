import { StatsLab } from '@/components/stats/stats-lab';
import { styleAnalyses } from '@/lib/models/analyses';
import type { Metadata } from 'next';

import { ErrorNotice } from '@/components/error-notice';
import { AlternativesView } from '@/components/models/alternatives-view';
import { ModelHeader } from '@/components/models/common';
import { CURRENT_TEAM } from '@/config/teams';
import { getAlternatives, getMarketValues, getModelRun } from '@/lib/data/models';
import { getPlayers } from '@/lib/data/players';

export const metadata: Metadata = {
  description:
    'Alternativas para cada jugador de Boca básquet con K-means sobre toda la Liga Nacional: de otro club 1 a 1, en dupla o dentro del plantel, de la más parecida a la menos.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AlternativasPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const requested = Number(Array.isArray(raw.jugador) ? raw.jugador[0] : raw.jugador);
  const [run, data, values, master] = await Promise.all([
    getModelRun(CURRENT_TEAM.slug, 'alternativas'),
    getAlternatives(CURRENT_TEAM.slug),
    getMarketValues(CURRENT_TEAM.slug),
    getPlayers(),
  ]);
  const valueOf = new Map((values.ok ? values.data.rows : []).map((r) => [r.playerId, r.actual]));
  const facts = Object.fromEntries(
    (master.ok ? master.data : []).map((p) => [
      p.playerId,
      { value: valueOf.get(p.playerId) ?? null, age: p.age, minutes: p.minutes, games: p.matches },
    ]),
  );
  // Nombre de cada estadística del agrupamiento, como lo guarda el pipeline en los parámetros del run.
  const features = run.ok ? run.data?.params.features : undefined;
  const labels = Object.fromEntries(
    (Array.isArray(features) ? features : []).flatMap((f) =>
      f && typeof f === 'object' && !Array.isArray(f) && typeof f.id === 'string' && typeof f.label === 'string'
        ? [[f.id, f.label]]
        : [],
    ),
  );
  return (
    <div className="grid gap-6">
      <ModelHeader
        title="Alternativas"
        subtitle={`${CURRENT_TEAM.name} · elegí un jugador y mirá quién juega parecido`}
      />
      {!run.ok ? (
        <ErrorNotice code={run.code} />
      ) : !data.ok ? (
        <ErrorNotice code={data.code} />
      ) : (
        <AlternativesView
          key={Number.isInteger(requested) ? requested : 'inicio'}
          team={CURRENT_TEAM.name}
          run={run.data}
          {...data.data}
          initialPlayer={Number.isInteger(requested) && requested > 0 ? requested : null}
          facts={facts}
        />
      )}
      {data.ok ? <StatsLab analyses={styleAnalyses(data.data.styles, labels)} /> : null}
    </div>
  );
}
