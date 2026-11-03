import 'server-only';

import { type DataResult, fetchAll } from '@/lib/data/players';
import type { PlayerRow, SetScope, StatDef, StatLevel, StatRule, StatSet, TeamMatchRow } from '@/lib/stats/catalog';
import { createApiClient } from '@/lib/supabase/server';

const LEVELS = new Set<string>(['A', 'B', 'C']);
const RULES = new Set<string>(['metrica', 'suma', 'promedio', 'maximo', 'cociente']);
const SCOPES = new Set<string>(['temporada', 'partido', 'quinteto']);
// El catálogo guarda el id de la fuente; la web muestra su nombre.
const SOURCE_NAMES: Record<string, string> = {
  lnb: 'Liga Nacional de Básquet',
  wikipedia: 'Wikipedia',
  'lnb|wikipedia': 'Liga Nacional de Básquet, Wikipedia',
};

function fail(cause: unknown): { ok: false; code: 'PEL-DB-001'; detail: string } {
  return { ok: false, code: 'PEL-DB-001', detail: cause instanceof Error ? cause.message : String(cause) };
}

/** Catálogo completo (jugador y equipo comparten algunas estadísticas, como eFG% o TOV%). */
export async function getCatalog(): Promise<DataResult<StatDef[]>> {
  try {
    const { data, error } = await createApiClient()
      .from('stat_catalog')
      .select(
        'stat_id, entity, name_es, short_name, description_es, reading_es, stat_group, unit, source, level, formula, higher_is_better, available, estimated, per_unit, rule, arg1, arg2, factor',
      );
    if (error) return fail(error.message);
    // Lo que viene de la base se valida antes de usarlo: una fila rara se descarta (14.3).
    const stats = data.flatMap((r): StatDef[] =>
      r.stat_id && r.level && LEVELS.has(r.level) && r.rule && RULES.has(r.rule)
        ? [
            {
              id: r.stat_id,
              entity: r.entity === 'equipo' ? 'equipo' : 'jugador',
              name: r.name_es ?? r.stat_id,
              short: r.short_name ?? r.name_es ?? r.stat_id,
              description: r.description_es ?? '',
              reading: r.reading_es ?? '',
              group: r.stat_group ?? '',
              unit: r.unit ?? '',
              source: SOURCE_NAMES[r.source ?? ''] ?? r.source ?? '',
              level: r.level as StatLevel,
              formula: r.formula ?? '',
              higherIsBetter: r.higher_is_better ?? true,
              available: r.available ?? false,
              estimated: r.estimated ?? false,
              per36: r.per_unit ?? false,
              rule: r.rule as StatRule,
              arg1: r.arg1 ?? '',
              arg2: r.arg2 ?? '',
              factor: r.factor ?? 1,
            },
          ]
        : [],
    );
    return { ok: true, data: stats };
  } catch (cause) {
    return fail(cause);
  }
}

/** Conjuntos de columnas (el desplegable de categoría) de una entidad, en su orden. */
export async function getStatSets(entity: 'jugador' | 'equipo'): Promise<DataResult<StatSet[]>> {
  try {
    const client = createApiClient();
    const rows = await fetchAll((from, to) =>
      client
        .from('stat_set_column')
        .select('set_id, set_name, set_order, stat_id, sort_order, scope')
        .eq('entity', entity)
        .order('set_order')
        .order('sort_order')
        .range(from, to),
    );
    const sets = new Map<string, StatSet>();
    for (const r of rows) {
      if (!r.set_id || !r.stat_id) continue;
      const set = sets.get(r.set_id) ?? {
        id: r.set_id,
        entity,
        scope: (r.scope && SCOPES.has(r.scope) ? r.scope : 'temporada') as SetScope,
        name: r.set_name ?? r.set_id,
        statIds: [],
      };
      set.statIds.push(r.stat_id);
      sets.set(r.set_id, set);
    }
    return { ok: true, data: [...sets.values()] };
  } catch (cause) {
    return fail(cause);
  }
}

/** Objeto JSON {id: valor} de la base, quedándose solo con los números. */
export function numericStats(json: unknown): Record<string, number> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(json)) {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

/** Plantel de Boca con todas sus estadísticas de temporada y la ficha (Interfaz 3), de más a menos minutos. */
export async function getPlayerRows(): Promise<DataResult<PlayerRow[]>> {
  try {
    const client = createApiClient();
    const [summary, bios, stats] = await Promise.all([
      client.from('player_summary').select('player_id, full_name, known_as, shirt_number, matches, minutes').limit(200),
      client.from('player_bio').select('player_id, position_raw, height_cm, weight_kg, nationality').limit(2000),
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
    if (bios.error) return fail(bios.error.message);
    const bioOf = new Map(bios.data.map((b) => [b.player_id, b]));
    const values = new Map<number, Record<string, number | null>>();
    for (const s of stats) {
      if (s.player_id === null || s.stat_id === null) continue;
      values.set(s.player_id, { ...values.get(s.player_id), [s.stat_id]: s.value });
    }
    const rows = summary.data.flatMap((r): PlayerRow[] => {
      if (r.player_id === null || r.full_name === null) return [];
      const bio = bioOf.get(r.player_id);
      const own = values.get(r.player_id) ?? {};
      return [
        {
          playerId: r.player_id,
          name: r.known_as ?? r.full_name,
          position: bio?.position_raw ?? null,
          shirtNumber: r.shirt_number,
          age: own.age ?? null,
          heightCm: bio?.height_cm ?? null,
          weightKg: bio?.weight_kg ?? null,
          nationality: bio?.nationality ?? null,
          matches: r.matches ?? 0,
          minutes: r.minutes ?? 0,
          stats: own,
        },
      ];
    });
    return { ok: true, data: rows.toSorted((a, b) => b.minutes - a.minutes) };
  } catch (cause) {
    return fail(cause);
  }
}

/** Partidos de Boca con todas sus estadísticas por partido (Interfaz 2), por fecha. */
export async function getTeamMatches(): Promise<DataResult<TeamMatchRow[]>> {
  try {
    const { data, error } = await createApiClient()
      .from('boca_game')
      .select('game_id, game_date, is_home, opponent, points_for, points_against, stats')
      .order('game_date')
      .limit(500);
    if (error) return fail(error.message);
    return {
      ok: true,
      data: data.flatMap((r): TeamMatchRow[] =>
        r.game_id === null || r.game_date === null || r.points_for === null || r.points_against === null
          ? []
          : [
              {
                matchId: r.game_id,
                date: r.game_date,
                // Por ahora solo la Liga Nacional: el resto de las competiciones están en FIBA (sin permiso).
                competitionCode: 'lnb',
                competitionName: 'Liga Nacional',
                opponent: r.opponent ?? 'Rival',
                home: r.is_home ?? false,
                pointsFor: r.points_for,
                pointsAgainst: r.points_against,
                stats: numericStats(r.stats),
              },
            ],
      ),
    };
  } catch (cause) {
    return fail(cause);
  }
}
