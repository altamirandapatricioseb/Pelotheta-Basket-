// Tablero de Situaciones (Interfaz 4, 9.6): tipos, filtros y orden de las tarjetas, como en
// Pelotheta fútbol. En el básquet no hay empates: se mide % de victorias, margen y puntos.
// Funciones puras y testeadas; la vista vive en el componente.

export interface SituationRow {
  param: string;
  order: number;
  n: number;
  w: number;
  l: number;
  winPct: number;
  pf: number;
  pa: number;
  margin: number;
  /** Base de Boca en toda la temporada para cada métrica. */
  base: { winPct: number; pf: number; pa: number; margin: number };
  delta: number;
  /** Promedio de estadísticas del partido en esos partidos y en toda la temporada. */
  stats: Record<string, number>;
  baseStats: Record<string, number>;
  matchIds: number[];
}

export type MainMetric = 'win_pct' | 'margin' | 'pf' | 'pa';

export interface SituationCard {
  id: string;
  category: string;
  title: string;
  condition: string;
  params: string;
  measured: string;
  required: string;
  level: string;
  available: boolean;
  estimated: boolean;
  reason: string;
  /** Métrica que destaca la tarjeta (la que mejor responde su pregunta). */
  mainMetric: MainMetric;
  /** Estadísticas del partido que muestra cada fila además de la principal. */
  extraMetrics: string[];
  rows: SituationRow[];
}

export interface SituationMatch {
  date: string;
  opponent: string;
  home: boolean;
  pointsFor: number;
  pointsAgainst: number;
  result: string;
}

export interface CardFilters {
  query?: string;
  category?: string;
  level?: string;
  onlyData?: boolean;
  hideSmall?: boolean;
}

export type CardSort = 'categoria' | 'destacados' | 'muestra';

/** Muestra pequeña de 9.6: menos de 5 partidos en la fila. */
export const SMALL_SAMPLE = 5;

export const CATEGORY_NAMES: Record<string, string> = {
  A: 'Marcador, cuartos y definiciones',
  B: 'Anotación y ritmo',
  C: 'Tiros',
  D: 'Rebotes y posesiones',
  E: 'Asistencias y juego colectivo',
  F: 'Defensa y faltas',
  G: 'Contexto',
  H: 'Forma y rachas',
  I: 'Jugadores y plantel',
  J: 'Cuartos y minutos',
};

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterCards(cards: readonly SituationCard[], f: CardFilters): SituationCard[] {
  const query = f.query ? fold(f.query.trim()) : '';
  return cards.flatMap((c) => {
    if (f.category && c.category !== f.category) return [];
    if (f.level && c.level !== f.level) return [];
    if (query && !fold(`${c.title} ${c.condition} ${c.params} ${c.id}`).includes(query)) return [];
    const rows = f.hideSmall ? c.rows.filter((r) => r.n >= SMALL_SAMPLE) : c.rows;
    if (f.onlyData && (!c.available || rows.length === 0)) return [];
    return [{ ...c, rows }];
  });
}

export const METRICS: Record<MainMetric, { label: string; unit: string; scale: number; higherIsBetter: boolean }> = {
  win_pct: { label: 'victorias', unit: '%', scale: 100, higherIsBetter: true },
  margin: { label: 'margen por partido', unit: 'pts', scale: 20, higherIsBetter: true },
  pf: { label: 'puntos a favor por partido', unit: 'pts', scale: 20, higherIsBetter: true },
  pa: { label: 'puntos en contra por partido', unit: 'pts', scale: 20, higherIsBetter: false },
};

/** Valor de la métrica principal en una fila, su base de temporada y si está mejor que la base. */
export function headline(
  row: SituationRow,
  metric: MainMetric,
): { value: number; base: number; diff: number; better: boolean } {
  const pick: Record<MainMetric, [number, number]> = {
    win_pct: [row.winPct, row.base.winPct],
    margin: [row.margin, row.base.margin],
    pf: [row.pf, row.base.pf],
    pa: [row.pa, row.base.pa],
  };
  const [value, base] = pick[metric];
  const diff = value - base;
  return { value, base, diff, better: METRICS[metric].higherIsBetter ? diff > 0 : diff < 0 };
}

/**
 * La diferencia contra la base más alejada de 0 entre las filas con muestra suficiente, relativa a
 * la escala de la métrica (para comparar puntos con porcentajes); null si no hay filas.
 */
export function strongestDelta(card: SituationCard): number | null {
  const scale = METRICS[card.mainMetric].scale;
  return card.rows
    .filter((r) => r.n >= SMALL_SAMPLE)
    .map((r) => headline(r, card.mainMetric).diff / scale)
    .reduce<number | null>((best, d) => (best === null || Math.abs(d) > Math.abs(best) ? d : best), null);
}

const totalN = (c: SituationCard) => c.rows.reduce((a, r) => a + r.n, 0);

export function sortCards(cards: readonly SituationCard[], mode: CardSort): SituationCard[] {
  const list = [...cards];
  if (mode === 'destacados') {
    // Las tarjetas sin filas comparables van al final.
    const strength = (c: SituationCard) => {
      const d = strongestDelta(c);
      return d === null ? -1 : Math.abs(d);
    };
    return list.sort((a, b) => strength(b) - strength(a));
  }
  if (mode === 'muestra') return list.sort((a, b) => totalN(b) - totalN(a));
  return list.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
}

/** Estadísticas del partido que pueden mostrar las filas. `better`: si más alto es mejor (null: estilo). */
export const MATCH_STATS: Record<string, { label: string; percent: boolean; better: boolean | null }> = {
  efg: { label: 'eFG%', percent: true, better: true },
  tov_pct: { label: 'TOV%', percent: true, better: false },
  orb_pct_team: { label: 'ORB%', percent: true, better: true },
  pace: { label: 'Ritmo', percent: false, better: null },
  ortg: { label: 'ORtg', percent: false, better: true },
  drtg: { label: 'DRtg', percent: false, better: false },
  team_fg3m: { label: 'Triples', percent: false, better: true },
  team_fg3_pct: { label: '3P%', percent: true, better: true },
  reb_margin: { label: 'Dif. rebotes', percent: false, better: true },
  team_ast: { label: 'Asistencias', percent: false, better: true },
  team_tov: { label: 'Pérdidas', percent: false, better: false },
  rival_fg3m: { label: 'Triples del rival', percent: false, better: false },
  team_fta: { label: 'Libres', percent: false, better: true },
};
