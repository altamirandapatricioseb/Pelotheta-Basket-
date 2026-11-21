import { StatsLab } from '@/components/stats/stats-lab';
import { getTeamMatches } from '@/lib/data/catalog';
import { predictorAnalyses } from '@/lib/models/analyses';
import type { Metadata } from 'next';

import { ErrorNotice } from '@/components/error-notice';
import { ModelHeader } from '@/components/models/common';
import { PredictorView } from '@/components/models/predictor-view';
import { CURRENT_TEAM } from '@/config/teams';
import { getModelRun, getPredictions, getStatTests } from '@/lib/data/models';

export const metadata: Metadata = {
  description:
    'Predictor de partidos de básquet: probabilidad de ganar contra cualquier rival o la media de una liga, puntos esperados, backtest y pruebas de hipótesis.',
};

export default async function PredictorPage() {
  const [run, data, tests, matches] = await Promise.all([
    getModelRun(CURRENT_TEAM.slug, 'predictor_partido'),
    getPredictions(CURRENT_TEAM.slug),
    getStatTests(CURRENT_TEAM.slug),
    getTeamMatches(),
  ]);
  return (
    <div className="grid gap-6">
      <ModelHeader
        title="Predictor"
        subtitle={`${CURRENT_TEAM.name} · Liga Nacional 2026-27 · regresión de puntos y margen normal`}
      />
      {!run.ok ? (
        <ErrorNotice code={run.code} />
      ) : !data.ok ? (
        <ErrorNotice code={data.code} />
      ) : (
        <PredictorView
          team={CURRENT_TEAM.name}
          run={run.data}
          predictions={data.data.predictions}
          strengths={data.data.strengths}
          tests={tests.ok ? tests.data : []}
        />
      )}
      {matches.ok ? <StatsLab analyses={predictorAnalyses(matches.data)} /> : null}
    </div>
  );
}
