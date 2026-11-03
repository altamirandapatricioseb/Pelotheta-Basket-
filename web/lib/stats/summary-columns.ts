// Columnas de las tablas de la Interfaz 3 (9.1). Salen de la base: el catálogo (stat_catalog)
// da nombre, descripción, fórmula y nivel, y el conjunto (stat_set_item) qué columnas y en qué orden.

import type { PlayerSummary } from '@/lib/data/players';
import { formatNumber, NOT_AVAILABLE } from '@/lib/format';

/** Nivel A: viene directo de una fuente. B: se calcula. C: no disponible en fuentes gratuitas. */
export type StatLevel = 'A' | 'B' | 'C';

export interface SummaryColumn {
  key: string;
  short: string;
  name: string;
  unit: string;
  description: string;
  formula?: string;
  level: StatLevel;
  /** Si tiene sentido expresarla cada 36 minutos (conteos, no tasas ni porcentajes). */
  per36: boolean;
  available: boolean;
  higherIsBetter: boolean;
}

// Totales de temporada: los únicos que se llevan a 36 minutos. Por unidad no alcanza: «puntos por
// tiro» o el Game Score medio están en puntos y ya son tasas.
const SEASON_TOTALS = new Set([
  'pts',
  'trb',
  'orb',
  'drb',
  'ast',
  'stl',
  'blk',
  'tov',
  'pf',
  'pf_drawn',
  'fgm',
  'fga',
  'fg2m',
  'fg2a',
  'fg3m',
  'fg3a',
  'ftm',
  'fta',
]);

export interface CatalogRow {
  stat_id: string;
  name_es: string;
  description_es: string;
  unit: string;
  formula: string | null;
  level: string;
  available: boolean;
  higher_is_better: boolean;
}

export function toColumn(row: CatalogRow): SummaryColumn {
  return {
    key: row.stat_id,
    short: row.name_es,
    name: row.name_es,
    unit: row.unit,
    description: row.description_es,
    formula: row.formula ?? undefined,
    level: row.level === 'A' || row.level === 'B' ? row.level : 'C',
    per36: SEASON_TOTALS.has(row.stat_id),
    available: row.available,
    higherIsBetter: row.higher_is_better,
  };
}

/** Columna por clave; si la clave no está en el conjunto, la primera. */
export function getColumn(
  columns: readonly SummaryColumn[],
  key: string | null | undefined,
): SummaryColumn | undefined {
  return columns.find((c) => c.key === key) ?? columns[0];
}

/** Valor de una columna para un jugador, en totales o cada 36 minutos. null = no disponible. */
export function columnValue(player: PlayerSummary, column: SummaryColumn, per36: boolean): number | null {
  const raw = player.values[column.key];
  if (raw === undefined || raw === null) return null;
  if (!per36 || !column.per36) return raw;
  return player.minutes > 0 ? (raw * 36) / player.minutes : null;
}

/** Porcentajes guardados como proporción (0 a 1) se muestran como %; el resto con 1 decimal o entero. */
export function formatValue(value: number | null | undefined, column: Pick<SummaryColumn, 'unit'>): string {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  if (column.unit === '%' && Math.abs(value) <= 1) return `${formatNumber(value * 100, 1)} %`;
  // Las proporciones (FT/FGA, AST/TOV...) viven cerca de 0: con un decimal casi todas se ven iguales.
  if (column.unit === 'proporción') return value.toFixed(2).replace('.', ',');
  return formatNumber(value, Number.isInteger(value) ? 0 : 1);
}

/** Puesto en el plantel (1 = el más alto) y percentil (0 a 100) de un valor. */
export function rankAndPercentile(values: readonly number[], value: number): { rank: number; percentile: number } {
  const higher = values.filter((v) => v > value).length;
  const lower = values.filter((v) => v < value).length;
  // Los empatados (sin contarse a sí mismo) cuentan por mitades: todos iguales = percentil 50, no 0.
  const tied = Math.max(0, values.length - higher - lower - 1);
  const percentile = values.length > 1 ? Math.round(((lower + tied / 2) / (values.length - 1)) * 100) : 100;
  return { rank: higher + 1, percentile };
}
