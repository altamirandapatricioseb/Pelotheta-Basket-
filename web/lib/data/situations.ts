import 'server-only';

import { type DataResult, fetchAll } from '@/lib/data/players';
import {
  CATEGORY_NAMES,
  MATCH_STATS,
  METRICS,
  type MainMetric,
  type SituationCard,
  type SituationMatch,
  type SituationRow,
} from '@/lib/situations/board';
import { createApiClient } from '@/lib/supabase/server';

const METRIC_IDS = new Set(Object.keys(METRICS));
// Una fila se vuelve conclusión cuando se aleja al menos esto de la temporada, con 2 partidos o más.
const CONCLUSION_PP = 25;
const CONCLUSION_MIN_N = 2;
// Tarjetas del marco I con una fila por jugador (el valor de la fila es su nombre).
const PLAYER_CARDS = new Set([
  's089',
  's090',
  's091',
  's092',
  's093',
  's094',
  's095',
  's096',
  's097',
  's098',
  's099',
  's100',
  's101',
  's110',
]);

/** Objeto JSON de la base con valores numéricos; cualquier otra cosa se descarta. */
function numbers(json: unknown): Record<string, number> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  return Object.fromEntries(
    Object.entries(json).flatMap(([k, v]) => {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
      return Number.isFinite(n) ? [[k, n]] : [];
    }),
  );
}

function fail(cause: unknown): { ok: false; code: 'PEL-DB-001'; detail: string } {
  return { ok: false, code: 'PEL-DB-001', detail: cause instanceof Error ? cause.message : String(cause) };
}

export interface Conclusion {
  id: string;
  /** 0 para el equipo; el id del jugador en las conclusiones individuales. */
  entityId: number;
  playerName: string | null;
  playerPosition: string | null;
  area: string;
  title: string;
  tone: 'positivo' | 'negativo' | 'neutral';
  text: string;
  n: number;
  cardId: string;
}

export interface SituationsData {
  conclusions: Conclusion[];
  cards: SituationCard[];
  matches: Record<number, SituationMatch>;
  /** % de victorias de Boca en toda la temporada (la base de cada tarjeta). */
  baseWinPct: number | null;
}

const N0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** Conclusiones de las tarjetas: las filas que más se alejan de la temporada, con sus números. */
function conclusionsOf(
  cards: SituationCard[],
  players: Map<string, { id: number; position: string | null }>,
): Conclusion[] {
  return cards.flatMap((c) =>
    c.rows
      .filter((r) => r.n >= CONCLUSION_MIN_N && Math.abs(r.winPct - r.base.winPct) >= CONCLUSION_PP)
      .map((r): Conclusion => {
        const perPlayer = PLAYER_CARDS.has(c.id);
        const name = perPlayer ? r.param.replace(/: .*$/, '') : null;
        const player = name ? players.get(name) : undefined;
        const detail = r.param.includes(': ') ? ` (${r.param.split(': ')[1] ?? ''})` : '';
        const situation = perPlayer
          ? `${c.title.replace('X', name ?? 'el jugador')}${detail}`
          : `${c.title}: ${r.param}`;
        return {
          id: `${c.id}-${r.param}`,
          entityId: player?.id ?? 0,
          playerName: player ? name : null,
          playerPosition: player?.position ?? null,
          area: CATEGORY_NAMES[c.category] ?? c.category,
          title: c.title.replace('X', name ?? 'X'),
          tone: r.winPct > r.base.winPct ? 'positivo' : 'negativo',
          text: `${situation}. Boca ganó ${String(r.w)} de ${String(r.n)} (${N0.format(r.winPct)} %), contra el ${N0.format(r.base.winPct)} % de la temporada.`,
          n: r.n,
          cardId: c.id,
        };
      }),
  );
}

