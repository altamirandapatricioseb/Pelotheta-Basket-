import 'server-only';

import { getCatalog, getPlayerRows } from '@/lib/data/catalog';
import { type DataResult, getTeamRows } from '@/lib/data/players';
import { playerValue, rankAndPercentile, type StatDef } from '@/lib/stats/catalog';
import { createApiClient } from '@/lib/supabase/server';

export type Entity = 'jugador' | 'equipo' | 'rival';

export interface SeriesPoint {
  matchId: number;
  date: string;
  competitionCode: string;
  competition: string;
  opponent: string;
  home: boolean;
  result: string;
  pointsFor: number;
  pointsAgainst: number;
  value: number | null;
}

export interface StatWindow {
  key: string;
  label: string;
  order: number;
  n: number;
  value: number | null;
  total: number | null;
  best: number | null;
  worst: number | null;
  delta: number | null;
}

export interface StatDetail {
  stat: StatDef;
  entity: Entity;
  entityName: string;
  series: SeriesPoint[];
  windows: StatWindow[];
  /** Valor de temporada aunque no haya serie partido a partido (PER, On/Off, Elo de la tabla). */
  seasonValue: number | null;
  /** Puesto y percentil en el plantel (jugador) o entre los equipos de la liga (equipo). */
  standing: { rank: number; of: number; percentile: number; group: string } | null;
  /** Referencias para las barras comparadas: plantel y posición, o promedio de la liga. */
  references: { label: string; value: number }[];
  /** Referencias elegidas en Comparar (9.7), como media por partido sobre las barras de cada partido. */
  matchReferences: { label: string; value: number }[];
  related: StatDef[];
}

function fail(cause: unknown): { ok: false; code: 'PEL-DB-001'; detail: string } {
  return { ok: false, code: 'PEL-DB-001', detail: cause instanceof Error ? cause.message : String(cause) };
}

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** Todo lo que muestra la página de una estadística desglosada (9.8). null = no existe. */
export async function getStatDetail(
  statId: string,
  entity: Entity,
  id: number | null,
): Promise<DataResult<StatDetail> | null> {
  try {
    const catalog = await getCatalog();
    if (!catalog.ok) return catalog;
    const stat = catalog.data.find((s) => s.id === statId);
    if (!stat) return null;
    const api = createApiClient();
    const args = { p_stat: statId, p_entity: entity, p_id: id };
    const [series, windows] = await Promise.all([api.rpc('stat_series', args), api.rpc('stat_windows', args)]);
    if (series.error) return fail(series.error.message);
    if (windows.error) return fail(windows.error.message);

    let entityName = 'Boca Juniors';
    let seasonValue = windows.data.find((w) => w.window_key === 'temporada')?.value ?? null;
    let standing: StatDetail['standing'] = null;
    const references: StatDetail['references'] = [];
    if (entity === 'jugador') {
      const players = await getPlayerRows();
      if (players.ok) {
        const me = players.data.find((p) => p.playerId === id);
        if (!me) return null;
        entityName = me.name;
        const valueOf = (p: (typeof players.data)[number]) => playerValue(p, stat, false);
        const all = players.data.map(valueOf).filter((v): v is number => v !== null);
        const mine = valueOf(me);
        seasonValue ??= mine;
        if (mine !== null && all.length > 1) {
          const r = rankAndPercentile(all, mine, stat.higherIsBetter);
          standing = { rank: r.rank, of: all.length, percentile: r.percentile, group: 'en el plantel' };
        }
        const squad = average(all);
        if (squad !== null) references.push({ label: 'Plantel', value: squad });
        const samePosition = players.data
          .filter((p) => p.position !== null && p.position === me.position)
          .map(valueOf)
          .filter((v): v is number => v !== null);
        const position = average(samePosition);
        if (position !== null && me.position) references.push({ label: `${me.position} (plantel)`, value: position });
        if (mine !== null) references.unshift({ label: entityName, value: mine });
      }
    } else {
      if (entity === 'rival') entityName = `Boca contra ${series.data[0]?.opponent ?? 'el rival'}`;
      // Equipo: Boca frente a los equipos de la liga, si la estadística está en la tabla de la liga.
      const league = await getTeamRows('temporada');
      if (league.ok) {
        const values = league.data.map((t) => t.values[stat.id] ?? null).filter((v): v is number => v !== null);
        const boca = league.data.find((t) => t.highlight)?.values[stat.id] ?? null;
        if (entity === 'equipo') seasonValue ??= boca;
        if (values.length > 1) {
          const avg = average(values);
          if (avg !== null) references.push({ label: 'Promedio de la liga', value: avg });
          if (boca !== null) {
            const r = rankAndPercentile(values, boca, stat.higherIsBetter);
            standing = {
              rank: r.rank,
              of: values.length,
              percentile: r.percentile,
              group: 'entre los equipos de la liga',
            };
          }
        }
      }
      if (seasonValue !== null) references.unshift({ label: entityName, value: seasonValue });
    }

    return {
      ok: true,
      data: {
        stat,
        entity,
        entityName,
        series: series.data.map((r) => ({
          matchId: r.match_id,
          date: r.match_date,
          competitionCode: r.competition_code,
          competition: r.competition_name,
          opponent: r.opponent,
          home: r.home,
          result: r.result,
          pointsFor: r.points_for,
          pointsAgainst: r.points_against,
          value: r.value,
        })),
        windows: windows.data.map((w) => ({
          key: w.window_key,
          label: w.label,
          order: w.sort_order,
          n: w.n,
          value: w.value,
          total: w.total,
          best: w.best,
          worst: w.worst,
          delta: w.delta,
        })),
        seasonValue,
        standing,
        references,
        matchReferences: [],
        related: catalog.data
          .filter((s) => s.group === stat.group && s.id !== stat.id && s.available && s.group !== 'auxiliar')
          .slice(0, 12),
      },
    };
  } catch (cause) {
    return fail(cause);
  }
}
