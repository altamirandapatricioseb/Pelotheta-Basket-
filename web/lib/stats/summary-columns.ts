// Columnas de las tablas de la Interfaz 3 (9.1). Salen de la base: el catálogo (stat_catalog)
// da nombre, descripción, fórmula y nivel, y el conjunto (stat_set_item) qué columnas y en qué orden.

import type { PlayerSummary } from '@/lib/data/players';

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

// Unidades de conteo: son las únicas que se llevan a 36 minutos.
const COUNT_UNITS = new Set(['puntos', 'rebotes', 'asistencias', 'robos', 'tapas', 'pérdidas', 'faltas']);
// Estadísticas que ya vienen normalizadas aunque su unidad sea de conteo.
const ALREADY_RATE = /(_per36|_avg|_stdev|_pct|_share)$/;

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
    per36: COUNT_UNITS.has(row.unit) && !ALREADY_RATE.test(row.stat_id) && row.stat_id !== 'efficiency',
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

/** Puesto en el plantel (1 = el más alto) y percentil (0 a 100) de un valor. */
export function rankAndPercentile(values: readonly number[], value: number): { rank: number; percentile: number } {
  const higher = values.filter((v) => v > value).length;
  const lower = values.filter((v) => v < value).length;
  const percentile = values.length > 1 ? Math.round((lower / (values.length - 1)) * 100) : 100;
  return { rank: higher + 1, percentile };
}
