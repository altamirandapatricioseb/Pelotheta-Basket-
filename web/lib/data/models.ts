import 'server-only';

import type { Json } from '@/lib/database.types';
import type { DataResult } from '@/lib/data/players';
import { createApiClient } from '@/lib/supabase/server';

// Lecturas de los modelos (interfaces Valor, Alternativas y Predictor y el panel Probabilidad de Equipo).
// Todo se filtra por el slug del equipo elegido: las tablas ya están listas para más equipos.

function fail(cause: unknown): { ok: false; code: 'PEL-DB-001'; detail: string } {
  return { ok: false, code: 'PEL-DB-001', detail: cause instanceof Error ? cause.message : String(cause) };
}

const obj = (v: Json | null): Record<string, Json> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {};
const nums = (v: Json | null): Record<string, number> =>
  Object.fromEntries(Object.entries(obj(v)).filter((e): e is [string, number] => typeof e[1] === 'number'));

export type ModelName = 'valor_mercado' | 'alternativas' | 'predictor_partido';

export interface ModelRun {
  model: ModelName;
  status: 'ok' | 'sin_datos';
  n: number;
  metrics: Record<string, Json>;
  params: Record<string, Json>;
  message: string | null;
  trainedAt: string | null;
}

export async function getModelRun(team: string, model: ModelName): Promise<DataResult<ModelRun | null>> {
  try {
    const { data, error } = await createApiClient()
      .from('model_run')
      .select('model, status, n, metrics, params, message, trained_at')
      .eq('team_slug', team)
      .eq('model', model)
      .limit(1);
    if (error) return fail(error.message);
    const r = data[0];
    return {
      ok: true,
      data: r
        ? {
            model,
            status: r.status === 'ok' ? 'ok' : 'sin_datos',
            n: r.n ?? 0,
            metrics: obj(r.metrics),
            params: obj(r.params),
            message: r.message,
            trainedAt: r.trained_at,
          }
        : null,
    };
  } catch (cause) {
    return fail(cause);
  }
}

export interface ValueRow {
  playerId: number;
  name: string;
  position: string | null;
  actual: number | null;
  predicted: number | null;
  low: number | null;
  high: number | null;
  residualPct: number | null;
  features: Record<string, number>;
  detail: ValueDetail;
}

export interface Comparable {
  name: string;
  team: string;
  age: number | null;
  /** Real y esperado del comparable, en la unidad del modelo (minutos o dólares). */
  value: number | null;
  predicted: number | null;
}

/** Análisis de un jugador: aporte de cada variable, comparables de la liga y su uso en cancha. */
export interface ValueDetail {
  average: number | null;
  market: number | null;
  /** Lo esperado con el equipo fuera del ajuste (prueba fuera de muestra). */
  oos: number | null;
  effects: Record<string, number>;
  age: number | null;
  games: number | null;
  minutes: number | null;
  starts: number | null;
  performance: Record<string, number | null>;
  comparables: Comparable[];
}

