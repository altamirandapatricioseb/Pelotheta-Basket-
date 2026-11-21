import { StatsLab } from '@/components/stats/stats-lab';
import { valueAnalyses } from '@/lib/models/analyses';
import type { Metadata } from 'next';

import { ErrorNotice } from '@/components/error-notice';
import { ModelHeader } from '@/components/models/common';
import { ValueView } from '@/components/models/value-view';
import { CURRENT_TEAM } from '@/config/teams';
import { getMarketValues, getModelRun } from '@/lib/data/models';

export const metadata: Metadata = {
  description:
    'Minutos que le da el entrenador a cada jugador contra los que su producción justifica, con una regresión entrenada con toda la Liga Nacional.',
};

export default async function ValorPage() {
  const [run, values] = await Promise.all([
    getModelRun(CURRENT_TEAM.slug, 'valor_mercado'),
    getMarketValues(CURRENT_TEAM.slug),
  ]);
  return (
    <div className="grid gap-6">
      <ModelHeader
        title="Valor"
        subtitle={`${CURRENT_TEAM.name} · lo que juega contra lo que su producción justifica`}
      />
      {!run.ok ? (
        <ErrorNotice code={run.code} />
      ) : !values.ok ? (
        <ErrorNotice code={values.code} />
      ) : (
        <>
          <ValueView run={run.data} rows={values.data.rows} coefs={values.data.coefs} />
          <StatsLab
            analyses={valueAnalyses(
              values.data.rows,
              typeof run.data?.params.unit === 'string' ? run.data.params.unit : 'min',
            )}
          />
        </>
      )}
    </div>
  );
}
