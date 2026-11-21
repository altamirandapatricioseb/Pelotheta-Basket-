import type { Metadata } from 'next';

import { ErrorNotice } from '@/components/error-notice';
import { ModelHeader } from '@/components/models/common';
import { ScoutView } from '@/components/models/scout-view';
import { StatsLab } from '@/components/stats/stats-lab';
import { CURRENT_TEAM } from '@/config/teams';
import { loadScouting } from '@/lib/data/scouting';
import { marketAnalyses } from '@/lib/models/analyses';
import { GROUPS, type Group, scoutReports } from '@/lib/models/scouting';

export const metadata: Metadata = {
  description:
    'Informes de ojeador: qué le falta al plantel por zona, oportunidades de mercado y jóvenes promesas de otros clubes, con nota de 0 a 10.',
};

export default async function OjeadorPage() {
  const loaded = await loadScouting(CURRENT_TEAM);
  if (!loaded.ok) {
    return (
      <div className="grid gap-6">
        <ModelHeader title="Ojeador" subtitle={CURRENT_TEAM.name} />
        <ErrorNotice code={loaded.code} />
      </div>
    );
  }
  const { market, needs, squad, unit } = loaded.data;
  const rows = market.flatMap((p) =>
    GROUPS.includes(p.position as Group) && p.value !== null && p.value > 0 && p.age !== null
      ? [{ name: p.name, team: p.team, group: p.position as string, age: p.age, value: p.value }]
      : [],
  );
  const own = squad.flatMap((p) =>
    p.value !== null && p.value > 0 && p.age !== null ? [{ value: p.value, age: p.age }] : [],
  );
  return (
    <div className="grid gap-6">
      <ModelHeader
        title="Ojeador"
        subtitle={`${CURRENT_TEAM.name} · lo que le falta al plantel y a quién ir a buscar a otros clubes`}
      />
      <ScoutView needs={needs} reports={scoutReports(market, needs, 12, unit)} marketSize={market.length} unit={unit} />
      <StatsLab analyses={marketAnalyses(rows, own, GROUPS, CURRENT_TEAM.name, unit)} />
    </div>
  );
}