/** Catálogo, resultados y partidos de cada fila de las tarjetas de Situaciones (9.6). */
export async function getSituations(): Promise<DataResult<SituationsData>> {
  try {
    const api = createApiClient();
    const [catalog, results, bios] = await Promise.all([
      api
        .from('situational_catalog')
        .select(
          'card_id, category, title_es, condition_es, params_es, measured_es, required_data, level, available, estimated, reason_es, sort_order, main_metric, extra_metrics',
        )
        .order('sort_order')
        .limit(500),
      fetchAll((from, to) =>
        api
          .from('situational_result')
          .select(
            'card_id, param_value, param_order, n, w, l, win_pct, pf_avg, pa_avg, margin, base_win_pct, delta, base_pf, base_pa, base_margin, stats, base_stats',
          )
          .order('card_id')
          .order('param_value')
          .range(from, to),
      ),
      api.from('player_bio').select('player_id, full_name, known_as, position_raw').limit(2000),
    ]);
    if (catalog.error) return fail(catalog.error.message);

    // Partidos de cada fila, de a 1000 (el tope de la Data API).
    const members = await fetchAll((from, to) =>
      api
        .from('situational_match')
        .select('card_id, param_value, match_id, match_date, opponent, home, points_for, points_against, result')
        .order('card_id')
        .order('param_value')
        .order('match_id')
        .range(from, to),
    );
    const matches: Record<number, SituationMatch> = {};
    const byRow = new Map<string, number[]>();
    for (const m of members) {
      if (m.card_id === null || m.param_value === null || m.match_id === null) continue;
      matches[m.match_id] ??= {
        date: m.match_date ?? '',
        opponent: m.opponent ?? '',
        home: m.home ?? false,
        pointsFor: m.points_for ?? 0,
        pointsAgainst: m.points_against ?? 0,
        result: m.result ?? '',
      };
      const key = `${m.card_id}|${m.param_value}`;
      byRow.set(key, [...(byRow.get(key) ?? []), m.match_id]);
    }

    const rowsByCard = new Map<string, SituationRow[]>();
    let baseWinPct: number | null = null;
    for (const r of results) {
      if (r.card_id === null || r.param_value === null) continue;
      baseWinPct ??= r.base_win_pct;
      const list = rowsByCard.get(r.card_id) ?? [];
      list.push({
        param: r.param_value,
        order: r.param_order ?? 0,
        n: r.n ?? 0,
        w: r.w ?? 0,
        l: r.l ?? 0,
        winPct: r.win_pct ?? 0,
        pf: r.pf_avg ?? 0,
        pa: r.pa_avg ?? 0,
        margin: r.margin ?? 0,
        base: { winPct: r.base_win_pct ?? 0, pf: r.base_pf ?? 0, pa: r.base_pa ?? 0, margin: r.base_margin ?? 0 },
        delta: r.delta ?? 0,
        stats: numbers(r.stats),
        baseStats: numbers(r.base_stats),
        // Partidos de la fila, del más reciente al más viejo.
        matchIds: (byRow.get(`${r.card_id}|${r.param_value}`) ?? []).sort((a, b) =>
          (matches[b]?.date ?? '').localeCompare(matches[a]?.date ?? ''),
        ),
      });
      rowsByCard.set(r.card_id, list);
    }

    const cards = catalog.data.flatMap((c): SituationCard[] =>
      c.card_id && c.category && c.title_es
        ? [
            {
              id: c.card_id,
              category: c.category,
              title: c.title_es,
              condition: c.condition_es ?? '',
              params: c.params_es ?? '',
              measured: c.measured_es ?? '',
              required: c.required_data ?? '',
              level: c.level ?? 'A',
              available: c.available ?? false,
              estimated: c.estimated ?? false,
              reason: c.reason_es ?? '',
              extraMetrics: (c.extra_metrics ?? '').split(' ').filter((k) => k in MATCH_STATS),
              mainMetric: METRIC_IDS.has(c.main_metric ?? '') ? (c.main_metric as MainMetric) : 'win_pct',
              rows: (rowsByCard.get(c.card_id) ?? []).sort(
                (a, b) => a.order - b.order || a.param.localeCompare(b.param),
              ),
            },
          ]
        : [],
    );
    const players = new Map<string, { id: number; position: string | null }>();
    for (const b of bios.data ?? []) {
      const name = b.known_as ?? b.full_name;
      if (b.player_id !== null && name) players.set(name, { id: b.player_id, position: b.position_raw });
    }
    return { ok: true, data: { cards, matches, baseWinPct, conclusions: conclusionsOf(cards, players) } };
  } catch (cause) {
    return fail(cause);
  }
}
