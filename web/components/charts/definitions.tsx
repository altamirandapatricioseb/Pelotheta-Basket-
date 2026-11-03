'use client';

// Definiciones de los gráficos de la Interfaz 1 (9.2.1), como en Pelotheta fútbol. Cada una toma
// los datos ya filtrados (localía global) y devuelve el gráfico y su tabla equivalente, o el
// motivo por el que no hay datos. Los números de gráfico siguen `data/chart_catalog.csv`.

import { useState, type ReactNode } from 'react';

import type { Line } from '@/lib/data/details';
import type { LandingData } from '@/lib/data/landing';
import { bins, countMatrix, cumulative, pearson, rolling } from '@/lib/charts/transform';
import {
  aggregateTeam,
  playerValue,
  rankAndPercentile,
  type PlayerRow,
  type StatDef,
  type TeamMatchRow,
} from '@/lib/stats/catalog';

import type { ChartTable } from './chart-card';
import {
  BarChart,
  Heatmap,
  Legend,
  LineChart,
  ScatterChart,
  Strip,
  type ScatterPoint,
  type Series,
  type Slot,
} from './primitives';

export interface ChartContext {
  data: LandingData;
  matches: TeamMatchRow[];
  /** Jugadores con al menos 40 minutos (referencia de percentiles y rankings, como el pipeline). */
  regulars: PlayerRow[];
}

export type ChartOutput = { node: ReactNode; table: ChartTable; coverage?: string } | { empty: string };
export type ChartRender = (ctx: ChartContext) => ChartOutput;

const RESULT_SLOT: Record<string, Slot> = { G: 1, P: 3 };
const RESULT_NAME: Record<string, string> = { G: 'Ganado', P: 'Perdido' };
const RESULTS = ['G', 'P'] as const;
// Color por posición en las dispersiones: exteriores, aleros e internos (tres colores como máximo).
const positionSlot = (p: PlayerRow): Slot =>
  p.position === 'Base' || p.position === 'Escolta' ? 1 : p.position === 'Alero' ? 4 : 2;
const POSITION_GROUPS: { label: string; slot: Slot }[] = [
  { label: 'Bases y escoltas', slot: 1 },
  { label: 'Aleros', slot: 4 },
  { label: 'Internos y sin posición', slot: 2 },
];

const s = (m: TeamMatchRow, key: string): number | null => m.stats[key] ?? null;
const result = (m: TeamMatchRow) => (m.pointsFor > m.pointsAgainst ? 'G' : 'P');
const margin = (m: TeamMatchRow) => m.pointsFor - m.pointsAgainst;
const day = (m: TeamMatchRow) => m.date.slice(8, 10) + '/' + m.date.slice(5, 7);
const matchLabel = (m: TeamMatchRow) => `${day(m)} ${m.home ? 'vs' : 'en'} ${m.opponent}`;
const sum = (v: (number | null)[]) => v.reduce<number>((a, b) => a + (b ?? 0), 0);
const avg = (v: (number | null)[]) => {
  const n = v.filter((x): x is number => x !== null);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
};
const pct = (part: number, total: number) => (total ? (100 * part) / total : null);
const covered = (ms: TeamMatchRow[], key: string) => {
  const n = ms.filter((m) => s(m, key) !== null).length;
  return n < ms.length ? `dato en ${String(n)} de ${String(ms.length)} partidos` : undefined;
};
const statById = (catalog: StatDef[], id: string) => catalog.find((c) => c.id === id);
const pv = (p: PlayerRow, catalog: StatDef[], id: string, per36 = false): number | null => {
  const stat = statById(catalog, id);
  return stat ? playerValue(p, stat, per36) : null;
};
/** Valor agrupado de una estadística del equipo con su regla del catálogo (suma sobre suma). */
const team = (ms: TeamMatchRow[], catalog: StatDef[], id: string, perMatch = false): number | null => {
  const stat = statById(catalog, id);
  return stat ? aggregateTeam(ms, stat, { perMatch }) : null;
};
const leagueValue = (row: { values: Record<string, number | null> }, id: string) => row.values[id] ?? null;
const shortTeam = (name: string) => name.replace(/\s*\(.*\)$/, '');
const n = (v: number | null) => v ?? 0;
/** Proporción (0 a 1) a porcentaje; null queda null. */
const x100 = (v: number | null) => (v === null ? null : v * 100);

/** Líneas de box score de Boca de los partidos del filtro, agrupadas por partido. */
function linesByMatch(data: LandingData, ms: TeamMatchRow[]): Map<number, Line[]> {
  const ids = new Set(ms.map((m) => m.matchId));
  const out = new Map<number, Line[]>();
  for (const l of data.lines) {
    if (l.game_id === null || !ids.has(l.game_id)) continue;
    out.set(l.game_id, [...(out.get(l.game_id) ?? []), l]);
  }
  return out;
}

/** Game Score de Hollinger de una línea de box score. */
function gameScore(l: Line): number {
  const fgm = n(l.fg2m) + n(l.fg3m);
  const fga = n(l.fg2a) + n(l.fg3a);
  return (
    n(l.pts) +
    0.4 * fgm -
    0.7 * fga -
    0.4 * (n(l.fta) - n(l.ftm)) +
    0.7 * n(l.orb) +
    0.3 * n(l.drb) +
    n(l.stl) +
    0.7 * n(l.ast) +
    0.7 * n(l.blk) -
    0.4 * n(l.pf) -
    n(l.tov)
  );
}

function perMatchLine(
  ms: TeamMatchRow[],
  series: { key: string; label: string; slot: Slot; scale?: number }[],
  window = 0,
): ChartOutput {
  const withData = ms.filter((m) => series.some((x) => s(m, x.key) !== null));
  if (withData.length < 2) return { empty: 'Menos de dos partidos con este dato en el filtro elegido.' };
  const lines: Series[] = series.map((x) => {
    const raw = withData.map((m) => {
      const v = s(m, x.key);
      return v === null ? null : v * (x.scale ?? 1);
    });
    return {
      id: x.key,
      label: window ? `${x.label} (media de ${String(window)})` : x.label,
      slot: x.slot,
      values: window ? rolling(raw, window) : raw,
    };
  });
  return {
    node: (
      <LineChart
        labels={withData.map(day)}
        series={lines}
        includeZero={false}
        label={series.map((x) => x.label).join(' y ')}
      />
    ),
    table: {
      head: ['Partido', ...series.map((x) => x.label)],
      rows: withData.map((m, i) => [matchLabel(m), ...lines.map((l) => l.values[i] ?? null)]),
    },
    coverage: covered(ms, series[0]?.key ?? ''),
  };
}

function perMatchBars(
  ms: TeamMatchRow[],
  series: { label: string; slot: Slot; value: (m: TeamMatchRow) => number | null }[],
  title: string,
  options: { stacked?: boolean; references?: { value: number; label: string }[] } = {},
): ChartOutput {
  if (!ms.length) return { empty: 'No hay partidos en el filtro elegido.' };
  return {
    node: (
      <BarChart
        stacked={options.stacked}
        labels={ms.map(day)}
        series={series.map((x, i) => ({ id: String(i), label: x.label, slot: x.slot, values: ms.map(x.value) }))}
        references={options.references}
        label={title}
      />
    ),
    table: {
      head: ['Partido', ...series.map((x) => x.label)],
      rows: ms.map((m) => [matchLabel(m), ...series.map((x) => x.value(m))]),
    },
  };
}

function scatterMatches(
  ms: TeamMatchRow[],
  fx: (m: TeamMatchRow) => number | null,
  fy: (m: TeamMatchRow) => number | null,
  xLabel: string,
  yLabel: string,
  diagonal = false,
): ChartOutput {
  const pts = ms.flatMap((m) => {
    const x = fx(m);
    const y = fy(m);
    return x === null || y === null ? [] : [{ x, y, label: matchLabel(m), slot: RESULT_SLOT[result(m)] ?? 1 }];
  });
  if (pts.length < 3) return { empty: 'Menos de tres partidos con estos datos en el filtro elegido.' };
  return {
    node: (
      <ScatterChart
        medians={!diagonal}
        diagonal={diagonal}
        points={pts}
        groups={RESULTS.map((r) => ({ label: RESULT_NAME[r] ?? r, slot: RESULT_SLOT[r] ?? 1 }))}
        xLabel={xLabel}
        yLabel={yLabel}
        label={`${yLabel} frente a ${xLabel.toLowerCase()} por partido`}
      />
    ),
    table: { head: ['Partido', xLabel, yLabel], rows: pts.map((p) => [p.label, p.x, p.y]) },
  };
}

