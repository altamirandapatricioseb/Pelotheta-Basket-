// Columnas del conjunto «Resumen» de la Interfaz 3 (9.1) con su descripción.
// Etapa 2: viven acá. En la etapa 4 pasan a las tablas stat_catalog, stat_set y stat_set_item
// de la base, como pide la sección 9.1, y este archivo se borra.

import type { PlayerSummary } from '@/lib/data/players';

/** Nivel A: viene directo de una fuente. B: se calcula. C: no disponible en fuentes gratuitas. */
export type StatLevel = 'A' | 'B' | 'C';

export interface SummaryColumn {
  key: keyof PlayerSummary;
  short: string;
  name: string;
  unit: string;
  description: string;
  formula?: string;
  level: StatLevel;
  /** Si tiene sentido expresarla cada 36 minutos. */
  per36: boolean;
}

const MATCHES: SummaryColumn = {
  key: 'matches',
  short: 'PJ',
  name: 'Partidos jugados',
  unit: 'partidos',
  description: 'Partidos en los que el jugador estuvo en cancha al menos un segundo, como titular o desde el banco.',
  formula: 'Partidos con minutos > 0 en el box score',
  level: 'B',
  per36: false,
};

export const SUMMARY_COLUMNS: readonly SummaryColumn[] = [
  MATCHES,
  {
    key: 'starts',
    short: 'Tit.',
    name: 'Titularidades',
    unit: 'partidos',
    description: 'Partidos que empezó en el quinteto inicial.',
    level: 'A',
    per36: false,
  },
  {
    key: 'minutes',
    short: 'Min.',
    name: 'Minutos jugados',
    unit: 'minutos',
    description: 'Minutos en cancha sumados en la temporada, desde el tiempo de juego de cada box score.',
    formula: 'Σ minutos por partido',
    level: 'B',
    per36: false,
  },
  {
    key: 'pts',
    short: 'PTS',
    name: 'Puntos',
    unit: 'puntos',
    description: 'Puntos convertidos: dobles, triples y tiros libres.',
    formula: '2 × dobles + 3 × triples + libres',
    level: 'B',
    per36: true,
  },
  {
    key: 'reb',
    short: 'REB',
    name: 'Rebotes',
    unit: 'rebotes',
    description: 'Rebotes ofensivos más defensivos tomados.',
    formula: 'Rebotes ofensivos + defensivos',
    level: 'B',
    per36: true,
  },
  {
    key: 'ast',
    short: 'AST',
    name: 'Asistencias',
    unit: 'asistencias',
    description: 'Último pase antes de una canasta de un compañero, según la planilla oficial.',
    level: 'B',
    per36: true,
  },
  {
    key: 'efficiency',
    short: 'VAL',
    name: 'Valoración',
    unit: 'puntos de valoración',
    description:
      'Índice de la planilla FIBA: suma lo positivo (puntos, rebotes, asistencias, robos) y resta lo negativo.',
    formula: 'PTS + REB + AST + ROB + TAP − tiros errados − PER − faltas',
    level: 'A',
    per36: true,
  },
];

/** Columna por clave; si la clave no existe, la primera (Partidos jugados). */
export function getColumn(key: string | null | undefined): SummaryColumn {
  return SUMMARY_COLUMNS.find((c) => c.key === key) ?? MATCHES;
}

/** Valor de una columna para un jugador, en totales o cada 36 minutos. null = no disponible. */
export function columnValue(player: PlayerSummary, column: SummaryColumn, per36: boolean): number | null {
  const raw = player[column.key];
  if (typeof raw !== 'number') return null;
  if (!per36 || !column.per36) return raw;
  return player.minutes > 0 ? (raw * 36) / player.minutes : null;
}

/** Puesto en el plantel (1 = el más alto) y percentil (0 a 100) de un valor. */
export function rankAndPercentile(values: readonly number[], value: number): { rank: number; percentile: number } {
  const higher = values.filter((v) => v > value).length;
  const lower = values.filter((v) => v < value).length;
  const percentile = values.length > 1 ? Math.round((lower / (values.length - 1)) * 100) : 100;
  return { rank: higher + 1, percentile };
}
