import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ErrorNotice } from '@/components/error-notice';
import { ModelHeader } from '@/components/models/common';
import { type ReportStatRow, ScoutReportView } from '@/components/models/scout-report';
import { CURRENT_TEAM } from '@/config/teams';
import { getCatalog } from '@/lib/data/catalog';
import { loadScouting } from '@/lib/data/scouting';
import { priceCurves } from '@/lib/models/analyses';
import { GROUPS, type Group, median, MIN_LEAGUE, scoutReports, STARTERS } from '@/lib/models/scouting';
import { type PlayerRow, playerValue, rankAndPercentile } from '@/lib/stats/catalog';

export const metadata: Metadata = {
  description:
    'Informe completo de ojeador: todas las estadísticas contra la liga y contra los titulares propios, y su precio en el mercado.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

interface Source {
  name: string;
  position: string | null;
  age: number | null;
  minutes: number | null;
  stats: Record<string, number>;
}

// Lo que la fuente de otros clubes no trae directo pero sale de lo que sí trae.
const derived = (s: Record<string, number>): Record<string, number> => ({
  ...s,
  ...(s.orb !== undefined && s.drb !== undefined && s.trb === undefined ? { trb: s.orb + s.drb } : {}),
});

const row = (p: Source): PlayerRow => ({
  playerId: 0,
  name: p.name,
  position: p.position,
  shirtNumber: null,
  age: p.age,
  heightCm: null,
  weightKg: null,
  nationality: null,
  matches: 0,
  minutes: p.minutes ?? 0,
  stats: {
    ...derived(p.stats),
    ...(p.minutes !== null ? { minutes: p.minutes } : {}),
    ...(p.age !== null ? { age: p.age } : {}),
  },
});

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export default async function InformePage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const name = first(raw.jugador);
  const club = first(raw.club);
  if (!name || !club) notFound();
  const [loaded, catalog] = await Promise.all([loadScouting(CURRENT_TEAM), getCatalog()]);
  if (!loaded.ok || !catalog.ok) {
    return (
      <div className="grid gap-6">
        <ModelHeader title="Informe de ojeador" subtitle={CURRENT_TEAM.name} />
        <ErrorNotice code="PEL-DB-001" />
      </div>
    );
  }
  const { market, needs, squad, unit } = loaded.data;
  const report = scoutReports(market, needs, Infinity, unit).find(
    (r) => r.player.name === name && r.player.team === club,
  );
  if (!report) notFound();
  const group = report.group;

  // Todas las estadísticas de jugador del catálogo: las mismas que se ven de los jugadores propios.
  const stats = catalog.data.filter((s) => s.entity === 'jugador' && s.available);
  const peers = market.filter(
    (p) => p.position === group && (p.minutes ?? 0) >= MIN_LEAGUE && Object.keys(p.stats).length > 0,
  );
  const starters = squad
    .filter((p) => p.position === group)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, STARTERS[group]);
  const me = row(report.player);
  const values = (list: Source[], s: (typeof stats)[number]) =>
    list.flatMap((p) => {
      const v = num(playerValue(row(p), s, true));
      return v === null ? [] : [v];
    });
  const rows: ReportStatRow[] = stats.map((s) => {
    const value = num(playerValue(me, s, true));
    const league = values(peers, s);
    return {
      id: s.id,
      name: s.name,
      category: s.group,
      unit: s.unit,
      per36: s.per36,
      higherIsBetter: s.higherIsBetter,
      value,
      percentile:
        value !== null && league.length >= 5 ? rankAndPercentile(league, value, s.higherIsBetter).percentile : null,
      leagueMedian: median(league),
      ownMedian: median(values(starters, s)),
    };
  });
  const marketRows = market.flatMap((p) =>
    GROUPS.includes(p.position as Group) && p.value !== null && p.value > 0 && p.age !== null
      ? [{ name: p.name, team: p.team, group: p.position as string, age: p.age, value: p.value }]
      : [],
  );

  return (
    <div className="grid gap-6">
      <Link href="/ojeador#informes" className="chip focus-ring w-fit">
        ← Volver al Ojeador
      </Link>
      <ModelHeader
        title={report.player.name}
        subtitle={`Informe de ojeador · ${report.player.team} · ${group} · para ${CURRENT_TEAM.name}`}
      />
      <ScoutReportView
        report={report}
        rows={rows}
        team={CURRENT_TEAM.name}
        starters={starters.map((p) => p.name)}
        leaguePeers={peers.length}
        unit={unit}
        market={marketRows.filter((m) => m.group === group)}
        curve={priceCurves(marketRows, GROUPS, unit).find((c) => c.group === group)?.points ?? []}
        own={squad.flatMap((p) =>
          p.position === group && p.value !== null && p.age !== null
            ? [{ name: p.name, age: p.age, value: p.value }]
            : [],
        )}
      />
    </div>
  );
}
