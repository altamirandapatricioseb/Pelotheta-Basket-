import 'server-only';

import { type CatalogRow, type SummaryColumn, toColumn } from '@/lib/stats/summary-columns';
import { createApiClient } from '@/lib/supabase/server';

export interface PlayerSummary {
  playerId: number;
  name: string;
  shortName: string | null;
  position: string | null;
  shirtNumber: number | null;
  age: number | null;
  heightCm: number | null;
  matches: number;
  minutes: number;
  /** Valor de cada estadística del catálogo; null = n/d. */
  values: Record<string, number | null>;
}

export type SetScope = 'temporada' | 'partido' | 'quinteto';

export interface StatSet {
  id: string;
  name: string;
  scope: SetScope;
  statIds: string[];
}

export type DataResult<T> = { ok: true; data: T } | { ok: false; code: 'PEL-DB-001'; detail: string };

function fail(cause: unknown): { ok: false; code: 'PEL-DB-001'; detail: string } {
  return { ok: false, code: 'PEL-DB-001', detail: cause instanceof Error ? cause.message : String(cause) };
}

// Supabase corta cada pedido en 1000 filas (max-rows de PostgREST): las tablas largas se piden por tramos.
const PAGE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const CATALOG_COLUMNS = 'stat_id, name_es, description_es, unit, formula, level, available, higher_is_better';

/** Catálogo y conjuntos de una entidad: qué tablas hay y qué columnas lleva cada una. */
export async function getSets(
  entity: 'jugador' | 'equipo',
): Promise<DataResult<{ sets: StatSet[]; columns: Map<string, SummaryColumn> }>> {
  try {
    const client = createApiClient();
    const [catalog, items] = await Promise.all([
      client.from('stat_catalog').select(CATALOG_COLUMNS),
      client
        .from('stat_set_column')
        .select('set_id, set_name, set_order, stat_id, sort_order, scope')
        .eq('entity', entity)
        .order('set_order')
        .order('sort_order'),
    ]);
    if (catalog.error) return fail(catalog.error.message);
    if (items.error) return fail(items.error.message);
    const columns = new Map<string, SummaryColumn>();
    for (const r of catalog.data) {
      if (r.stat_id === null || r.name_es === null || r.description_es === null || r.unit === null) continue;
      const row: CatalogRow = {
        stat_id: r.stat_id,
        name_es: r.name_es,
        description_es: r.description_es,
        unit: r.unit,
        formula: r.formula,
        level: r.level ?? 'C',
        available: r.available ?? false,
        higher_is_better: r.higher_is_better ?? true,
      };
      columns.set(r.stat_id, toColumn(row));
    }
    const sets = new Map<string, StatSet>();
    for (const r of items.data) {
      if (r.set_id === null || r.stat_id === null || !columns.has(r.stat_id)) continue;
      const set = sets.get(r.set_id) ?? {
        id: r.set_id,
        name: r.set_name ?? r.set_id,
        scope: r.scope === 'partido' || r.scope === 'quinteto' ? r.scope : 'temporada',
        statIds: [],
      };
      set.statIds.push(r.stat_id);
      sets.set(r.set_id, set);
    }
    return { ok: true, data: { sets: [...sets.values()], columns } };
  } catch (cause) {
    return fail(cause);
  }
}

