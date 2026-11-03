// Conclusiones automáticas de las páginas de detalle (jugador y partido). Reglas simples y
// explicadas en el texto de cada tarjeta: nada se afirma sin el número que lo respalda.

import { formatValue, rankAndPercentile, type SummaryColumn } from '@/lib/stats/summary-columns';

export type Tone = 'positivo' | 'negativo';

export interface Conclusion {
  id: string;
  tone: Tone;
  title: string;
  text: string;
}

export const BEST_PERCENTILE = 80;
export const WORST_PERCENTILE = 20;
/** Con menos jugadores comparables un percentil no dice nada. */
export const MIN_POOL = 5;
/** Diferencia relativa contra el promedio de la temporada para que un partido sea noticia. */
export const GAME_THRESHOLD = 0.1;

/** Puesto (1 = el mejor) y percentil (100 = el mejor) según el sentido de la estadística. */
export function standing(values: readonly number[], value: number, higherIsBetter: boolean) {
  return higherIsBetter
    ? rankAndPercentile(values, value)
    : rankAndPercentile(
        values.map((v) => -v),
        -value,
      );
}

export interface RankedStat {
  column: SummaryColumn;
  value: number;
  rank: number;
  percentile: number;
  of: number;
}

/** Fortalezas (percentil 80 o más) y debilidades (20 o menos) del jugador dentro del plantel. */
export function playerConclusions(ranked: readonly RankedStat[], maxBest = 4, maxWorst = 3): Conclusion[] {
  const usable = ranked.filter((r) => r.of >= MIN_POOL);
  const card = (r: RankedStat, tone: Tone): Conclusion => ({
    id: `${tone}-${r.column.key}`,
    tone,
    title: r.column.name,
    // Los totales llegan ya llevados a 36 minutos (así se comparan): el texto lo aclara.
    text: `${formatValue(r.value, r.column)}${r.column.per36 ? ' cada 36 minutos' : ''}: ${String(r.rank)}.º de ${String(r.of)} en el plantel (percentil ${String(r.percentile)}).`,
  });
  const best = usable
    .filter((r) => r.percentile >= BEST_PERCENTILE)
    .toSorted((a, b) => b.percentile - a.percentile || a.rank - b.rank)
    .slice(0, maxBest)
    .map((r) => card(r, 'positivo'));
  const worst = usable
    .filter((r) => r.percentile <= WORST_PERCENTILE)
    .toSorted((a, b) => a.percentile - b.percentile || b.rank - a.rank)
    .slice(0, maxWorst)
    .map((r) => card(r, 'negativo'));
  return [...best, ...worst];
}

export interface GameStat {
  column: SummaryColumn;
  value: number;
  average: number;
}

/** Lo que más se apartó del promedio de la temporada en un partido, a favor o en contra. */
export function gameConclusions(stats: readonly GameStat[], max = 6): Conclusion[] {
  return stats
    .filter((s) => s.average !== 0)
    .map((s) => ({ ...s, gap: (s.value - s.average) / Math.abs(s.average) }))
    .filter((s) => Math.abs(s.gap) >= GAME_THRESHOLD)
    .toSorted((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, max)
    .map((s) => {
      const tone: Tone = s.gap > 0 === s.column.higherIsBetter ? 'positivo' : 'negativo';
      return {
        id: `${tone}-${s.column.key}`,
        tone,
        title: s.column.name,
        text: `${formatValue(s.value, s.column)} en este partido; promedio de la temporada: ${formatValue(s.average, s.column)}.`,
      };
    });
}
