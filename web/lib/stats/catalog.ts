// Reglas del catálogo de estadísticas en la web (secciones 5, 9.1 y 9.5), las mismas que
// Pelotheta fútbol. El equipo llega por partido (`api.boca_game`) y se agrupa en el navegador por
// rival, mes, competición o acumulado: suma, promedio, máximo y cocientes «suma sobre suma» solo
// en los partidos que tienen los dos datos (así un eFG% por rival no es el promedio de porcentajes).

import { NOT_AVAILABLE } from '@/lib/format';

export type StatLevel = 'A' | 'B' | 'C';
export type StatRule = 'metrica' | 'suma' | 'promedio' | 'maximo' | 'cociente';

export interface StatDef {
  id: string;
  entity: 'jugador' | 'equipo';
  name: string;
  short: string;
  description: string;
  /** Cómo leer el valor: si más alto es mejor, qué significa negativo o cerca de 0. */
  reading: string;
  group: string;
  unit: string;
  source: string;
  level: StatLevel;
  formula: string;
  higherIsBetter: boolean;
  available: boolean;
  estimated: boolean;
  /** Jugadores: se puede ver cada 36 minutos. Equipo: se puede ver como promedio por partido. */
  per36: boolean;
  rule: StatRule;
  arg1: string;
  arg2: string;
  factor: number;
}

export type SetScope = 'temporada' | 'partido' | 'quinteto';

export interface StatSet {
  id: string;
  entity: 'jugador' | 'equipo';
  scope: SetScope;
  name: string;
  statIds: string[];
}

export interface TeamMatchRow {
  matchId: number;
  date: string;
  competitionCode: string;
  competitionName: string;
  opponent: string;
  home: boolean;
  pointsFor: number;
  pointsAgainst: number;
  stats: Record<string, number>;
}

export type StatValue = number | null;

export interface PlayerRow {
  playerId: number;
  name: string;
  position: string | null;
  shirtNumber: number | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  nationality: string | null;
  matches: number;
  minutes: number;
  stats: Record<string, number | null>;
}

/** Valor de una estadística para un jugador, en totales o cada 36 minutos. null = n/d. */
export function playerValue(row: PlayerRow, stat: StatDef, per36: boolean): StatValue {
  const raw = row.stats[stat.id];
  if (raw === undefined || raw === null) return null;
  if (!per36 || !stat.per36) return raw;
  return row.minutes > 0 ? (raw * 36) / row.minutes : null;
}

/**
 * Puesto (1 = el mejor) y percentil (0 a 100, 100 = el mejor) de un valor en un grupo, según el
 * sentido de la estadística. Los empatados cuentan por mitades: todos iguales = percentil 50.
 */
export function rankAndPercentile(
  values: readonly number[],
  value: number,
  higherIsBetter: boolean,
): { rank: number; percentile: number } {
  const better = values.filter((v) => (higherIsBetter ? v > value : v < value)).length;
  const worse = values.filter((v) => (higherIsBetter ? v < value : v > value)).length;
  const tied = Math.max(0, values.length - better - worse - 1);
  const percentile = values.length > 1 ? Math.round(((worse + tied / 2) / (values.length - 1)) * 100) : 100;
  return { rank: better + 1, percentile };
}

function present(rows: readonly TeamMatchRow[], key: string): number[] {
  return rows.flatMap((r) => {
    const v = r.stats[key];
    return v === undefined ? [] : [v];
  });
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/** Valor de una estadística del equipo para un grupo de partidos. null = n/d. */
export function aggregateTeam(
  rows: readonly TeamMatchRow[],
  stat: StatDef,
  options: { perMatch?: boolean } = {},
): StatValue {
  const perMatch = options.perMatch === true && stat.per36;
  if (stat.rule === 'cociente') {
    // Suma sobre suma, solo con los partidos que tienen los dos datos.
    const both = rows.filter((r) => r.stats[stat.arg1] !== undefined && r.stats[stat.arg2] !== undefined);
    if (both.length === 0) return null;
    const den = sum(both.map((r) => r.stats[stat.arg2] ?? 0));
    return den !== 0 ? (sum(both.map((r) => r.stats[stat.arg1] ?? 0)) / den) * stat.factor : null;
  }
  const values = present(rows, stat.rule === 'metrica' ? stat.id : stat.arg1 || stat.id);
  if (values.length === 0) return null;
  if (stat.rule === 'maximo') return Math.max(...values);
  if (stat.rule === 'suma' && !perMatch) return sum(values);
  return sum(values) / values.length;
}

const formatters = {
  0: new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }),
  1: new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  2: new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
} as const;

/**
 * Texto de una celda. Los porcentajes llegan como proporción (0 a 1) o ya en escala 0-100
 * (TOV%, USG%); las proporciones (FT/FGA, AST/TOV) con dos decimales porque viven cerca de 0.
 */
export function formatStat(value: StatValue, stat: Pick<StatDef, 'unit' | 'per36'>, perUnit: boolean): string {
  if (value === null || Number.isNaN(value)) return NOT_AVAILABLE;
  if (stat.unit === '%') return `${formatters[1].format(Math.abs(value) <= 1 ? value * 100 : value)} %`;
  if (stat.unit === 'proporción') return formatters[2].format(value);
  if (perUnit && stat.per36) return formatters[1].format(value);
  if (Number.isInteger(value)) return formatters[0].format(value);
  return formatters[1].format(value);
}

/**
 * «best» si nadie del grupo supera el valor, «worst» si todos lo superan o igualan y alguno lo
 * supera; null si no hay con quién comparar o el grupo es parejo. Respeta `higher_is_better`.
 */
export function extremeOf(values: readonly number[], value: number, higherIsBetter: boolean): 'best' | 'worst' | null {
  const better = values.filter((v) => (higherIsBetter ? v > value : v < value)).length;
  const worse = values.filter((v) => (higherIsBetter ? v < value : v > value)).length;
  if (better === 0 && worse > 0) return 'best';
  if (worse === 0 && better > 0) return 'worst';
  return null;
}