/** Jugadores de Boca con todas sus estadísticas de temporada (formato largo -> una fila por jugador). */
export async function getPlayers(): Promise<DataResult<PlayerSummary[]>> {
  try {
    const client = createApiClient();
    const [summary, statRows] = await Promise.all([
      client
        .from('player_summary')
        .select('player_id, full_name, known_as, position_raw, height_cm, shirt_number, matches, minutes')
        .limit(200),
      fetchAll((from, to) =>
        client
          .from('player_stat')
          .select('player_id, stat_id, value')
          .order('player_id')
          .order('stat_id')
          .range(from, to),
      ),
    ]);
    if (summary.error) return fail(summary.error.message);
    const values = new Map<number, Record<string, number | null>>();
    for (const s of statRows) {
      if (s.player_id === null || s.stat_id === null) continue;
      const row = values.get(s.player_id) ?? {};
      row[s.stat_id] = s.value;
      values.set(s.player_id, row);
    }
    const players = summary.data.flatMap((r) =>
      r.player_id === null || r.full_name === null
        ? []
        : [
            {
              playerId: r.player_id,
              name: r.full_name,
              shortName: r.known_as,
              position: r.position_raw,
              shirtNumber: r.shirt_number,
              // Edad en años del plantel de Wikipedia (llega como estadística del catálogo).
              age: values.get(r.player_id)?.age ?? null,
              heightCm: r.height_cm,
              matches: r.matches ?? 0,
              minutes: r.minutes ?? 0,
              values: values.get(r.player_id) ?? {},
            },
          ],
    );
    return { ok: true, data: players.sort((a, b) => b.minutes - a.minutes) };
  } catch (cause) {
    return fail(cause);
  }
}

export interface TeamRow {
  id: string;
  label: string;
  highlight: boolean;
  values: Record<string, number | null>;
}

function shortDate(isoDate: string | null): string {
  if (!isoDate) return '';
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

/** Filas de una tabla del equipo: tabla de la liga (temporada) o partido a partido de Boca. */
export async function getTeamRows(scope: SetScope): Promise<DataResult<TeamRow[]>> {
  try {
    const client = createApiClient();
    if (scope === 'quinteto') {
      const { data, error } = await client.from('boca_lineup').select('lineup_key, players, stats, small_sample');
      if (error) return fail(error.message);
      const rows = data.flatMap((q) =>
        q.lineup_key === null
          ? []
          : [
              {
                id: q.lineup_key,
                label: `${q.players ?? ''}${q.small_sample ? ' (muestra pequeña)' : ''}`,
                highlight: false,
                values: (q.stats ?? {}) as Record<string, number | null>,
              },
            ],
      );
      return { ok: true, data: rows.sort((a, b) => (b.values.minutes ?? 0) - (a.values.minutes ?? 0)).slice(0, 25) };
    }
    if (scope === 'partido') {
      const { data, error } = await client
        .from('boca_game')
        .select('game_id, game_date, is_home, opponent, points_for, points_against, stats')
        .order('game_date');
      if (error) return fail(error.message);
      return {
        ok: true,
        data: data.flatMap((g) => {
          if (g.game_id === null || g.points_for === null || g.points_against === null) return [];
          const stats = (g.stats ?? {}) as Record<string, number | null>;
          const won = g.points_for > g.points_against;
          const where = g.is_home ? 'vs' : 'en';
          return [
            {
              id: String(g.game_id),
              label: `${shortDate(g.game_date)} ${where} ${g.opponent ?? ''} · ${won ? 'G' : 'P'} ${String(g.points_for)}-${String(g.points_against)}`,
              highlight: won,
              values: { ...stats, points_for: g.points_for, points_against: g.points_against },
            },
          ];
        }),
      };
    }
    const data = await fetchAll((from, to) =>
      client
        .from('team_stat')
        .select('team_id, team, is_boca, stat_id, value')
        .order('team_id')
        .order('stat_id')
        .range(from, to),
    );
    const rows = new Map<number, TeamRow>();
    for (const s of data) {
      if (s.team_id === null || s.stat_id === null) continue;
      const row = rows.get(s.team_id) ?? {
        id: String(s.team_id),
        label: s.team ?? '',
        highlight: s.is_boca ?? false,
        values: {},
      };
      row.values[s.stat_id] = s.value;
      rows.set(s.team_id, row);
    }
    return { ok: true, data: [...rows.values()].sort((a, b) => (b.values.win_pct ?? 0) - (a.values.win_pct ?? 0)) };
  } catch (cause) {
    return fail(cause);
  }
}
