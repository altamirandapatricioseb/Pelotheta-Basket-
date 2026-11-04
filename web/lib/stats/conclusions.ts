// Conclusiones automáticas de las páginas de detalle (jugador y partido). Reglas simples y
// explicadas en el texto de cada tarjeta: nada se afirma sin el número que lo respalda.

import type { Conclusion as SituationConclusion } from '@/lib/data/situations';
import {
  formatStat,
  playerValue,
  rankAndPercentile as rankInGroup,
  type PlayerRow,
  type StatDef,
} from '@/lib/stats/catalog';
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

/** Minutos de temporada desde los que un jugador lleva sus conclusiones individuales. */
export const MIN_PLAYER_MINUTES = 36;
// Lo que dice cómo juega. Sin perfil, volumen ni porcentajes por zona: con pocos tiros, un 100 % no dice nada.
const VERDICT_GROUPS = new Set(['anotacion', 'rebote', 'creacion', 'defensa', 'valoracion', 'impacto']);

/**
 * Situaciones (9.6), sección Jugadores: el punto más fuerte y el más débil de cada jugador con
 * `MIN_PLAYER_MINUTES` o más, comparado con el resto de ese grupo. Todos llevan al menos una.
 */
export function playerStrengthConclusions(
  players: readonly PlayerRow[],
  catalog: readonly StatDef[],
): SituationConclusion[] {
  const pool = players.filter((p) => p.minutes >= MIN_PLAYER_MINUTES);
  const stats = catalog.flatMap((stat) => {
    if (stat.entity !== 'jugador' || !stat.available || !VERDICT_GROUPS.has(stat.group)) return [];
    const values = pool.flatMap((p) => playerValue(p, stat, true) ?? []);
    return values.length >= MIN_POOL ? [{ stat, values }] : [];
  });
  return pool.flatMap((p) => {
    const ranked = stats.flatMap(({ stat, values }) => {
      const value = playerValue(p, stat, true);
      return value === null
        ? []
        : [{ stat, value, of: values.length, ...rankInGroup(values, value, stat.higherIsBetter) }];
    });
    const best = ranked.toSorted((a, b) => b.percentile - a.percentile || a.rank - b.rank)[0];
    const worst = ranked.toSorted((a, b) => a.percentile - b.percentile || b.rank - a.rank)[0];
    const card = (
      r: NonNullable<typeof best>,
      kind: string,
      tone: SituationConclusion['tone'],
    ): SituationConclusion => ({
      id: `${kind}-${String(p.playerId)}-${r.stat.id}`,
      entityId: p.playerId,
      playerName: p.name,
      playerPosition: p.position,
      area: 'Jugadores',
      title: r.stat.name,
      tone,
      text: `${formatStat(r.value, r.stat, true)}${r.stat.per36 ? ' cada 36 minutos' : ''}${r.stat.higherIsBetter ? '' : ' (menos es mejor)'}: ${String(r.rank)}.º de ${String(r.of)} en el plantel (percentil ${String(r.percentile)}), con ${String(p.minutes)} minutos.`,
      n: p.matches,
      cardId: '',
    });
    return [
      ...(best ? [card(best, 'fuerte', best.percentile >= 50 ? 'positivo' : 'neutral')] : []),
      ...(worst && worst.percentile < 50 ? [card(worst, 'debil', 'negativo')] : []),
    ];
  });
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