function histogram(values: number[], unit: string, title: string, k = 6, slot: Slot = 1): ChartOutput {
  const b = bins(values, k);
  if (!b.length) return { empty: 'Sin datos en el filtro elegido.' };
  const labels = b.map((x) => `${x.from.toFixed(0)}-${x.to.toFixed(0)}`);
  return {
    node: (
      <BarChart
        labels={labels}
        series={[{ id: 'n', label: unit, slot, values: b.map((x) => x.count) }]}
        label={title}
      />
    ),
    table: { head: ['Tramo', unit], rows: labels.map((l, i) => [l, b[i]?.count ?? 0]) },
  };
}

function rankingChart(rows: { label: string; value: number | null }[], title: string, top = 12): ChartOutput {
  const list = rows
    .filter((r): r is { label: string; value: number } => r.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
  if (!list.length) return { empty: 'No hay jugadores con este dato.' };
  return {
    node: (
      <BarChart
        horizontal
        labels={list.map((r) => r.label)}
        series={[{ id: 'v', label: title, slot: 1, values: list.map((r) => r.value) }]}
        label={title}
      />
    ),
    table: { head: ['Jugador', title], rows: list.map((r) => [r.label, r.value]) },
  };
}

/** Gráfico con un selector propio (jugador o estadística) dentro de la tarjeta. */
function Selectable<T extends string>({
  options,
  initial,
  label,
  render,
}: {
  options: { value: T; label: string }[];
  initial: T;
  label: string;
  render: (value: T) => ReactNode;
}) {
  const [value, setValue] = useState<T>(initial);
  return (
    <div className="grid gap-2">
      <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted">
        {label}
        <select
          aria-label={label}
          className="select focus-ring min-w-0 max-w-full flex-1 text-xs"
          value={value}
          onChange={(e) => {
            setValue(e.target.value as T);
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {render(value)}
    </div>
  );
}

function outputNode(out: ChartOutput): ReactNode {
  return 'empty' in out ? <p className="text-sm text-muted">Sin datos: {out.empty}</p> : out.node;
}

const playerOptions = (ps: PlayerRow[]) => ps.map((p) => ({ value: String(p.playerId), label: p.name }));
// Estadísticas de jugador elegibles en los selectores: las que tienen dato y no son de nivel C.
const statOptions = (catalog: StatDef[]) =>
  catalog
    .filter((c) => c.entity === 'jugador' && c.available && c.level !== 'C')
    .map((c) => ({ value: c.id, label: c.name }));

/** Posición de cada equipo después de cada fecha (más victorias; a igualdad, mejor diferencia). */
function standings(data: LandingData) {
  const dates = [...new Set(data.leagueGames.map((g) => g.date))].sort();
  const acc = new Map<string, { w: number; l: number; diff: number }>();
  const byDate: { date: string; table: { team: string; pos: number }[] }[] = [];
  const add = (t: string, won: boolean, diff: number) => {
    const r = acc.get(t) ?? { w: 0, l: 0, diff: 0 };
    acc.set(t, { w: r.w + (won ? 1 : 0), l: r.l + (won ? 0 : 1), diff: r.diff + diff });
  };
  for (const date of dates) {
    for (const g of data.leagueGames.filter((x) => x.date === date)) {
      const homeWon = g.homePoints > g.awayPoints;
      add(g.home, homeWon, g.homePoints - g.awayPoints);
      add(g.away, !homeWon, g.awayPoints - g.homePoints);
    }
    const rate = (r: { w: number; l: number }) => r.w / Math.max(1, r.w + r.l);
    const table = [...acc.entries()]
      .sort(([, a], [, b]) => rate(b) - rate(a) || b.diff - a.diff)
      .map(([t], i) => ({ team: t, pos: i + 1 }));
    byDate.push({ date, table });
  }
  return byDate;
}

function ScatterConfig({ players, catalog }: { players: PlayerRow[]; catalog: StatDef[] }) {
  const options = statOptions(catalog);
  const [xId, setX] = useState('usg_pct');
  const [yId, setY] = useState('ts');
  const xs = statById(catalog, xId);
  const ys = statById(catalog, yId);
  const pts = players.flatMap((p): ScatterPoint[] => {
    const x = xs ? playerValue(p, xs, xs.per36) : null;
    const y = ys ? playerValue(p, ys, ys.per36) : null;
    return x !== null && y !== null
      ? [{ x, y, label: p.name, slot: positionSlot(p), size: Math.min(1, p.minutes / 400) }]
      : [];
  });
  const select = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted">
      {label}
      <select
        aria-label={label}
        className="select focus-ring min-w-0 max-w-full flex-1 text-xs"
        value={value}
        onChange={(e) => {
          set(e.target.value);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-3">
        {select('Eje X', xId, setX)}
        {select('Eje Y', yId, setY)}
      </div>
      <ScatterChart
        medians
        points={pts}
        groups={POSITION_GROUPS}
        xLabel={`${xs?.short ?? xId}${xs?.per36 ? ' /36' : ''}`}
        yLabel={`${ys?.short ?? yId}${ys?.per36 ? ' /36' : ''}`}
        label="Dispersión configurable: un punto por jugador (tamaño: minutos)"
      />
    </div>
  );
}

// Estadísticas del mapa de calor del plantel y de la matriz de correlación (tasas, no volumen).
const HEAT_STATS = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'ts', 'usg_pct', 'ast_pct', 'trb_pct', 'per', 'on_off'];
const CORR_STATS = ['ppg', 'rpg', 'apg', 'spg', 'ts', 'usg_pct', 'per', 'on_off'];
// Boca frente a la liga (n.º 54): estadísticas que hay para los 16 equipos.
const LEAGUE_STATS = [
  'win_pct',
  'mov',
  'srs',
  'sos',
  'ortg',
  'drtg',
  'net_rating',
  'efg',
  'tov_pct',
  'orb_pct_team',
  'ft_per_fga',
  'elo',
];
const FOUR_FACTORS = [
  { id: 'efg', rival: 'efg_against', label: 'eFG%', scale: 100 },
  { id: 'tov_pct', rival: 'tov_pct_against', label: 'TOV%', scale: 1 },
  { id: 'orb_pct_team', rival: 'orb_pct_against', label: 'ORB%', scale: 100 },
  { id: 'ft_per_fga', rival: 'ft_per_fga_against', label: 'TL/TCI (×100)', scale: 100 },
];
const ZONES = [
  ['aro', 'Cerca del aro'],
  ['pintura', 'Resto de la pintura'],
  ['media', 'Media distancia'],
  ['esquina3', 'Triple de esquina'],
  ['frontal3', 'Triple frontal'],
] as const;
const winPct = (rows: TeamMatchRow[]) => pct(rows.filter((m) => result(m) === 'G').length, rows.length);

export const CHARTS: Record<string, ChartRender> = {
  // --- A. Forma y resultados -----------------------------------------------------------------
  g01: ({ matches }) => {
    if (!matches.length) return { empty: 'No hay partidos en el filtro elegido.' };
    const acc = cumulative(matches.map((m) => (result(m) === 'G' ? 1 : 0)));
    return {
      node: (
        <>
          <LineChart
            labels={matches.map(day)}
            series={[{ id: 'w', label: 'Victorias acumuladas', slot: 2, values: acc }]}
            pointSlots={matches.map((m) => RESULT_SLOT[result(m)] ?? null)}
            label="Victorias acumuladas partido a partido"
          />
          <Legend items={RESULTS.map((r) => ({ label: RESULT_NAME[r] ?? r, slot: RESULT_SLOT[r] ?? 1 }))} />
        </>
      ),
      table: {
        head: ['Partido', 'Resultado', 'Victorias acumuladas'],
        rows: matches.map((m, i) => [
          matchLabel(m),
          `${String(m.pointsFor)}-${String(m.pointsAgainst)}`,
          acc[i] ?? null,
        ]),
      },
    };
  },
  g02: ({ matches }) => {
    if (!matches.length) return { empty: 'No hay partidos en el filtro elegido.' };
    const acc = cumulative(matches.map((m) => (result(m) === 'G' ? 1 : 0)));
    // En la liga cada partido da una victoria y una derrota: el equipo promedio gana la mitad.
    const league = matches.map((_, i) => (i + 1) / 2);
    return {
      node: (
        <LineChart
          labels={matches.map(day)}
          series={[
            { id: 'boca', label: 'Boca', slot: 1, values: acc },
            { id: 'liga', label: 'Equipo promedio de la liga', slot: 2, values: league },
          ]}
          label="Victorias acumuladas de Boca contra el equipo promedio de la liga"
        />
      ),
      table: {
        head: ['Partido', 'Boca', 'Equipo promedio'],
        rows: matches.map((m, i) => [matchLabel(m), acc[i] ?? null, league[i] ?? null]),
      },
    };
  },
  g03: ({ data }) => {
    const byDate = standings(data);
    const last = byDate.at(-1);
    if (byDate.length < 2 || !last) return { empty: 'Menos de dos fechas jugadas en la liga.' };
    const boca = last.table.find((r) => r.team.startsWith('BOCA'));
    const featured = [...new Set([...(boca ? [boca.team] : []), ...last.table.slice(0, 4).map((r) => r.team)])];
    const slots: Slot[] = [1, 2, 4, 5, 6];
    const teams = last.table.length;
    const series: Series[] = featured.map((t, i) => ({
      id: t,
      label: shortTeam(t),
      slot: slots[i] ?? 9,
      // Más arriba = mejor puesto: se dibuja la cantidad de equipos que tiene por debajo.
      values: byDate.map((d) => {
        const row = d.table.find((r) => r.team === t);
        return row ? teams - row.pos : null;
      }),
    }));
    return {
      node: (
        <LineChart
          labels={byDate.map((d) => d.date.slice(8, 10) + '/' + d.date.slice(5, 7))}
          series={series}
          label="Evolución de la tabla: equipos por debajo después de cada fecha (más arriba, mejor puesto)"
        />
      ),
      table: {
        head: ['Fecha', ...featured.map((t) => `Puesto de ${shortTeam(t)}`)],
        rows: byDate.map((d) => [d.date, ...featured.map((t) => d.table.find((r) => r.team === t)?.pos ?? null)]),
      },
      coverage: 'Desempate por diferencia de puntos (la LNB usa además el resultado entre los empatados).',
    };
  },
  g04: ({ matches }) => {
    const sides = [
      { label: 'Local', rows: matches.filter((m) => m.home) },
      { label: 'Visitante', rows: matches.filter((m) => !m.home) },
    ];
    return {
      node: (
        <BarChart
          stacked
          labels={sides.map((x) => x.label)}
          series={RESULTS.map((r) => ({
            id: r,
            label: RESULT_NAME[r] ?? r,
            slot: RESULT_SLOT[r] ?? 1,
            values: sides.map((x) => x.rows.filter((m) => result(m) === r).length),
          }))}
          label="Resultados de local y de visitante"
        />
      ),
      table: {
        head: ['Condición', 'Ganados', 'Perdidos'],
        rows: sides.map((x) => [x.label, ...RESULTS.map((r) => x.rows.filter((m) => result(m) === r).length)]),
      },
    };
  },
  g05: ({ matches }) => ({
    node: (
      <>
        <Strip
          items={matches.map((m) => ({
            label: result(m),
            slot: RESULT_SLOT[result(m)] ?? null,
            title: `${matchLabel(m)}: ${String(m.pointsFor)}-${String(m.pointsAgainst)}`,
          }))}
          label="Resultados en orden"
        />
        <Legend items={RESULTS.map((r) => ({ label: RESULT_NAME[r] ?? r, slot: RESULT_SLOT[r] ?? 1 }))} />
      </>
    ),
    table: { head: ['Partido', 'Resultado'], rows: matches.map((m) => [matchLabel(m), result(m)]) },
  }),
  g06: ({ data }) => {
    const pts = data.league.flatMap((t): ScatterPoint[] => {
      const x = leagueValue(t, 'pyth_wins');
      const y = leagueValue(t, 'wins');
      return x === null || y === null ? [] : [{ x, y, label: t.label, slot: t.highlight ? 1 : 4 }];
    });
    if (pts.length < 3) return { empty: 'Falta la tabla de la liga.' };
    return {
      node: (
        <ScatterChart
          diagonal
          points={pts}
          groups={[
            { label: 'Boca', slot: 1 },
            { label: 'Resto de la liga', slot: 4 },
          ]}
          xLabel="Victorias pitagóricas"
          yLabel="Victorias reales"
          label="Victorias reales frente a pitagóricas: arriba de la diagonal, ganó más de lo que dicen sus puntos"
        />
      ),
      table: { head: ['Equipo', 'Pitagóricas', 'Reales'], rows: pts.map((p) => [p.label, p.x, p.y]) },
    };
  },
  g07: ({ matches }) =>
    perMatchBars(
      matches,
      [{ label: 'Margen', slot: 1, value: margin }],
      'Margen de cada partido (positivo: ganó Boca)',
    ),

  // --- B. Puntos y ritmo ---------------------------------------------------------------------
  g08: ({ matches }) =>
    perMatchLine(matches, [
      { key: 'points_for', label: 'Puntos a favor', slot: 1 },
      { key: 'points_against', label: 'Puntos en contra', slot: 3 },
      { key: 'ortg', label: 'ORtg', slot: 4 },
      { key: 'drtg', label: 'DRtg', slot: 5 },
    ]),
  g09: ({ matches, data }) => {
    const season = team(matches, data.catalog, 'pace');
    return perMatchBars(
      matches,
      [{ label: 'Ritmo', slot: 4, value: (m) => s(m, 'pace') }],
      'Posesiones cada 40 minutos',
      { references: season === null ? [] : [{ value: season, label: 'Promedio' }] },
    );
  },
  g10: ({ matches }) =>
    scatterMatches(
      matches,
      (m) => s(m, 'ortg'),
      (m) => s(m, 'drtg'),
      'ORtg',
      'DRtg',
      true,
    ),
  g11: ({ matches }) => perMatchLine(matches, [{ key: 'net_rating', label: 'Net Rating', slot: 1 }], 3),
  g12: ({ matches }) =>
    histogram(
      matches.map((m) => m.pointsFor),
      'Partidos',
      'Partidos según los puntos anotados',
      5,
    ),
  g13: ({ matches }) =>
    perMatchBars(
      matches,
      [
        { label: 'Boca', slot: 1, value: (m) => m.pointsFor },
        { label: 'Rival', slot: 3, value: (m) => m.pointsAgainst },
      ],
      'Puntos totales del partido',
      { stacked: true },
    ),
  g14: ({ matches }) => scatterMatches(matches, (m) => s(m, 'pace'), margin, 'Ritmo', 'Margen'),

  // --- C. Cuartos ----------------------------------------------------------------------------
  g15: ({ matches, data }) => {
    const ids = new Set(matches.map((m) => m.matchId));
    const qs = [1, 2, 3, 4].map((q) => data.periods.filter((p) => p.period === q && ids.has(p.gameId)));
    if (!qs[0]?.length) return { empty: 'Sin parciales por cuarto en el filtro elegido.' };
    const pf = qs.map((q) => avg(q.map((p) => p.pointsFor)));
    const pa = qs.map((q) => avg(q.map((p) => p.pointsAgainst)));
    return {
      node: (
        <BarChart
          labels={['1.º', '2.º', '3.º', '4.º']}
          series={[
            { id: 'f', label: 'A favor', slot: 1, values: pf },
            { id: 'c', label: 'En contra', slot: 3, values: pa },
          ]}
          label="Puntos promedio por cuarto"
        />
      ),
      table: {
        head: ['Cuarto', 'A favor', 'En contra'],
        rows: qs.map((_, i) => [`${String(i + 1)}.º`, pf[i] ?? null, pa[i] ?? null]),
      },
    };
  },
  g16: ({ matches, data }) => {
    const poss = new Map(matches.map((m) => [m.matchId, s(m, 'possessions')]));
    const values = [1, 2, 3, 4].map((q) => {
      const rows = data.periods.filter((p) => p.period === q && (poss.get(p.gameId) ?? null) !== null);
      const diff = sum(rows.map((p) => p.pointsFor - p.pointsAgainst));
      const qp = sum(rows.map((p) => (poss.get(p.gameId) ?? 0) / 4));
      return qp ? (100 * diff) / qp : null;
    });
    if (values.every((v) => v === null)) return { empty: 'Sin parciales por cuarto en el filtro elegido.' };
    return {
      node: (
        <BarChart
          labels={['1.º', '2.º', '3.º', '4.º']}
          series={[{ id: 'nr', label: 'Net Rating', slot: 1, values }]}
          label="Net Rating de cada cuarto"
        />
      ),
      table: { head: ['Cuarto', 'Net Rating'], rows: values.map((v, i) => [`${String(i + 1)}.º`, v]) },
      coverage: 'Posesiones del cuarto estimadas como la cuarta parte de las del partido.',
    };
  },
  g17: ({ matches, data }) => {
    const won = (m: TeamMatchRow) =>
      data.periods.filter((p) => p.gameId === m.matchId && p.period <= 4 && p.pointsFor > p.pointsAgainst).length;
    const counts = [0, 1, 2, 3, 4];
    const count = (c: number, r: string) => matches.filter((m) => won(m) === c && result(m) === r).length;
    return {
      node: (
        <BarChart
          stacked
          labels={counts.map((c) => `${String(c)} cuartos`)}
          series={RESULTS.map((r) => ({
            id: r,
            label: RESULT_NAME[r] ?? r,
            slot: RESULT_SLOT[r] ?? 1,
            values: counts.map((c) => count(c, r)),
          }))}
          label="Partidos según los cuartos ganados y el resultado final"
        />
      ),
      table: {
        head: ['Cuartos ganados', 'Ganados', 'Perdidos'],
        rows: counts.map((c) => [c, count(c, 'G'), count(c, 'P')]),
      },
    };
  },
  g18: ({ matches }) =>
    scatterMatches(matches, (m) => s(m, 'h1_diff'), margin, 'Diferencia al descanso', 'Margen final'),

  // --- D. Eficiencia y cuatro factores ------------------------------------------------------
  g19: ({ matches, data }) => {
    const league = (id: string) => avg(data.league.map((t) => leagueValue(t, id)));
    const scaled = (v: number | null, k: number) => (v === null ? null : v * k);
    const rows = FOUR_FACTORS.map((f) => ({
      label: f.label,
      boca: scaled(team(matches, data.catalog, f.id), f.scale),
      rival: scaled(team(matches, data.catalog, f.rival), f.scale),
      liga: scaled(league(f.id), f.scale),
    }));
    return {
      node: (
        <BarChart
          labels={rows.map((r) => r.label)}
          series={[
            { id: 'b', label: 'Boca', slot: 1, values: rows.map((r) => r.boca) },
            { id: 'r', label: 'Rivales', slot: 3, values: rows.map((r) => r.rival) },
            { id: 'l', label: 'Promedio de la liga', slot: 2, values: rows.map((r) => r.liga) },
          ]}
          label="Cuatro factores de Boca, de sus rivales y promedio de la liga (en %)"
        />
      ),
      table: {
        head: ['Factor', 'Boca', 'Rivales', 'Liga'],
        rows: rows.map((r) => [r.label, r.boca, r.rival, r.liga]),
      },
    };
  },
  g20: ({ matches }) =>
    perMatchLine(matches, [
      { key: 'efg', label: 'eFG%', slot: 1, scale: 100 },
      { key: 'tov_pct', label: 'TOV%', slot: 3 },
      { key: 'orb_pct_team', label: 'ORB%', slot: 4, scale: 100 },
      { key: 'ft_per_fga', label: 'TL/TCI (×100)', slot: 5, scale: 100 },
    ]),
  g21: ({ matches }) =>
    scatterMatches(
      matches,
      (m) => x100(s(m, 'efg_against')),
      (m) => x100(s(m, 'efg')),
      'eFG% del rival',
      'eFG% de Boca',
      true,
    ),
  g22: ({ matches }) => perMatchLine(matches, [{ key: 'ts', label: 'TS%', slot: 1, scale: 100 }]),
  g23: ({ matches }) =>
    perMatchLine(matches, [
      { key: 'tov_pct', label: 'TOV% de Boca', slot: 3 },
      { key: 'tov_pct_against', label: 'TOV% del rival', slot: 1 },
    ]),
  g24: ({ matches }) =>
    perMatchBars(
      matches,
      [
        { label: 'Boca', slot: 1, value: (m) => s(m, 'ft_per_fga') },
        { label: 'Rival', slot: 3, value: (m) => s(m, 'ft_per_fga_against') },
      ],
      'Libres convertidos por tiro de campo',
    ),

  // --- E. Tiros ------------------------------------------------------------------------------
  g26: ({ matches, data }) => {
    // Reparto y acierto de la temporada: promedio de los partidos con el dato.
    const values = ZONES.map(([z]) => [
      x100(team(matches, data.catalog, `team_${z}_fga_share`)),
      x100(team(matches, data.catalog, `team_${z}_fg_pct`)),
    ]);
    if (values.every((r) => r.every((v) => v === null))) return { empty: 'Sin tiros con zona en el filtro elegido.' };
    return {
      node: (
        <Heatmap
          rows={ZONES.map(([, l]) => l)}
          cols={['% de los tiros', 'Acierto']}
          values={values}
          label="Tiros de Boca por zona: de dónde tira y con qué acierto"
        />
      ),
      table: {
        head: ['Zona', '% de los tiros', 'Acierto (%)'],
        rows: ZONES.map(([, l], i) => [l, ...(values[i] ?? [])]),
      },
      coverage: 'Zonas Z1 a Z14 de la LNB agrupadas en cinco (ver pipeline/extras.py).',
    };
  },
  g27: ({ matches }) =>
    perMatchBars(
      matches,
      [
        { label: 'Dobles', slot: 1, value: (m) => s(m, 'team_fg2a') },
        { label: 'Triples', slot: 4, value: (m) => s(m, 'team_fg3a') },
        { label: 'Libres', slot: 5, value: (m) => s(m, 'team_fta') },
      ],
      'Tiros intentados por partido',
      { stacked: true },
    ),
  g28: ({ matches }) => perMatchLine(matches, [{ key: 'team_fg3_pct', label: '% de triples', slot: 4, scale: 100 }]),
  g29: ({ matches }) =>
    scatterMatches(
      matches,
      (m) => x100(s(m, 'three_rate')),
      (m) => x100(s(m, 'team_fg3_pct')),
      '3PAr (%)',
      '% de triples',
    ),
  g30: ({ matches }) =>
    histogram(
      matches.flatMap((m) => s(m, 'team_fg3m') ?? []),
      'Partidos',
      'Partidos según los triples convertidos',
      4,
      4,
    ),
  g31: ({ matches }) =>
    perMatchBars(
      matches,
      [
        { label: 'Intentados', slot: 2, value: (m) => s(m, 'team_fta') },
        { label: 'Convertidos', slot: 1, value: (m) => s(m, 'team_ftm') },
      ],
      'Tiros libres intentados y convertidos',
    ),
  g32: ({ matches }) =>
    perMatchBars(
      matches,
      [
        { label: 'Dobles del rival', slot: 3, value: (m) => s(m, 'rival_fg2a') },
        { label: 'Triples del rival', slot: 5, value: (m) => s(m, 'rival_fg3a') },
      ],
      'Tiros de campo intentados por el rival',
      { stacked: true },
    ),

  // --- F. Rebotes, pérdidas y asistencias --------------------------------------------------
  g33: ({ matches }) =>
    perMatchBars(
      matches,
      [
        { label: 'Ofensivos', slot: 1, value: (m) => s(m, 'team_orb') },
        { label: 'Defensivos', slot: 4, value: (m) => s(m, 'team_drb') },
      ],
      'Rebotes de Boca por partido',
      { stacked: true },
    ),
  g34: ({ matches }) =>
    perMatchLine(matches, [
      { key: 'orb_pct_team', label: 'ORB%', slot: 1, scale: 100 },
      { key: 'team_drb_pct', label: 'DRB%', slot: 4, scale: 100 },
    ]),
  g35: ({ matches }) =>
    perMatchBars(
      matches,
      [
        { label: 'Pérdidas', slot: 3, value: (m) => s(m, 'team_tov') },
        { label: 'Robos', slot: 1, value: (m) => s(m, 'team_stl') },
      ],
      'Pérdidas y robos de Boca',
    ),
  g36: ({ matches }) => {
    const out = perMatchBars(
      matches,
      [
        { label: 'Asistencias', slot: 1, value: (m) => s(m, 'team_ast') },
        { label: 'Pérdidas', slot: 3, value: (m) => s(m, 'team_tov') },
      ],
      'Asistencias y pérdidas',
    );
    if ('empty' in out) return out;
    const ratio = (m: TeamMatchRow) => {
      const a = s(m, 'team_ast');
      const t = s(m, 'team_tov');
      return a !== null && t ? a / t : null;
    };
    return {
      ...out,
      table: {
        head: ['Partido', 'Asistencias', 'Pérdidas', 'AST/TOV'],
        rows: matches.map((m) => [matchLabel(m), s(m, 'team_ast'), s(m, 'team_tov'), ratio(m)]),
      },
    };
  },
  g37: ({ matches }) =>
    perMatchBars(
      matches,
      [{ label: 'Posesiones extra', slot: 1, value: (m) => s(m, 'extra_possessions') }],
      'Posesiones extra (rebotes ofensivos + robos − pérdidas, contra las del rival)',
    ),
  g38: ({ matches }) =>
    perMatchLine(matches, [{ key: 'team_ast_fgm', label: '% de canastas asistidas', slot: 1, scale: 100 }]),

  // --- G. Jugadores --------------------------------------------------------------------------
  g39: ({ data, regulars }) => ({
    node: <ScatterConfig players={regulars} catalog={data.catalog} />,
    table: {
      head: ['Jugador', 'USG%', 'TS%'],
      rows: regulars.map((p) => [p.name, pv(p, data.catalog, 'usg_pct'), pv(p, data.catalog, 'ts')]),
    },
  }),
  g40: ({ data, regulars }) => ({
    node: (
      <Selectable
        label="Estadística"
        options={statOptions(data.catalog)}
        initial="ppg"
        render={(id) =>
          outputNode(
            rankingChart(
              regulars.map((p) => ({ label: p.name, value: pv(p, data.catalog, id) })),
              statById(data.catalog, id)?.name ?? id,
            ),
          )
        }
      />
    ),
    table: {
      head: ['Jugador', 'Puntos por partido'],
      rows: regulars.map((p) => [p.name, pv(p, data.catalog, 'ppg')]),
    },
  }),
  g41: ({ data, regulars }) => ({
    node: (
      <Selectable
        label="Estadística"
        options={statOptions(data.catalog)}
        initial="per"
        render={(id) => {
          const values = regulars.map((p) => pv(p, data.catalog, id)).filter((v): v is number => v !== null);
          const b = bins(values, 5);
          return b.length ? (
            <BarChart
              labels={b.map((x) => `${x.from.toFixed(1)}-${x.to.toFixed(1)}`)}
              series={[{ id: 'n', label: 'Jugadores', slot: 2, values: b.map((x) => x.count) }]}
              label="Distribución en el plantel"
            />
          ) : (
            <p className="text-sm text-muted">Sin datos.</p>
          );
        }}
      />
    ),
    table: { head: ['Jugador', 'PER'], rows: regulars.map((p) => [p.name, pv(p, data.catalog, 'per')]) },
  }),
  g42: ({ data, matches, regulars }) => {
    const byMatch = linesByMatch(data, matches);
    const series = (id: number) => matches.map((m) => byMatch.get(m.matchId)?.find((l) => l.player_id === id) ?? null);
    const first = regulars[0];
    if (!first) return { empty: 'No hay jugadores con minutos.' };
    return {
      node: (
        <Selectable
          label="Jugador"
          options={playerOptions(regulars)}
          initial={String(first.playerId)}
          render={(id) => {
            const ls = series(Number(id));
            return (
              <LineChart
                labels={matches.map(day)}
                series={[
                  { id: 'p', label: 'Puntos', slot: 1, values: ls.map((l) => l?.pts ?? null) },
                  { id: 'r', label: 'Rebotes', slot: 4, values: ls.map((l) => l?.reb ?? null) },
                  { id: 'a', label: 'Asistencias', slot: 5, values: ls.map((l) => l?.ast ?? null) },
                ]}
                label="Puntos, rebotes y asistencias partido a partido"
              />
            );
          }}
        />
      ),
      table: {
        head: ['Partido', 'Puntos', 'Rebotes', 'Asistencias'],
        rows: series(first.playerId).map((l, i) => {
          const m = matches[i];
          return [m ? matchLabel(m) : '', l?.pts ?? null, l?.reb ?? null, l?.ast ?? null];
        }),
      },
      coverage: `Tabla: ${first.name}.`,
    };
  },
  g43: ({ data, matches, regulars }) => {
    const all = [...linesByMatch(data, matches).values()].flat();
    const rows = regulars.map((p) => {
      const own = all.filter((l) => l.player_id === p.playerId);
      return {
        name: p.name,
        starter: sum(own.filter((l) => l.started).map((l) => l.minutes)),
        bench: sum(own.filter((l) => !l.started).map((l) => l.minutes)),
      };
    });
    if (!rows.length) return { empty: 'No hay jugadores con minutos.' };
    return {
      node: (
        <BarChart
          horizontal
          stacked
          labels={rows.map((r) => r.name)}
          series={[
            { id: 't', label: 'Como titular', slot: 1, values: rows.map((r) => r.starter) },
            { id: 's', label: 'Desde el banco', slot: 4, values: rows.map((r) => r.bench) },
          ]}
          label="Minutos jugados como titular y desde el banco"
        />
      ),
      table: {
        head: ['Jugador', 'Como titular', 'Desde el banco'],
        rows: rows.map((r) => [r.name, r.starter, r.bench]),
      },
    };
  },
  g44: ({ data, regulars }) => {
    if (!regulars.length) return { empty: 'No hay jugadores con minutos.' };
    const stats = HEAT_STATS.flatMap((id) => statById(data.catalog, id) ?? []);
    const values = regulars.map((p) =>
      stats.map((st) => {
        const v = playerValue(p, st, false);
        const all = regulars.map((q) => playerValue(q, st, false)).filter((x): x is number => x !== null);
        return v === null ? null : rankAndPercentile(all, v, st.higherIsBetter).percentile;
      }),
    );
    return {
      node: (
        <Heatmap
          rows={regulars.map((p) => p.name)}
          cols={stats.map((st) => st.short)}
          values={values}
          label="Percentil de cada jugador en el plantel"
        />
      ),
      table: {
        head: ['Jugador', ...stats.map((st) => st.name)],
        rows: regulars.map((p, i) => [p.name, ...(values[i] ?? [])]),
      },
    };
  },
  g45: ({ data, regulars }) => {
    const pts = regulars.flatMap((p): ScatterPoint[] => {
      const x = pv(p, data.catalog, 'usg_pct');
      const y = x100(pv(p, data.catalog, 'ts'));
      return x === null || y === null
        ? []
        : [{ x, y, label: p.name, slot: positionSlot(p), size: Math.min(1, p.minutes / 400) }];
    });
    if (pts.length < 3) return { empty: 'Menos de tres jugadores con estos datos.' };
    return {
      node: (
        <ScatterChart
          medians
          points={pts}
          groups={POSITION_GROUPS}
          xLabel="USG%"
          yLabel="TS%"
          label="Volumen de juego (USG%) frente a eficiencia (TS%)"
        />
      ),
      table: { head: ['Jugador', 'USG%', 'TS%'], rows: pts.map((p) => [p.label, p.x, p.y]) },
    };
  },
  g46: ({ data, matches, regulars }) => {
    const byMatch = linesByMatch(data, matches);
    const top = regulars
      .map((p) => ({ p, pts: pv(p, data.catalog, 'pts') ?? 0 }))
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 5)
      .map((x) => x.p);
    const ids = new Set(top.map((p) => p.playerId));
    const slots: Slot[] = [1, 2, 4, 5, 6];
    const ptsOf = (m: TeamMatchRow, id: number | null) => {
      const ls = byMatch.get(m.matchId) ?? [];
      return id === null
        ? sum(ls.filter((l) => l.player_id === null || !ids.has(l.player_id)).map((l) => l.pts))
        : sum(ls.filter((l) => l.player_id === id).map((l) => l.pts));
    };
    const series = [
      ...top.map((p, i) => ({
        label: p.name,
        slot: slots[i] ?? 9,
        value: (m: TeamMatchRow) => ptsOf(m, p.playerId),
      })),
      { label: 'Resto', slot: 9 as Slot, value: (m: TeamMatchRow) => ptsOf(m, null) },
    ];
    return perMatchBars(matches, series, 'Puntos de cada jugador en cada partido', { stacked: true });
  },
  g47: ({ data, matches, regulars }) => {
    const byMatch = linesByMatch(data, matches);
    const first = regulars[0];
    if (!first) return { empty: 'No hay jugadores con minutos.' };
    const scores = (id: number) =>
      matches.map((m) => {
        const l = byMatch.get(m.matchId)?.find((x) => x.player_id === id);
        return l && n(l.minutes) > 0 ? gameScore(l) : null;
      });
    return {
      node: (
        <Selectable
          label="Jugador"
          options={playerOptions(regulars)}
          initial={String(first.playerId)}
          render={(id) => (
            <BarChart
              labels={matches.map(day)}
              series={[{ id: 'gs', label: 'Game Score', slot: 1, values: scores(Number(id)) }]}
              label="Game Score de Hollinger en cada partido"
            />
          )}
        />
      ),
      table: {
        head: ['Partido', 'Game Score'],
        rows: scores(first.playerId).map((v, i) => {
          const m = matches[i];
          return [m ? matchLabel(m) : '', v];
        }),
      },
      coverage: `Tabla: ${first.name}.`,
    };
  },
  g48: ({ data }) => {
    const rows = data.players
      .map((p) => ({
        name: p.name,
        dd: pv(p, data.catalog, 'double_doubles') ?? 0,
        td: pv(p, data.catalog, 'triple_doubles') ?? 0,
      }))
      .filter((r) => r.dd + r.td > 0);
    if (!rows.length) return { empty: 'Todavía ningún jugador hizo un doble-doble.' };
    return {
      node: (
        <BarChart
          horizontal
          labels={rows.map((r) => r.name)}
          series={[
            { id: 'dd', label: 'Dobles-dobles', slot: 1, values: rows.map((r) => r.dd) },
            { id: 'td', label: 'Triples-dobles', slot: 2, values: rows.map((r) => r.td) },
          ]}
          label="Dobles-dobles y triples-dobles"
        />
      ),
      table: { head: ['Jugador', 'Dobles-dobles', 'Triples-dobles'], rows: rows.map((r) => [r.name, r.dd, r.td]) },
    };
  },
  g49: ({ data, matches }) => {
    const byMatch = linesByMatch(data, matches);
    return perMatchBars(
      matches,
      [
        {
          label: 'Jugadores',
          slot: 4,
          value: (m) => (byMatch.get(m.matchId) ?? []).filter((l) => n(l.minutes) >= 10).length,
        },
      ],
      'Jugadores con 10 o más minutos en cada partido',
    );
  },
  g50: ({ data, matches }) => {
    const byMatch = linesByMatch(data, matches);
    const pts = (m: TeamMatchRow, started: boolean) =>
      sum((byMatch.get(m.matchId) ?? []).filter((l) => Boolean(l.started) === started).map((l) => l.pts));
    return perMatchBars(
      matches,
      [
        { label: 'Titulares', slot: 1, value: (m) => pts(m, true) },
        { label: 'Banca', slot: 4, value: (m) => pts(m, false) },
      ],
      'Puntos de los titulares y de la banca',
      { stacked: true },
    );
  },

  // --- H. Plantel y carga --------------------------------------------------------------------
  g51: ({ data, regulars }) => {
    const rows = regulars.map((p) => ({
      name: p.name,
      d7: pv(p, data.catalog, 'minutes_last_7d'),
      d14: pv(p, data.catalog, 'minutes_last_14d'),
      d28: pv(p, data.catalog, 'minutes_last_28d'),
    }));
    if (!rows.length) return { empty: 'No hay jugadores con minutos.' };
    return {
      node: (
        <BarChart
          horizontal
          labels={rows.map((r) => r.name)}
          series={[
            { id: '7', label: '7 días', slot: 3, values: rows.map((r) => r.d7) },
            { id: '14', label: '14 días', slot: 5, values: rows.map((r) => r.d14) },
            { id: '28', label: '28 días', slot: 4, values: rows.map((r) => r.d28) },
          ]}
          label="Minutos jugados en los últimos 7, 14 y 28 días"
        />
      ),
      table: {
        head: ['Jugador', '7 días', '14 días', '28 días'],
        rows: rows.map((r) => [r.name, r.d7, r.d14, r.d28]),
      },
    };
  },
  g52: ({ matches }) => scatterMatches(matches, (m) => s(m, 'rest_days'), margin, 'Días de descanso', 'Margen'),
  g53: ({ data }) => {
    const pts = data.players.flatMap((p): ScatterPoint[] =>
      p.age === null ? [] : [{ x: p.age, y: p.minutes, label: p.name, slot: positionSlot(p) }],
    );
    if (pts.length < 3) return { empty: 'Faltan edades del plantel.' };
    return {
      node: (
        <ScatterChart
          medians
          points={pts}
          groups={POSITION_GROUPS}
          xLabel="Edad"
          yLabel="Minutos"
          label="Edad y minutos de cada jugador del plantel"
        />
      ),
      table: { head: ['Jugador', 'Edad', 'Minutos'], rows: pts.map((p) => [p.label, p.x, p.y]) },
    };
  },

  // --- I. Competición ------------------------------------------------------------------------
  g54: ({ data }) => {
    const boca = data.league.find((t) => t.highlight);
    if (!boca) return { empty: 'Falta la tabla de la liga.' };
    const rows = LEAGUE_STATS.flatMap((id) => {
      const st = statById(data.catalog, id);
      const v = leagueValue(boca, id);
      const all = data.league.map((t) => leagueValue(t, id)).filter((x): x is number => x !== null);
      return st && v !== null && all.length > 1
        ? [{ label: st.short, name: st.name, value: rankAndPercentile(all, v, st.higherIsBetter).percentile }]
        : [];
    });
    return {
      node: (
        <BarChart
          horizontal
          labels={rows.map((r) => r.label)}
          series={[{ id: 'p', label: 'Percentil de Boca', slot: 1, values: rows.map((r) => r.value) }]}
          label={`Percentil de Boca entre los ${String(data.league.length)} equipos (100 = el mejor)`}
        />
      ),
      table: { head: ['Estadística', 'Percentil'], rows: rows.map((r) => [r.name, r.value]) },
    };
  },
  g55: ({ matches, data }) => {
    const final = data.league.find((t) => t.highlight)?.values.elo ?? null;
    return {
      node: (
        <LineChart
          labels={[...matches.map(day), 'Hoy']}
          includeZero={false}
          series={[
            { id: 'b', label: 'Boca', slot: 1, values: [...matches.map((m) => s(m, 'elo_pre')), final] },
            { id: 'r', label: 'Rival', slot: 3, values: [...matches.map((m) => s(m, 'elo_rival_pre')), null] },
          ]}
          label="Elo de Boca y de su rival antes de cada partido"
        />
      ),
      table: {
        head: ['Partido', 'Elo de Boca', 'Elo del rival'],
        rows: [...matches.map((m) => [matchLabel(m), s(m, 'elo_pre'), s(m, 'elo_rival_pre')]), ['Hoy', final, null]],
      },
    };
  },
  g56: ({ data }) => {
    const rows = [...data.league].sort((a, b) => n(leagueValue(b, 'srs')) - n(leagueValue(a, 'srs')));
    if (!rows.length) return { empty: 'Falta la tabla de la liga.' };
    return {
      node: (
        <BarChart
          horizontal
          labels={rows.map((t) => shortTeam(t.label))}
          series={[
            { id: 'srs', label: 'SRS', slot: 1, values: rows.map((t) => leagueValue(t, 'srs')) },
            { id: 'sos', label: 'SOS', slot: 2, values: rows.map((t) => leagueValue(t, 'sos')) },
          ]}
          label="SRS (fuerza neta) y SOS (dificultad del calendario) de cada equipo"
        />
      ),
      table: {
        head: ['Equipo', 'SRS', 'SOS'],
        rows: rows.map((t) => [t.label, leagueValue(t, 'srs'), leagueValue(t, 'sos')]),
      },
    };
  },
  g57: ({ data }) => {
    const pts = data.league.flatMap((t): ScatterPoint[] => {
      const x = leagueValue(t, 'ortg');
      const y = leagueValue(t, 'drtg');
      return x === null || y === null ? [] : [{ x, y, label: t.label, slot: t.highlight ? 1 : 4 }];
    });
    if (pts.length < 3) return { empty: 'Falta el box score de la liga.' };
    return {
      node: (
        <ScatterChart
          medians
          points={pts}
          groups={[
            { label: 'Boca', slot: 1 },
            { label: 'Resto de la liga', slot: 4 },
          ]}
          xLabel="ORtg"
          yLabel="DRtg (más bajo, mejor defensa)"
          label="Ataque y defensa de los equipos de la liga"
        />
      ),
      table: { head: ['Equipo', 'ORtg', 'DRtg'], rows: pts.map((p) => [p.label, p.x, p.y]) },
    };
  },
  g58: ({ data }) => {
    const options = ['rank_ppg', 'rank_rpg', 'rank_apg', 'rank_spg', 'rank_bpg', 'rank_per'].flatMap((id) => {
      const st = statById(data.catalog, id);
      return st ? [{ value: id, label: st.name }] : [];
    });
    const firstOption = options[0];
    if (!firstOption) return { empty: 'Sin puestos en la liga.' };
    const rows = (id: string) =>
      data.players
        .map((p) => ({ name: p.name, rank: pv(p, data.catalog, id) }))
        .filter((r): r is { name: string; rank: number } => r.rank !== null)
        .sort((a, b) => a.rank - b.rank);
    return {
      node: (
        <Selectable
          label="Categoría"
          options={options}
          initial={firstOption.value}
          render={(id) => (
            <BarChart
              horizontal
              labels={rows(id).map((r) => r.name)}
              series={[{ id: 'r', label: 'Puesto en la liga', slot: 2, values: rows(id).map((r) => r.rank) }]}
              label="Puesto de cada jugador de Boca en la liga (1 = líder)"
            />
          )}
        />
      ),
      table: {
        head: ['Jugador', `Puesto: ${firstOption.label}`],
        rows: rows(firstOption.value).map((r) => [r.name, r.rank]),
      },
    };
  },

  // --- J. Disciplina -------------------------------------------------------------------------
  g60: ({ data, regulars }) =>
    rankingChart(
      regulars.map((p) => ({ label: p.name, value: pv(p, data.catalog, 'fpg') })),
      'Faltas por partido',
    ),
  g61: ({ matches }) =>
    perMatchBars(
      matches,
      [
        { label: 'Libres de Boca', slot: 1, value: (m) => s(m, 'team_fta') },
        { label: 'Libres del rival', slot: 3, value: (m) => s(m, 'rival_fta') },
      ],
      'Tiros libres intentados a favor y en contra',
    ),

  // --- K. Métricas propias -------------------------------------------------------------------
  g62: ({ data, regulars }) => {
    const rows = regulars.map((p) => ({
      name: p.name,
      ewa: pv(p, data.catalog, 'ewa'),
      ela: pv(p, data.catalog, 'ela'),
      onOff: pv(p, data.catalog, 'on_off'),
    }));
    if (!rows.some((r) => r.ewa !== null)) return { empty: 'Sin métricas propias (faltan partidos con play-by-play).' };
    return {
      node: (
        <BarChart
          horizontal
          labels={rows.map((r) => r.name)}
          series={[
            { id: 'ewa', label: 'EWA (victorias)', slot: 1, values: rows.map((r) => r.ewa) },
            { id: 'ela', label: 'ELA (derrotas)', slot: 3, values: rows.map((r) => r.ela) },
          ]}
          label="Victorias y derrotas aportadas frente al reemplazo"
        />
      ),
      table: {
        head: ['Jugador', 'EWA', 'ELA', 'On/Off'],
        rows: rows.map((r) => [r.name, r.ewa, r.ela, r.onOff]),
      },
      coverage: 'Muestra pequeña: menos de 400 minutos por jugador.',
    };
  },
  g63: ({ matches }) =>
    perMatchBars(
      matches,
      [{ label: 'Net Rating', slot: 1, value: (m) => s(m, 'net_rating') }],
      'Net Rating de cada partido',
    ),
  g64: ({ data, regulars }) => {
    if (regulars.length < 4) return { empty: 'Menos de cuatro jugadores con minutos.' };
    const stats = CORR_STATS.flatMap((id) => statById(data.catalog, id) ?? []);
    const values = stats.map((a) =>
      stats.map((b) => {
        const pairs = regulars.flatMap((p) => {
          const x = playerValue(p, a, false);
          const y = playerValue(p, b, false);
          return x === null || y === null ? [] : [[x, y] as const];
        });
        const r = pearson(
          pairs.map((q) => q[0]),
          pairs.map((q) => q[1]),
        );
        return r === null ? null : Math.round(r * 100) / 100;
      }),
    );
    return {
      node: (
        <Heatmap
          diverging
          rows={stats.map((st) => st.short)}
          cols={stats.map((st) => st.short)}
          values={values}
          label="Correlación entre estadísticas en el plantel (−1 a 1)"
        />
      ),
      table: {
        head: ['', ...stats.map((st) => st.short)],
        rows: stats.map((st, i) => [st.short, ...(values[i] ?? [])]),
      },
      coverage: `Sobre ${String(regulars.length)} jugadores: con tan pocos, una correlación alta puede ser casualidad.`,
    };
  },

  // --- L. Situaciones ------------------------------------------------------------------------
  g65: ({ matches }) => {
    const groups = [
      { label: 'Ganando al descanso', rows: matches.filter((m) => n(s(m, 'h1_diff')) > 0) },
      { label: 'Empatado', rows: matches.filter((m) => s(m, 'h1_diff') === 0) },
      { label: 'Perdiendo al descanso', rows: matches.filter((m) => n(s(m, 'h1_diff')) < 0) },
    ];
    return {
      node: (
        <BarChart
          labels={groups.map((g) => g.label)}
          series={[{ id: 'w', label: '% de victorias', slot: 1, values: groups.map((g) => winPct(g.rows)) }]}
          label="Porcentaje de victorias según el resultado al descanso"
        />
      ),
      table: {
        head: ['Al descanso', 'Partidos', '% de victorias'],
        rows: groups.map((g) => [g.label, g.rows.length, winPct(g.rows)]),
      },
    };
  },
  g66: ({ matches }) => {
    if (matches.length < 3) return { empty: 'Menos de tres partidos en el filtro elegido.' };
    const pairs = matches.slice(1).map((m, i): [string, string] => [result(matches[i] ?? m), result(m)]);
    const labels = ['G', 'P'];
    const values = countMatrix(pairs, labels, labels);
    return {
      node: (
        <Heatmap
          rows={labels.map((r) => `Tras ${(RESULT_NAME[r] ?? r).toLowerCase()}`)}
          cols={labels.map((c) => RESULT_NAME[c] ?? c)}
          values={values}
          label="Resultado del partido siguiente según el anterior"
        />
      ),
      table: {
        head: ['Partido anterior', 'Ganó el siguiente', 'Perdió el siguiente'],
        rows: labels.map((r, i) => [RESULT_NAME[r] ?? r, ...(values[i] ?? [])]),
      },
    };
  },
  g67: ({ matches }) => {
    const bands = [
      { label: 'Menos de 10 triples', test: (v: number) => v < 10 },
      { label: '10 a 12', test: (v: number) => v >= 10 && v <= 12 },
      { label: '13 o más', test: (v: number) => v >= 13 },
    ];
    const groups = bands.map((b) => ({ label: b.label, rows: matches.filter((m) => b.test(n(s(m, 'team_fg3m')))) }));
    return {
      node: (
        <BarChart
          labels={groups.map((g) => g.label)}
          series={[{ id: 'w', label: '% de victorias', slot: 4, values: groups.map((g) => winPct(g.rows)) }]}
          label="Porcentaje de victorias según los triples convertidos"
        />
      ),
      table: {
        head: ['Triples convertidos', 'Partidos', '% de victorias'],
        rows: groups.map((g) => [g.label, g.rows.length, winPct(g.rows)]),
      },
    };
  },

  // --- M. Modelos, contexto y calendario -----------------------------------------------------
  g68: ({ matches }) =>
    scatterMatches(
      matches,
      (m) => x100(s(m, 'elo_win_prob')),
      margin,
      'Probabilidad de ganar según el Elo (%)',
      'Margen final',
    ),
  g69: ({ matches }) => {
    const bands = [
      { label: 'Menos de 40 %', lo: 0, hi: 0.4 },
      { label: '40 a 60 %', lo: 0.4, hi: 0.6 },
      { label: 'Más de 60 %', lo: 0.6, hi: 1.01 },
    ];
    const groups = bands.map((b) => {
      const rows = matches.filter((m) => {
        const p = s(m, 'elo_win_prob');
        return p !== null && p >= b.lo && p < b.hi;
      });
      return {
        label: b.label,
        expected: x100(avg(rows.map((m) => s(m, 'elo_win_prob')))),
        real: winPct(rows),
        count: rows.length,
      };
    });
    const brier = avg(matches.map((m) => s(m, 'brier')));
    return {
      node: (
        <BarChart
          labels={groups.map((g) => g.label)}
          series={[
            { id: 'e', label: 'Prevista', slot: 2, values: groups.map((g) => g.expected) },
            { id: 'r', label: 'Real', slot: 1, values: groups.map((g) => g.real) },
          ]}
          label="Probabilidad de ganar prevista por el Elo y frecuencia real de victorias (%)"
        />
      ),
      table: {
        head: ['Tramo', 'Partidos', 'Prevista (%)', 'Real (%)'],
        rows: groups.map((g) => [g.label, g.count, g.expected, g.real]),
      },
      coverage: `Brier medio: ${brier === null ? 'n/d' : brier.toFixed(3).replace('.', ',')} (0 es perfecto; 0,25 es tirar una moneda).`,
    };
  },
  g70: ({ matches, data }) => {
    const sides = [
      { label: 'Local', rows: matches.filter((m) => m.home) },
      { label: 'Visitante', rows: matches.filter((m) => !m.home) },
    ];
    const values = sides.map((x) => team(x.rows, data.catalog, 'net_rating'));
    return {
      node: (
        <BarChart
          labels={sides.map((x) => x.label)}
          series={[{ id: 'nr', label: 'Net Rating', slot: 1, values }]}
          label="Net Rating de local y de visitante"
        />
      ),
      table: {
        head: ['Condición', 'Partidos', 'Net Rating'],
        rows: sides.map((x, i) => [x.label, x.rows.length, values[i] ?? null]),
      },
    };
  },
  g71: ({ matches }) => ({
    node: (
      <>
        <Strip
          items={matches.map((m) => ({
            label: m.date.slice(8, 10),
            slot: RESULT_SLOT[result(m)] ?? null,
            title: `${matchLabel(m)}: ${String(m.pointsFor)}-${String(m.pointsAgainst)}`,
          }))}
          label="Calendario: un cuadro por partido con el día del mes y el color del resultado"
        />
        <Legend items={RESULTS.map((r) => ({ label: RESULT_NAME[r] ?? r, slot: RESULT_SLOT[r] ?? 1 }))} />
      </>
    ),
    table: { head: ['Fecha', 'Rival', 'Resultado'], rows: matches.map((m) => [m.date, m.opponent, result(m)]) },
  }),
  g72: ({ matches, data }) => {
    const overtime = new Set(data.periods.filter((p) => p.period > 4).map((p) => p.gameId));
    const event = (m: TeamMatchRow): { label: string; name: string; slot: Slot } =>
      overtime.has(m.matchId)
        ? { label: 'S', name: 'Suplementario', slot: 2 }
        : margin(m) < 0 && margin(m) >= -3
          ? { label: 'A', name: 'Derrota por 1 a 3', slot: 3 }
          : Math.abs(margin(m)) >= 20
            ? { label: 'Z', name: margin(m) > 0 ? 'Paliza a favor' : 'Paliza en contra', slot: 5 }
            : { label: '·', name: 'Sin evento', slot: 9 };
    return {
      node: (
        <>
          <Strip
            items={matches.map((m) => ({
              label: event(m).label,
              slot: event(m).slot,
              title: `${matchLabel(m)}: ${event(m).name}`,
            }))}
            label="Eventos de la temporada en orden"
          />
          <Legend
            items={[
              { label: 'Suplementario', slot: 2 },
              { label: 'Derrota por 1 a 3', slot: 3 },
              { label: 'Paliza (20 o más)', slot: 5 },
            ]}
          />
        </>
      ),
      table: { head: ['Partido', 'Evento'], rows: matches.map((m) => [matchLabel(m), event(m).name]) },
    };
  },
  g73: ({ data, matches }) => {
    if (matches.length < 2) return { empty: 'Menos de dos partidos en el filtro elegido.' };
    const byMatch = linesByMatch(data, matches);
    const five = (m: TeamMatchRow) =>
      new Set((byMatch.get(m.matchId) ?? []).filter((l) => l.started).map((l) => l.player_id));
    const values = matches.map((m, i) => {
      const prev = matches[i - 1];
      if (!prev) return null;
      const a = five(prev);
      const b = five(m);
      const inter = [...a].filter((x) => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      return union ? inter / union : null;
    });
    return {
      node: (
        <LineChart
          labels={matches.map(day)}
          series={[{ id: 'j', label: 'Repetición del quinteto', slot: 1, values }]}
          label="Repetición del quinteto titular respecto del partido anterior (1 = mismo quinteto)"
        />
      ),
      table: {
        head: ['Partido', 'Jaccard con el anterior'],
        rows: matches.map((m, i) => [matchLabel(m), values[i] ?? null]),
      },
    };
  },
  g74: ({ data }) => {
    const bands = [
      { label: 'Hasta 21', lo: 0, hi: 21 },
      { label: '22 a 26', lo: 22, hi: 26 },
      { label: '27 a 31', lo: 27, hi: 31 },
      { label: '32 o más', lo: 32, hi: 99 },
    ];
    const withAge = data.players.filter((p) => p.age !== null);
    const total = sum(withAge.map((p) => p.minutes));
    if (!total) return { empty: 'Faltan edades del plantel.' };
    const inBand = (p: PlayerRow, b: { lo: number; hi: number }) => {
      const age = Math.floor(p.age ?? 0);
      return age >= b.lo && age <= b.hi;
    };
    const values = bands.map((b) => pct(sum(withAge.filter((p) => inBand(p, b)).map((p) => p.minutes)), total));
    return {
      node: (
        <BarChart
          labels={bands.map((b) => b.label)}
          series={[{ id: 'm', label: '% de los minutos', slot: 4, values }]}
          label="Reparto de los minutos por tramo de edad"
        />
      ),
      table: { head: ['Edad', '% de los minutos'], rows: bands.map((b, i) => [b.label, values[i] ?? null]) },
    };
  },
  g75: ({ data }) => {
    const rows = data.players
      .map((p) => ({
        name: p.name,
        ten: pv(p, data.catalog, 'streak_10_pts') ?? 0,
        dd: pv(p, data.catalog, 'streak_double_double') ?? 0,
      }))
      .filter((r) => r.ten + r.dd > 0)
      .sort((a, b) => b.ten - a.ten);
    if (!rows.length) return { empty: 'Sin rachas en el plantel.' };
    return {
      node: (
        <BarChart
          horizontal
          labels={rows.map((r) => r.name)}
          series={[
            { id: 't', label: '10 o más puntos', slot: 1, values: rows.map((r) => r.ten) },
            { id: 'd', label: 'Doble-doble', slot: 2, values: rows.map((r) => r.dd) },
          ]}
          label="Racha más larga de partidos seguidos"
        />
      ),
      table: { head: ['Jugador', '10 o más puntos', 'Doble-doble'], rows: rows.map((r) => [r.name, r.ten, r.dd]) },
    };
  },
};