const numOrNull = (v: Json | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function valueDetail(v: Json | null): ValueDetail {
  const o = obj(v);
  const perf = obj(o.performance ?? null);
  return {
    average: numOrNull(o.average_eur),
    market: numOrNull(o.market_eur),
    oos: numOrNull(o.oos_eur),
    effects: nums(o.effects ?? null),
    age: numOrNull(o.age),
    games: numOrNull(o.games),
    minutes: numOrNull(o.minutes),
    starts: numOrNull(o.starts),
    performance: Object.fromEntries(Object.entries(perf).map(([k, x]) => [k, numOrNull(x)])),
    comparables: (Array.isArray(o.comparables) ? o.comparables : []).map((c) => {
      const q = obj(c);
      return {
        name: typeof q.name === 'string' ? q.name : 'Jugador',
        team: typeof q.team === 'string' ? q.team : '',
        age: numOrNull(q.age),
        value: numOrNull(q.value_eur),
        predicted: numOrNull(q.predicted_eur),
      };
    }),
  };
}

export interface CoefRow {
  feature: string;
  coef: number;
  stdErr: number;
  t: number;
  p: number;
  low: number;
  high: number;
}

export async function getMarketValues(team: string): Promise<DataResult<{ rows: ValueRow[]; coefs: CoefRow[] }>> {
  try {
    const client = createApiClient();
    const [pred, coef] = await Promise.all([
      client
        .from('market_value_prediction')
        .select(
          'player_id, player_name, position_group, actual_eur, predicted_eur, low_eur, high_eur, residual_pct, features, detail',
        )
        .eq('team_slug', team)
        .limit(500),
      client
        .from('market_value_coef')
        .select('feature, coef, std_err, t_stat, p_value, ci_low, ci_high')
        .eq('team_slug', team)
        .limit(50),
    ]);
    if (pred.error) return fail(pred.error.message);
    if (coef.error) return fail(coef.error.message);
    return {
      ok: true,
      data: {
        rows: pred.data.flatMap((r) =>
          r.player_id === null
            ? []
            : [
                {
                  playerId: r.player_id,
                  name: r.player_name ?? 'Jugador',
                  position: r.position_group,
                  actual: r.actual_eur,
                  predicted: r.predicted_eur,
                  low: r.low_eur,
                  high: r.high_eur,
                  residualPct: r.residual_pct,
                  features: nums(r.features),
                  detail: valueDetail(r.detail),
                },
              ],
        ),
        coefs: coef.data.flatMap((c) =>
          c.feature === null
            ? []
            : [
                {
                  feature: c.feature,
                  coef: c.coef ?? 0,
                  stdErr: c.std_err ?? 0,
                  t: c.t_stat ?? 0,
                  p: c.p_value ?? 1,
                  low: c.ci_low ?? 0,
                  high: c.ci_high ?? 0,
                },
              ],
        ),
      },
    };
  } catch (cause) {
    return fail(cause);
  }
}

export interface StyleRow {
  playerId: number;
  name: string;
  position: string | null;
  cluster: number;
  label: string;
  pc1: number;
  pc2: number;
  features: Record<string, number>;
  /** Escala z contra toda la liga (los mismos de K-means). */
  z: Record<string, number>;
  percentiles: Record<string, number>;
}

export interface AlternativeMember {
  name: string;
  team: string;
  playerId: number | null;
  position: string | null;
  profile: string;
  value: number | null;
  age: number | null;
  minutes: number | null;
  games: number | null;
  mpg: number | null;
  /** Estadísticas cada 36 (null donde la fuente no la tiene) y su valor en escala z. */
  features: Record<string, number | null>;
  z: Record<string, number>;
}

export type AlternativeSection = 'externo' | 'dupla' | 'club';

export interface AlternativeRow {
  playerId: number;
  section: AlternativeSection;
  rank: number;
  members: AlternativeMember[];
  similarity: number;
  total: number | null;
  savings: number | null;
}

function members(v: Json | null): AlternativeMember[] {
  return (Array.isArray(v) ? v : []).map((m) => {
    const o = obj(m);
    return {
      name: typeof o.name === 'string' ? o.name : 'Jugador',
      team: typeof o.team === 'string' ? o.team : '',
      playerId: typeof o.player_id === 'number' ? o.player_id : null,
      position: typeof o.position === 'string' ? o.position : null,
      profile: typeof o.profile === 'string' ? o.profile : '',
      value: typeof o.value_eur === 'number' ? o.value_eur : null,
      age: numOrNull(o.age),
      minutes: numOrNull(o.minutes),
      games: numOrNull(o.games),
      mpg: numOrNull(o.mpg),
      features: Object.fromEntries(Object.entries(obj(o.features ?? null)).map(([k, x]) => [k, numOrNull(x)])),
      z: nums(o.z ?? null),
    };
  });
}

export async function getAlternatives(
  team: string,
): Promise<DataResult<{ styles: StyleRow[]; alternatives: AlternativeRow[] }>> {
  try {
    const client = createApiClient();
    const [st, alt] = await Promise.all([
      client
        .from('player_style')
        .select('player_id, player_name, position_group, cluster, cluster_label, pc1, pc2, features, z, percentiles')
        .eq('team_slug', team)
        .limit(1000),
      client
        .from('player_alternative')
        .select('player_id, section, rank, members, similarity, total_value_eur, savings_eur')
        .eq('team_slug', team)
        .order('rank')
        .limit(5000),
    ]);
    if (st.error) return fail(st.error.message);
    if (alt.error) return fail(alt.error.message);
    return {
      ok: true,
      data: {
        styles: st.data.flatMap((r) =>
          r.player_id === null
            ? []
            : [
                {
                  playerId: r.player_id,
                  name: r.player_name ?? 'Jugador',
                  position: r.position_group,
                  cluster: r.cluster ?? 0,
                  label: r.cluster_label ?? '',
                  pc1: r.pc1 ?? 0,
                  pc2: r.pc2 ?? 0,
                  features: nums(r.features),
                  z: nums(r.z),
                  percentiles: nums(r.percentiles),
                },
              ],
        ),
        alternatives: alt.data.flatMap((r): AlternativeRow[] =>
          r.player_id === null || (r.section !== 'externo' && r.section !== 'dupla' && r.section !== 'club')
            ? []
            : [
                {
                  playerId: r.player_id,
                  section: r.section,
                  rank: r.rank ?? 1,
                  members: members(r.members),
                  similarity: r.similarity ?? 0,
                  total: r.total_value_eur,
                  savings: r.savings_eur,
                },
              ],
        ),
      },
    };
  } catch (cause) {
    return fail(cause);
  }
}

export interface Prediction {
  kind: 'escenario' | 'backtest';
  date: string | null;
  home: string;
  away: string;
  ptsHome: number;
  ptsAway: number;
  pHome: number;
  pAway: number;
  marginSd: number;
  actualHome: number | null;
  actualAway: number | null;
  competition: string;
  neutral: boolean;
}

export interface Strength {
  team: string;
  competition: string;
  country: string | null;
  league: string | null;
  estimated: boolean;
  games: number;
  pointsFor: number;
  pointsAgainst: number;
  profile: Record<string, number>;
  elo: number | null;
  form: number | null;
}

export async function getPredictions(
  team: string,
): Promise<DataResult<{ predictions: Prediction[]; strengths: Strength[] }>> {
  try {
    const client = createApiClient();
    const [pr, st] = await Promise.all([
      client
        .from('match_prediction')
        .select(
          'kind, match_date, home_team, away_team, pts_home, pts_away, p_home, p_away, margin_sd, actual_home, actual_away, competition, neutral',
        )
        .eq('team_slug', team)
        .order('match_date')
        .limit(1000),
      client
        .from('team_strength')
        .select('team_name, competition, country, league, estimated, games, points_for, points_against, profile, elo, form')
        .eq('team_slug', team)
        .limit(1000),
    ]);
    if (pr.error) return fail(pr.error.message);
    if (st.error) return fail(st.error.message);
    return {
      ok: true,
      data: {
        predictions: pr.data.flatMap((r): Prediction[] =>
          r.home_team === null || r.away_team === null
            ? []
            : [
                {
                  kind: r.kind === 'backtest' ? 'backtest' : 'escenario',
                  date: r.match_date,
                  home: r.home_team,
                  away: r.away_team,
                  ptsHome: r.pts_home ?? 0,
                  ptsAway: r.pts_away ?? 0,
                  pHome: r.p_home ?? 0,
                  pAway: r.p_away ?? 0,
                  marginSd: r.margin_sd ?? 12,
                  actualHome: r.actual_home,
                  actualAway: r.actual_away,
                  competition: r.competition ?? 'liga',
                  neutral: r.neutral ?? false,
                },
              ],
        ),
        strengths: st.data.flatMap((s) =>
          s.team_name === null
            ? []
            : [
                {
                  team: s.team_name,
                  competition: s.competition ?? 'liga',
                  country: s.country,
                  league: s.league,
                  estimated: s.estimated ?? false,
                  games: s.games ?? 0,
                  pointsFor: s.points_for ?? 0,
                  pointsAgainst: s.points_against ?? 0,
                  profile: nums(s.profile),
                  elo: s.elo,
                  form: s.form,
                },
              ],
        ),
      },
    };
  } catch (cause) {
    return fail(cause);
  }
}

export interface StatTest {
  id: string;
  title: string;
  statistic: number;
  df: number | null;
  p: number | null;
  decision: string;
  detail: Record<string, Json>;
}

export async function getStatTests(team: string): Promise<DataResult<StatTest[]>> {
  try {
    const { data, error } = await createApiClient()
      .from('stat_test')
      .select('test_id, title_es, statistic, df, p_value, decision_es, detail')
      .eq('team_slug', team)
      .order('test_id')
      .limit(50);
    if (error) return fail(error.message);
    return {
      ok: true,
      data: data.flatMap((t) =>
        t.test_id === null
          ? []
          : [
              {
                id: t.test_id,
                title: t.title_es ?? t.test_id,
                statistic: t.statistic ?? 0,
                df: t.df,
                p: t.p_value,
                decision: t.decision_es ?? '',
                detail: obj(t.detail),
              },
            ],
      ),
    };
  } catch (cause) {
    return fail(cause);
  }
}
